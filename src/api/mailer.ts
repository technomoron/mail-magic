import { ApiModule, ApiRoute, ApiError } from '@technomoron/api-server-base';
import emailAddresses, { ParsedMailbox } from 'email-addresses';
import { convert } from 'html-to-text';
import nunjucks from 'nunjucks';

import { api_domain } from '../models/domain.js';
import { api_template } from '../models/template.js';
import { api_user } from '../models/user.js';
import { mailApiServer } from '../server.js';
import { mailApiRequest } from '../types.js';

export class MailerAPI extends ApiModule<mailApiServer> {
	//
	// Validate and return the parsed email address
	//
	validateEmail(email: string): string | null {
		const parsed = emailAddresses.parseOneAddress(email);
		if (parsed) {
			return (parsed as ParsedMailbox).address;
		}
		return null;
	}

	//
	// Validate a set of email addresses. Return arrays of invalid
	// and valid email addresses.
	//

	validateEmails(list: string): { valid: string[]; invalid: string[] } {
		const valid = [] as string[],
			invalid = [] as string[];

		const emails = list
			.split(',')
			.map((email) => email.trim())
			.filter((email) => email !== '');
		emails.forEach((email) => {
			const addr = this.validateEmail(email);
			if (addr) {
				valid.push(addr);
			} else {
				invalid.push(email);
			}
		});
		return { valid, invalid };
	}

	async assert_domain_and_user(apireq: mailApiRequest) {
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

	// Store a template in the database

	private async post_template(apireq: mailApiRequest): Promise<[number, any]> {
		await this.assert_domain_and_user(apireq);

		const { template, sender = '', name, subject = '', locale = '' } = apireq.req.body;

		if (!template) {
			throw new ApiError({ code: 400, message: 'Missing template data' });
		}
		if (!name) {
			throw new ApiError({ code: 400, message: 'Missing template name' });
		}

		const data = {
			user_id: apireq.user!.user_id,
			domain_id: apireq.domain!.domain_id,
			name,
			subject,
			locale,
			sender,
			template
		};

		/*
		console.log(JSON.stringify({
		user: apireq.user,
		domain: apireq.domain,
		domain_id: apireq.domain.domain_id,
		data
		}, undefined, 2)); */

		try {
			const [tpl, created] = await api_template.upsert(data, {
				returning: true
			});
			console.log('Template upserted:', name, 'Created:', created);
		} catch (error: any) {
			throw new ApiError({
				code: 500,
				message: this.server!.guessExceptionText(error, 'Unknown Sequelize Error on upsert template')
			});
		}
		return [200, { Status: 'OK' }];
	}

	// Send a template using posted arguments.

	private async post_send(apireq: mailApiRequest): Promise<[number, any]> {
		await this.assert_domain_and_user(apireq);

		const { name, rcpt, user, domain = '', locale = '', vars = {} } = apireq.req.body;

		if (!name || !rcpt || !domain) {
			throw new ApiError({ code: 400, message: 'name/rcpt/domain required' });
		}

		const thevars = typeof vars === 'string' ? JSON.parse(vars) : vars;

		// const dbdomain = await api_domain.findOne({ where: { domain } });

		const { valid, invalid } = this.validateEmails(rcpt);
		if (invalid.length > 0) {
			throw new ApiError({ code: 400, message: 'Invalid email address(es): ' + invalid.join(',') });
		}
		let template: api_template | null;
		const deflocale = apireq.server.store.deflocale || '';

		try {
			const domain_id = apireq.domain!.domain_id;
			template =
				(await api_template.findOne({ where: { name, domain_id, locale } })) ||
				(await api_template.findOne({ where: { name, domain_id, locale: deflocale } })) ||
				(await api_template.findOne({ where: { name, domain_id } }));
			if (!template) {
				throw new ApiError({
					code: 404,
					message: `Template "${name}" not found for any locale in domain "${domain}"`
				});
			}
		} catch (e: any) {
			throw new ApiError({
				code: 500,
				message: this.server!.guessExceptionText(e, 'Unknown Sequelize Error')
			});
		}

		const sender = template.sender || apireq.domain!.sender || apireq.user!.email;
		if (!sender) {
			throw new ApiError({ code: 500, message: `Unable to locate sender for ${template.name}` });
		}

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

		console.log(JSON.stringify({ vars, thevars, varNames }, undefined, 2));

		try {
			const env = new nunjucks.Environment(null, { autoescape: false });

			const compiled = nunjucks.compile(template.template, env);

			for (const recipient of valid) {
				const fullargs = {
					...thevars,
					_rcpt_email_: recipient,
					_attachments_: attachmentMap,
					_vars_: thevars
				};
				const html = await compiled.render(fullargs);
				const text = convert(html);
				const sendargs = {
					from: sender,
					to: recipient,
					subject: 'My Subject',
					html,
					text,
					attachments
				};
				await apireq.server.storage.transport.sendMail(sendargs);
			}
			return [200, { Status: 'OK', Message: 'Emails sent successfully' }];
		} catch (e: any) {
			// console.log(JSON.stringify(e, null, 2));
			throw new ApiError({ code: 500, message: e });
		}
	}

	override defineRoutes(): ApiRoute[] {
		return [
			{ method: 'post', path: '/v1/send', handler: this.post_send.bind(this), auth: { type: 'yes', req: 'any' } },
			{
				method: 'post',
				path: '/template',
				handler: this.post_template.bind(this),
				auth: { type: 'yes', req: 'any' }
			}
		];
	}
}
