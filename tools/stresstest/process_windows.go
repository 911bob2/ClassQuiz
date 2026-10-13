// SPDX-License-Identifier: MPL-2.0
package main

import (
	"syscall"
	"unsafe"
)

var kernel32 = syscall.NewLazyDLL("kernel32.dll")
var memoryInfo = kernel32.NewProc("K32GetProcessMemoryInfo")
var processTimes = kernel32.NewProc("GetProcessTimes")

type memoryCounters struct {
	Cb, PageFaults                                                                                  uint32
	PeakWorking, Working, PeakPaged, Paged, PeakNonpaged, Nonpaged, Pagefile, PeakPagefile, Private uintptr
}
type fileTime struct{ Low, High uint32 }

func processResources() (uint64, float64) {
	p := ^uintptr(0)
	m := memoryCounters{}
	m.Cb = uint32(unsafe.Sizeof(m))
	memoryInfo.Call(p, uintptr(unsafe.Pointer(&m)), uintptr(m.Cb))
	var creation, exit, kernel, user fileTime
	processTimes.Call(p, uintptr(unsafe.Pointer(&creation)), uintptr(unsafe.Pointer(&exit)), uintptr(unsafe.Pointer(&kernel)), uintptr(unsafe.Pointer(&user)))
	cpu := (uint64(kernel.High)<<32 | uint64(kernel.Low)) + (uint64(user.High)<<32 | uint64(user.Low))
	return uint64(m.Working), float64(cpu) / 1e7
}
