"""Offline verdict/config regression checks, run with the lab's Python environment."""

import unittest
from types import SimpleNamespace
from unittest.mock import patch
from classquiz.captcha import CaptchaVerifier, configuration, valid_response


class CaptchaTests(unittest.IsolatedAsyncioTestCase):
    def test_google_verdicts(self):
        policy = dict(
            provider="recaptcha_v3", action="classquiz_join", min_score=0.5, allowed_hostnames=["quiz.example"]
        )
        good = dict(success=True, score=0.9, hostname="quiz.example", action="classquiz_join")
        self.assertTrue(valid_response(policy, good))
        for key, value in [
            ("success", 1),
            ("hostname", "evil.example"),
            ("action", "login"),
            ("score", True),
            ("score", None),
            ("score", "0.9"),
            ("score", 0.1),
            ("score", float("nan")),
            ("score", float("inf")),
            ("score", 10**400),
            ("error-codes", ["Over free quota."]),
        ]:
            with self.subTest(key=key, value=str(value)[:20]):
                self.assertFalse(valid_response(policy, {**good, key: value}))

    def test_hcaptcha_hostname_is_not_authentication(self):
        policy = dict(provider="hcaptcha")
        self.assertTrue(valid_response(policy, dict(success=True, hostname="not-provided")))
        for bad in [None, [], {}, dict(success=False), dict(success=True, **{"error-codes": ["invalid-input-secret"]})]:
            self.assertFalse(valid_response(policy, bad))

    def test_configuration(self):
        values = dict(
            captcha_provider="hcaptcha",
            captcha_site_key=None,
            captcha_secret_key=None,
            captcha_allowed_hostnames=None,
            captcha_recaptcha_min_score=0.5,
            root_address="https://quiz.example",
            hcaptcha_site_key=None,
            recaptcha_site_key=None,
            hcaptcha_key=None,
            recaptcha_key=None,
        )
        with patch.dict("os.environ", {"VITE_HCAPTCHA": "", "VITE_RECAPTCHA": ""}):
            with patch("classquiz.captcha.settings", return_value=SimpleNamespace(**values)):
                self.assertEqual(configuration(), (None, ""))
            values.update(hcaptcha_site_key="legacy-public", hcaptcha_key="legacy-private")
            with patch("classquiz.captcha.settings", return_value=SimpleNamespace(**values)):
                policy, secret = configuration()
                self.assertEqual(policy["site_key"], "legacy-public")
                self.assertEqual(secret, "legacy-private")
                self.assertNotIn("secret", policy)
            values.update(captcha_provider="none")
            with patch("classquiz.captcha.settings", return_value=SimpleNamespace(**values)):
                self.assertEqual(configuration(), (None, ""))

    async def test_missing_configuration_fails_without_network(self):
        verifier = CaptchaVerifier(None, "")
        self.assertEqual(await verifier.verify("anything"), "captcha_unavailable")
        self.assertIsNone(verifier.session)


if __name__ == "__main__":
    unittest.main()
