// SPDX-License-Identifier: MPL-2.0
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"math/bits"
	"runtime"
	"sort"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

// Fixed logarithmic buckets keep percentile memory independent of event count.
// Reported percentiles are upper bounds with roughly 10% bucket precision.
type histogram struct {
	buckets       [512]uint64
	count         uint64
	sum, min, max float64
}
type latencyStats struct {
	Count  uint64  `json:"count"`
	MeanMS float64 `json:"mean_ms"`
	P50MS  float64 `json:"p50_ms"`
	P95MS  float64 `json:"p95_ms"`
	P99MS  float64 `json:"p99_ms"`
	MinMS  float64 `json:"min_ms"`
	MaxMS  float64 `json:"max_ms"`
}

func (h *histogram) add(d time.Duration) {
	x := max(0, float64(d)/float64(time.Millisecond))
	if h.count == 0 || x < h.min {
		h.min = x
	}
	if x > h.max {
		h.max = x
	}
	h.count++
	h.sum += x
	b := int(math.Ceil(math.Log1p(x*1000) / math.Log(1.1)))
	h.buckets[min(b, len(h.buckets)-1)]++
}
func (h *histogram) stats() latencyStats {
	s := latencyStats{Count: h.count, MinMS: h.min, MaxMS: h.max}
	if h.count == 0 {
		return s
	}
	s.MeanMS = h.sum / float64(h.count)
	q := func(p float64) float64 {
		rank := uint64(math.Ceil(float64(h.count) * p))
		var n uint64
		for i, c := range h.buckets {
			n += c
			if n >= rank {
				return min(h.max, (math.Pow(1.1, float64(i))-1)/1000)
			}
		}
		return h.max
	}
	s.P50MS = q(.5)
	s.P95MS = q(.95)
	s.P99MS = q(.99)
	return s
}

type failure struct {
	Phase   string   `json:"phase"`
	Reason  string   `json:"reason"`
	Count   int      `json:"count"`
	Samples []string `json:"samples,omitempty"`
}
type questionMetrics struct {
	index                    int
	first                    time.Time
	received, sent, recorded []uint64
	delivery                 histogram
	resultReceived           []uint64
	lastResult               time.Time
	verified                 bool
	source                   string
	duplicates               int
}
type questionReport struct {
	Index          int          `json:"question_index"`
	Received       int          `json:"players_received"`
	Sent           int          `json:"answers_sent"`
	Recorded       *int         `json:"answers_recorded,omitempty"`
	Missing        *int         `json:"answers_missing,omitempty"`
	Unexpected     *int         `json:"unexpected_bot_answers,omitempty"`
	Duplicates     int          `json:"duplicate_bot_answers"`
	Source         string       `json:"verification_source"`
	Delivery       latencyStats `json:"delivery_spread"`
	ResultReceipts int          `json:"result_receipts"`
	LastResult     time.Time    `json:"last_result_at"`
}
type generatorSample struct {
	At             time.Time `json:"at"`
	HeapBytes      uint64    `json:"heap_bytes"`
	RSSBytes       uint64    `json:"rss_bytes"`
	CPUPercent     float64   `json:"cpu_percent_one_core"`
	Goroutines     int       `json:"goroutines"`
	Connected      int64     `json:"connected"`
	Active         int64     `json:"active"`
	ReceivedBytes  uint64    `json:"received_payload_bytes"`
	SentBytes      uint64    `json:"sent_payload_bytes"`
	SchedulerLagMS float64   `json:"scheduler_lag_ms"`
}
type report struct {
	Version            int                     `json:"schema_version"`
	Started            time.Time               `json:"started"`
	Finished           time.Time               `json:"finished"`
	Reason             string                  `json:"stop_reason"`
	Config             config                  `json:"config"`
	Attempted          uint64                  `json:"players_attempted"`
	ConnectionAttempts uint64                  `json:"connection_attempts"`
	Joined             uint64                  `json:"players_joined"`
	PeakConnected      int64                   `json:"peak_connected"`
	PeakActive         int64                   `json:"peak_active"`
	Rejoins            uint64                  `json:"rejoins"`
	Disconnects        uint64                  `json:"unexpected_disconnects"`
	ReceivedBytes      uint64                  `json:"received_payload_bytes"`
	SentBytes          uint64                  `json:"sent_payload_bytes"`
	Packets            uint64                  `json:"received_packets"`
	DroppedLogs        uint64                  `json:"dropped_log_lines"`
	Failures           []failure               `json:"failures"`
	Latency            map[string]latencyStats `json:"latency"`
	Questions          []questionReport        `json:"questions"`
	MediaRequests      uint64                  `json:"media_requests"`
	MediaBytes         uint64                  `json:"media_bytes"`
	MediaCacheHits     uint64                  `json:"media_cache_hits"`
	Generator          []generatorSample       `json:"generator_samples"`
	Server             []json.RawMessage       `json:"server_samples,omitempty"`
	MonitoringErrors   []string                `json:"monitoring_errors,omitempty"`
	Notes              []string                `json:"notes"`
	FinalReceipts      int                     `json:"final_result_receipts"`
	LastFinal          time.Time               `json:"last_final_at"`
}

