type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | {
    [key: string]: JsonValue;
};
type RequestBody = JsonValue | object;
interface templateData {
    template: string;
    domain: string;
    sender?: string;
    name?: string;
    subject?: string;
    locale?: string;
    part?: boolean;
}
interface formTemplateData {
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
interface formRecipientData {
    domain: string;
    idname: string;
    email: string;
    name?: string;
    form_key?: string;
    formid?: string;
    locale?: string;
}
interface sendTemplateData {
    name: string;
    rcpt: string;
    domain: string;
    locale?: string;
    vars?: Record<string, unknown>;
    replyTo?: string;
    headers?: Record<string, string>;
    attachments?: AttachmentInput[];
}
interface sendFormData {
    _mm_form_key: string;
    _mm_locale?: string;
    _mm_recipients?: string[] | string;
    fields?: Record<string, unknown>;
    attachments?: AttachmentInput[];
}
type AttachmentInput = {
    path: string;
    filename?: string;
    contentType?: string;
    field?: string;
};
type UploadAssetInput = string | AttachmentInput;
interface uploadAssetsData {
    domain: string;
    files: UploadAssetInput[];
    templateType?: 'tx' | 'form';
    template?: string;
    locale?: string;
    path?: string;
}
declare class templateClient {
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
    storeTemplate(td: templateData): Promise<unknown>;
    sendTemplate(std: sendTemplateData): Promise<unknown>;
    storeTxTemplate(td: templateData): Promise<unknown>;
    sendTxMessage(std: sendTemplateData): Promise<unknown>;
    storeFormTemplate(data: formTemplateData): Promise<unknown>;
    storeFormRecipient(data: formRecipientData): Promise<unknown>;
    sendFormMessage(data: sendFormData): Promise<unknown>;
    uploadAssets(data: uploadAssetsData): Promise<unknown>;
    getSwaggerSpec(): Promise<unknown>;
    fetchPublicAsset(domain: string, assetPath: string, viaApiBase?: boolean): Promise<ArrayBuffer>;
}
export default templateClient;
