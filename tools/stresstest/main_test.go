// SPDX-License-Identifier: MPL-2.0
package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func testConfig(t *testing.T, target string, users int) config {
	t.Helper()
	c, err := parseConfig([]string{"--target", target, "--users", fmt.Sprint(users), "--code", "001234", "--ramp-up", "0s", "--answer-mode", "burst", "--verbosity", "0", "--timeout", "5s", "--duration", "15s"}, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	return c
}
func TestConfiguration(t *testing.T) {
	c := testConfig(t, "https://example.test/prefix/", 10000)
	if c.Code != "001234" || c.endpoint("/socket.io/") != "https://example.test/prefix/socket.io/" {
		t.Fatal(c)
	}
	base := []string{"--target", "https://example.test", "--users", "10", "--code", "001234"}
	for _, extra := range [][]string{{"--users", "0"}, {"--code", "123"}, {"--verbosity", "5"}, {"--answer-min", "6s", "--answer-max", "1s"}, {"--target", "https://a:b@example.test"}, {"--monitor-ssh", "-oProxyCommand=bad"}, {"--transport", "v2"}} {
		if _, err := parseConfig(append(append([]string(nil), base...), extra...), io.Discard); err == nil {
			t.Fatalf("accepted %v", extra)
		}
	}
}
func TestAnswers(t *testing.T) {
	r := rand.New(rand.NewPCG(42, 17))
	choices := json.RawMessage(`[{"answer":"A"},{"answer":"B"},{"answer":"C"}]`)
	for _, kind := range []string{"ABCD", "VOTING", "ORDER", "CHECK", "TEXT", "RANGE", "SLIDE"} {
		q := question{Type: kind, Answers: choices}
		if kind == "RANGE" {
			q.Answers = json.RawMessage(`{"min":-3,"max":3}`)
		}
		for range 100 {
			s, err := randomAnswer(q, 7, r)
			if err != nil {
				t.Fatal(kind, err)
			}
			if s.Index != 7 {
				t.Fatal(s)
			}
			if kind == "ORDER" {
				seen := map[string]bool{}
				for _, a := range s.Complex {
					seen[a.Answer] = true
				}
				if len(seen) != 3 || s.Answer != "a" {
					t.Fatal(s)
				}
			}
			if kind == "CHECK" {
				a := s.Answer.(string)
				if a == "" || strings.ContainsAny(a, "3456789") {
					t.Fatal(a)
				}
			}
			if kind == "TEXT" && !strings.HasPrefix(s.Answer.(string), "guess-") {
				t.Fatal(s)
			}
		}
	}
	for _, q := range []question{{Type: "ABCD", Answers: json.RawMessage(`[]`)}, {Type: "RANGE", Answers: json.RawMessage(`{"min":8,"max":1}`)}, {Type: "UNKNOWN"}} {
		if _, err := randomAnswer(q, 0, r); err == nil {
			t.Fatalf("accepted %+v", q)
		}
	}
}
func TestPollingRecords(t *testing.T) {
	packets := []string{"42[\"large\",\"" + strings.Repeat("a", 1<<20) + "\"]", "2", "6"}
	b := bufio.NewReaderSize(strings.NewReader(strings.Join(packets, "\x1e")), 512)
	for _, want := range packets {
		got, err := io.ReadAll(&recordReader{br: b})
		if err != nil || string(got) != want {
			t.Fatalf("record len=%d err=%v", len(got), err)
		}
	}
	if _, err := b.Peek(1); err != io.EOF {
		t.Fatal(err)
	}
}

func TestEventPrefix(t *testing.T) {
	for _, input := range []string{`["question_results",[]]`, ` [ "question_results" , [] ]`, `["question_\u0072esults",[]]`} {
		name, d, err := readEvent(strings.NewReader(input))
		if err != nil || name != "question_results" {
			t.Fatal(name, err)
		}
		var rows []any
		if err = d.Decode(&rows); err != nil {
			t.Fatal(err)
		}
	}
	name, _, err := readEvent(strings.NewReader(`["start_game"]`))
	if err != nil || name != "start_game" {
		t.Fatal(name, err)
	}
	for _, input := range []string{`2["x",{}]`, `["x" {};]`, `[10,{}]`} {
		if _, _, err = readEvent(strings.NewReader(input)); err == nil {
			t.Fatal("accepted malformed event", input)
		}
	}
}
func TestResultReconciliation(t *testing.T) {
	m := newMetrics(3)
	m.names = map[string]int{"one": 0, "two": 1, "three": 2}
	for id := range 3 {
		m.answerSent(0, id)
	}
	m.answerSent(1, 0)
	if err := m.verify(0, json.NewDecoder(strings.NewReader(`[{"username":"one"},{"username":"one"},{"username":"two"},{"username":"human"}]`)), "question_results"); err != nil {
		t.Fatal(err)
	}
	r := m.snapshot(config{}, "test", 0)
	if *r.Questions[0].Missing != 1 || r.Questions[0].Duplicates != 1 || r.Questions[1].Recorded != nil {
		t.Fatal(r.Questions)
	}
	if err := m.verifyFinal(json.NewDecoder(strings.NewReader(`{"0":[{"username":"one"},{"username":"two"},{"username":"three"}]}`))); err != nil {
		t.Fatal(err)
	}
	r = m.snapshot(config{}, "test", 0)
	if *r.Questions[0].Missing != 0 || r.Questions[0].Duplicates != 0 || *r.Questions[1].Missing != 1 {
		t.Fatal(r.Questions)
	}
	if err := m.verifyFinal(json.NewDecoder(strings.NewReader(`{"0":[{"username":"one"}],"bad":[]}`))); err == nil {
		t.Fatal("accepted invalid index")
	}
	r = m.snapshot(config{}, "test", 0)
	if *r.Questions[0].Missing != 0 {
		t.Fatal("partial stream replaced complete snapshot")
	}
}
func TestMediaCachingRangeAndRedirects(t *testing.T) {
	counts := map[string]int{}
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		counts[r.URL.Path]++
		switch r.URL.Path {
		case "/api/v1/storage/info/image":
			w.Header().Set("Content-Type", "image/png")
		case "/api/v1/storage/info/video":
			w.Header().Set("Content-Type", "video/mp4")
		case "/api/v1/storage/download/image":
			http.Redirect(w, r, "/object", 307)
		case "/object":
			w.Write([]byte(strings.Repeat("i", 10000)))
		case "/api/v1/storage/download/video":
			if r.Header.Get("Range") != "bytes=0-1048575" {
				t.Error("missing Range")
			}
			w.WriteHeader(206)
			io.WriteString(w, strings.Repeat("v", 2<<20))
		default:
			w.WriteHeader(404)
		}
	}))
	defer s.Close()
	c := testConfig(t, s.URL, 1)
	m := newMetrics(1)
	l := newLogger(0, io.Discard)
	defer l.close()
	p := &mediaPlayer{c: c, hc: newHTTPClient(http.DefaultTransport), m: m, log: l, cache: map[string]bool{}}
	for _, src := range []string{"image", "image", "video"} {
		if err := p.fetch(context.Background(), src, true); err != nil {
			t.Fatal(err)
		}
	}
	if counts["/api/v1/storage/info/image"] != 2 || counts["/api/v1/storage/download/image"] != 1 || m.cacheHits.Load() != 1 || m.mediaBytes.Load() != uint64(10000+(1<<20)) {
		t.Fatal(counts, m.mediaBytes.Load())
	}
	if err := p.fetch(context.Background(), "missing", false); err == nil {
		t.Fatal("ignored media failure")
	}
	request, _ := http.NewRequest("GET", s.URL, nil)
	external, _ := http.NewRequest("GET", "https://other.test/image?X-Amz-Signature=secret", nil)
	if err := p.hc.CheckRedirect(external, []*http.Request{request}); err == nil {
		t.Fatal("allowed third-party redirect")
	}
}
func TestTraceRedaction(t *testing.T) {
	for _, s := range []string{`42["time_sync","secret"]`, `42["session_id",{"session_id":"secret"}]`, `https://a/object?X-Amz-Signature=secret&X-Amz-Credential=secret`} {
		if strings.Contains(traceSample(s), "secret") {
			t.Fatal("secret in trace")
		}
	}
}