type metrics struct {
	mu                                                    sync.Mutex
	started                                               time.Time
	users                                                 int
	names                                                 map[string]int
	questions                                             map[int]*questionMetrics
	latency                                               map[string]*histogram
	failures                                              map[string]*failure
	generator                                             []generatorSample
	server                                                []json.RawMessage
	monitorErrors                                         []string
	attempted, attempts, joined, rejoins, disconnects     atomic.Uint64
	rx, tx, packets, mediaRequests, mediaBytes, cacheHits atomic.Uint64
	connected, active, peakConnected, peakActive          atomic.Int64
	observer                                              atomic.Int64
	finalizing                                            atomic.Bool
	finalReceived                                         []uint64
	lastFinal                                             time.Time
}

func newMetrics(users int) *metrics {
	return &metrics{started: time.Now(), users: users, names: make(map[string]int), questions: make(map[int]*questionMetrics), latency: make(map[string]*histogram), failures: make(map[string]*failure)}
}
func peak(p *atomic.Int64, value int64) {
	for old := p.Load(); value > old; old = p.Load() {
		if p.CompareAndSwap(old, value) {
			return
		}
	}
}
func setBit(b []uint64, id int) bool {
	mask := uint64(1) << uint(id%64)
	old := b[id/64]&mask != 0
	b[id/64] |= mask
	return old
}
func bitCount(b []uint64) int {
	n := 0
	for _, v := range b {
		n += bits.OnesCount64(v)
	}
	return n
}
func (m *metrics) question(index int) *questionMetrics {
	q := m.questions[index]
	if q == nil {
		q = &questionMetrics{index: index, received: make([]uint64, (m.users+63)/64), sent: make([]uint64, (m.users+63)/64), recorded: make([]uint64, (m.users+63)/64), resultReceived: make([]uint64, (m.users+63)/64), source: "unverified"}
		m.questions[index] = q
	}
	return q
}
func (m *metrics) receiveQuestion(index, id int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	q := m.question(index)
	if !setBit(q.received, id) {
		now := time.Now()
		if q.first.IsZero() {
			q.first = now
		}
		q.delivery.add(now.Sub(q.first))
	}
}
func (m *metrics) answerSent(index, id int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	setBit(m.question(index).sent, id)
}
func (m *metrics) duration(name string, d time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	h := m.latency[name]
	if h == nil {
		h = &histogram{}
		m.latency[name] = h
	}
	h.add(d)
}

func (m *metrics) resultReceipt(index, id int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	q := m.question(index)
	if !setBit(q.resultReceived, id) {
		q.lastResult = time.Now()
	}
}

func (m *metrics) personalResult(index, id int, answered bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	q := m.question(index)
	q.verified = true
	q.source = "personal_question_results"
	if answered {
		setBit(q.recorded, id)
	}
}

func (m *metrics) finalReceipt(id int) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.finalReceived == nil {
		m.finalReceived = make([]uint64, (m.users+63)/64)
	}
	if !setBit(m.finalReceived, id) {
		m.lastFinal = time.Now()
	}
	return bitCount(m.finalReceived) == m.users
}
func (m *metrics) error(phase, reason, sample string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := phase + ":" + reason
	f := m.failures[key]
	if f == nil {
		if len(m.failures) >= 128 {
			key = "other:additional failure reasons"
			phase = "other"
			reason = "additional failure reasons"
		}
		f = m.failures[key]
		if f == nil {
			f = &failure{Phase: phase, Reason: reason}
			m.failures[key] = f
		}
	}
	f.Count++
	if len(f.Samples) < 3 {
		f.Samples = append(f.Samples, traceSample(sample[:min(len(sample), 1024)]))
	}
}
func (m *metrics) isObserver(id int) bool {
	if m.observer.Load() == 0 {
		m.observer.CompareAndSwap(0, int64(id+1))
	}
	return m.observer.Load() == int64(id+1)
}

