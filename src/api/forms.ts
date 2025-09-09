import { ApiRoute, ApiRequest, ApiModule, ApiError } from '@technomoron/api-server-base';
import nunjucks from 'nunjucks';

import { api_form } from '../models/form.js';
import { mailApiServer } from '../server.js';

export class FormAPI extends ApiModule<mailApiServer> {
	private async postSendForm(apireq: ApiRequest): Promise<[number, any]> {
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

		const thevars = typeof vars === 'string' ? JSON.parse(vars) : vars;

		/*
		console.log('Headers:', apireq.req.headers);
		console.log('Body:', JSON.stringify(apireq.req.body, null, 2));
		console.log('Files:', JSON.stringify(apireq.req.files, null, 2));
		*/

		const rawFiles = Array.isArray(apireq.req.files) ? apireq.req.files : [];
		const attachments = rawFiles.map((file) => ({
			filename: file.originalname,
			path: file.path
		}));

		const attachmentMap: Record<string, string> = {};
		for (const file of rawFiles) {
			attachmentMap[file.fieldname] = file.originalname;
		}
		const varNames = Object.keys(thevars || {});

		const context = {
			...thevars,
			_rcpt_email_: recipient,
			_attachments_: attachmentMap,
			_vars_: thevars,
			_fields_: apireq.req.body,
			_files_: Array.isArray(apireq.req.files) ? apireq.req.files : []
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
			this.server.storage.print_debug('Error sending email: ' + error);
			return [500, { error: 'Error sending email: error' }];
		}

		return [200, {}];
	}

	override defineRoutes(): ApiRoute[] {
		return [
			{
				method: 'post',
				path: '/v1/sendform',
				handler: (req) => this.postSendForm(req),
				auth: { type: 'none', req: 'any' }
			}
		];
	}
}
