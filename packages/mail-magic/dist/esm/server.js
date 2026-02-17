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
        // Backwards-compatible fallback for legacy databases that still store plaintext tokens.
        const legacy = await api_user.findOne({ where: { token } });
        if (!legacy) {
            this.storage.print_debug('Unable to find user for api key');
            return null;
        }
        try {
            await legacy.update({ token_hmac, token: '' });
        }
        catch (err) {
            // Don't leak token data; just surface the update failure for debugging.
            this.storage.print_debug(`Unable to migrate legacy api token: ${err instanceof Error ? err.message : String(err)}`);
        }
        return { uid: legacy.user_id };
    }
}
