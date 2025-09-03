import { ApiServerConf, ApiServer } from '@technomoron/api-server-base';

import { api_user } from './models/user.js';
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
		this.storage.print_debug(`Looking up api key ${token}`);
		const user = await api_user.findOne({ where: { token: token } });
		if (!user) {
			this.storage.print_debug(`Unable to find user for token ${token}`);
			return null;
		} else {
			return { uid: user.user_id } as ApiKey;
		}
	}
}
