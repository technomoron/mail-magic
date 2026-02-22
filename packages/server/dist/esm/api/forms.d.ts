import { ApiRoute, ApiModule } from '@technomoron/api-server-base';
import { mailApiServer } from '../server.js';
export declare class FormAPI extends ApiModule<mailApiServer> {
    private readonly rateLimiter;
    private postFormRecipient;
    private postFormTemplate;
    private postSendForm;
    defineRoutes(): ApiRoute[];
}
