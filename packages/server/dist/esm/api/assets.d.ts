import { ApiModule, ApiRoute } from '@technomoron/api-server-base';
import { mailApiServer } from '../server.js';
import type { ApiRequest, ExtendedReq } from '@technomoron/api-server-base';
type ApiRes = ApiRequest['res'];
export declare class AssetAPI extends ApiModule<mailApiServer> {
    private resolveTemplateDir;
    private postAssets;
    defineRoutes(): ApiRoute[];
}
export declare function createAssetHandler(server: mailApiServer): (req: ExtendedReq, res: ApiRes, next?: (error?: unknown) => void) => Promise<void>;
export {};
