// SPDX-License-Identifier: MPL-2.0
package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
)

// Fixed read-only commands are sent on stdin. User input is only an SSH alias,
// passed as an argument, never interpolated into a remote shell program.
const monitorScript = `import datetime, json, os, subprocess, time
def command(args):
    return subprocess.check_output(args, text=True, timeout=12, stderr=subprocess.DEVNULL)
def cpu():
    values = list(map(int, open('/proc/stat').readline().split()[1:9]))
    return sum(values), values[3] + values[4], values[7]
containers = json.loads(command(['docker', 'inspect'] + command(['docker', 'ps', '-q']).split()))
selected = [c for c in containers if 'classquiz' in c['Config'].get('Labels', {}).get('com.docker.compose.project', '')]
if not selected:
    raise RuntimeError('No running ClassQuiz Compose containers found')
api = next((c['Name'].lstrip('/') for c in selected if c['Config'].get('Labels', {}).get('com.docker.compose.service') == 'api'), None)
redis = next((c['Name'].lstrip('/') for c in selected if c['Config'].get('Labels', {}).get('com.docker.compose.service') == 'redis'), None)
names = [c['Name'].lstrip('/') for c in selected]
names += [c['Name'].lstrip('/') for c in containers if 'npm' in c['Name']]
proxy_limits = {}
for c in selected + [c for c in containers if 'npm' in c['Name']]:
    service = c['Config'].get('Labels', {}).get('com.docker.compose.service', '')
    if service == 'proxy' or 'npm' in c['Name']:
        name = c['Name'].lstrip('/')
        try:
            proxy_limits[name] = command(['docker','exec',name,'sh','-c',
                "grep -E 'worker_connections|worker_processes|worker_rlimit_nofile' /etc/nginx/nginx.conf; grep 'Max open files' /proc/1/limits"])
        except Exception as e:
            proxy_limits[name] = str(e)
process_probe = """import os,json,re
rows=[]
for p in os.listdir('/proc'):
 if not p.isdigit() or int(p)==os.getpid(): continue
 try:
  cmd=open('/proc/'+p+'/cmdline','rb').read()
  if b'gunicorn' not in cmd: continue
  limits=open('/proc/'+p+'/limits').read()
  match=re.search(r'Max open files\s+(\S+)\s+(\S+)',limits)
  rows.append({'pid':int(p),'open_files':len(os.listdir('/proc/'+p+'/fd')),'soft_limit':match[1],'hard_limit':match[2]})
 except (OSError,TypeError): pass
print(json.dumps(rows))"""
previous = cpu()
while True:
    started = time.monotonic()
    sample = {'at':datetime.datetime.now(datetime.timezone.utc).isoformat(), 'containers':[], 'proxy_limits':proxy_limits}
    try:
        for row in command(['docker', 'stats', '--no-stream', '--format', '{{json .}}'] + names).splitlines():
            sample['containers'].append(json.loads(row))
        current = cpu(); total = current[0] - previous[0]
        sample['vm_cpu_percent'] = 100 * (1 - (current[1]-previous[1])/total) if total else 0
        sample['vm_steal_percent'] = 100 * (current[2]-previous[2])/total if total else 0
        previous = current
        mem = {line.split(':')[0]:int(line.split()[1])*1024 for line in open('/proc/meminfo') if line.split()[1].isdigit()}
        sample['vm_memory_total_bytes']=mem['MemTotal'];sample['vm_memory_available_bytes']=mem['MemAvailable']
        if api:
            sample['api_processes']=json.loads(command(['docker','exec',api,'python','-c',process_probe]))
        if redis:
            raw=command(['docker','exec',redis,'sh','-c','if command -v valkey-cli >/dev/null; then valkey-cli INFO; else redis-cli INFO; fi'])
            fields=dict(line.split(':',1) for line in raw.splitlines() if ':' in line)
            sample['redis']={k:fields.get(k) for k in ['connected_clients','maxclients','used_memory','used_memory_rss','instantaneous_ops_per_sec','total_net_input_bytes','total_net_output_bytes','rejected_connections']}
    except Exception as e:
        sample['collection_error']=str(e)
    try:
        print(json.dumps(sample),flush=True)
    except BrokenPipeError:
        break
    time.sleep(max(0,5-(time.monotonic()-started)))
`

func monitor(ctx context.Context, c config, m *metrics, l *logger) {
	cmd := exec.CommandContext(ctx, "ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15", c.MonitorSSH, "python3 -u -")
	hideProcess(cmd)
	cmd.Stdin = strings.NewReader(monitorScript)
	var stderr limitedBuffer
	cmd.Stderr = &stderr
	stdout, err := cmd.StdoutPipe()
	if err == nil {
		err = cmd.Start()
	}
	if err != nil {
		monitorFailure(m, l, err.Error())
		return
	}
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 4096), 256<<10)
	for scanner.Scan() {
		line := append(json.RawMessage(nil), scanner.Bytes()...)
		if !json.Valid(line) {
			monitorFailure(m, l, "SSH returned invalid metrics JSON")
			continue
		}
		m.mu.Lock()
		if len(m.server) >= 720 {
			copy(m.server, m.server[1:])
			m.server = m.server[:719]
		}
		m.server = append(m.server, line)
		m.mu.Unlock()
		var sample struct {
			Error string `json:"collection_error"`
		}
		json.Unmarshal(line, &sample)
		if sample.Error != "" {
			monitorFailure(m, l, "metric collection: "+sample.Error)
		}
	}
	scanErr := scanner.Err()
	err = cmd.Wait()
	if ctx.Err() == nil {
		if scanErr != nil {
			monitorFailure(m, l, scanErr.Error())
		}
		if err != nil {
			monitorFailure(m, l, fmt.Sprintf("%s: %s", err, strings.TrimSpace(stderr.String())))
		}
	}
}
func monitorFailure(m *metrics, l *logger, s string) {
	m.mu.Lock()
	if len(m.monitorErrors) < 10 {
		m.monitorErrors = append(m.monitorErrors, s)
	}
	m.mu.Unlock()
	l.log(1, 0, "SSH monitoring unavailable: %s", s)
}

type limitedBuffer struct{ bytes.Buffer }

func (b *limitedBuffer) Write(p []byte) (int, error) {
	n := len(p)
	remaining := 4096 - b.Len()
	if remaining > 0 {
		b.Buffer.Write(p[:min(len(p), remaining)])
	}
	return n, nil
}
