// SPDX-License-Identifier: MPL-2.0
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

const maxPacketBytes = 256 << 20

var writeBuffers sync.Pool
var errServerDisconnect = errors.New("server disconnected the Socket.IO namespace")

type phaseError struct {
	phase string
	err   error
}

func (e *phaseError) Error() string      { return e.phase + ": " + e.err.Error() }
func (e *phaseError) Unwrap() error      { return e.err }
func phase(what string, err error) error { return &phaseError{what, err} }

type handshake struct {
	SID          string   `json:"sid"`
	Upgrades     []string `json:"upgrades"`
	PingInterval int64    `json:"pingInterval"`
	PingTimeout  int64    `json:"pingTimeout"`
	MaxPayload   int64    `json:"maxPayload"`
}

type outgoing struct {
	packet  string
	written func()
}

// wire supports the text-only root namespace used by ClassQuiz. One reader and
// one writer per connection; no goroutine is created for a broadcast packet.
type wire struct {
	ctx        context.Context
	cancel     context.CancelFunc
	c          config
	http       *http.Client
	ws         *websocket.Conn
	engine     handshake
	transport  string
	queue      chan outgoing
	errMu      sync.Mutex
	err        error
	closed     sync.Once
	writerDone chan struct{}
	lastPing   time.Time
	reader     *bufio.Reader
	counter    sampleReader
	trace      func(string, string, string)
	rx, tx     *atomic.Uint64
	packets    *atomic.Uint64
}

func engineURL(c config, transport, sid string) string {
	path := c.socketPath
	if path == "" {
		path = "/socket.io/"
	}
	u, _ := url.Parse(c.endpoint(path))
	q := u.Query()
	q.Set("EIO", "4")
	q.Set("transport", transport)
	if sid != "" {
		q.Set("sid", sid)
	}
	u.RawQuery = q.Encode()
	if transport == "websocket" {
		if u.Scheme == "https" {
			u.Scheme = "wss"
		} else {
			u.Scheme = "ws"
		}
	}
	return u.String()
}

func openWire(ctx context.Context, c config, hc *http.Client, trace func(string, string, string), rx, tx, packets *atomic.Uint64) (*wire, error) {
	ctx, cancel := context.WithCancel(ctx)
	w := &wire{ctx: ctx, cancel: cancel, c: c, http: hc, queue: make(chan outgoing, 8), writerDone: make(chan struct{}), lastPing: time.Now(), trace: trace, rx: rx, tx: tx, packets: packets}
	setup, stop := context.WithTimeout(ctx, c.Timeout)
	defer stop()
	var err error
	if c.Transport == "websocket" {
		w.ws, err = w.dialWS(setup, "")
		if err == nil {
			w.transport = "websocket"
			w.ws.SetReadDeadline(time.Now().Add(c.Timeout))
			_, r, e := w.ws.NextReader()
			err = e
			if err == nil {
				err = w.readOpen(r)
			}
		}
	} else {
		w.transport = "polling"
		var resp *http.Response
		resp, err = w.request(setup, "GET", "", "")
		if err == nil {
			err = w.readOpen(io.LimitReader(resp.Body, 1<<20))
			resp.Body.Close()
		}
		if err == nil && c.Transport == "auto" {
			for _, upgrade := range w.engine.Upgrades {
				if upgrade != "websocket" {
					continue
				}
				var ws *websocket.Conn
				ws, err = w.dialWS(setup, w.engine.SID)
				if err != nil {
					w.trace("upgrade_failed", "polling", err.Error())
					err = nil
					break
				}
				ws.SetReadDeadline(time.Now().Add(c.Timeout))
				ws.SetWriteDeadline(time.Now().Add(c.Timeout))
				if err = ws.WriteMessage(websocket.TextMessage, []byte("2probe")); err == nil {
					var kind int
					var msg []byte
					kind, msg, err = ws.ReadMessage()
					if err == nil && (kind != websocket.TextMessage || string(msg) != "3probe") {
						err = errors.New("invalid WebSocket probe response")
					}
				}
				if err == nil {
					err = ws.WriteMessage(websocket.TextMessage, []byte("5"))
				}
				if err != nil {
					ws.Close()
					break
				} // An incomplete probe can invalidate the Engine.IO session.
				w.ws = ws
				w.transport = "websocket"
				break
			}
		}
	}
	if err != nil {
		cancel()
		if w.ws != nil {
			w.ws.Close()
		}
		return nil, phase("transport", err)
	}
	if w.engine.SID == "" || w.engine.PingInterval <= 0 || w.engine.PingTimeout <= 0 {
		cancel()
		if w.ws != nil {
			w.ws.Close()
		}
		return nil, phase("handshake", errors.New("invalid Engine.IO open packet"))
	}
	w.lastPing = time.Now()
	go w.writeLoop()
	go func() {
		<-ctx.Done()
		if w.ws != nil {
			w.ws.Close()
		}
	}()
	return w, nil
}

