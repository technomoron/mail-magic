import { ApiError, FixedWindowRateLimiter } from '@technomoron/api-server-base';
export { FixedWindowRateLimiter };
export function enforceFormRateLimit(limiter, env, apireq) {
    const clientIp = apireq.getClientIp() ?? '';
    if (!clientIp) {
        // Cannot rate-limit without a resolvable client IP; skip to avoid collapsing
        // all IP-unknown requests into a single shared bucket.
        return;
    }
    const windowMs = Math.max(0, env.FORM_RATE_LIMIT_WINDOW_SEC) * 1000;
    const decision = limiter.check(`form-message:${clientIp}`, env.FORM_RATE_LIMIT_MAX, windowMs);
    if (!decision.allowed) {
        const fastifyReply = apireq.res.reply;
        fastifyReply?.header('retry-after', String(decision.retryAfterSec));
        throw new ApiError({ code: 429, message: 'Too many form submissions; try again later' });
    }
}
