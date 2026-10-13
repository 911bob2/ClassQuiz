// SPDX-License-Identifier: MPL-2.0
package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type mediaJob struct {
	ctx  context.Context
	src  string
	info bool
}
type mediaPlayer struct {
	ctx           context.Context
	cancel        context.CancelFunc
	c             config
	hc            *http.Client
	m             *metrics
	log           *logger
	id            int
	jobs          chan mediaJob
	done          chan struct{}
	mu            sync.Mutex
	currentCancel context.CancelFunc
	cache         map[string]bool
}

func newMediaPlayer(ctx context.Context, c config, hc *http.Client, m *metrics, l *logger, id int) *mediaPlayer {
	ctx, cancel := context.WithCancel(ctx)
	p := &mediaPlayer{ctx: ctx, cancel: cancel, c: c, hc: hc, m: m, log: l, id: id, jobs: make(chan mediaJob, 2), done: make(chan struct{}), cache: make(map[string]bool)}
	go p.loop()
	return p
}
func (p *mediaPlayer) enqueue(ctx context.Context, src string, info bool) {
	select {
	case p.jobs <- mediaJob{ctx, src, info}:
	default:
		p.m.error("media", "download queue full", "media scheduler cannot keep up")
	}
}
func (p *mediaPlayer) cancelCurrent() {
	p.mu.Lock()
	if p.currentCancel != nil {
		p.currentCancel()
	}
	p.mu.Unlock()
}
func (p *mediaPlayer) close() { p.cancel(); p.cancelCurrent(); <-p.done }
func (p *mediaPlayer) loop() {
	defer close(p.done)
	for {
		select {
		case <-p.ctx.Done():
			return
		case job := <-p.jobs:
			if job.ctx.Err() != nil {
				continue
			}
			ctx, cancel := context.WithCancel(job.ctx)
			stop := context.AfterFunc(p.ctx, cancel)
			p.mu.Lock()
			p.currentCancel = cancel
			p.mu.Unlock()
			err := p.fetch(ctx, job.src, job.info)
			if err != nil && ctx.Err() == nil {
				p.m.error("media", failureReason(err), err.Error())
				p.log.log(2, p.id, "media error: %s", err)
			}
			cancel()
			stop()
			p.mu.Lock()
			p.currentCancel = nil
			p.mu.Unlock()
		}
	}
}
func (p *mediaPlayer) get(ctx context.Context, path string, video bool) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", p.c.endpoint(path), nil)
	if err != nil {
		return nil, err
	}
	if video {
		req.Header.Set("Range", "bytes=0-1048575")
	}
	p.m.mediaRequests.Add(1)
	p.log.log(3, p.id, "media GET %s range=%t", path, video)
	resp, err := p.hc.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != 200 && resp.StatusCode != 206 {
		resp.Body.Close()
		return nil, fmt.Errorf("media %s HTTP %d", path, resp.StatusCode)
	}
	return resp, nil
}
func (p *mediaPlayer) fetch(ctx context.Context, src string, info bool) error {
	if src == "" || strings.ContainsAny(src, "/?#\\") {
		return fmt.Errorf("invalid storage media identifier %q", src)
	}
	ctx, cancel := context.WithTimeout(ctx, p.c.Timeout)
	defer cancel()
	start := time.Now()
	defer func() { p.m.duration("media", time.Since(start)) }()
	video := false
	if info {
		resp, err := p.get(ctx, "/api/v1/storage/info/"+url.PathEscape(src), false)
		if err != nil {
			return err
		}
		video = strings.HasPrefix(resp.Header.Get("Content-Type"), "video/")
		n, err := io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10))
		resp.Body.Close()
		p.m.mediaBytes.Add(uint64(n))
		if err != nil {
			return err
		}
	}
	key := fmt.Sprintf("%t:%s", video, src)
	if p.cache[key] {
		p.m.cacheHits.Add(1)
		return nil
	}
	resp, err := p.get(ctx, "/api/v1/storage/download/"+url.PathEscape(src), video)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	var reader io.Reader = resp.Body
	if video {
		reader = io.LimitReader(reader, 1<<20)
	}
	n, err := io.Copy(io.Discard, reader)
	p.m.mediaBytes.Add(uint64(n))
	if err != nil {
		return err
	}
	if !video && resp.ContentLength >= 0 && n != resp.ContentLength {
		return fmt.Errorf("incomplete image download: got %d of %d bytes", n, resp.ContentLength)
	}
	if len(p.cache) >= 4096 {
		clear(p.cache)
	}
	p.cache[key] = true
	return nil
}
