import fs from 'node:fs';
import path from 'path';
import { ApiError } from '@technomoron/api-server-base';
import { SEGMENT_PATTERN } from './paths.js';
export function buildAttachments(rawFiles) {
    const attachments = rawFiles.map((file) => ({
        filename: file.originalname,
        ...(file.buffer ? { content: file.buffer } : { path: file.filepath })
    }));
    const attachmentMap = {};
    for (const file of rawFiles) {
        attachmentMap[file.fieldname] = file.originalname;
    }
    return { attachments, attachmentMap };
}
export async function cleanupUploadedFiles(files) {
    await Promise.all(files.map(async (file) => {
        if (!file?.filepath) {
            return;
        }
        try {
            await fs.promises.unlink(file.filepath);
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
        if (file.buffer) {
            await fs.promises.writeFile(destination, file.buffer);
        }
        else if (file.filepath) {
            if (destination === file.filepath) {
                continue;
            }
            try {
                await fs.promises.rename(file.filepath, destination);
            }
            catch {
                await fs.promises.copyFile(file.filepath, destination);
                await fs.promises.unlink(file.filepath);
            }
        }
    }
}
