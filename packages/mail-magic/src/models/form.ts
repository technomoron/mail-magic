import path from 'path';

import { Sequelize, Model, DataTypes } from 'sequelize';
import { z } from 'zod';

import { StoredFile } from '../types.js';
import { user_and_domain, normalizeSlug } from '../util.js';

export const api_form_schema = z.object({
	form_id: z.number().int().nonnegative(),
	user_id: z.number().int().nonnegative(),
	domain_id: z.number().int().nonnegative(),
	locale: z.string().default(''),
	idname: z.string().min(1),
	sender: z.string().min(1),
	recipient: z.string().min(1),
	subject: z.string(),
	template: z.string().default(''),
	filename: z.string().default(''),
	slug: z.string().default(''),
	secret: z.string().default(''),
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

export type api_form_type = z.infer<typeof api_form_schema>;

export class api_form extends Model {
	declare form_id: number;
	declare user_id: number;
	declare domain_id: number;
	declare locale: string;
	declare idname: string;
	declare sender: string;
	declare recipient: string;
	declare subject: string;
	declare template: string;
	declare filename: string;
	declare slug: string;
	declare secret: string;
	declare files: StoredFile[];
}

export async function init_api_form(api_db: Sequelize): Promise<typeof api_form> {
	api_form.init(
		{
			form_id: {
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
			locale: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: '',
				unique: false
			},
			idname: {
				type: DataTypes.STRING,
				allowNull: false,
				unique: false,
				defaultValue: ''
			},
			sender: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			},
			recipient: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			},
			subject: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			},
			filename: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			},
			template: {
				type: DataTypes.TEXT,
				allowNull: false,
				defaultValue: ''
			},
			slug: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			},
			secret: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
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
			tableName: 'form',
			charset: 'utf8mb4',
			collate: 'utf8mb4_unicode_ci',
			indexes: [
				{
					unique: true,
					fields: ['user_id', 'domain_id', 'locale', 'idname']
				}
			]
		}
	);

	return api_form;
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

export async function upsert_form(record: api_form_type): Promise<api_form> {
	const { user, domain } = await user_and_domain(record.domain_id);

	const idname = normalizeSlug(user.idname);
	const dname = normalizeSlug(domain.name);
	const name = normalizeSlug(record.idname);
	const locale = normalizeSlug(record.locale || domain.locale || user.locale || '');

	if (!record.slug) {
		record.slug = `${idname}-${dname}${locale ? '-' + locale : ''}-${name}`;
	}

	if (!record.filename) {
		const parts = [dname, 'form-template'];
		if (locale) parts.push(locale);
		parts.push(name);
		record.filename = path.join(...parts);
	} else {
		record.filename = path.join(dname, 'form-template', record.filename);
	}
	if (!record.filename.endsWith('.njk')) {
		record.filename += '.njk';
	}
	record.filename = assertSafeRelativePath(record.filename, 'Form filename');

	let instance: api_form | null = null;
	instance = await api_form.findByPk(record.form_id);
	if (instance) {
		await instance.update(record);
	} else {
		instance = await api_form.create(record);
	}
	if (!instance) {
		throw new Error(`Unable to update/create form ${record.form_id}`);
	}
	return instance;
}
