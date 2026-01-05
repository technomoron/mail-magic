import path from 'path';

import { Sequelize, Model, DataTypes } from 'sequelize';
import { z } from 'zod';

import { StoredFile } from '../types.js';
import { user_and_domain, normalizeSlug } from '../util.js';

export const api_txmail_schema = z.object({
	template_id: z.number().int().nonnegative(),
	user_id: z.number().int().nonnegative(),
	domain_id: z.number().int().nonnegative(),
	name: z.string().min(1),
	locale: z.string().default(''),
	template: z.string().default(''),
	filename: z.string().default(''),
	sender: z.string().min(1),
	subject: z.string(),
	slug: z.string().default(''),
	files: z
		.array(
			z.object({
				filename: z.string(),
				path: z.string(),
				cid: z.string().optional()
			})
		)
		.default([])
});

export type api_txmail_type = z.infer<typeof api_txmail_schema>;
export class api_txmail extends Model {
	declare template_id: number;
	declare user_id: number;
	declare domain_id: number;
	declare name: string;
	declare locale: string;
	declare template: string;
	declare filename: string;
	declare sender: string;
	declare subject: string;
	declare slug: string;
	declare files: StoredFile[];
}

function assertSafeRelativePath(filename: string, label: string): string {
	const normalized = path.normalize(filename);
	if (path.isAbsolute(normalized)) {
		throw new Error(`${label} path must be relative`);
	}
	if (normalized.split(path.sep).includes('..')) {
		throw new Error(`${label} path cannot include '..' segments`);
	}
	return normalized;
}

export async function upsert_txmail(record: api_txmail_type): Promise<api_txmail> {
	const { user, domain } = await user_and_domain(record.domain_id);

	const idname = normalizeSlug(user.idname);
	const dname = normalizeSlug(domain.name);
	const name = normalizeSlug(record.name);
	const locale = normalizeSlug(record.locale || domain.locale || user.locale || '');

	if (!record.slug) {
		record.slug = `${idname}-${dname}${locale ? '-' + locale : ''}-${name}`;
	}

	if (!record.filename) {
		const parts = [dname, 'tx-template'];
		if (locale) parts.push(locale);
		parts.push(name);
		record.filename = path.join(...parts);
	} else {
		record.filename = path.join(dname, 'tx-template', record.filename);
	}
	if (!record.filename.endsWith('.njk')) {
		record.filename += '.njk';
	}
	record.filename = assertSafeRelativePath(record.filename, 'Template filename');

	const [instance] = await api_txmail.upsert(record);
	return instance;
}

export async function init_api_txmail(api_db: Sequelize): Promise<typeof api_txmail> {
	api_txmail.init(
		{
			template_id: {
				type: DataTypes.INTEGER,
				autoIncrement: true,
				allowNull: false,
				primaryKey: true
			},
			user_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
				unique: false,
				references: {
					model: 'user',
					key: 'user_id'
				},
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE'
			},
			domain_id: {
				type: DataTypes.INTEGER,
				allowNull: false,
				unique: false,
				references: {
					model: 'domain',
					key: 'domain_id'
				},
				onDelete: 'CASCADE',
				onUpdate: 'CASCADE'
			},
			name: {
				type: DataTypes.STRING,
				allowNull: false,
				unique: false
			},
			locale: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: '',
				unique: false
			},
			template: {
				type: DataTypes.TEXT,
				allowNull: false,
				defaultValue: ''
			},
			filename: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			},
			sender: {
				type: DataTypes.STRING,
				allowNull: false
			},
			subject: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			},
			slug: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			},
			part: {
				type: DataTypes.BOOLEAN,
				allowNull: false,
				defaultValue: false
			},
			files: {
				type: DataTypes.TEXT,
				allowNull: false,
				defaultValue: '[]',
				get() {
					const raw = this.getDataValue('files') as string | null;
					return raw ? (JSON.parse(raw) as StoredFile[]) : [];
				},
				set(value: StoredFile[] | null | undefined) {
					this.setDataValue('files', JSON.stringify(value ?? []));
				}
			}
		},
		{
			sequelize: api_db,
			tableName: 'txmail',
			charset: 'utf8mb4',
			collate: 'utf8mb4_unicode_ci',
			indexes: [
				{
					unique: true,
					fields: ['user_id', 'domain_id', 'locale', 'name']
				}
			]
		}
	);

	api_txmail.addHook('beforeValidate', async (template: api_txmail) => {
		const { user, domain } = await user_and_domain(template.domain_id);

		const dname = normalizeSlug(domain.name);
		const name = normalizeSlug(template.name);
		const locale = normalizeSlug(template.locale || domain.locale || user.locale || '');

		template.slug ||= `${normalizeSlug(user.idname)}-${dname}${locale ? '-' + locale : ''}-${name}`;

		if (!template.filename) {
			const parts = [dname, 'tx-template'];
			if (locale) parts.push(locale);
			parts.push(name);
			template.filename = parts.join('/');
		}
		if (!template.filename.endsWith('.njk')) {
			template.filename += '.njk';
		}
		template.filename = assertSafeRelativePath(template.filename, 'Template filename');
	});

	return api_txmail;
}
