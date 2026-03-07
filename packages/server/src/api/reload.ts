import { ApiError, ApiModule, ApiRoute } from '@technomoron/api-server-base';

import { api_user } from '../models/user.js';
import { mailApiServer } from '../server.js';

import type { mailApiRequest } from '../types.js';

export class ReloadAPI extends ApiModule<mailApiServer> {
	private async assertUser(apireq: mailApiRequest): Promise<void> {
		const rawUid = apireq.getRealUid();
		const uid = rawUid === null ? null : Number(rawUid);
		if (!uid || Number.isNaN(uid)) {
			throw new ApiError({ code: 401, message: 'Invalid/Unknown API Key/Token' });
		}
		const user = await api_user.findByPk(uid);
		if (!user) {
			throw new ApiError({ code: 401, message: 'Invalid/Unknown API Key/Token' });
		}
	}

	private async postReload(apireq: mailApiRequest): Promise<[number, { Status: string; reload: string }]> {
		await this.assertUser(apireq);
		const reload = this.server.storage.triggerReload(true);
		return [200, { Status: 'OK', reload }];
	}

	override defineRoutes(): ApiRoute[] {
		return [
			{
				method: 'post',
				path: '/v1/reload',
				auth: { type: 'yes', req: 'any' },
				handler: (req) => this.postReload(req as mailApiRequest)
			}
		];
	}
}
