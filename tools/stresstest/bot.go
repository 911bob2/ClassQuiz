// SPDX-License-Identifier: MPL-2.0
package main

import (
	"context"
	cryptorand "crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"math/rand/v2"
	"net/http"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

type lobby struct {
	Enabled     bool    `json:"enabled"`
	CaptchaLab  bool    `json:"captcha_lab"`
	GameMode    string  `json:"game_mode"`
	CustomField *string `json:"custom_field"`
	SocketPath  string  `json:"socket_path"`
}
type terminalError struct{ reason string }

func (e *terminalError) Error() string { return e.reason }

type question struct {
	Type    string          `json:"type"`
	Time    string          `json:"time"`
	Image   string          `json:"image"`
	Answers json.RawMessage `json:"answers"`
}
type choice struct {
	Answer string `json:"answer"`
}
type submission struct {
	Index   int      `json:"question_index"`
	Answer  any      `json:"answer"`
	Complex []choice `json:"complex_answer,omitempty"`
	Token   string   `json:"question_token,omitempty"`
}

func randomAnswer(q question, index int, r *rand.Rand) (submission, error) {
	s := submission{Index: index}
	if q.Type == "" {
		q.Type = "ABCD"
	}
	switch q.Type {
	case "SLIDE":
		return s, nil
	case "TEXT":
		s.Answer = fmt.Sprintf("guess-%x", r.Uint32())
		return s, nil
	case "RANGE":
		var bounds struct {
			Min *int64 `json:"min"`
			Max *int64 `json:"max"`
		}
		if err := json.Unmarshal(q.Answers, &bounds); err != nil {
			return s, err
		}
		if bounds.Min == nil || bounds.Max == nil || *bounds.Max < *bounds.Min || float64(*bounds.Max)-float64(*bounds.Min) > 1e12 {
			return s, errors.New("invalid numeric range")
		}
		s.Answer = strconv.FormatInt(*bounds.Min+r.Int64N(*bounds.Max-*bounds.Min+1), 10)
		return s, nil
	case "ABCD", "VOTING", "ORDER", "CHECK":
		var a []choice
		if err := json.Unmarshal(q.Answers, &a); err != nil {
			return s, err
		}
		if len(a) == 0 {
			return s, errors.New("question has no choices")
		}
		for _, v := range a {
			if v.Answer == "" {
				return s, errors.New("question contains an empty choice")
			}
		}
		switch q.Type {
		case "ABCD", "VOTING":
			s.Answer = a[r.IntN(len(a))].Answer
		case "ORDER":
			r.Shuffle(len(a), func(i, j int) { a[i], a[j] = a[j], a[i] })
			s.Answer = "a"
			s.Complex = a
		case "CHECK":
			// The current CHECK UI has four selection slots, regardless of the
			// number of choices. Match that UI rather than sending impossible input.
			n := min(4, len(a))
			selected := make([]bool, n)
			for i := range selected {
				selected[i] = r.IntN(2) == 1
			}
			selected[r.IntN(n)] = true
			answer := ""
			for i, v := range selected {
				if v {
					answer += strconv.Itoa(i)
				}
			}
			s.Answer = answer
		}
		return s, nil
	default:
		return s, fmt.Errorf("unsupported question type %q", q.Type)
	}
}

func fetchLobby(ctx context.Context, c config, hc *http.Client) (lobby, error) {
	var meta lobby
	ctx, cancel := context.WithTimeout(ctx, c.Timeout)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", c.endpoint("/api/v1/quiz/play/check_captcha/"+c.Code), nil)
	resp, err := hc.Do(req)
	if err != nil {
		return meta, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return meta, &terminalError{fmt.Sprintf("lobby metadata HTTP %d", resp.StatusCode)}
	}
	if err = json.NewDecoder(io.LimitReader(resp.Body, 64<<10)).Decode(&meta); err != nil {
		return meta, fmt.Errorf("invalid lobby metadata: %w", err)
	}
	if meta.Enabled && !(c.LabCaptcha && meta.CaptchaLab) {
		return meta, &terminalError{"room has CAPTCHA enabled"}
	}
	return meta, nil
}

type bot struct {
	id               int
	name             string
	c                config
	hc               *http.Client
	m                *metrics
	log              *logger
	rng              *rand.Rand
	finish           func()
	mu               sync.Mutex
	w                *wire
	oldSID, sid      string
	resumeToken      string
	joined           bool
	everJoined       bool
	accepted         *atomic.Bool
	joinStart        time.Time
	synced           bool
	current          int
	answered         map[int]bool
	timer            *time.Timer
	questionCancel   context.CancelFunc
	questionDeadline time.Time
	meta             lobby
	media            *mediaPlayer
	personalScores   map[int]int
}

func (b *bot) run(ctx context.Context, sem chan struct{}) {
	b.m.attempted.Add(1)
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	if b.c.Traffic == "media" {
		b.media = newMediaPlayer(ctx, b.c, b.hc, b.m, b.log, b.id+1)
		defer b.media.close()
	}
	retries := 0
	for ctx.Err() == nil {
		select {
		case sem <- struct{}{}:
		case <-ctx.Done():
			return
		}
		b.m.attempts.Add(1)
		meta, err := fetchLobby(ctx, b.c, b.hc)
		if err == nil && !b.everJoined {
			requestCtx, stop := context.WithTimeout(ctx, b.c.Timeout)
			req, _ := http.NewRequestWithContext(requestCtx, "GET", b.c.endpoint("/api/v1/users/me"), nil)
			var resp *http.Response
			resp, err = b.hc.Do(req)
			if resp != nil {
				_, copyErr := io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10))
				resp.Body.Close()
				if err == nil {
					err = copyErr
				}
				if err == nil && resp.StatusCode != 200 && resp.StatusCode != 401 && resp.StatusCode != 403 {
					err = fmt.Errorf("anonymous /users/me HTTP %d", resp.StatusCode)
				}
			}
			stop()
		}
		started := time.Now()
		var w *wire
		if err == nil {
			connectionConfig := b.c
			if meta.SocketPath == "/socket.io-rust" {
				connectionConfig.socketPath = "/socket.io-rust/"
			}
			w, err = openWire(ctx, connectionConfig, b.hc, func(direction, transport, sample string) {
				b.log.log(4, b.id+1, "%s transport=%s %s", direction, transport, traceSample(sample))
				if direction == "upgrade_failed" {
					b.log.log(2, b.id+1, "upgrade failed, continuing polling: %s", sample)
				}
			}, &b.m.rx, &b.m.tx, &b.m.packets)
		}
		<-sem
		if ctx.Err() != nil {
			if w != nil {
				w.close()
			}
			return
		}
		if err == nil {
			b.m.duration("connect", time.Since(started))
			peak(&b.m.peakConnected, b.m.connected.Add(1))
			b.log.log(2, b.id+1, "transport connected (%s)", w.transport)
			accepted := &atomic.Bool{}
			b.mu.Lock()
			b.w = w
			b.meta = meta
			b.synced = false
			b.accepted = accepted
			b.current = -1
			b.mu.Unlock()
			dog := time.AfterFunc(b.c.Timeout, func() {
				if !accepted.Load() {
					w.fail(phase("join", errors.New("join confirmation timed out")))
				}
			})
			if err = w.send("40", nil); err == nil {
				err = w.serve(func(typ byte, r io.Reader) error { return b.handle(ctx, w, typ, r) })
			}
			dog.Stop()
			w.close()
			b.mu.Lock()
			wasJoined := b.joined
			b.cancelQuestionLocked()
			b.joined = false
			b.w = nil
			b.mu.Unlock()
			b.m.connected.Add(-1)
			if wasJoined {
				b.m.active.Add(-1)
			}
			b.m.observer.CompareAndSwap(int64(b.id+1), 0)
			if ctx.Err() != nil {
				return
			}
			var terminal *terminalError
			if wasJoined && (!errors.As(err, &terminal) || terminal.reason == errServerDisconnect.Error()) {
				b.m.disconnects.Add(1)
			}
		}
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			phaseName := "connect"
			var pe *phaseError
			if errors.As(err, &pe) {
				phaseName = pe.phase
			}
			reason := failureReason(err)
			b.m.error(phaseName, reason, err.Error())
			b.log.log(2, b.id+1, "failure phase=%s reason=%s detail=%s", phaseName, reason, err)
			var terminal *terminalError
			if errors.As(err, &terminal) {
				return
			}
		}
		retries++
		// Match the browser's exponential backoff: one to five seconds with jitter.
		delay := time.Duration(math.Min(5, math.Pow(2, float64(min(retries-1, 3))))) * time.Second
		b.mu.Lock()
		delay = time.Duration(float64(delay) * (.5 + b.rng.Float64()))
		b.mu.Unlock()
		if !waitContext(ctx, delay) {
			return
		}
	}
}