// Socket.IO question_results contains no index, so it is associated with the
// observer's current question. final_results provides authoritative indices.
func (m *metrics) verify(index int, d *json.Decoder, source string) error {
	t, err := d.Token()
	if err != nil {
		return err
	}
	if t == nil {
		m.mu.Lock()
		q := m.question(index)
		clear(q.recorded)
		q.verified = true
		q.source = source
		q.duplicates = 0
		m.mu.Unlock()
		return nil
	}
	if t != json.Delim('[') {
		return fmt.Errorf("results for question %d are not an array", index)
	}
	recorded := make([]uint64, (m.users+63)/64)
	duplicates := 0
	for d.More() {
		var row struct {
			Username string `json:"username"`
		}
		if err = d.Decode(&row); err != nil {
			return err
		}
		id, ok := m.names[row.Username]
		if ok && setBit(recorded, id) {
			duplicates++
		}
	}
	if _, err = d.Token(); err != nil {
		return err
	}
	m.mu.Lock()
	q := m.question(index)
	q.recorded = recorded
	q.duplicates = duplicates
	q.verified = true
	q.source = source
	m.mu.Unlock()
	return nil
}
func (m *metrics) verifyFinal(d *json.Decoder) error {
	t, err := d.Token()
	if err != nil {
		return err
	}
	if t != json.Delim('{') {
		return fmt.Errorf("final_results must be an object")
	}
	// Accumulate into a temporary coordinator so an interrupted/malformed stream
	// never replaces a valid snapshot with partially parsed data.
	tmp := newMetrics(m.users)
	tmp.names = m.names
	for d.More() {
		key, err := d.Token()
		if err != nil {
			return err
		}
		index, parseErr := strconv.Atoi(key.(string))
		if parseErr != nil || index < 0 {
			return fmt.Errorf("invalid final result index %q", key)
		}
		if err = tmp.verify(index, d, "final_results"); err != nil {
			return err
		}
	}
	if _, err = d.Token(); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	for index, q := range m.questions {
		clear(q.recorded)
		q.verified = true
		q.source = "final_results"
		q.duplicates = 0
		if v := tmp.questions[index]; v != nil {
			q.recorded = v.recorded
			q.duplicates = v.duplicates
		}
	}
	for index, q := range tmp.questions {
		if m.questions[index] == nil {
			m.questions[index] = q
		}
	}
	return nil
}

func (m *metrics) snapshot(c config, reason string, dropped uint64) report {
	m.mu.Lock()
	defer m.mu.Unlock()
	r := report{Version: 1, Started: m.started.UTC(), Finished: time.Now().UTC(), Reason: reason, Config: c, Attempted: m.attempted.Load(), ConnectionAttempts: m.attempts.Load(), Joined: m.joined.Load(), PeakConnected: m.peakConnected.Load(), PeakActive: m.peakActive.Load(), Rejoins: m.rejoins.Load(), Disconnects: m.disconnects.Load(), ReceivedBytes: m.rx.Load(), SentBytes: m.tx.Load(), Packets: m.packets.Load(), DroppedLogs: dropped, Latency: make(map[string]latencyStats), MediaRequests: m.mediaRequests.Load(), MediaBytes: m.mediaBytes.Load(), MediaCacheHits: m.cacheHits.Load(), Generator: append([]generatorSample(nil), m.generator...), Server: append([]json.RawMessage(nil), m.server...), MonitoringErrors: append([]string(nil), m.monitorErrors...)}
	for _, f := range m.failures {
		r.Failures = append(r.Failures, *f)
	}
	r.FinalReceipts = bitCount(m.finalReceived)
	r.LastFinal = m.lastFinal
	sort.Slice(r.Failures, func(i, j int) bool {
		return r.Failures[i].Phase+r.Failures[i].Reason < r.Failures[j].Phase+r.Failures[j].Reason
	})
	for name, h := range m.latency {
		r.Latency[name] = h.stats()
	}
	for index, q := range m.questions {
		qr := questionReport{Index: index, Received: bitCount(q.received), Sent: bitCount(q.sent), Duplicates: q.duplicates, Source: q.source, Delivery: q.delivery.stats()}
		qr.ResultReceipts = bitCount(q.resultReceived)
		qr.LastResult = q.lastResult
		if q.verified {
			recorded := 0
			unexpected := 0
			for i, v := range q.recorded {
				recorded += bits.OnesCount64(v & q.sent[i])
				unexpected += bits.OnesCount64(v &^ q.sent[i])
			}
			missing := qr.Sent - recorded
			qr.Recorded = &recorded
			qr.Missing = &missing
			qr.Unexpected = &unexpected
		}
		r.Questions = append(r.Questions, qr)
	}
	sort.Slice(r.Questions, func(i, j int) bool { return r.Questions[i].Index < r.Questions[j].Index })
	r.Notes = []string{"Sent means a transport write completed, not that an answer was accepted.", "Delivery spread is measured from the first bot receipt, not the host click.", "Percentiles use fixed histogram buckets with approximately 10% precision.", "Payload bytes exclude TLS, HTTP and WebSocket framing.", "Question-result snapshots use the observer's current question; indexed final results supersede them.", "Media mode approximates downloads; it does not render the frontend or decode video."}
	return r
}

