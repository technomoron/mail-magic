import fs from 'node:fs';
import path from 'path';
import { ApiError } from '@technomoron/api-server-base';
import { SEGMENT_PATTERN } from './paths.js';
export function buildAttachments(rawFiles) {
    const attachments = rawFiles.map((file) => ({
        filename: file.originalname,
        path: file.path
    }));
    const attachmentMap = {};
    for (const file of rawFiles) {
        attachmentMap[file.fieldname] = file.originalname;
    }
    return { attachments, attachmentMap };
}
export async function cleanupUploadedFiles(files) {
    await Promise.all(files.map(async (file) => {
        if (!file?.path) {
            return;
        }
        try {
            await fs.promises.unlink(file.path);
        }
        catch {
            // best effort cleanup
        }
    }));
}
export async function moveUploadedFiles(files, targetDir) {
    await fs.promises.mkdir(targetDir, { recursive: true });
    for (const file of files) {
        const filename = path.basename(file.originalname || '');
        if (!filename || !SEGMENT_PATTERN.test(filename)) {
            throw new ApiError({ code: 400, message: `Invalid filename "${file.originalname}"` });
        }
        const destination = path.join(targetDir, filename);
        if (destination === file.path) {
            continue;
        }
        try {
            await fs.promises.rename(file.path, destination);
        }
        catch {
            await fs.promises.copyFile(file.path, destination);
            await fs.promises.unlink(file.path);
        }
    }
}
