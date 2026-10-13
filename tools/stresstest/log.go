// SPDX-License-Identifier: MPL-2.0
package main

import (
	"fmt"
	"io"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type logger struct {
	level   int
	out     io.Writer
	queue   chan string
	done    chan struct{}
	dropped atomic.Uint64
	once    sync.Once
}

func newLogger(level int, out io.Writer) *logger {
	l := &logger{level: level, out: out, queue: make(chan string, 1024), done: make(chan struct{})}
	go func() {
		defer close(l.done)
		for s := range l.queue {
			fmt.Fprintln(l.out, s)
		}
	}()
	return l
}

func (l *logger) log(level int, id int, format string, args ...any) {
	if l.level < level {
		return
	}
	prefix := time.Now().UTC().Format("15:04:05.000")
	if id > 0 {
		prefix += fmt.Sprintf(" bot=%d", id)
	}
	s := prefix + " " + fmt.Sprintf(format, args...)
	select {
	case l.queue <- s:
	default:
		l.dropped.Add(1)
	}
}

var signedQuery = regexp.MustCompile(`(?i)(X-Amz-[A-Za-z-]+|signature|token|credential)=[^&\s"\\]+`)

func traceSample(s string) string {
	if strings.Contains(s, `"time_sync"`) || strings.Contains(s, `"echo_time_sync"`) || strings.Contains(s, `"session_id"`) {
		return "<session/time-sync packet redacted>"
	}
	s = signedQuery.ReplaceAllString(s, "$1=<redacted>")
	return s
}

func (l *logger) close() { l.once.Do(func() { close(l.queue); <-l.done }) }
