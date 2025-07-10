import fs from 'fs';
import path from 'path';
// import { fileURLToPath } from 'url';

import nunjucks from 'nunjucks';
import { z } from 'zod';

const formDefinitionSchema = z.object({
	rcpt: z.string().email(),
	sender: z.string(),
	subject: z.string(),
	template: z.string().endsWith('.njk')
});

const formsJsonSchema = z.record(formDefinitionSchema);

type FormDef = z.infer<typeof formDefinitionSchema>;

export interface FormDefFull extends FormDef {
	templateFile: string;
	templateContent: string;
	verifyTemplate(): void;
}

export type FormConfig = Record<string, FormDefFull>;

const dummyContext = {
	formFields: { name: 'Test', email: 'test@example.com' },
	files: [{ originalname: 'file.txt', path: '/uploads/file.txt' }]
};

export function formConfig(configPath: string): FormConfig {
	configPath ||= path.join(process.cwd(), 'config');
	const configFile = path.join(configPath, 'forms.config.json');

	const rawJson = fs.readFileSync(configFile, 'utf-8');
	const parsed = JSON.parse(rawJson);
	const validated = formsJsonSchema.parse(parsed);

	const templatesPath = path.join(configPath, 'templates');

	const nunjucksEnv = new nunjucks.Environment(new nunjucks.FileSystemLoader(templatesPath), {
		autoescape: true,
		noCache: true
	});

	const result: FormConfig = {};

	for (const [key, form] of Object.entries(validated)) {
		const templatePath = path.join(templatesPath, form.template);
		if (!fs.existsSync(templatePath)) {
			throw new Error(`Missing template file "${form.template}" for form "${key}".`);
		}
		const templateContent = fs.readFileSync(templatePath, 'utf-8');

		result[key] = {
			...form,
			templateFile: form.template,
			templateContent,
			verifyTemplate: () => {
				try {
					nunjucksEnv.renderString(templateContent, dummyContext);
				} catch (err) {
					throw new Error(
						`Template "${form.template}" for form "${key}" failed to render: ${(err as Error).message}`
					);
				}
			}
		};
	}

	return result;
}
