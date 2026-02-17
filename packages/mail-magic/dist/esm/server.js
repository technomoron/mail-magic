import { ApiServer } from '@technomoron/api-server-base';
import { apiTokenToHmac, api_user } from './models/user.js';
export class mailApiServer extends ApiServer {
    store;
    storage;
    constructor(config, store) {
        super(config);
        this.store = store;
        this.storage = store;
    }
    async getApiKey(token) {
        this.storage.print_debug('Looking up api key');
        const pepper = this.storage.vars.API_TOKEN_PEPPER;
        const token_hmac = apiTokenToHmac(token, pepper);
        const user = await api_user.findOne({ where: { token_hmac } });
        if (user) {
            return { uid: user.user_id };
        }
        this.storage.print_debug('Unable to find user for api key');
        return null;
    }
}
