// SPDX-License-Identifier: MPL-2.0
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// A separate process keeps the fixture's memory and CPU out of generator
// measurements. It intentionally omits ClassQuiz's quadratic broadcasts and
// storage, so this checks the client generator, never the VM's capacity.
func TestScaleFixture(t *testing.T) {
	if os.Getenv("STRESSTEST_FIXTURE_PROCESS") != "1" {
		t.Skip("subprocess fixture")
	}
	var joins, active, sequence atomic.Int64
	upgrader := websocket.Upgrader{ReadBufferSize: 512, WriteBufferSize: 512, WriteBufferPool: &writeBuffers}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/quiz/play/check_captcha/", func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, `{"enabled":false,"game_mode":"normal"}`)
	})
	mux.HandleFunc("/api/v1/users/me", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(401); io.WriteString(w, `{}`) })
	mux.HandleFunc("/stats", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]int64{"joins": joins.Load(), "active": active.Load()})
	})
	mux.HandleFunc("/socket.io/", func(w http.ResponseWriter, r *http.Request) {
		ws, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer ws.Close()
		active.Add(1)
		defer active.Add(-1)
		id := sequence.Add(1)
		ws.WriteMessage(1, []byte(fmt.Sprintf(`0{"sid":"eio-%d","upgrades":[],"pingInterval":2000,"pingTimeout":20000,"maxPayload":1000000}`, id)))
		incoming := make(chan string, 4)
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		go func() {
			defer cancel()
			for {
				_, b, err := ws.ReadMessage()
				if err != nil {
					return
				}
				select {
				case incoming <- string(b):
				case <-ctx.Done():
					return
				}
			}
		}()
		tick := time.NewTicker(2 * time.Second)
		defer tick.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-tick.C:
				ws.SetWriteDeadline(time.Now().Add(20 * time.Second))
				if ws.WriteMessage(1, []byte("2")) != nil {
					return
				}
			case packet := <-incoming:
				if packet == "40" {
					if ws.WriteMessage(1, []byte(fmt.Sprintf(`40{"sid":"sio-%d"}`, id))) != nil {
						return
					}
				}
				if strings.HasPrefix(packet, `42["join_game"`) {
					joins.Add(1)
					if ws.WriteMessage(1, []byte(`42["joined_game",{"started":false,"cover_image":null}]`)) != nil {
						return
					}
					if ws.WriteMessage(1, []byte(`42["time_sync","fixture-sync"]`)) != nil {
						return
					}
				}
			}
		}
	})
	s := httptest.NewServer(mux)
	defer s.Close()
	fmt.Println(s.URL)
	select {}
}

func TestScale(t *testing.T) {
	selection := os.Getenv("STRESSTEST_SCALE")
	if selection == "" {
		t.Skip("set STRESSTEST_SCALE=10,100,1000,10000 to run scalability checks")
	}
	for _, part := range strings.Split(selection, ",") {
		users, err := strconv.Atoi(part)
		if err != nil || users < 1 {
			t.Fatal("invalid STRESSTEST_SCALE")
		}
		t.Run(part, func(t *testing.T) {
			ctx, stop := context.WithCancel(context.Background())
			defer stop()
			binary, err := os.Executable()
			if err != nil {
				t.Fatal(err)
			}
			cmd := exec.CommandContext(ctx, binary, "-test.run=^TestScaleFixture$")
			hideProcess(cmd)
			cmd.Env = append(os.Environ(), "STRESSTEST_FIXTURE_PROCESS=1")
			stdout, err := cmd.StdoutPipe()
			if err != nil {
				t.Fatal(err)
			}
			cmd.Stderr = os.Stderr
			if err = cmd.Start(); err != nil {
				t.Fatal(err)
			}
			defer func() { stop(); cmd.Wait() }()
			reader := bufio.NewReader(stdout)
			url, err := reader.ReadString('\n')
			if err != nil {
				t.Fatal(err)
			}
			target := strings.TrimSpace(url)
			go io.Copy(io.Discard, reader)
			c := testConfig(t, target, users)
			c.Transport = "websocket"
			c.Timeout = 20 * time.Second
			c.Duration = 20 * time.Second
			c.RampUp = 5 * time.Second
			r, err := execute(context.Background(), c, io.Discard)
			if err != nil {
				t.Fatal(err)
			}
			if err = os.MkdirAll("reports", 0755); err != nil {
				t.Fatal(err)
			}
			data, _ := json.MarshalIndent(r, "", "  ")
			if err = os.WriteFile("reports/scale-"+part+".json", data, 0644); err != nil {
				t.Fatal(err)
			}
			var rss, heap uint64
			var cpu, lag float64
			for _, s := range r.Generator {
				rss = max(rss, s.RSSBytes)
				heap = max(heap, s.HeapBytes)
				cpu = max(cpu, s.CPUPercent)
				lag = max(lag, s.SchedulerLagMS)
			}
			t.Logf("players=%d joined=%d disconnects=%d peak-RSS=%.1fMiB peak-heap=%.1fMiB peak-CPU=%.1f%% lag=%.1fms", users, r.Joined, r.Disconnects, float64(rss)/(1<<20), float64(heap)/(1<<20), cpu, lag)
			if r.Joined != uint64(users) || r.Disconnects != 0 || len(r.Failures) != 0 {
				t.Fatalf("scale failures: joined=%d disconnected=%d %+v", r.Joined, r.Disconnects, r.Failures)
			}
		})
	}
}

func TestLiveSSHMonitor(t *testing.T) {
	alias := os.Getenv("STRESSTEST_TEST_SSH")
	if alias == "" {
		t.Skip("set STRESSTEST_TEST_SSH to opt into read-only SSH monitoring test")
	}
	c := testConfig(t, "https://example.test", 1)
	c.MonitorSSH = alias
	m := newMetrics(1)
	l := newLogger(0, io.Discard)
	defer l.close()
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	monitor(ctx, c, m, l)
	if len(m.server) == 0 || len(m.monitorErrors) > 0 {
		t.Fatalf("monitoring failed: %v", m.monitorErrors)
	}
	var sample struct {
		Error     string `json:"collection_error"`
		Processes []any  `json:"api_processes"`
	}
	json.Unmarshal(m.server[0], &sample)
	if sample.Error != "" || len(sample.Processes) == 0 {
		t.Fatalf("bad sample: %s", m.server[0])
	}
	data, _ := json.MarshalIndent(m.server, "", "  ")
	os.MkdirAll("reports", 0755)
	os.WriteFile("reports/ssh-check.json", data, 0644)
}
