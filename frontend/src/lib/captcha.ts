export interface CaptchaPolicy {
	provider: 'hcaptcha' | 'recaptcha_v3';
	site_key: string;
	action: string;
}

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
	if (scripts.has(src)) return scripts.get(src)!;
	const promise = new Promise<void>((resolve, reject) => {
		const script = document.createElement('script');
		script.src = src;
		script.async = true;
		const fail = () => {
			clearTimeout(timer);
			script.remove();
			scripts.delete(src);
			reject(new Error('Verification could not load. Please retry.'));
		};
		const timer = setTimeout(fail, 15000);
		script.onload = () => {
			clearTimeout(timer);
			resolve();
		};
		script.onerror = fail;
		document.head.append(script);
	});
	scripts.set(src, promise);
	return promise;
}

export function captchaWidget() {
	let widget: number | string | undefined;
	let siteKey = '';
	let destroyed = false;
	const reset = () => {
		if (widget !== undefined) (window as any).hcaptcha?.reset(widget);
	};
	const destroy = () => {
		destroyed = true;
		if (widget !== undefined) (window as any).hcaptcha?.remove(widget);
		widget = undefined;
	};
	return {
		reset,
		destroy,
		async token(policy: CaptchaPolicy, element: HTMLElement): Promise<string> {
			if (policy.provider === 'hcaptcha') {
				await loadScript('https://js.hcaptcha.com/1/api.js?render=explicit');
				if (destroyed) throw new Error('Join cancelled.');
				const api = (window as any).hcaptcha;
				if (widget !== undefined && siteKey !== policy.site_key) {
					api.remove(widget);
					widget = undefined;
				}
				if (widget === undefined) {
					siteKey = policy.site_key;
					widget = api.render(element, { sitekey: siteKey, size: 'invisible' });
				}
				reset();
				const result = await api.execute(widget, { async: true });
				if (!result?.response) throw new Error('Verification failed. Please retry.');
				return result.response;
			}
			await loadScript(
				`https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(policy.site_key)}`
			);
			if (destroyed) throw new Error('Join cancelled.');
			const api = (window as any).grecaptcha;
			return new Promise<string>((resolve, reject) => {
				const timer = setTimeout(
					() => reject(new Error('Verification timed out. Please retry.')),
					15000
				);
				api.ready(() => {
					if (destroyed) {
						clearTimeout(timer);
						reject(new Error('Join cancelled.'));
						return;
					}
					Promise.resolve()
						.then(() => api.execute(policy.site_key, { action: policy.action }))
						.then((token) => {
							if (typeof token !== 'string' || !token)
								throw new Error('Verification failed. Please retry.');
							resolve(token);
						})
						.catch(reject)
						.finally(() => clearTimeout(timer));
				});
			});
		}
	};
}

export function captchaMessage(code: string): string {
	return (
		(
			{
				captcha_required: 'Please complete verification to join.',
				captcha_failed: 'Verification was not accepted. Please retry.',
				captcha_expired: 'Verification expired. Please retry.',
				captcha_busy: 'Many players are joining. Please retry in a moment.',
				captcha_unavailable:
					'Verification is temporarily unavailable. Please retry shortly.'
			} as Record<string, string>
		)[code] || 'Verification failed. Please retry.'
	);
}
