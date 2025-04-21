import nodemailer from 'nodemailer';
import nunjucks from 'nunjucks';
import { apiModule, apiRoute, apiRequest, apiServer, apiError, apiAuthClass } from 'tm-api-server';

import { forms } from '../forms.js';
import { mailApiServer } from '../server.js';

export class formAPI extends apiModule<mailApiServer> {
	private async post_sendform(apireq: apiRequest): Promise<[number, any]> {
		const { formid } = apireq.req.body;

		console.log('Headers:', apireq.req.headers);
		console.log('Body:', JSON.stringify(apireq.req.body, null, 2));
		console.log('Files:', JSON.stringify(apireq.req.files, null, 2));

		if (!formid) {
			throw new apiError({ code: 404, message: 'Missing formid field in form' });
		}
		if (!forms[formid]) {
			throw new apiError({ code: 404, message: `No such form ${formid}` });
		}
		const form = forms[formid];

		const attachments = Array.isArray(apireq.req.files)
			? apireq.req.files.map((file: any) => ({
					filename: file.originalname,
					path: file.path,
				}))
			: [];

		const context = {
			formFields: apireq.req.body,
			files: Array.isArray(apireq.req.files) ? apireq.req.files : [],
		};

		nunjucks.configure({ autoescape: true });
		const html = nunjucks.renderString(form.template, context);

		const transporter = nodemailer.createTransport({
			host: 'm.document.no',
			port: 25,
			secure: false,
		});

		const mailOptions = {
			from: form.sender,
			to: form.rcpt,
			subject: form.subject,
			html,
			attachments,
		};

		await apireq.server.storage.mailer.sendMail(mailOptions);

		return [200, { message: 'OK' }];
	}

	override define_routes(): apiRoute[] {
		return [{ method: 'post', path: '/sendform', handler: this.post_sendform, auth: { type: 'none', req: 'any' } }];
	}
}
