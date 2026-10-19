//! Initial-admission verification. Never called by gameplay or authenticated resume.
use crate::store::Store;
use anyhow::{Result, bail, ensure};
use hdrhistogram::Histogram;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    env,
    time::{Duration, Instant},
};
use tokio::sync::Semaphore;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Policy {
    pub provider: String,
    pub site_key: String,
    pub action: String,
    pub min_score: f64,
    pub allowed_hostnames: Vec<String>,
}

fn setting(name: &str) -> Option<String> {
    env::var(name).ok().filter(|v| !v.trim().is_empty())
}
fn positive(name: &str, default: usize) -> Result<usize> {
    let n = setting(name)
        .map(|s| s.parse())
        .transpose()?
        .unwrap_or(default);
    ensure!((1..=10000).contains(&n), "invalid {name}");
    Ok(n)
}
pub fn digest(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}
pub fn binding(game: &Value, name: &str, resume: &str) -> String {
    digest(
        &json!([
            game["game_id"],
            game["game_pin"],
            name,
            resume,
            game["captcha_policy"]
        ])
        .to_string(),
    )
}

struct Statistics {
    outcomes: BTreeMap<String, u64>,
    provider_ms: Histogram<u64>,
    queue_ms: Histogram<u64>,
    peak_inflight: usize,
}
pub struct Captcha {
    pub policy: Option<Policy>,
    secret: String,
    client: reqwest::Client,
    pending: Semaphore,
    requests: Semaphore,
    max_concurrent: usize,
    rate: f64,
    bucket: Mutex<(Instant, f64)>,
    stats: Mutex<Statistics>,
}
impl Captcha {
    pub fn from_env() -> Result<Self> {
        let hkey = setting("CAPTCHA_SITE_KEY")
            .or_else(|| setting("HCAPTCHA_SITE_KEY"))
            .or_else(|| setting("VITE_HCAPTCHA"));
        let rkey = setting("CAPTCHA_SITE_KEY")
            .or_else(|| setting("RECAPTCHA_SITE_KEY"))
            .or_else(|| setting("VITE_RECAPTCHA"));
        let provider = setting("CAPTCHA_PROVIDER").unwrap_or_else(|| {
            if hkey.is_none() && rkey.is_some() {
                "recaptcha_v3".into()
            } else {
                "hcaptcha".into()
            }
        });
        ensure!(
            ["none", "hcaptcha", "recaptcha_v3"].contains(&provider.as_str()),
            "invalid CAPTCHA_PROVIDER"
        );
        let site_key = if provider == "hcaptcha" { hkey } else { rkey };
        let secret = setting("CAPTCHA_SECRET_KEY")
            .or_else(|| {
                setting(if provider == "hcaptcha" {
                    "HCAPTCHA_KEY"
                } else {
                    "RECAPTCHA_KEY"
                })
            })
            .unwrap_or_default();
        let origin = setting("CLASSQUIZ_ORIGIN")
            .or_else(|| setting("ROOT_ADDRESS"))
            .unwrap_or_default();
        let host = reqwest::Url::parse(&origin)
            .ok()
            .and_then(|u| u.host_str().map(str::to_owned))
            .unwrap_or_default();
        let allowed_hostnames: Vec<_> = setting("CAPTCHA_ALLOWED_HOSTNAMES")
            .unwrap_or(host)
            .split(',')
            .map(|s| s.trim().to_ascii_lowercase())
            .filter(|s| !s.is_empty())
            .collect();
        let min_score: f64 = setting("CAPTCHA_RECAPTCHA_MIN_SCORE")
            .map(|s| s.parse())
            .transpose()?
            .unwrap_or(0.5);
        ensure!(
            min_score.is_finite() && (0.0..=1.0).contains(&min_score),
            "invalid CAPTCHA_RECAPTCHA_MIN_SCORE"
        );
        let policy = if provider != "none"
            && !secret.is_empty()
            && (provider != "recaptcha_v3" || !allowed_hostnames.is_empty())
        {
            site_key.map(|site_key| Policy {
                provider,
                site_key,
                action: "classquiz_join".into(),
                min_score,
                allowed_hostnames,
            })
        } else {
            None
        };
        #[cfg(not(feature = "captcha-lab"))]
        if let Some(p) = &policy {
            ensure!(
                !p.site_key.ends_with("-ffff-ffff-ffff-000000000001")
                    && secret != "0x0000000000000000000000000000000000000000",
                "hCaptcha test keys require the lab build"
            );
        }
        let max_concurrent = positive("RUST_CAPTCHA_MAX_CONCURRENT", 128)?;
        let queue = positive("RUST_CAPTCHA_QUEUE", 256)?;
        let rate = positive("RUST_CAPTCHA_RPS", 200)? as f64;
        Ok(Self {
            policy,
            secret,
            client: reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(2))
                .timeout(Duration::from_secs(5))
                .redirect(reqwest::redirect::Policy::none())
                .pool_max_idle_per_host(max_concurrent)
                .pool_idle_timeout(Duration::from_secs(90))
                .build()?,
            pending: Semaphore::new(max_concurrent + queue),
            requests: Semaphore::new(max_concurrent),
            max_concurrent,
            rate,
            bucket: Mutex::new((Instant::now(), max_concurrent as f64)),
            stats: Mutex::new(Statistics {
                outcomes: BTreeMap::new(),
                provider_ms: Histogram::new(3)?,
                queue_ms: Histogram::new(3)?,
                peak_inflight: 0,
            }),
        })
    }
    pub fn metrics(&self) -> Value {
        let s = self.stats.lock();
        let histogram = |h: &Histogram<u64>| json!({"count": h.len(), "p50": h.value_at_quantile(0.5), "p95": h.value_at_quantile(0.95), "p99": h.value_at_quantile(0.99), "max": h.max()});
        json!({"outcomes":s.outcomes, "provider_ms":histogram(&s.provider_ms), "queue_ms":histogram(&s.queue_ms), "inflight":self.max_concurrent-self.requests.available_permits(), "peak_inflight":s.peak_inflight, "max_concurrent":self.max_concurrent, "starts_per_second":self.rate, "lab_build":cfg!(feature="captcha-lab")})
    }
    async fn rate_limit(&self) {
        loop {
            let wait = {
                let mut b = self.bucket.lock();
                let now = Instant::now();
                b.1 = (b.1 + now.duration_since(b.0).as_secs_f64() * self.rate)
                    .min(self.max_concurrent as f64);
                b.0 = now;
                if b.1 >= 1.0 {
                    b.1 -= 1.0;
                    return;
                }
                Duration::from_secs_f64((1.0 - b.1) / self.rate)
            };
            tokio::time::sleep(wait).await;
        }
    }
    pub async fn verify(
        &self,
        store: &Store,
        game: &Value,
        name: &str,
        resume: &str,
        token: Option<&str>,
    ) -> Result<String> {
        let result = self.verify_inner(store, game, name, resume, token).await;
        let outcome = match &result {
            Ok(_) => "accepted",
            Err(e) => match e.to_string().as_str() {
                "captcha_failed" => "rejected",
                "captcha_expired" => "expired",
                "captcha_busy" => "busy",
                "captcha_required" => "missing",
                _ => "unavailable",
            },
        };
        *self
            .stats
            .lock()
            .outcomes
            .entry(outcome.into())
            .or_default() += 1;
        result
    }
    async fn verify_inner(
        &self,
        store: &Store,
        game: &Value,
        name: &str,
        resume: &str,
        token: Option<&str>,
    ) -> Result<String> {
        let policy = self
            .policy
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("captcha_unavailable"))?;
        ensure!(
            serde_json::to_value(policy)? == game["captcha_policy"],
            "captcha_unavailable"
        );
        let proof = binding(game, name, resume);
        if store.captcha_receipt(&proof).await? {
            *self
                .stats
                .lock()
                .outcomes
                .entry("receipt_reused".into())
                .or_default() += 1;
            return Ok(proof);
        }
        let token = token
            .filter(|t| !t.is_empty() && t.len() <= 8192)
            .ok_or_else(|| anyhow::anyhow!("captcha_required"))?;
        let _pending = self
            .pending
            .try_acquire()
            .map_err(|_| anyhow::anyhow!("captcha_busy"))?;
        let queued = Instant::now();
        let _permit = tokio::time::timeout(Duration::from_secs(2), async {
            let permit = self.requests.acquire().await?;
            self.rate_limit().await;
            Ok::<_, anyhow::Error>(permit)
        })
        .await
        .map_err(|_| anyhow::anyhow!("captcha_busy"))??;
        {
            let mut stats = self.stats.lock();
            stats
                .queue_ms
                .record(queued.elapsed().as_millis() as u64)
                .ok();
            stats.peak_inflight = stats
                .peak_inflight
                .max(self.max_concurrent - self.requests.available_permits());
        }
        let token_key = format!(
            "classquiz:captcha:token:{}",
            digest(&json!([policy.provider, policy.site_key, token]).to_string())
        );
        ensure!(
            store.captcha_claim(game, &token_key, &proof).await?,
            "captcha_expired"
        );
        let started = Instant::now();
        let result = self.request(policy, token).await;
        self.stats
            .lock()
            .provider_ms
            .record(started.elapsed().as_millis() as u64)
            .ok();
        result?;
        store.captcha_finish(game, &token_key, &proof).await?;
        Ok(proof)
    }
    async fn request(&self, policy: &Policy, token: &str) -> Result<()> {
        let endpoint = if policy.provider == "hcaptcha" {
            "https://api.hcaptcha.com/siteverify"
        } else {
            "https://www.google.com/recaptcha/api/siteverify"
        };
        #[cfg(feature = "captcha-lab")]
        let override_url = setting("CAPTCHA_TEST_VERIFY_URL");
        #[cfg(feature = "captcha-lab")]
        let endpoint = override_url.as_deref().unwrap_or(endpoint);
        let mut form = vec![("secret", self.secret.as_str()), ("response", token)];
        if policy.provider == "hcaptcha" {
            form.push(("sitekey", policy.site_key.as_str()));
        }
        let mut response = self
            .client
            .post(endpoint)
            .form(&form)
            .send()
            .await
            .map_err(|_| anyhow::anyhow!("captcha_unavailable"))?;
        ensure!(response.status().is_success(), "captcha_unavailable");
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| anyhow::anyhow!("captcha_unavailable"))?
        {
            ensure!(bytes.len() + chunk.len() <= 16384, "captcha_unavailable");
            bytes.extend_from_slice(&chunk);
        }
        let value: Value =
            serde_json::from_slice(&bytes).map_err(|_| anyhow::anyhow!("captcha_unavailable"))?;
        validate(policy, &value)
    }
}
pub fn validate(policy: &Policy, value: &Value) -> Result<()> {
    if value
        .get("error-codes")
        .is_some_and(|v| !v.is_null() && v != &json!([]))
    {
        bail!("captcha_failed");
    }
    ensure!(value["success"] == true, "captcha_failed");
    if policy.provider == "recaptcha_v3" {
        let hostname = value["hostname"]
            .as_str()
            .unwrap_or("")
            .to_ascii_lowercase();
        let score = value["score"].as_f64().unwrap_or(f64::NAN);
        ensure!(
            policy.allowed_hostnames.contains(&hostname)
                && value["action"] == policy.action
                && score.is_finite()
                && score >= policy.min_score
                && score <= 1.0,
            "captcha_failed"
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn provider_contracts() {
        let mut p = Policy {
            provider: "hcaptcha".into(),
            site_key: "key".into(),
            action: "classquiz_join".into(),
            min_score: 0.5,
            allowed_hostnames: vec!["quiz.example".into()],
        };
        assert!(validate(&p, &json!({"success":true,"hostname":"not-provided"})).is_ok());
        for v in [
            json!({}),
            json!({"success":false}),
            json!({"success":true,"error-codes":["Over free quota."]}),
        ] {
            assert!(validate(&p, &v).is_err());
        }
        p.provider = "recaptcha_v3".into();
        let good =
            json!({"success":true,"hostname":"quiz.example","action":"classquiz_join","score":0.8});
        assert!(validate(&p, &good).is_ok());
        for (field, bad) in [
            ("hostname", json!("evil.example")),
            ("action", json!("login")),
            ("score", json!(0.1)),
            ("score", json!(2)),
            ("score", Value::Null),
        ] {
            let mut v = good.clone();
            v[field] = bad;
            assert!(validate(&p, &v).is_err());
        }
    }
}
