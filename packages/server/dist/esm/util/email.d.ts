import { ParsedMailbox } from 'email-addresses';
export declare function validateEmail(email: string): string | undefined;
export declare function parseMailbox(value: string): ParsedMailbox | undefined;
