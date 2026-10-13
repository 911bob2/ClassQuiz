// SPDX-License-Identifier: MPL-2.0
package main

import (
	"os/exec"
	"syscall"
)

func hideProcess(c *exec.Cmd) { c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true} }
