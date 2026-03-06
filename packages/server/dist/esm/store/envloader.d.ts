export declare const envOptions: {
    NODE_ENV: {
        description: string;
        options: string[];
        default: string;
    };
    API_PORT: {
        description: string;
        default: string;
        type: "number";
    };
    API_HOST: {
        description: string;
        default: string;
    };
    DB_AUTO_RELOAD: {
        description: string;
        type: "boolean";
        default: false;
    };
    DB_FORCE_SYNC: {
        description: string;
        type: "boolean";
        default: false;
    };
    DB_SYNC_ALTER: {
        description: string;
        type: "boolean";
        default: false;
    };
    API_URL: {
        description: string;
        default: string;
    };
    ASSET_PUBLIC_BASE: {
        description: string;
        default: string;
    };
    SWAGGER_ENABLED: {
        description: string;
        default: false;
        type: "boolean";
    };
    ADMIN_ENABLED: {
        description: string;
        default: false;
        type: "boolean";
    };
    ADMIN_APP_PATH: {
        description: string;
        default: string;
    };
    CONFIG_PATH: {
        description: string;
        default: string;
    };
    GEN_ENV_TEMPLATE: {
        description: string;
        default: false;
        type: "boolean";
    };
    DB_USER: {
        description: string;
    };
    DB_PASS: {
        description: string;
    };
    DB_NAME: {
        description: string;
        default: string;
    };
    DB_HOST: {
        description: string;
        default: string;
    };
    DB_TYPE: {
        description: string;
        options: string[];
        default: string;
    };
    DB_LOG: {
        description: string;
        default: string;
        type: "boolean";
    };
    DEBUG: {
        description: string;
        default: false;
        type: "boolean";
    };
    AUTOESCAPE_HTML: {
        description: string;
        default: true;
        type: "boolean";
    };
    SMTP_HOST: {
        description: string;
        default: string;
    };
    SMTP_PORT: {
        description: string;
        default: number;
        type: "number";
    };
    SMTP_SECURE: {
        description: string;
        default: false;
        type: "boolean";
    };
    SMTP_TLS_REJECT: {
        description: string;
        default: true;
        type: "boolean";
    };
    SMTP_REQUIRE_TLS: {
        description: string;
        default: true;
        type: "boolean";
    };
    SMTP_USER: {
        description: string;
        default: string;
    };
    SMTP_PASSWORD: {
        description: string;
        default: string;
    };
    UPLOAD_PATH: {
        description: string;
        default: string;
    };
    UPLOAD_MAX: {
        description: string;
        default: number;
        type: "number";
    };
    FORM_RATE_LIMIT_WINDOW_SEC: {
        description: string;
        default: number;
        type: "number";
    };
    FORM_RATE_LIMIT_MAX: {
        description: string;
        default: number;
        type: "number";
    };
    FORM_MAX_ATTACHMENTS: {
        description: string;
        default: number;
        type: "number";
    };
    FORM_KEEP_UPLOADS: {
        description: string;
        default: true;
        type: "boolean";
    };
    FORM_CAPTCHA_PROVIDER: {
        description: string;
        options: string[];
        default: string;
    };
    FORM_CAPTCHA_SECRET: {
        description: string;
        default: string;
    };
    FORM_CAPTCHA_REQUIRED: {
        description: string;
        default: false;
        type: "boolean";
    };
    API_TOKEN_PEPPER: {
        description: string;
        required: true;
        transform: (raw: string) => string;
    };
};