func fixturePython() string {
	if p := os.Getenv("STRESSTEST_PYTHON"); p != "" {
		return p
	}
	p := filepath.Join(".venv", "bin", "python")
	if runtime.GOOS == "windows" {
		p = filepath.Join(".venv", "Scripts", "python.exe")
	}
	if _, err := os.Stat(p); err == nil {
		abs, _ := filepath.Abs(p)
		return abs
	}
	return ""
}
func startFixture(t *testing.T, scenario string, users int) string {
	t.Helper()
	python := fixturePython()
	if python == "" {
		t.Skip("Install testdata/requirements.txt into .venv or set STRESSTEST_PYTHON for interoperability tests")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cmd := exec.CommandContext(ctx, python, "-u", "testdata/server.py", "--scenario", scenario, "--users", fmt.Sprint(users))
	hideProcess(cmd)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err = cmd.Start(); err != nil {
		cancel()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cancel()
		cmd.Wait()
		if t.Failed() {
			t.Log(stderr.String())
		}
	})
	portCh := make(chan string, 1)
	go func() {
		line, _ := bufio.NewReader(stdout).ReadString('\n')
		portCh <- strings.TrimSpace(line)
		io.Copy(io.Discard, stdout)
	}()
	var port string
	select {
	case port = <-portCh:
	case <-time.After(10 * time.Second):
		t.Fatal("fixture startup timeout")
	}
	if port == "" {
		t.Fatal("fixture exited before startup")
	}
	target := "http://127.0.0.1:" + port
	for range 100 {
		resp, err := http.Get(target + "/stats")
		if err == nil {
			resp.Body.Close()
			return target
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("fixture HTTP not ready")
	return ""
}
func TestPythonInteroperability(t *testing.T) {
	for _, mode := range []string{"websocket", "polling", "auto", "auto-fallback"} {
		t.Run(mode, func(t *testing.T) {
			scenario := "normal"
			if mode == "auto-fallback" {
				scenario = "upgrade-reject"
			}
			target := startFixture(t, scenario, 10)
			c := testConfig(t, target, 10)
			c.Transport = mode
			if mode == "auto-fallback" {
				c.Transport = "auto"
			}
			r, err := execute(context.Background(), c, io.Discard)
			if err != nil {
				t.Fatal(err)
			}
			if r.Reason != "final results received" || r.Joined != 10 || r.Disconnects != 0 || len(r.Failures) != 0 || len(r.Questions) != 6 {
				t.Fatalf("bad report %+v", r)
			}
			for _, q := range r.Questions {
				if q.Sent != 10 || q.Recorded == nil || *q.Missing != 0 {
					t.Fatalf("bad answers %+v", q)
				}
			}
		})
	}
}
func TestPythonFailureAndMediaScenarios(t *testing.T) {
	for _, scenario := range []string{"loss", "duplicates", "reconnect", "observer", "stale", "media", "reject"} {
		t.Run(scenario, func(t *testing.T) {
			target := startFixture(t, scenario, 10)
			c := testConfig(t, target, 10)
			if scenario == "stale" {
				c.AnswerMode = "spread"
				c.AnswerMin = 500 * time.Millisecond
				c.AnswerMax = 600 * time.Millisecond
			}
			if scenario == "media" {
				c.Traffic = "media"
				c.AnswerMode = "spread"
				c.AnswerMin = 200 * time.Millisecond
				c.AnswerMax = 250 * time.Millisecond
			}
			r, err := execute(context.Background(), c, io.Discard)
			if err != nil {
				t.Fatal(err)
			}
			if scenario == "reject" {
				if r.Joined != 0 || len(r.Failures) == 0 || r.Reason != "all players stopped" {
					t.Fatal(r)
				}
				return
			}
			if r.Reason != "final results received" {
				t.Fatalf("did not complete: %+v", r)
			}
			switch scenario {
			case "loss":
				for _, q := range r.Questions {
					if q.Missing == nil || *q.Missing != 1 {
						t.Fatal(q)
					}
				}
			case "duplicates":
				for _, q := range r.Questions {
					if q.Duplicates != 1 {
						t.Fatal(q)
					}
				}
			case "reconnect", "observer":
				if r.Rejoins < 1 || r.Disconnects < 1 {
					t.Fatal(r.Rejoins, r.Disconnects)
				}
				if scenario == "reconnect" && r.Rejoins < 2 {
					t.Fatal("second reconnect failed")
				}
				for _, q := range r.Questions {
					if q.Recorded == nil || *q.Missing != 0 {
						t.Fatal(q)
					}
				}
			case "stale":
				if r.Questions[0].Sent != 0 {
					t.Fatal("stale timer submitted an answer")
				}
			case "media":
				if r.MediaBytes < 10*(1<<20) || r.MediaCacheHits < 10 || len(r.Failures) > 0 {
					t.Fatal(r.MediaBytes, r.MediaCacheHits, r.Failures)
				}
			}
		})
	}
}
func TestCancellationAndUnverifiedAnswers(t *testing.T) {
	target := startFixture(t, "idle", 10)
	c := testConfig(t, target, 10)
	c.Duration = 0
	ctx, cancel := context.WithCancel(context.Background())
	time.AfterFunc(time.Second, cancel)
	start := time.Now()
	r, err := execute(ctx, c, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	if r.Reason != "interrupted" || r.Disconnects != 0 || time.Since(start) > 3*time.Second {
		t.Fatal(r.Reason, r.Disconnects)
	}
	m := newMetrics(1)
	m.answerSent(0, 0)
	if m.snapshot(c, "test", 0).Questions[0].Recorded != nil {
		t.Fatal("claimed acceptance without results")
	}
}
func TestMonitoringFailureDoesNotStopPlayers(t *testing.T) {
	target := startFixture(t, "normal", 10)
	c := testConfig(t, target, 10)
	c.MonitorSSH = "classquiz-nonexistent-test-alias"
	r, err := execute(context.Background(), c, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	if r.Joined != 10 || r.Reason != "final results received" {
		t.Fatal(r)
	}
}
