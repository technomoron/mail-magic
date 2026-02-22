import { ApiModule, ApiRoute } from '@technomoron/api-server-base';
import { mailApiServer } from '../server.js';
export declare class MailerAPI extends ApiModule<mailApiServer> {
    validateEmails(list: string): {
        valid: string[];
        invalid: string[];
    };
    private post_template;
    private post_send;
    defineRoutes(): ApiRoute[];
}
