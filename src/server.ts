import { apiServerConf, apiServer, apiError, apiAuthClass } from '@technomoron/api-server-base';

import { api_domain } from './models/domain.js';
import { api_user } from './models/user.js';
import { mailStore } from './store/store.js';
import { mailApiRequest } from './types.js';

export class mailApiServer extends apiServer {
	storage: mailStore;

	constructor(
		config: apiServerConf,
		private store: mailStore
	) {
		super(config);
		this.storage = store;
	}

	override async get_api_key(key: string): Promise<any | null> {
		console.log(`Looking up api key  ${key}`);
		const user = await api_user.findOne({ where: { token: key } });
		if (!user) {
			// throw apiError({code: 500, message: `Unable to find user for token ${key}`});
		}
		return user ? { uid: user.user_id } : null;
	}
}
