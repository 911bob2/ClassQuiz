// SPDX-License-Identifier: MPL-2.0
package main

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	mathrand "math/rand/v2"
	"net"
	"net/http"
	"net/http/cookiejar"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

func containsFold(s, part string) bool {
	return strings.Contains(strings.ToLower(s), strings.ToLower(part))
}

func newHTTPClient(t http.RoundTripper) *http.Client {
	jar, _ := cookiejar.New(nil)
	return &http.Client{Transport: t, Jar: jar, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 10 {
			return errors.New("too many HTTP redirects")
		}
		// This test is authorized for the target. Do not silently load a CDN or
		// unrelated media host, or leak player cookies to it.
		if len(via) > 0 && (req.URL.Host != via[0].URL.Host || req.URL.Scheme != via[0].URL.Scheme) {
			return errors.New("cross-origin redirect blocked")
		}
		return nil
	}}
}

func execute(parent context.Context, c config, out io.Writer) (report, error) {
	if c.Seed == 0 {
		var seed [8]byte
		if _, err := rand.Read(seed[:]); err != nil {
			return report{}, err
		}
		c.Seed = binary.LittleEndian.Uint64(seed[:])
	}
	var runBytes [2]byte
	if _, err := rand.Read(runBytes[:]); err != nil {
		return report{}, err
	}
	runID := hex.EncodeToString(runBytes[:])
	m := newMetrics(c.Users)
	l := newLogger(c.Verbosity, out)
	transport := &http.Transport{Proxy: http.ProxyFromEnvironment, DialContext: (&net.Dialer{Timeout: c.Timeout, KeepAlive: 30 * time.Second}).DialContext, TLSHandshakeTimeout: c.Timeout, MaxIdleConns: 128, MaxIdleConnsPerHost: 128, IdleConnTimeout: 15 * time.Second, ForceAttemptHTTP2: true}
	defer transport.CloseIdleConnections()
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	_, err := fetchLobby(ctx, c, newHTTPClient(transport))
	if err != nil {
		l.close()
		m.error("preflight", failureReason(err), err.Error())
		return m.snapshot(c, "preflight failed", l.dropped.Load()), err
	}
	l.log(1, 0, "target=%s users=%d room=%s traffic=%s answers=%s transport=%s seed=%d", c.Target, c.Users, c.Code, c.Traffic, c.AnswerMode, c.Transport, c.Seed)
	l.log(1, 0, "Joining over %s. Wait for active players before starting the quiz; reveal question/final results to verify answers.", c.RampUp)
	finished := make(chan struct{})
	var finishOnce sync.Once
	finish := func() { finishOnce.Do(func() { close(finished) }) }
	sem := make(chan struct{}, c.JoinConcurrency)
	bots := make([]*bot, c.Users)
	for i := range bots {
		r := mathrand.New(mathrand.NewPCG(c.Seed, uint64(i+1)))
		name := []string{"Fox", "Owl", "Yak", "Bee"}[r.IntN(4)] + "-" + runID + "-" + strconv.FormatInt(int64(i), 36)
		m.names[name] = i
		bots[i] = &bot{id: i, name: name, c: c, hc: newHTTPClient(transport), m: m, log: l, rng: r, finish: finish, current: -1, answered: make(map[int]bool)}
	}
	var backgrounds sync.WaitGroup
	backgrounds.Add(1)
	go func() { defer backgrounds.Done(); progress(ctx, c, m, l) }()
	if c.MonitorSSH != "" {
		backgrounds.Add(1)
		go func() { defer backgrounds.Done(); monitor(ctx, c, m, l) }()
	}
	var players sync.WaitGroup
	players.Add(1)
	go func() {
		defer players.Done()
		start := time.Now()
		for i, b := range bots {
			delay := time.Duration(0)
			if c.Users > 1 {
				delay = time.Duration(float64(c.RampUp) * float64(i) / float64(c.Users-1))
			}
			if !waitContext(ctx, max(0, time.Until(start.Add(delay)))) {
				return
			}
			players.Add(1)
			go func(b *bot) { defer players.Done(); b.run(ctx, sem) }(b)
		}
	}()
	allDone := make(chan struct{})
	go func() { players.Wait(); close(allDone) }()
	var duration <-chan time.Time
	var timer *time.Timer
	if c.Duration > 0 {
		timer = time.NewTimer(c.Duration)
		duration = timer.C
		defer timer.Stop()
	}
	reason := ""
	select {
	case <-parent.Done():
		reason = "interrupted"
	case <-duration:
		reason = "duration reached"
	case <-finished:
		reason = "final results received"
	case <-allDone:
		reason = "all players stopped"
	}
	cancel()
	<-allDone
	backgrounds.Wait()
	var cpu float64
	var sampled time.Time
	m.sample(time.Now(), &cpu, &sampled)
	l.close()
	r := m.snapshot(c, reason, l.dropped.Load())
	return r, nil
}

