import { ApiModule, ApiRoute } from '@technomoron/api-server-base';
import { mailApiServer } from '../server.js';
export declare class ReloadAPI extends ApiModule<mailApiServer> {
    private assertUser;
    private postReload;
    defineRoutes(): ApiRoute[];
}
