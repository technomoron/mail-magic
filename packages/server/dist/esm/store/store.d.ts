import { envConfig } from '@technomoron/env-loader';
import { Transporter } from 'nodemailer';
import { Sequelize } from 'sequelize';
import { envOptions } from './envloader.js';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
type UploadedFile = {
    fieldname?: string;
    originalname?: string;
    filepath?: string;
    buffer?: Buffer;
};
export type MailStoreVars = envConfig<typeof envOptions>;
type AutoReloadHandle = {
    close: () => void;
};
type AutoReloadContext = {
    vars: Pick<MailStoreVars, 'DB_AUTO_RELOAD'>;
    config_filename: (name: string) => string;
    print_debug: (msg: string) => void;
};
export declare function enableInitDataAutoReload(ctx: AutoReloadContext, reload: () => void | Promise<void>, reloadForce?: () => void | Promise<void>): AutoReloadHandle | null;
export declare class mailStore {
    private env;
    vars: MailStoreVars;
    transport?: Transporter<SMTPTransport.SentMessageInfo>;
    api_db: Sequelize | null;
    configpath: string;
    uploadTemplate?: string;
    uploadStagingPath?: string;
    autoReloadHandle: AutoReloadHandle | null;
    print_debug(msg: string): void;
    config_filename(name: string): string;
    resolveUploadPath(domainName?: string): string;
    getUploadStagingPath(): string;
    relocateUploads(domainName: string | null, files: UploadedFile[]): Promise<void>;
    init(overrides?: Partial<MailStoreVars>): Promise<this>;
}
export {};