func progress(ctx context.Context, c config, m *metrics, l *logger) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	var cpu float64
	var sampled time.Time
	m.sample(time.Now(), &cpu, &sampled)
	for {
		select {
		case <-ctx.Done():
			return
		case at := <-ticker.C:
			s := m.sample(at, &cpu, &sampled)
			l.log(1, 0, "attempted=%d joined=%d active=%d connected=%d disconnects=%d RX=%.1fMiB heap=%.1fMiB RSS=%.1fMiB CPU=%.0f%% lag=%.1fms", m.attempted.Load(), m.joined.Load(), s.Active, s.Connected, m.disconnects.Load(), float64(s.ReceivedBytes)/(1<<20), float64(s.HeapBytes)/(1<<20), float64(s.RSSBytes)/(1<<20), s.CPUPercent, s.SchedulerLagMS)
			m.mu.Lock()
			var count int
			for _, f := range m.failures {
				count += f.Count
			}
			var latest *questionMetrics
			for _, q := range m.questions {
				if latest == nil || q.index > latest.index {
					latest = q
				}
			}
			qLine := ""
			if latest != nil {
				qLine = fmt.Sprintf("question=%d received=%d sent=%d verification=%s", latest.index, bitCount(latest.received), bitCount(latest.sent), latest.source)
			}
			m.mu.Unlock()
			if count > 0 {
				l.log(1, 0, "failures=%d (details grouped in final report; --verbosity 2 shows individual failures)", count)
			}
			if qLine != "" {
				l.log(1, 0, "%s", qLine)
			}
		}
	}
}

func main() { os.Exit(mainCode(os.Args[1:], os.Stdout, os.Stderr)) }
func mainCode(args []string, out, errOut io.Writer) int {
	c, err := parseConfig(args, errOut)
	if errors.Is(err, flag.ErrHelp) {
		return 0
	}
	if err != nil {
		fmt.Fprintln(errOut, err)
		return 2
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() { <-ctx.Done(); stop() }() // A second Ctrl+C may force termination.
	r, runErr := execute(ctx, c, out)
	printReport(out, r)
	if c.Output != "" {
		err := os.MkdirAll(filepath.Dir(c.Output), 0755)
		var f *os.File
		if err == nil {
			f, err = os.Create(c.Output)
		}
		if err == nil {
			enc := json.NewEncoder(f)
			enc.SetIndent("", "  ")
			err = enc.Encode(r)
			closeErr := f.Close()
			if err == nil {
				err = closeErr
			}
		}
		if err != nil {
			fmt.Fprintf(errOut, "cannot write report: %s\n", err)
			return 2
		}
		fmt.Fprintf(out, "Report: %s\n", c.Output)
	}
	if runErr != nil {
		fmt.Fprintln(errOut, runErr)
		return 1
	}
	if r.Joined == 0 || len(r.Failures) > 0 || r.Disconnects > 0 {
		return 1
	}
	for _, q := range r.Questions {
		if q.Missing != nil && *q.Missing > 0 || q.Duplicates > 0 || q.Unexpected != nil && *q.Unexpected > 0 {
			return 1
		}
	}
	return 0
}
