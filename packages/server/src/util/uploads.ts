import fs from 'node:fs';
import path from 'path';

import { ApiError } from '@technomoron/api-server-base';

import { SEGMENT_PATTERN } from './paths.js';

import type { UploadedFile } from '../types.js';

export function buildAttachments(rawFiles: UploadedFile[]): {
	attachments: Array<{ filename: string; path?: string; content?: Buffer }>;
	attachmentMap: Record<string, string>;
} {
	const attachments = rawFiles.map((file) => ({
		filename: file.originalname,
		...(file.buffer ? { content: file.buffer } : { path: file.filepath })
	}));
	const attachmentMap: Record<string, string> = {};
	for (const file of rawFiles) {
		attachmentMap[file.fieldname] = file.originalname;
	}
	return { attachments, attachmentMap };
}

export async function cleanupUploadedFiles(files: UploadedFile[]): Promise<void> {
	await Promise.all(
		files.map(async (file) => {
			if (!file?.filepath) {
				return;
			}
			try {
				await fs.promises.unlink(file.filepath);
			} catch {
				// best effort cleanup
			}
		})
	);
}

export async function moveUploadedFiles(files: UploadedFile[], targetDir: string): Promise<void> {
	await fs.promises.mkdir(targetDir, { recursive: true });
	for (const file of files) {
		const filename = path.basename(file.originalname || '');
		if (!filename || !SEGMENT_PATTERN.test(filename)) {
			throw new ApiError({ code: 400, message: `Invalid filename "${file.originalname}"` });
		}
		const destination = path.join(targetDir, filename);
		if (file.buffer) {
			await fs.promises.writeFile(destination, file.buffer);
		} else if (file.filepath) {
			if (destination === file.filepath) {
				continue;
			}
			try {
				await fs.promises.rename(file.filepath, destination);
			} catch {
				await fs.promises.copyFile(file.filepath, destination);
				await fs.promises.unlink(file.filepath);
			}
		}
	}
}
