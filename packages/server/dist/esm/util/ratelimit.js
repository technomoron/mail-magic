import { ApiError } from '@technomoron/api-server-base';
export class FixedWindowRateLimiter {
    maxKeys;
    buckets = new Map();
    constructor(maxKeys = 10_000) {
        this.maxKeys = maxKeys;
    }
    check(key, max, windowMs) {
        if (!key || max <= 0 || windowMs <= 0) {
            return { allowed: true, retryAfterSec: 0 };
        }
        const now = Date.now();
        const bucket = this.buckets.get(key);
        if (!bucket || now - bucket.windowStartMs >= windowMs) {
            this.buckets.delete(key);
            this.buckets.set(key, { windowStartMs: now, count: 1 });
            this.prune();
            return { allowed: true, retryAfterSec: 0 };
        }
        bucket.count += 1;
        // Refresh insertion order to keep active entries at the end for pruning.
        this.buckets.delete(key);
        this.buckets.set(key, bucket);
        if (bucket.count <= max) {
            return { allowed: true, retryAfterSec: 0 };
        }
        const retryAfterSec = Math.max(1, Math.ceil((bucket.windowStartMs + windowMs - now) / 1000));
        return { allowed: false, retryAfterSec };
    }
    prune() {
        while (this.buckets.size > this.maxKeys) {
            const oldest = this.buckets.keys().next().value;
            if (!oldest) {
                break;
            }
            this.buckets.delete(oldest);
        }
    }
}
export function enforceFormRateLimit(limiter, env, apireq) {
    const clientIp = apireq.getClientIp() ?? '';
    const windowMs = Math.max(0, env.FORM_RATE_LIMIT_WINDOW_SEC) * 1000;
    const decision = limiter.check(`form-message:${clientIp || 'unknown'}`, env.FORM_RATE_LIMIT_MAX, windowMs);
    if (!decision.allowed) {
        apireq.res.set('Retry-After', String(decision.retryAfterSec));
        throw new ApiError({ code: 429, message: 'Too many form submissions; try again later' });
    }
}
