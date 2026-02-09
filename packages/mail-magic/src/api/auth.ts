import { ApiError } from '@technomoron/api-server-base';

import { api_domain } from '../models/domain.js';
import { api_user } from '../models/user.js';
import { getBodyValue } from '../util.js';

import type { mailApiRequest } from '../types.js';

export async function assert_domain_and_user(apireq: mailApiRequest): Promise<void> {
	const body = apireq.req.body ?? {};
	const domain = getBodyValue(body, 'domain');
	const locale = getBodyValue(body, 'locale');

	if (!domain) {
		throw new ApiError({ code: 401, message: 'Missing domain' });
	}

	const rawUid = apireq.getRealUid();
	const uid = rawUid === null ? null : Number(rawUid);
	if (!uid || Number.isNaN(uid)) {
		throw new ApiError({ code: 401, message: 'Invalid/Unknown API Key/Token' });
	}

	const user = await api_user.findByPk(uid);
	if (!user) {
		throw new ApiError({ code: 401, message: 'Invalid/Unknown API Key/Token' });
	}
	const dbdomain = await api_domain.findOne({ where: { name: domain } });
	if (!dbdomain) {
		throw new ApiError({ code: 401, message: `Unable to look up the domain ${domain}` });
	}
	if (dbdomain.user_id !== user.user_id) {
		throw new ApiError({ code: 403, message: `Domain ${domain} is not owned by this user` });
	}
	apireq.domain = dbdomain;
	apireq.user = user;
	apireq.locale = locale || 'en';
}
