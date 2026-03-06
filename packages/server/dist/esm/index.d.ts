import { mailApiServer } from './server.js';
import { MailStoreVars, mailStore } from './store/store.js';
import type { ApiServerConf } from '@technomoron/api-server-base';
export type MailMagicServerOptions = Partial<Omit<ApiServerConf, 'apiBasePath' | 'swaggerPath'>>;
export type MailMagicServerBootstrap = {
    server: mailApiServer;
    store: mailStore;
    vars: MailStoreVars;
};
export declare const STARTUP_ERROR_MESSAGE = "Failed to start mail-magic:";
export declare function createMailMagicServer(overrides?: MailMagicServerOptions, envOverrides?: Partial<MailStoreVars>): Promise<MailMagicServerBootstrap>;
export declare function startMailMagicServer(overrides?: MailMagicServerOptions, envOverrides?: Partial<MailStoreVars>): Promise<MailMagicServerBootstrap>;
