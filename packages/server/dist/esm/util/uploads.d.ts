import type { UploadedFile } from '../types.js';
export declare function buildAttachments(rawFiles: UploadedFile[]): {
    attachments: Array<{
        filename: string;
        path?: string;
        content?: Buffer;
    }>;
    attachmentMap: Record<string, string>;
};
export declare function cleanupUploadedFiles(files: UploadedFile[]): Promise<void>;
export declare function moveUploadedFiles(files: UploadedFile[], targetDir: string): Promise<void>;
