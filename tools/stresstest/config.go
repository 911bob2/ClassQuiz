// SPDX-License-Identifier: MPL-2.0
package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"net/url"
	"regexp"
	"strings"
	"time"
)

type config struct {
	Target          string        `json:"target"`
	Users           int           `json:"users"`
	Code            string        `json:"code"`
	Traffic         string        `json:"traffic"`
	AnswerMode      string        `json:"answer_mode"`
	AnswerMin       time.Duration `json:"answer_min_ns"`
	AnswerMax       time.Duration `json:"answer_max_ns"`
	RampUp          time.Duration `json:"ramp_up_ns"`
	JoinConcurrency int           `json:"join_concurrency"`
	Transport       string        `json:"transport"`
	Duration        time.Duration `json:"duration_ns"`
	Timeout         time.Duration `json:"timeout_ns"`
	MonitorSSH      string        `json:"monitor_ssh,omitempty"`
	Output          string        `json:"output,omitempty"`
	Verbosity       int           `json:"verbosity"`
	Seed            uint64        `json:"seed"`
	CustomField     string        `json:"custom_field,omitempty"`
	base            *url.URL
}

func parseConfig(args []string, out io.Writer) (config, error) {
	c := config{}
	f := flag.NewFlagSet("stresstest", flag.ContinueOnError)
	f.SetOutput(out)
	f.StringVar(&c.Target, "target", "", "ClassQuiz base URL (required)")
	f.IntVar(&c.Users, "users", 0, "number of independent players (required)")
	f.StringVar(&c.Code, "code", "", "six-digit room code (required)")
	f.StringVar(&c.Traffic, "traffic", "gameplay", "gameplay or media")
	f.StringVar(&c.AnswerMode, "answer-mode", "spread", "spread or burst")
	f.DurationVar(&c.AnswerMin, "answer-min", 500*time.Millisecond, "minimum random answer delay")
	f.DurationVar(&c.AnswerMax, "answer-max", 5*time.Second, "maximum random answer delay")
	f.DurationVar(&c.RampUp, "ramp-up", 30*time.Second, "time over which players begin joining (0s for simultaneous)")
	f.IntVar(&c.JoinConcurrency, "join-concurrency", 128, "maximum concurrent transport handshakes")
	f.StringVar(&c.Transport, "transport", "auto", "auto (polling then upgrade), websocket, or polling")
	f.DurationVar(&c.Duration, "duration", 0, "optional run duration, including ramp-up")
	f.DurationVar(&c.Timeout, "timeout", 20*time.Second, "handshake, join and HTTP request timeout")
	f.StringVar(&c.MonitorSSH, "monitor-ssh", "", "optional SSH alias for read-only VM metrics")
	f.StringVar(&c.Output, "output", "", "optional final JSON report path")
	f.IntVar(&c.Verbosity, "verbosity", 1, "0 summary, 1 progress, 2 connections, 3 events, 4 packet traces")
	f.Uint64Var(&c.Seed, "seed", 0, "random seed; 0 generates a seed")
	f.StringVar(&c.CustomField, "custom-field", "", "value for the lobby's optional custom player field")
	f.Usage = func() {
		fmt.Fprintln(out, "Usage: stresstest --target https://quiz.911bob.dev --users 1000 --code 123456 [flags]")
		fmt.Fprintln(out, "You host the quiz normally. Stop with Ctrl+C or reveal final results.")
		f.PrintDefaults()
	}
	if err := f.Parse(args); err != nil {
		return c, err
	}
	if f.NArg() != 0 {
		return c, fmt.Errorf("unexpected arguments: %v", f.Args())
	}
	u, err := url.Parse(c.Target)
	if err != nil || u == nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return c, errors.New("--target must be an http(s) base URL without credentials, query or fragment")
	}
	if c.Users < 1 || c.Users > 1_000_000 {
		return c, errors.New("--users must be between 1 and 1000000")
	}
	if !regexp.MustCompile(`^[0-9]{6}$`).MatchString(c.Code) {
		return c, errors.New("--code must contain exactly six digits")
	}
	if c.Traffic != "gameplay" && c.Traffic != "media" {
		return c, errors.New("--traffic must be gameplay or media")
	}
	if c.AnswerMode != "spread" && c.AnswerMode != "burst" {
		return c, errors.New("--answer-mode must be spread or burst")
	}
	if c.Transport != "auto" && c.Transport != "websocket" && c.Transport != "polling" {
		return c, errors.New("--transport must be auto, websocket or polling")
	}
	if c.AnswerMin < 0 || c.AnswerMax < c.AnswerMin || c.RampUp < 0 || c.Duration < 0 || c.Timeout <= 0 || c.JoinConcurrency < 1 {
		return c, errors.New("invalid duration or concurrency value")
	}
	if c.Verbosity < 0 || c.Verbosity > 4 {
		return c, errors.New("--verbosity must be 0 through 4")
	}
	if c.MonitorSSH != "" && !regexp.MustCompile(`^[A-Za-z0-9_][A-Za-z0-9_.-]*$`).MatchString(c.MonitorSSH) {
		return c, errors.New("--monitor-ssh must be an SSH config alias")
	}
	u.Path = strings.TrimRight(u.Path, "/")
	c.base = u
	c.Target = u.String()
	return c, nil
}

func (c config) endpoint(path string) string {
	u := *c.base
	u.Path += path
	u.RawPath = ""
	return u.String()
}
