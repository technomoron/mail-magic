import { ApiRequest, FixedWindowRateLimiter } from '@technomoron/api-server-base';
export { FixedWindowRateLimiter };
export type { RateLimitDecision } from '@technomoron/api-server-base';
export declare function enforceFormRateLimit(limiter: FixedWindowRateLimiter, env: {
    FORM_RATE_LIMIT_WINDOW_SEC: number;
    FORM_RATE_LIMIT_MAX: number;
}, apireq: ApiRequest): void;