func failureReason(err error) string {
	var te *terminalError
	if errors.As(err, &te) {
		return te.reason
	}
	var pe *phaseError
	if errors.As(err, &pe) {
		err = pe.err
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return "timeout"
	}
	type timeout interface{ Timeout() bool }
	var t timeout
	if errors.As(err, &t) && t.Timeout() {
		return "timeout"
	}
	// Exact details are retained as samples, without creating a bucket per port/SID.
	s := err.Error()
	for _, reason := range []string{"HTTP 400", "HTTP 401", "HTTP 403", "HTTP 404", "HTTP 429", "HTTP 500", "HTTP 502", "HTTP 503", "HTTP 504", "connection refused", "connection reset", "forcibly closed", "no such host", "join confirmation timed out", "outgoing queue full", "server disconnected", "server closed", "unsupported", "invalid"} {
		if containsFold(s, reason) {
			return reason
		}
	}
	return "network/protocol error"
}

func (b *bot) cancelQuestionLocked() {
	if b.timer != nil {
		b.timer.Stop()
		b.timer = nil
	}
	if b.questionCancel != nil {
		b.questionCancel()
		b.questionCancel = nil
	}
	if b.media != nil {
		b.media.cancelCurrent()
	}
}

func (b *bot) handle(ctx context.Context, w *wire, typ byte, r io.Reader) error {
	switch typ {
	case '0':
		var data struct {
			SID string `json:"sid"`
		}
		if err := json.NewDecoder(r).Decode(&data); err != nil {
			return err
		}
		if data.SID == "" {
			return errors.New("missing Socket.IO SID")
		}
		b.mu.Lock()
		b.sid = data.SID
		b.joinStart = time.Now()
		old := b.oldSID
		resume := b.resumeToken
		if resume == "" {
			var identity [32]byte
			if _, err := cryptorand.Read(identity[:]); err != nil {
				b.mu.Unlock()
				return err
			}
			resume = fmt.Sprintf("%x", identity)
			b.resumeToken = resume
		}
		meta := b.meta
		b.mu.Unlock()
		if old != "" {
			return w.emit("rejoin_game", map[string]string{"old_sid": old, "game_pin": b.c.Code, "username": b.name, "resume_token": resume}, nil)
		}
		dataJoin := map[string]any{"username": b.name, "game_pin": b.c.Code, "resume_token": resume}
		if b.c.LabCaptcha && meta.Enabled && meta.CaptchaLab {
			dataJoin["captcha"] = fmt.Sprintf("good:%s:%d", resume, time.Now().UnixNano())
		}
		if meta.CustomField != nil {
			value := b.c.CustomField
			if value == "" {
				value = b.name
			}
			dataJoin["custom_field"] = value
		}
		return w.emit("join_game", dataJoin, nil)
	case '1':
		return &terminalError{errServerDisconnect.Error()}
	case '4':
		var raw json.RawMessage
		json.NewDecoder(r).Decode(&raw)
		return &terminalError{"Socket.IO connect_error: " + string(raw)}
	case '3':
		return nil // No application ACKs are requested; drain any unsolicited ACK.
	case '2':
	default:
		return fmt.Errorf("unsupported Socket.IO packet type %q", typ)
	}
	event, d, err := readEvent(r)
	if err != nil {
		return err
	}
	b.log.log(3, b.id+1, "event=%s", event)
	switch event {
	case "captcha_error":
		var data struct {
			Code string `json:"code"`
		}
		if err = d.Decode(&data); err != nil {
			return err
		}
		// A normal stress client must never bypass a protected lobby. The
		// explicit lab client retries transient overload with its usual backoff.
		if b.c.LabCaptcha && (data.Code == "captcha_busy" || data.Code == "captcha_unavailable" || data.Code == "captcha_expired") {
			return fmt.Errorf("captcha admission: %s", data.Code)
		}
		return &terminalError{"captcha admission: " + data.Code}
	case "joined_game", "rejoined_game":
		var data struct {
			Cover  string `json:"cover_image"`
			Resume string `json:"resume_token"`
		}
		if err = d.Decode(&data); err != nil {
			return err
		}
		b.mu.Lock()
		if !b.joined {
			b.joined = true
			peak(&b.m.peakActive, b.m.active.Add(1))
			if !b.everJoined {
				b.everJoined = true
				b.m.joined.Add(1)
			} else {
				b.m.rejoins.Add(1)
			}
		}
		b.oldSID = b.sid
		b.resumeToken = data.Resume
		b.accepted.Store(true)
		joinStart := b.joinStart
		b.mu.Unlock()
		b.m.isObserver(b.id)
		b.m.duration("join", time.Since(joinStart))
		b.log.log(2, b.id+1, "%s name=%s", event, b.name)
		if b.media != nil && data.Cover != "" {
			b.mu.Lock()
			coverCtx, cancel := context.WithCancel(ctx)
			b.questionCancel = cancel
			b.mu.Unlock()
			b.media.enqueue(coverCtx, data.Cover, false)
		}
	case "time_sync":
		var data string
		if err = d.Decode(&data); err != nil {
			return err
		}
		if err = w.emit("echo_time_sync", data, nil); err != nil {
			return err
		}
		b.mu.Lock()
		b.synced = true
		b.mu.Unlock()
	case "set_question_number":
		var data struct {
			Index    int       `json:"question_index"`
			Question *question `json:"question"`
			Token    string    `json:"question_token"`
		}
		if err = d.Decode(&data); err != nil {
			return err
		}
		if data.Index < 0 {
			return errors.New("negative question index")
		}
		b.mu.Lock()
		defer b.mu.Unlock()
		b.cancelQuestionLocked()
		b.current = data.Index
		if data.Question == nil || data.Question.Type == "SLIDE" {
			return nil
		}
		b.m.receiveQuestion(data.Index, b.id)
		if !b.joined || !b.synced {
			b.m.error("answer", "player not ready", "question arrived before join/time-sync")
			return nil
		}
		if b.answered[data.Index] {
			return nil
		}
		s, err := randomAnswer(*data.Question, data.Index, b.rng)
		s.Token = data.Token
		if err != nil {
			b.m.error("question", "malformed/unsupported question", err.Error())
			return nil
		}
		secs, err := strconv.ParseFloat(data.Question.Time, 64)
		if err != nil || math.IsNaN(secs) || math.IsInf(secs, 0) || secs <= 0 || secs > 86400 {
			b.m.error("question", "invalid timer", data.Question.Time)
			return nil
		}
		window := time.Duration(secs * float64(time.Second))
		delay := time.Duration(0)
		if b.c.AnswerMode == "spread" {
			lo := min(b.c.AnswerMin, window/2)
			hi := min(b.c.AnswerMax, window*9/10)
			delay = lo
			if hi > lo {
				delay += time.Duration(b.rng.Float64() * float64(hi-lo))
			}
		}
		qctx, cancel := context.WithCancel(ctx)
		b.questionCancel = cancel
		b.questionDeadline = time.Now().Add(window)
		if b.media != nil && b.meta.GameMode != "kahoot" && data.Question.Image != "" {
			b.media.enqueue(qctx, data.Question.Image, true)
		}
		due := time.Now().Add(delay)
		b.timer = time.AfterFunc(delay, func() {
			b.mu.Lock()
			defer b.mu.Unlock()
			if qctx.Err() != nil || b.w != w || !b.joined || b.current != s.Index || b.answered[s.Index] || b.m.finalizing.Load() || time.Now().After(b.questionDeadline) {
				return
			}
			b.answered[s.Index] = true
			b.m.duration("answer_scheduler_lag", time.Since(due))
			if err := w.emit("submit_answer", s, func() { b.m.answerSent(s.Index, b.id) }); err != nil {
				b.m.error("answer", "write failed", err.Error())
				w.fail(err)
			}
		})
	case "question_results":
		b.mu.Lock()
		index := b.current
		b.cancelQuestionLocked()
		b.mu.Unlock()
		if index >= 0 && b.m.isObserver(b.id) {
			if err = b.m.verify(index, d, "question_results"); err != nil {
				b.m.error("results", "invalid results", err.Error())
			}
		}
		if _, err = io.Copy(io.Discard, io.MultiReader(d.Buffered(), r)); err != nil {
			return err
		}
		if index >= 0 {
			b.m.resultReceipt(index, b.id)
		}
	case "personal_question_results":
		var data struct {
			Version  int    `json:"version"`
			Index    int    `json:"question_index"`
			Username string `json:"username"`
			Score    int    `json:"score"`
			Rank     int    `json:"rank"`
			Answer   *struct {
				Username string `json:"username"`
				Score    int    `json:"score"`
			} `json:"answer"`
		}
		if err = d.Decode(&data); err != nil {
			return err
		}
		if data.Version != 1 || data.Username != b.name || data.Index < 0 || data.Rank < 1 || (data.Answer != nil && data.Answer.Username != b.name) {
			return errors.New("invalid personal question result")
		}
		b.mu.Lock()
		b.cancelQuestionLocked()
		if b.personalScores == nil {
			b.personalScores = make(map[int]int)
		}
		if data.Answer != nil {
			b.personalScores[data.Index] = data.Answer.Score
		}
		b.mu.Unlock()
		b.m.personalResult(data.Index, b.id, data.Answer != nil)
		b.m.resultReceipt(data.Index, b.id)
	case "personal_final_results":
		var data struct {
			Version        int            `json:"version"`
			Username       string         `json:"username"`
			Score          int            `json:"score"`
			Rank           int            `json:"rank"`
			QuestionScores map[string]int `json:"question_scores"`
		}
		if err = d.Decode(&data); err != nil {
			return err
		}
		b.mu.Lock()
		b.cancelQuestionLocked()
		score := 0
		indices := make([]int, 0, len(data.QuestionScores))
		for index, points := range data.QuestionScores {
			q, parseErr := strconv.Atoi(index)
			if parseErr != nil || q < 0 || points < 0 || points > 1000 {
				b.mu.Unlock()
				return errors.New("invalid personal question score")
			}
			if previous, ok := b.personalScores[q]; ok && previous != points {
				b.mu.Unlock()
				return errors.New("personal final score differs from question result")
			}
			indices = append(indices, q)
			score += points
		}
		b.mu.Unlock()
		if data.Version != 1 || data.Username != b.name || data.Rank < 1 || data.Score != score {
			return errors.New("invalid personal final score/rank")
		}
		for _, index := range indices {
			b.m.personalResult(index, b.id, true)
		}
		b.m.finalizing.Store(true)
		all := b.m.finalReceipt(b.id)
		if all || (!b.c.WaitAllResults && b.m.isObserver(b.id)) {
			b.finish()
		}
	case "final_results":
		b.m.finalizing.Store(true)
		b.mu.Lock()
		b.cancelQuestionLocked()
		b.mu.Unlock()
		if b.m.isObserver(b.id) {
			if err = b.m.verifyFinal(d); err != nil {
				b.m.error("results", "invalid final results", err.Error())
			}
		}
		if _, err = io.Copy(io.Discard, io.MultiReader(d.Buffered(), r)); err != nil {
			return err
		}
		all := b.m.finalReceipt(b.id)
		if all || (!b.c.WaitAllResults && b.m.isObserver(b.id)) {
			b.finish()
		}
	case "solutions", "everyone_answered":
		b.mu.Lock()
		b.cancelQuestionLocked()
		b.mu.Unlock()
	case "game_not_found", "game_already_started", "username_already_exists", "kick":
		return &terminalError{event}
	case "error", "question_not_active", "already_replied":
		b.m.error("server", event, "server emitted "+event)
	case "session_id", "start_game", "player_answer": // Drain broadcasts without decoding their bodies.
	default: // Other events are harmless; verbose logging identifies them.
	}
	return nil
}

func waitContext(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}
