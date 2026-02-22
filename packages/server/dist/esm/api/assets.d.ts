import { ApiModule, ApiRoute } from '@technomoron/api-server-base';
import { mailApiServer } from '../server.js';
import type { NextFunction, Request, Response } from 'express';
export declare class AssetAPI extends ApiModule<mailApiServer> {
    private resolveTemplateDir;
    private postAssets;
    defineRoutes(): ApiRoute[];
}
export declare function createAssetHandler(server: mailApiServer): (req: Request, res: Response, next?: NextFunction) => Promise<void>;
