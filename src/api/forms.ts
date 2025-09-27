import path from 'path';

import { ApiRoute, ApiRequest, ApiModule, ApiError } from '@technomoron/api-server-base';
import nunjucks from 'nunjucks';

import { api_domain } from '../models/domain.js';
import { api_form } from '../models/form.js';
import { api_user } from '../models/user.js';
import { mailApiServer } from '../server.js';
import { normalizeSlug } from '../util.js';

import type { mailApiRequest, UploadedFile } from '../types.js';

export class FormAPI extends ApiModule<mailApiServer> {
	private async assertDomainAndUser(apireq: mailApiRequest): Promise<void> {
		const { domain, locale } = apireq.req.body;

		if (!domain) {
			throw new ApiError({ code: 401, message: 'Missing domain' });
		}
		const user = await api_user.findOne({ where: { token: apireq.token } });
		if (!user) {
			throw new ApiError({ code: 401, message: `Invalid/Unknown API Key/Token '${apireq.token}'` });
		}
		const dbdomain = await api_domain.findOne({ where: { domain } });
		if (!dbdomain) {
			throw new ApiError({ code: 401, message: `Unable to look up the domain ${domain}` });
		}
		apireq.domain = dbdomain;
		apireq.locale = locale || 'en';
		apireq.user = user;
	}

	private async postFormTemplate(apireq: mailApiRequest): Promise<[number, { Status: string }]> {
		await this.assertDomainAndUser(apireq);

		const {
			template,
			sender = '',
			recipient = '',
			idname,
			subject = '',
			locale = '',
			secret = ''
		} = apireq.req.body;

		if (!template) {
			throw new ApiError({ code: 400, message: 'Missing template data' });
		}
		if (!idname) {
			throw new ApiError({ code: 400, message: 'Missing form identifier' });
		}
		if (!sender) {
			throw new ApiError({ code: 400, message: 'Missing sender address' });
		}
		if (!recipient) {
			throw new ApiError({ code: 400, message: 'Missing recipient address' });
		}

		const user = apireq.user!;
		const domain = apireq.domain!;
		const resolvedLocale = locale || apireq.locale || '';
		const userSlug = normalizeSlug(user.idname);
		const domainSlug = normalizeSlug(domain.name);
		const formSlug = normalizeSlug(idname);
		const localeSlug = normalizeSlug(resolvedLocale || domain.locale || user.locale || '');
		const slug = `${userSlug}-${domainSlug}${localeSlug ? '-' + localeSlug : ''}-${formSlug}`;
		const filenameParts = [userSlug, domainSlug, 'form-template'];
		if (localeSlug) {
			filenameParts.push(localeSlug);
		}
		filenameParts.push(formSlug);
		let filename = path.join(...filenameParts);
		if (!filename.endsWith('.njk')) {
			filename += '.njk';
		}

		const record = {
			user_id: user.user_id,
			domain_id: domain.domain_id,
			locale: localeSlug,
			idname,
			sender,
			recipient,
			subject,
			template,
			slug,
			filename,
			secret,
			files: []
		};

		try {
			const [form, created] = await api_form.upsert(record, {
				returning: true,
				conflictFields: ['user_id', 'domain_id', 'locale', 'idname']
			});
			this.server.storage.print_debug(`Form template upserted: ${form.idname} (created=${created})`);
		} catch (error: unknown) {
			throw new ApiError({
				code: 500,
				message: this.server!.guessExceptionText(error, 'Unknown Sequelize Error on upsert form template')
			});
		}

		return [200, { Status: 'OK' }];
	}

	private async postSendForm(apireq: ApiRequest): Promise<[number, Record<string, unknown>]> {
		const { formid, secret, recipient, vars = {} } = apireq.req.body;

		if (!formid) {
			throw new ApiError({ code: 404, message: 'Missing formid field in form' });
		}

		const form = await api_form.findOne({ where: { idname: formid } });
		if (!form) {
			throw new ApiError({ code: 404, message: `No such form: ${formid}` });
		}

		if (form.secret && !secret) {
			throw new ApiError({ code: 401, message: 'This form requires a secret key' });
		}
		if (form.secret && form.secret !== secret) {
			throw new ApiError({ code: 401, message: 'Bad form secret' });
		}
		if (recipient && !form.secret) {
			throw new ApiError({ code: 401, message: "'recipient' parameterer requires form secret to be set" });
		}

		let parsedVars: unknown = vars ?? {};
		if (typeof vars === 'string') {
			try {
				parsedVars = JSON.parse(vars);
			} catch (error) {
				throw new ApiError({ code: 400, message: 'Invalid JSON provided in "vars"' });
			}
		}
		const thevars = parsedVars as Record<string, unknown>;

		/*
		console.log('Headers:', apireq.req.headers);
		console.log('Body:', JSON.stringify(apireq.req.body, null, 2));
		console.log('Files:', JSON.stringify(apireq.req.files, null, 2));
		*/

		const rawFiles = Array.isArray(apireq.req.files) ? (apireq.req.files as UploadedFile[]) : [];
		const attachments = rawFiles.map((file) => ({
			filename: file.originalname,
			path: file.path
		}));

		const attachmentMap: Record<string, string> = {};
		for (const file of rawFiles) {
			attachmentMap[file.fieldname] = file.originalname;
		}

		const context = {
			...thevars,
			_rcpt_email_: recipient,
			_attachments_: attachmentMap,
			_vars_: thevars,
			_fields_: apireq.req.body,
			_files_: rawFiles
		};

		nunjucks.configure({ autoescape: true });
		const html = nunjucks.renderString(form.template, context);

		const mailOptions = {
			from: form.sender,
			to: recipient || form.recipient,
			subject: form.subject,
			html,
			attachments
		};

		try {
			const info = await this.server.storage.transport!.sendMail(mailOptions);
			this.server.storage.print_debug('Email sent: ' + info.response);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.server.storage.print_debug('Error sending email: ' + errorMessage);
			return [500, { error: `Error sending email: ${errorMessage}` }];
		}

		return [200, {}];
	}

	override defineRoutes(): ApiRoute[] {
		return [
			{
				method: 'post',
				path: '/v1/form/template',
				handler: (req) => this.postFormTemplate(req as mailApiRequest),
				auth: { type: 'yes', req: 'any' }
			},
			{
				method: 'post',
				path: '/v1/form/message',
				handler: (req) => this.postSendForm(req),
				auth: { type: 'none', req: 'any' }
			}
		];
	}
}