func (m *metrics) sample(at time.Time, previousCPU *float64, previousAt *time.Time) generatorSample {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	rss, cpu := processResources()
	percent := 0.0
	if !previousAt.IsZero() {
		elapsed := time.Since(*previousAt).Seconds()
		if elapsed > 0 {
			percent = max(0, (cpu-*previousCPU)/elapsed*100)
		}
	}
	*previousCPU = cpu
	*previousAt = time.Now()
	s := generatorSample{At: time.Now().UTC(), HeapBytes: mem.HeapAlloc, RSSBytes: rss, CPUPercent: percent, Goroutines: runtime.NumGoroutine(), Connected: m.connected.Load(), Active: m.active.Load(), ReceivedBytes: m.rx.Load(), SentBytes: m.tx.Load(), SchedulerLagMS: float64(max(0, time.Since(at))) / float64(time.Millisecond)}
	m.mu.Lock()
	if len(m.generator) >= 720 {
		copy(m.generator, m.generator[1:])
		m.generator = m.generator[:719]
	}
	m.generator = append(m.generator, s)
	m.mu.Unlock()
	return s
}

func printReport(w io.Writer, r report) {
	fmt.Fprintf(w, "\nStopped: %s | elapsed %s\n", r.Reason, r.Finished.Sub(r.Started).Round(time.Millisecond))
	fmt.Fprintf(w, "Players: requested=%d attempted=%d joined=%d peak-active=%d peak-connected=%d rejoins=%d unexpected-disconnects=%d\n", r.Config.Users, r.Attempted, r.Joined, r.PeakActive, r.PeakConnected, r.Rejoins, r.Disconnects)
	if r.FinalReceipts > 0 {
		fmt.Fprintf(w, "Final results: received=%d/%d players\n", r.FinalReceipts, r.Config.Users)
	}
	for _, name := range []string{"connect", "join", "answer_scheduler_lag", "media"} {
		if s, ok := r.Latency[name]; ok {
			fmt.Fprintf(w, "%s: n=%d p50=%.2fms p95=%.2fms p99=%.2fms max=%.2fms\n", name, s.Count, s.P50MS, s.P95MS, s.P99MS, s.MaxMS)
		}
	}
	for _, q := range r.Questions {
		recorded := "unverified"
		if q.Recorded != nil {
			recorded = fmt.Sprintf("%d missing=%d duplicates=%d unexpected=%d (%s)", *q.Recorded, *q.Missing, q.Duplicates, *q.Unexpected, q.Source)
		}
		fmt.Fprintf(w, "Question %d: received=%d sent=%d recorded=%s delivery-p95=%.2fms max=%.2fms\n", q.Index, q.Received, q.Sent, recorded, q.Delivery.P95MS, q.Delivery.MaxMS)
	}
	for _, f := range r.Failures {
		fmt.Fprintf(w, "FAIL %s / %s: %d; %s\n", f.Phase, f.Reason, f.Count, stringsJoin(f.Samples))
	}
	fmt.Fprintf(w, "Traffic: received=%.2fMiB sent=%.2fMiB packets=%d media=%.2fMiB requests=%d cache-hits=%d dropped-log-lines=%d\n", float64(r.ReceivedBytes)/(1<<20), float64(r.SentBytes)/(1<<20), r.Packets, float64(r.MediaBytes)/(1<<20), r.MediaRequests, r.MediaCacheHits, r.DroppedLogs)
	if len(r.Generator) > 0 {
		s := r.Generator[len(r.Generator)-1]
		fmt.Fprintf(w, "Generator: heap=%.1fMiB RSS=%.1fMiB goroutines=%d CPU=%.1f%% (one core)\n", float64(s.HeapBytes)/(1<<20), float64(s.RSSBytes)/(1<<20), s.Goroutines, s.CPUPercent)
	}
	if len(r.Server) > 0 {
		fmt.Fprintf(w, "SSH monitoring: %d samples\n", len(r.Server))
	}
	for _, e := range r.MonitoringErrors {
		fmt.Fprintf(w, "SSH monitoring unavailable: %s\n", e)
	}
	fmt.Fprintln(w, "Sent answers require results to verify acceptance. Delivery spread excludes host-to-first-player delay.")
}
func stringsJoin(s []string) string {
	if len(s) == 0 {
		return ""
	}
	return s[0]
}
