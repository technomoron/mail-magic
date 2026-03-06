import type { mailApiServer } from './server.js';
type SwaggerInstallOptions = {
    apiUrl: string;
    swaggerEnabled?: boolean;
};
export declare function installMailMagicSwagger(server: mailApiServer, opts: SwaggerInstallOptions): void;
export {};
