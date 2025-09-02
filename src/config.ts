import fs from 'fs';
import path from 'path';

import { z } from 'zod';

import { mailStore } from './store/store';
import { loadFormTemplate } from './util';

const formDefinitionSchema = z.object({
	rcpt: z.string().email(),
	sender: z.string(),
	subject: z.string(),
	template: z.string().endsWith('.njk')
});

const formsJsonSchema = z.record(z.string(), formDefinitionSchema);

type FormDef = z.infer<typeof formDefinitionSchema>;

interface FormDefFull extends FormDef {
	templateFile: string;
	templateContent: string;
}

export type FormConfig = Record<string, FormDefFull>;

const dummyContext = {
	formFields: { name: 'Test', email: 'test@example.com' },
	files: [{ originalname: 'file.txt', path: '/uploads/file.txt' }]
};

export async function formConfig(store: mailStore): Promise<FormConfig> {
	const configFile = path.join(store.configpath, 'forms.config.json');

	const rawJson = fs.readFileSync(configFile, 'utf-8');
	const parsed = JSON.parse(rawJson);
	const validated = formsJsonSchema.parse(parsed);

	const result: FormConfig = {};

	for (const [key, form] of Object.entries(validated)) {
		const templateContent = await loadFormTemplate(store, form.template);
		result[key] = {
			...form,
			templateFile: form.template,
			templateContent
		};
	}

	return result;
}
