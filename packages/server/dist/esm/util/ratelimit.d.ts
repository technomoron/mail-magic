import { ApiRequest } from '@technomoron/api-server-base';
export type RateLimitDecision = {
    allowed: boolean;
    retryAfterSec: number;
};
export declare class FixedWindowRateLimiter {
    private readonly maxKeys;
    private readonly buckets;
    constructor(maxKeys?: number);
    check(key: string, max: number, windowMs: number): RateLimitDecision;
    private prune;
}
export declare function enforceFormRateLimit(limiter: FixedWindowRateLimiter, env: {
    FORM_RATE_LIMIT_WINDOW_SEC: number;
    FORM_RATE_LIMIT_MAX: number;
}, apireq: ApiRequest): void;
