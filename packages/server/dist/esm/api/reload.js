import { ApiError, ApiModule } from '@technomoron/api-server-base';
import { api_user } from '../models/user.js';
export class ReloadAPI extends ApiModule {
    async assertUser(apireq) {
        const rawUid = apireq.getRealUid();
        const uid = rawUid === null ? null : Number(rawUid);
        if (!uid || Number.isNaN(uid)) {
            throw new ApiError({ code: 401, message: 'Invalid/Unknown API Key/Token' });
        }
        const user = await api_user.findByPk(uid);
        if (!user) {
            throw new ApiError({ code: 401, message: 'Invalid/Unknown API Key/Token' });
        }
    }
    async postReload(apireq) {
        await this.assertUser(apireq);
        const reload = this.server.storage.triggerReload(true);
        return [200, { Status: 'OK', reload }];
    }
    defineRoutes() {
        return [
            {
                method: 'post',
                path: '/v1/reload',
                auth: { type: 'yes', req: 'any' },
                handler: (req) => this.postReload(req)
            }
        ];
    }
}
