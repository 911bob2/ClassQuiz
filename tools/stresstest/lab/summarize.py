"""Reduce raw lab reports. Percentiles are observed nearest-rank samples."""
import json
import math
import sys
from collections import defaultdict
from pathlib import Path


def percentile(values, fraction):
    values = sorted(values)
    return round(values[max(0, math.ceil(len(values)*fraction)-1)], 3) if values else None


def summarize(path):
    d = json.loads(path.read_text())
    if not isinstance(d, dict) or 'server' not in d or 'label' not in d:
        return None
    bpath = path.with_name(path.stem + '.bots.json')
    b = json.loads(bpath.read_text()) if bpath.exists() else {}
    phases = d.get('server', {}).get('phases', {})
    totals = defaultdict(lambda: defaultdict(float))
    for data in phases.values():
        for kind, groups in data.items():
            for name, values in groups.items():
                for key, value in values.items():
                    if key == 'max_s':
                        totals[kind+':'+name][key] = max(totals[kind+':'+name][key], value)
                    else:
                        totals[kind+':'+name][key] += value
    groups = {}
    for group in ['joins', 'idle', 'answer', 'results', 'final', 'after']:
        selected = lambda x: x.get('phase','').split('_')[0] == group
        http = [x['ms'] for x in d.get('http',[]) if selected(x)]
        lag = [x['ms'] for x in d.get('server',{}).get('lag',[]) if selected(x)]
        samples = d.get('server',{}).get('samples',[])
        cpu_s = wall_s = 0
        for a, z in zip(samples, samples[1:]):
            if selected(a) and selected(z) and a['phase'] == z['phase']:
                cpu_s += z['cpu_s']-a['cpu_s']
                wall_s += z['time']-a['time']
        groups[group] = dict(http_samples=len(http), http_p95_ms=percentile(http,.95),
            http_max_ms=max(http,default=None), lag_p95_ms=percentile(lag,.95),
            lag_max_ms=max(lag,default=None), sampled_cpu_pct=round(100*cpu_s/wall_s,2) if wall_s else None)
    q = d.get('questions',[])
    samples = d.get('server',{}).get('samples',[])
    return dict(label=d['label'], users=d['users'], completed_questions=len(q),
        stored=sum(x['stored'] for x in q), unique=sum(x['unique_players'] for x in q),
        error=d.get('error'), join_s=round(d.get('join_seconds',0),3),
        joined=d.get('host_joined'), bot_exit=d.get('bot_exit'),
        stored_median_ms=percentile([x['all_stored_ms'] for x in q],.5),
        stored_max_ms=max([x['all_stored_ms'] for x in q],default=None),
        host_results_median_ms=percentile([x['host_results_ms'] for x in q],.5),
        host_results_max_ms=max([x['host_results_ms'] for x in q],default=None),
        host_final_ms=d.get('host_final_ms'),
        rx_mib=round(b.get('received_payload_bytes',0)/1024**2,3),
        packets=b.get('received_packets'), disconnects=b.get('unexpected_disconnects'),
        failures=b.get('failures'),
        fds_max=max([x['fds'] for x in samples],default=None),
        rss_mib_max=max([x['rss_kib']/1024 for x in samples],default=None),
        environment=d.get('environment'), groups=groups, counters=dict(totals))


if __name__ == '__main__':
    paths = [Path(x) for x in sys.argv[1:]] or sorted(Path(__file__).parent.joinpath('results').glob('*.json'))
    output = []
    for path in paths:
        if path.name.endswith('.bots.json') or path.name in {'summary.json', 'fuzz.json'}:
            continue
        try:
            reduced = summarize(path)
            if reduced:
                output.append(reduced)
        except KeyError:
            continue
    print(json.dumps(output,indent=2))
