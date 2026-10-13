// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
)

var ticksOnce sync.Once
var clockTicks = 100.0

func processResources() (uint64, float64) {
	ticksOnce.Do(func() {
		if out, err := exec.Command("getconf", "CLK_TCK").Output(); err == nil {
			if n, e := strconv.ParseFloat(strings.TrimSpace(string(out)), 64); e == nil && n > 0 {
				clockTicks = n
			}
		}
	})
	var rss uint64
	if data, err := os.ReadFile("/proc/self/statm"); err == nil {
		f := strings.Fields(string(data))
		if len(f) > 1 {
			n, _ := strconv.ParseUint(f[1], 10, 64)
			rss = n * uint64(os.Getpagesize())
		}
	}
	var cpu float64
	if data, err := os.ReadFile("/proc/self/stat"); err == nil {
		s := string(data)
		i := strings.LastIndex(s, ")")
		if i >= 0 {
			f := strings.Fields(s[i+1:])
			if len(f) > 12 {
				u, _ := strconv.ParseFloat(f[11], 64)
				k, _ := strconv.ParseFloat(f[12], 64)
				cpu = (u + k) / clockTicks
			}
		}
	}
	return rss, cpu
}
