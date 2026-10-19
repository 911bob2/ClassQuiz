"""Independent fixed-rate probes; host result JSON decoding cannot stall these."""

import argparse
import asyncio
import json
import time
from pathlib import Path

import aiohttp


async def main():
    p = argparse.ArgumentParser()
    p.add_argument("--pin", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--state", required=True)
    p.add_argument("--rust", action="store_true")
    args = p.parse_args()
    state = Path(args.state)
    records = []
    pending = set()
    skipped = 0
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=20)) as http:

        async def probe(kind, url, phase):
            sample = dict(kind=kind, phase=phase, time=time.time())
            at = time.perf_counter()
            try:
                async with http.get(url) as response:
                    await response.read()
                    sample["status"] = response.status
            except Exception as exc:
                sample["error"] = repr(exc)
            sample["ms"] = (time.perf_counter() - at) * 1000
            records.append(sample)

        due = time.monotonic()
        while True:
            phase = state.read_text().strip()
            if phase == "stop":
                break
            for kind, url in [("python", f"http://proxy:8080/api/v1/quiz/play/check_captcha/{args.pin}")] + (
                [("rust", "http://api:81/health")] if args.rust else []
            ):
                if len(pending) >= 40:
                    skipped += 1
                    continue
                task = asyncio.create_task(probe(kind, url, phase))
                pending.add(task)
                task.add_done_callback(pending.discard)
            due += 0.1
            await asyncio.sleep(max(0, due - time.monotonic()))
            if time.monotonic() - due > 1:
                due = time.monotonic()
        if pending:
            await asyncio.gather(*pending)
    Path(args.output).write_text(json.dumps(dict(samples=records, skipped=skipped)))


if __name__ == "__main__":
    asyncio.run(main())