func (w *wire) dialWS(ctx context.Context, sid string) (*websocket.Conn, error) {
	d := websocket.Dialer{HandshakeTimeout: w.c.Timeout, ReadBufferSize: 512, WriteBufferSize: 512, WriteBufferPool: &writeBuffers, EnableCompression: true, Proxy: http.ProxyFromEnvironment}
	headers := http.Header{"Origin": {w.c.base.Scheme + "://" + w.c.base.Host}}
	ws, resp, err := d.DialContext(ctx, engineURL(w.c, "websocket", sid), headers)
	if err != nil {
		if resp != nil {
			status := resp.StatusCode
			resp.Body.Close()
			return nil, fmt.Errorf("WebSocket HTTP %d: %w", status, err)
		}
		return nil, err
	}
	ws.SetReadLimit(maxPacketBytes)
	return ws, nil
}

func (w *wire) request(ctx context.Context, method, packet, sid string) (*http.Response, error) {
	r, err := http.NewRequestWithContext(ctx, method, engineURL(w.c, "polling", sid), strings.NewReader(packet))
	if err != nil {
		return nil, err
	}
	r.Header.Set("Origin", w.c.base.Scheme+"://"+w.c.base.Host)
	if method == "POST" {
		r.Header.Set("Content-Type", "text/plain;charset=UTF-8")
	}
	resp, err := w.http.Do(r)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, fmt.Errorf("polling %s HTTP %d", method, resp.StatusCode)
	}
	return resp, nil
}

func (w *wire) readOpen(r io.Reader) error {
	b := bufio.NewReader(r)
	kind, err := b.ReadByte()
	if err != nil {
		return err
	}
	if kind != '0' {
		return errors.New("expected Engine.IO open packet")
	}
	if err = json.NewDecoder(b).Decode(&w.engine); err != nil {
		return err
	}
	return nil
}

func (w *wire) send(packet string, written func()) error {
	if w.ctx.Err() != nil {
		return w.ctx.Err()
	}
	select {
	case w.queue <- outgoing{packet, written}:
		return nil
	default:
		return phase("write", errors.New("outgoing queue full; generator or target cannot keep up"))
	}
}

func (w *wire) emit(event string, data any, written func()) error {
	b, err := json.Marshal([]any{event, data})
	if err != nil {
		return err
	}
	return w.send("42"+string(b), written)
}

func (w *wire) fail(err error) {
	w.errMu.Lock()
	if w.err == nil {
		w.err = err
	}
	w.errMu.Unlock()
	w.cancel()
}

func (w *wire) writeLoop() {
	defer close(w.writerDone)
	for {
		select {
		case <-w.ctx.Done():
			return
		case o := <-w.queue:
			w.trace("send", w.transport, o.packet)
			var err error
			if w.ws != nil {
				w.ws.SetWriteDeadline(time.Now().Add(w.c.Timeout))
				err = w.ws.WriteMessage(websocket.TextMessage, []byte(o.packet))
			} else {
				ctx, cancel := context.WithTimeout(w.ctx, w.c.Timeout)
				var resp *http.Response
				resp, err = w.request(ctx, "POST", o.packet, w.engine.SID)
				if resp != nil {
					_, errCopy := io.Copy(io.Discard, resp.Body)
					resp.Body.Close()
					if err == nil {
						err = errCopy
					}
				}
				cancel()
			}
			if err != nil {
				w.fail(phase("write", err))
				return
			}
			w.tx.Add(uint64(len(o.packet)))
			if o.written != nil {
				o.written()
			}
		}
	}
}

// reader is consumed synchronously. Large result bodies can be discarded or
// decoded as streams instead of being retained separately by every player.
func (w *wire) serve(handle func(byte, io.Reader) error) error {
	for w.ctx.Err() == nil {
		var err error
		deadline := w.lastPing.Add(time.Duration(w.engine.PingInterval+w.engine.PingTimeout) * time.Millisecond)
		if w.ws != nil {
			w.ws.SetReadDeadline(deadline)
			var kind int
			var r io.Reader
			kind, r, err = w.ws.NextReader()
			if err == nil && kind != websocket.TextMessage {
				err = errors.New("unsupported binary Engine.IO packet")
			}
			if err == nil {
				err = w.processPacket(r, handle)
			}
		} else {
			ctx, cancel := context.WithDeadline(w.ctx, deadline)
			var resp *http.Response
			resp, err = w.request(ctx, "GET", "", w.engine.SID)
			if err == nil {
				br := bufio.NewReaderSize(resp.Body, 4096)
				for {
					if _, e := br.Peek(1); e == io.EOF {
						break
					} else if e != nil {
						err = e
						break
					}
					r := &recordReader{br: br}
					if err = w.processPacket(r, handle); err != nil {
						break
					}
				}
				resp.Body.Close()
			}
			cancel()
		}
		if err != nil {
			w.fail(phase("read", err))
			break
		}
	}
	w.errMu.Lock()
	err := w.err
	w.errMu.Unlock()
	if err == nil {
		err = w.ctx.Err()
	}
	return err
}

