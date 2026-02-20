type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | {
    [key: string]: JsonValue;
};
type RequestBody = JsonValue | object;
export type ApiResponse<T = unknown> = {
    Status?: string;
    data?: T;
    message?: string;
    [key: string]: unknown;
};
export interface StoreTxTemplateInput {
    template: string;
    domain: string;
    sender?: string;
    name?: string;
    subject?: string;
    locale?: string;
    part?: boolean;
}
export interface StoreFormTemplateInput {
    idname: string;
    domain: string;
    template: string;
    sender: string;
    recipient: string;
    subject?: string;
    locale?: string;
    secret?: string;
    replyto_email?: string;
    replyto_from_fields?: boolean;
    allowed_fields?: string[] | string;
    captcha_required?: boolean;
}
export interface StoreFormRecipientInput {
    domain: string;
    idname: string;
    email: string;
    name?: string;
    form_key?: string;
    formid?: string;
    locale?: string;
}
export interface SendTxMessageInput {
    name: string;
    rcpt: string;
    domain: string;
    locale?: string;
    vars?: Record<string, unknown>;
    replyTo?: string;
    headers?: Record<string, string>;
    attachments?: AttachmentInput[];
}
export interface SendFormMessageInput {
    _mm_form_key: string;
    _mm_locale?: string;
    _mm_recipients?: string[] | string;
    fields?: Record<string, unknown>;
    attachments?: AttachmentInput[];
}
export type AttachmentInput = {
    path: string;
    filename?: string;
    contentType?: string;
    field?: string;
};
type UploadAssetInput = string | AttachmentInput;
export interface UploadAssetsInput {
    domain: string;
    files: UploadAssetInput[];
    templateType?: 'tx' | 'form';
    template?: string;
    locale?: string;
    path?: string;
}
declare class TemplateClient {
    private baseURL;
    private apiKey;
    constructor(baseURL: string, apiKey: string);
    request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', command: string, body?: RequestBody): Promise<T>;
    get<T>(command: string): Promise<T>;
    post<T>(command: string, body: RequestBody): Promise<T>;
    put<T>(command: string, body: RequestBody): Promise<T>;
    delete<T>(command: string, body?: RequestBody): Promise<T>;
    validateEmails(list: string): {
        valid: string[];
        invalid: string[];
    };
    private validateTemplate;
    private validateSender;
    private createAttachmentPayload;
    private appendFields;
    private postFormData;
    storeTemplate(td: StoreTxTemplateInput): Promise<ApiResponse>;
    sendTemplate(std: SendTxMessageInput): Promise<ApiResponse>;
    storeTxTemplate(td: StoreTxTemplateInput): Promise<ApiResponse>;
    sendTxMessage(std: SendTxMessageInput): Promise<ApiResponse>;
    storeFormTemplate(data: StoreFormTemplateInput): Promise<ApiResponse>;
    storeFormRecipient(data: StoreFormRecipientInput): Promise<ApiResponse>;
    sendFormMessage(data: SendFormMessageInput): Promise<ApiResponse>;
    uploadAssets(data: UploadAssetsInput): Promise<ApiResponse>;
    getSwaggerSpec(): Promise<ApiResponse>;
    fetchPublicAsset(domain: string, assetPath: string, viaApiBase?: boolean): Promise<ArrayBuffer>;
}
export default TemplateClient;
