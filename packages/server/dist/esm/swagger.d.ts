import type { mailApiServer } from './server.js';
type SwaggerInstallOptions = {
    apiBasePath: string;
    assetRoute: string;
    apiUrl: string;
    swaggerEnabled?: boolean;
    swaggerPath?: string;
};
export declare function installMailMagicSwagger(server: mailApiServer, opts: SwaggerInstallOptions): void;
export {};
