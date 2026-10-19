# SPDX-License-Identifier: MPL-2.0
"""Single-owner native process supervisor. Safe to import without enabling Rust.

Run this file as a dedicated service; never spawn one child per API worker.
"""

import asyncio
import hashlib
import os
import signal
import time
import logging
from pathlib import Path

import aiohttp


class RustRealtime:
    def __init__(self, binary: str, redis_url: str, *, port=81, threads=4, redis_connections=8):
        self.binary = Path(binary).resolve(strict=True)
        with self.binary.open("rb") as stream:
            self.binary_sha256 = hashlib.file_digest(stream, "sha256").hexdigest()
        self.redis_url = redis_url
        self.port = port
        self.threads = threads
        self.redis_connections = redis_connections
        self.process = None
        self._fd_count = 0
        self._fd_sample_at = 0.0
        self._stopping = False
        self._monitor = None

    async def start(self):
        if self.process is not None and self.process.returncode is None:
            raise RuntimeError("Rust runtime already started")
        env = dict(os.environ, CLASSQUIZ_REDIS=self.redis_url, RUST_LOG="warn")
        self._stopping = False
        self._fd_count = 0
        self._fd_sample_at = 0.0
        self.process = await asyncio.create_subprocess_exec(
            str(self.binary),
            "--listen",
            f"0.0.0.0:{self.port}",
            "--threads",
            str(self.threads),
            "--redis-connections",
            str(self.redis_connections),
            env=env,
        )
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=1)) as http:
                until = time.monotonic() + 45
                while time.monotonic() < until:
                    if self.process.returncode is not None:
                        raise RuntimeError(f"Rust runtime exited with {self.process.returncode}")
                    try:
                        async with http.get(f"http://127.0.0.1:{self.port}/health") as response:
                            if response.status == 200:
                                return
                    except (aiohttp.ClientError, asyncio.TimeoutError):
                        pass
                    await asyncio.sleep(0.1)
            raise RuntimeError("Rust runtime did not become ready")
        except BaseException:
            await self.stop()
            raise

    async def stop(self):
        self._stopping = True
        if self._monitor and self._monitor is not asyncio.current_task():
            self._monitor.cancel()
            await asyncio.gather(self._monitor, return_exceptions=True)
        if self.process is None or self.process.returncode is not None:
            return
        self.process.send_signal(signal.SIGINT)
        try:
            await asyncio.wait_for(self.process.wait(), 10)
        except asyncio.TimeoutError:
            self.process.kill()
            await self.process.wait()

    def supervise(self):
        if self._monitor and not self._monitor.done():
            raise RuntimeError("Rust supervisor is already running")
        self._monitor = asyncio.create_task(self._restart_loop())

    async def _restart_loop(self):
        delay = 0.5
        while not self._stopping:
            born = time.monotonic()
            await self.process.wait()
            while not self._stopping:
                logging.error("Rust realtime exited; restarting in %.1fs", delay)
                await asyncio.sleep(delay)
                try:
                    await self.start()
                    delay = 0.5 if time.monotonic() - born > 60 else min(10, delay * 2)
                    break
                except Exception:
                    self._stopping = False
                    logging.exception("Rust restart failed")
                    delay = min(10, delay * 2)

    async def metrics(self):
        if self.process is None or self.process.returncode is not None:
            raise RuntimeError("Rust runtime is not running")
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as http:
            async with http.get(f"http://127.0.0.1:{self.port}/__rust/metrics") as response:
                response.raise_for_status()
                return await response.json()

    def sample(self):
        """Read child CPU/RSS separately: Python getrusage excludes live children."""
        if self.process is None or self.process.returncode is not None:
            return None
        try:
            return self._sample_process(self.process.pid)
        except (OSError, KeyError, ValueError):
            # The child can exit between the returncode check and /proc reads.
            return None

    def _sample_process(self, pid):
        root = Path(f"/proc/{pid}")
        fields = (root / "stat").read_text().rsplit(")", 1)[1].split()
        status = dict(line.split(":", 1) for line in (root / "status").read_text().splitlines() if ":" in line)
        # Creating tens of thousands of Path objects every 500 ms measurably
        # perturbs Python GC. Descriptor count changes slowly during admission;
        # CPU/RSS still retain the original 500 ms sampling interval.
        now = time.monotonic()
        if now - self._fd_sample_at >= 5:
            self._fd_count = len(os.listdir(root / "fd"))
            self._fd_sample_at = now
        return {
            "pid": self.process.pid,
            "cpu_s": (int(fields[11]) + int(fields[12])) / os.sysconf("SC_CLK_TCK"),
            "rss_kib": int(status["VmHWM"].split()[0]),
            "current_rss_kib": int(status["VmRSS"].split()[0]),
            "fds": self._fd_count,
            "threads": int(status["Threads"]),
        }


async def main():
    runtime = RustRealtime(
        os.getenv("RUST_REALTIME_BINARY", "/usr/local/bin/classquiz-realtime"),
        os.environ["REDIS"].split("?", 1)[0],
        port=int(os.getenv("RUST_REALTIME_PORT", "81")),
        threads=int(os.getenv("RUST_REALTIME_THREADS", "4")),
    )
    stopped = asyncio.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        asyncio.get_running_loop().add_signal_handler(sig, stopped.set)

    async def run():
        await runtime.start()
        runtime.supervise()
        await stopped.wait()

    running = asyncio.create_task(run())
    stopping = asyncio.create_task(stopped.wait())
    try:
        await asyncio.wait([running, stopping], return_when=asyncio.FIRST_COMPLETED)
        if running.done():
            await running
    finally:
        running.cancel()
        stopping.cancel()
        await asyncio.gather(running, stopping, return_exceptions=True)
        await runtime.stop()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
