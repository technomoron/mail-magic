import path from 'path';

import { nanoid } from 'nanoid';
import { Sequelize, Model, DataTypes, UniqueConstraintError } from 'sequelize';
import { z } from 'zod';

import { StoredFile } from '../types.js';
import { assertSafeRelativePath } from '../util/paths.js';
import { user_and_domain, normalizeSlug } from '../util.js';

const stored_file_schema: z.ZodType<StoredFile> = z
	.object({
		filename: z.string().describe('Asset filename (relative to the domain assets directory).'),
		path: z.string().describe('Absolute path on disk where the asset is stored.'),
		cid: z.string().optional().describe('Content-ID used for inline attachments (cid:...) when set.')
	})
	.describe('A stored file/asset referenced by a template.');

export const api_form_schema = z
	.object({
		form_id: z.number().int().nonnegative().describe('Database primary key for the form configuration record.'),
		form_key: z
			.string()
			.trim()
			.min(1)
			.default(() => nanoid())
			.describe('Public form key required by the unauthenticated form submission endpoint (globally unique).'),
		user_id: z.number().int().nonnegative().describe('Owning user ID.'),
		domain_id: z.number().int().nonnegative().describe('Owning domain ID.'),
		locale: z
			.string()
			.default('')
			.describe('Locale for this form configuration (used for lookup/rendering and template path generation).'),
		idname: z.string().min(1).describe('Form identifier within the domain (slug-like).'),
		sender: z.string().min(1).describe('Email From header used when delivering form submissions.'),
		recipient: z
			.string()
			.min(1)
			.describe(
				'Default email recipient (To) used when delivering form submissions (unless recipients are overridden).'
			),
		subject: z.string().describe('Email subject used when delivering form submissions.'),
		template: z
			.string()
			.default('')
			.describe('Nunjucks template content used to render the outbound email body for this form.'),
		filename: z
			.string()
			.default('')
			.describe('Relative path (within the config tree) of the source .njk template file for this form.'),
		slug: z.string().default('').describe('Generated slug for this form record (domain + locale + idname).'),
		secret: z
			.string()
			.default('')
			.describe(
				'Legacy form secret (stored for compatibility; not part of the public form submission contract).'
			),
		replyto_email: z
			.string()
			.default('')
			.describe('Optional forced Reply-To email address used when reply-to extraction is disabled or fails.'),
		replyto_from_fields: z
			.boolean()
			.default(false)
			.describe('If true, attempt to extract Reply-To from submitted form fields (email + name).'),
		allowed_fields: z
			.array(z.string())
			.default([])
			.describe(
				'Optional allowlist of submitted field names that are exposed to templates as _fields_. When empty, all non-system fields are exposed.'
			),
		captcha_required: z
			.boolean()
			.default(false)
			.describe(
				'If true, require a captcha token for public submissions to this form (in addition to any server-level requirement).'
			),
		files: z
			.array(stored_file_schema)
			.default([])
			.describe(
				'Derived list of template-referenced assets (inline cids and external links) resolved during preprocessing/import.'
			)
	})
	.describe('Form configuration and template used by the public form submission endpoint.');

export type api_form_input = z.input<typeof api_form_schema>;
export type api_form_type = z.output<typeof api_form_schema>;
export type api_form_creation_type = Omit<api_form_input, 'form_id'> & { form_id?: number };

// Sequelize typing pattern: merge the Zod-inferred attribute type onto the model instance type.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class api_form extends Model<api_form_type, api_form_creation_type> {}

// Merge Zod-inferred attributes onto the Sequelize model instance type (avoids per-field `declare`).
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface api_form extends api_form_type {}

export async function init_api_form(api_db: Sequelize): Promise<typeof api_form> {
	api_form.init(
		{
			form_id: {
				type: DataTypes.INTEGER,
				autoIncrement: true,
				allowNull: false,
				primaryKey: true
			},
			form_key: {
				type: DataTypes.STRING,
				allowNull: false
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
			replyto_email: {
				type: DataTypes.STRING,
				allowNull: false,
				defaultValue: ''
			},
			replyto_from_fields: {
				type: DataTypes.BOOLEAN,
				allowNull: false,
				defaultValue: false
			},
			allowed_fields: {
				type: DataTypes.TEXT,
				allowNull: false,
				defaultValue: '[]',
				get() {
					// This column is stored as JSON text but exposed as `string[]` via getter/setter.
					const raw = this.getDataValue('allowed_fields') as unknown as string | null;
					if (!raw) {
						return [];
					}
					try {
						const parsed = JSON.parse(raw) as unknown;
						return Array.isArray(parsed) ? (parsed as string[]) : [];
					} catch {
						return [];
					}
				},
				set(value: string[] | null | undefined) {
					this.setDataValue('allowed_fields', JSON.stringify(value ?? []) as unknown as string[]);
				}
			},
			captcha_required: {
				type: DataTypes.BOOLEAN,
				allowNull: false,
				defaultValue: false
			},
			files: {
				type: DataTypes.TEXT,
				allowNull: false,
				defaultValue: '[]',
				get() {
					// This column is stored as JSON text but exposed as `StoredFile[]` via getter/setter.
					const raw = this.getDataValue('files') as unknown as string | null;
					if (!raw) {
						return [];
					}
					try {
						const parsed = JSON.parse(raw) as unknown;
						return Array.isArray(parsed) ? (parsed as StoredFile[]) : [];
					} catch {
						return [];
					}
				},
				set(value: StoredFile[] | null | undefined) {
					this.setDataValue('files', JSON.stringify(value ?? []) as unknown as StoredFile[]);
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
					fields: ['form_key']
				},
				{
					unique: true,
					fields: ['user_id', 'domain_id', 'locale', 'idname']
				}
			]
		}
	);

	return api_form;
}

export async function upsert_form(record: api_form_type): Promise<api_form> {
	const { user, domain } = await user_and_domain(record.domain_id);

	const dname = normalizeSlug(domain.name);
	const name = normalizeSlug(record.idname);
	const locale = normalizeSlug(record.locale || domain.locale || user.locale || '');

	if (!record.slug) {
		record.slug = `${dname}${locale ? '-' + locale : ''}-${name}`;
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
		// Existing forms should always have a form_key. If not, repair it.
		if (!String(instance.form_key ?? '').trim()) {
			record.form_key = nanoid();
		}
		await instance.update(record);
	} else {
		// form_key must be globally unique; retry on collisions.
		for (let attempt = 0; attempt < 10; attempt++) {
			record.form_key = String(record.form_key ?? '').trim() || nanoid();
			try {
				instance = await api_form.create(record);
				break;
			} catch (err: unknown) {
				if (err instanceof UniqueConstraintError) {
					const conflicted = (err as UniqueConstraintError).errors?.some((e) => e.path === 'form_key');
					if (conflicted) {
						record.form_key = nanoid();
						continue;
					}
				}
				throw err;
			}
		}
	}
	if (!instance) {
		throw new Error(`Unable to update/create form ${record.form_id}`);
	}
	return instance;
}
