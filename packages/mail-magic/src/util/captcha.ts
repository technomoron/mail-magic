export type CaptchaProvider = 'turnstile' | 'hcaptcha' | 'recaptcha';

export async function verifyCaptcha(params: {
	provider: CaptchaProvider;
	secret: string;
	token: string;
	remoteip: string | null;
}): Promise<boolean> {
	const endpoints: Record<CaptchaProvider, string> = {
		turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
		hcaptcha: 'https://hcaptcha.com/siteverify',
		recaptcha: 'https://www.google.com/recaptcha/api/siteverify'
	};
	const endpoint = endpoints[params.provider] ?? endpoints.turnstile;

	const body = new URLSearchParams();
	body.set('secret', params.secret);
	body.set('response', params.token);
	if (params.remoteip) {
		body.set('remoteip', params.remoteip);
	}

	const res = await fetch(endpoint, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body
	});
	if (!res.ok) {
		return false;
	}

	const data = (await res.json().catch(() => null)) as { success?: boolean } | null;
	return Boolean(data?.success);
}
