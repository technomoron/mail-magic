import { ApiServerConf, ApiServer } from '@technomoron/api-server-base';

import { apiTokenToHmac, api_user } from './models/user.js';
import { mailStore } from './store/store.js';

export class mailApiServer extends ApiServer {
	storage: mailStore;

	constructor(
		config: Partial<ApiServerConf>,
		private store: mailStore
	) {
		super(config);
		this.storage = store;
	}

	override async getApiKey<ApiKey>(token: string): Promise<ApiKey | null> {
		this.storage.print_debug('Looking up api key');
		const pepper = this.storage.vars.API_TOKEN_PEPPER;
		const token_hmac = apiTokenToHmac(token, pepper);

		const user = await api_user.findOne({ where: { token_hmac } });
		if (user) {
			return { uid: user.user_id } as ApiKey;
		}
		this.storage.print_debug('Unable to find user for api key');
		return null;
	}
}
