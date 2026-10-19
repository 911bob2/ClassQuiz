"""Captcha for Python rooms. Native rooms call their own pooled Rust verifier."""

import asyncio
import json
import math
import os
from urllib.parse import urlparse

import aiohttp

from classquiz.config import settings


def configuration():
    config = settings()
    hkey = config.captcha_site_key or config.hcaptcha_site_key or os.getenv("VITE_HCAPTCHA")
    rkey = config.captcha_site_key or config.recaptcha_site_key or os.getenv("VITE_RECAPTCHA")
    provider = config.captcha_provider or ("recaptcha_v3" if not hkey and rkey else "hcaptcha")
    site_key = hkey if provider == "hcaptcha" else rkey
    secret = config.captcha_secret_key or (config.hcaptcha_key if provider == "hcaptcha" else config.recaptcha_key)
    hostnames = [
        h.strip().lower()
        for h in (config.captcha_allowed_hostnames or urlparse(config.root_address).hostname or "").split(",")
        if h.strip()
    ]
    score = config.captcha_recaptcha_min_score
    if provider not in {"hcaptcha", "recaptcha_v3"} or not site_key or not secret:
        return None, ""
    if not math.isfinite(score) or not 0 <= score <= 1 or (provider == "recaptcha_v3" and not hostnames):
        return None, ""
    return (
        dict(
            provider=provider, site_key=site_key, action="classquiz_join", min_score=score, allowed_hostnames=hostnames
        ),
        secret,
    )


def public_policy():
    return configuration()[0]


def valid_response(policy, data):
    if not isinstance(data, dict) or data.get("success") is not True or data.get("error-codes") not in (None, []):
        return False
    if policy["provider"] == "recaptcha_v3":
        score = data.get("score")
        return (
            isinstance(score, (float, int))
            and not isinstance(score, bool)
            and policy["min_score"] <= score <= 1
            and math.isfinite(score)
            and isinstance(data.get("hostname"), str)
            and data["hostname"].lower() in policy["allowed_hostnames"]
            and data.get("action") == policy["action"]
        )
    return True


class CaptchaVerifier:
    def __init__(self, policy, secret):
        self.policy, self.secret = policy, secret
        self.session = None
        self.pending = 0
        self.requests = asyncio.Semaphore(128)

    async def close(self):
        if self.session is not None:
            await self.session.close()
            self.session = None

    async def verify(self, token, policy=None):
        if not self.policy or (policy is not None and policy != self.policy):
            return "captcha_unavailable"
        if not isinstance(token, str) or not 0 < len(token.encode()) <= 8192:
            return "captcha_required"
        if self.pending >= 384:
            return "captcha_busy"
        self.pending += 1
        acquired = False
        try:
            try:
                await asyncio.wait_for(self.requests.acquire(), 2)
                acquired = True
            except asyncio.TimeoutError:
                return "captcha_busy"
            if self.session is None:
                self.session = aiohttp.ClientSession(
                    timeout=aiohttp.ClientTimeout(total=5, connect=2),
                    connector=aiohttp.TCPConnector(limit=128, limit_per_host=128, ttl_dns_cache=90),
                    auto_decompress=False,
                )
            endpoint = (
                "https://api.hcaptcha.com/siteverify"
                if self.policy["provider"] == "hcaptcha"
                else "https://www.google.com/recaptcha/api/siteverify"
            )
            body = dict(secret=self.secret, response=token)
            if self.policy["provider"] == "hcaptcha":
                body["sitekey"] = self.policy["site_key"]
            # Decompression is off so the size cap applies to the wire bytes; ask
            # the provider not to compress, or the JSON parse below would fail.
            async with self.session.post(
                endpoint, data=body, headers={"Accept-Encoding": "identity"}, allow_redirects=False
            ) as response:
                if response.status != 200:
                    return "captcha_unavailable"
                raw = bytearray()
                async for chunk in response.content.iter_chunked(4096):
                    raw.extend(chunk)
                    if len(raw) > 16384:
                        return "captcha_unavailable"
                data = json.loads(raw)
                return None if valid_response(self.policy, data) else "captcha_failed"
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError, TypeError):
            return "captcha_unavailable"
        finally:
            if acquired:
                self.requests.release()
            self.pending -= 1


_verifier = None


async def verify_captcha(token, policy=None):
    global _verifier
    if _verifier is None:
        _verifier = CaptchaVerifier(*configuration())
    return await _verifier.verify(token, policy)


async def close_verifier():
    global _verifier
    if _verifier is not None:
        await _verifier.close()
        _verifier = None
