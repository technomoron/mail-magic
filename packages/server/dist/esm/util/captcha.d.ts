export type CaptchaProvider = 'turnstile' | 'hcaptcha' | 'recaptcha';
export declare function verifyCaptcha(params: {
    provider: CaptchaProvider;
    secret: string;
    token: string;
    remoteip: string | null;
}): Promise<boolean>;