type sampleReader struct {
	r        io.Reader
	bytes    int64
	sample   []byte
	trace    bool
	terminal error
}

func (r *sampleReader) Read(p []byte) (int, error) {
	if r.terminal != nil {
		return 0, r.terminal
	}
	n, err := r.r.Read(p)
	if err != nil {
		r.terminal = err
	}
	r.bytes += int64(n)
	if r.trace && len(r.sample) < 4096 {
		keep := min(n, 4096-len(r.sample))
		r.sample = append(r.sample, p[:keep]...)
	}
	if r.bytes > maxPacketBytes {
		return n, errors.New("Engine.IO packet exceeds 256 MiB")
	}
	return n, err
}

func (w *wire) processPacket(r io.Reader, handle func(byte, io.Reader) error) error {
	w.counter = sampleReader{r: r, trace: w.c.Verbosity >= 4}
	s := &w.counter
	if w.reader == nil {
		w.reader = bufio.NewReaderSize(s, 512)
	} else {
		w.reader.Reset(s)
	}
	br := w.reader
	kind, err := br.ReadByte()
	if err != nil {
		return err
	}
	switch kind {
	case '2':
		w.lastPing = time.Now()
		var data []byte
		data, err = io.ReadAll(io.LimitReader(br, 1024))
		if err == nil {
			err = w.send("3"+string(data), nil)
		}
	case '1':
		err = errors.New("server closed the Engine.IO session")
	case '4':
		var typ byte
		typ, err = br.ReadByte()
		if err == nil {
			err = handle(typ, br)
		}
	case '6': // polling no-op
	default:
		err = fmt.Errorf("unsupported Engine.IO packet type %q", kind)
	}
	if err == nil {
		_, err = io.Copy(io.Discard, br)
	}
	w.rx.Add(uint64(s.bytes))
	w.packets.Add(1)
	if len(s.sample) > 0 {
		sample := string(s.sample)
		if s.bytes > int64(len(s.sample)) {
			sample += "... <truncated>"
		}
		w.trace("recv", w.transport, sample)
	}
	return err
}

func (w *wire) close() {
	w.closed.Do(func() {
		// Let an already-running write finish before releasing the transport.
		w.cancel()
		if w.ws != nil {
			w.ws.Close()
		}
		<-w.writerDone
	})
}

// A record separator delimits polling packets. ReadSlice limits memory even for
// large result arrays and does not consume the following packet.
type recordReader struct {
	br      *bufio.Reader
	pending []byte
	end     bool
}

func (r *recordReader) Read(p []byte) (int, error) {
	if len(p) == 0 {
		return 0, nil
	}
	if len(r.pending) == 0 {
		if r.end {
			return 0, io.EOF
		}
		s, err := r.br.ReadSlice(0x1e)
		if err == nil {
			s = s[:len(s)-1]
			r.end = true
		} else if err == io.EOF {
			r.end = true
		} else if err != bufio.ErrBufferFull {
			return 0, err
		}
		r.pending = s
	}
	n := copy(p, r.pending)
	r.pending = r.pending[n:]
	if n == 0 && r.end {
		return 0, io.EOF
	}
	return n, nil
}

func readEvent(r io.Reader) (string, *json.Decoder, error) {
	br, ok := r.(*bufio.Reader)
	if !ok {
		br = bufio.NewReaderSize(r, 512)
	}
	next := func() (byte, error) {
		for {
			b, err := br.ReadByte()
			if err != nil {
				return b, err
			}
			if b != ' ' && b != '\t' && b != '\n' && b != '\r' {
				return b, nil
			}
		}
	}
	b, err := next()
	if err != nil {
		return "", nil, err
	}
	if b != '[' {
		return "", nil, errors.New("Socket.IO event payload must be an array")
	}
	b, err = next()
	if err != nil {
		return "", nil, err
	}
	if b != '"' {
		return "", nil, errors.New("Socket.IO event name must be a string")
	}
	var small [128]byte
	name := append(small[:0], '"')
	escaped := false
	for {
		b, err = br.ReadByte()
		if err != nil {
			return "", nil, err
		}
		name = append(name, b)
		if len(name) > 1024 {
			return "", nil, errors.New("Socket.IO event name too long")
		}
		if b == '"' && !escaped {
			break
		}
		if b == '\\' && !escaped {
			escaped = true
		} else {
			escaped = false
		}
	}
	var event string
	if err = json.Unmarshal(name, &event); err != nil {
		return "", nil, err
	}
	b, err = next()
	if err != nil {
		return "", nil, err
	}
	if b != ',' && b != ']' {
		return "", nil, errors.New("invalid Socket.IO event argument separator")
	}
	// Most broadcasts are ignored. Lazily decode only the event body when its
	// handler needs it; do not allocate decoder buffers for every notification.
	return event, json.NewDecoder(br), nil
}
