import { ApiServerConf, ApiServer } from '@technomoron/api-server-base';
import { mailStore } from './store/store.js';
export declare class mailApiServer extends ApiServer {
    private store;
    storage: mailStore;
    constructor(config: Partial<ApiServerConf>, store: mailStore);
    getApiKey<ApiKey>(token: string): Promise<ApiKey | null>;
}
