import path from 'path';
import { Model, DataTypes } from 'sequelize';
import { z } from 'zod';
import { assertSafeRelativePath } from '../util/paths.js';
import { user_and_domain, normalizeSlug } from '../util.js';
export const api_txmail_schema = z
    .object({
    template_id: z.number().int().nonnegative().describe('Database primary key for the template record.'),
    user_id: z.number().int().nonnegative().describe('Owning user ID.'),
    domain_id: z.number().int().nonnegative().describe('Owning domain ID.'),
    name: z.string().min(1).describe('Template name within the domain.'),
    locale: z.string().default('').describe('Locale for this template configuration.'),
    template: z.string().default('').describe('Nunjucks template content used for rendering.'),
    filename: z.string().default('').describe('Relative path of the source .njk template file.'),
    sender: z.string().min(1).describe('Email From header used when delivering this template.'),
    subject: z.string().describe('Email subject used when delivering this template.'),
    slug: z.string().default('').describe('Generated slug for this template record (domain + locale + name).'),
    part: z.boolean().default(false).describe('If true, template is a partial (not a standalone send).'),
    files: z
        .array(z.object({
        filename: z.string().describe('Asset filename (relative to the domain assets directory).'),
        path: z.string().describe('Absolute path on disk where the asset is stored.'),
        cid: z.string().optional().describe('Content-ID used for inline attachments when set.')
    }))
        .default([])
        .describe('Derived list of template-referenced assets resolved during preprocessing/import.')
})
    .describe('Transactional email template configuration.');
// Sequelize typing pattern: merge the Zod-inferred attribute type onto the model instance type.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class api_txmail extends Model {
}
export async function upsert_txmail(record) {
    const { user, domain } = await user_and_domain(record.domain_id);
    const dname = normalizeSlug(domain.name);
    const name = normalizeSlug(record.name);
    const locale = normalizeSlug(record.locale || domain.locale || user.locale || '');
    if (!record.slug) {
        record.slug = `${dname}${locale ? '-' + locale : ''}-${name}`;
    }
    if (!record.filename) {
        const parts = [dname, 'tx-template'];
        if (locale)
            parts.push(locale);
        parts.push(name);
        record.filename = path.join(...parts);
    }
    else {
        record.filename = path.join(dname, 'tx-template', record.filename);
    }
    if (!record.filename.endsWith('.njk')) {
        record.filename += '.njk';
    }
    record.filename = assertSafeRelativePath(record.filename, 'Template filename');
    const [instance] = await api_txmail.upsert(record);
    return instance;
}
export async function init_api_txmail(api_db) {
    api_txmail.init({
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
                const raw = this.getDataValue('files');
                if (!raw) {
                    return [];
                }
                try {
                    const parsed = JSON.parse(raw);
                    return Array.isArray(parsed) ? parsed : [];
                }
                catch {
                    return [];
                }
            },
            set(value) {
                this.setDataValue('files', JSON.stringify(value ?? []));
            }
        }
    }, {
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
    });
    api_txmail.addHook('beforeValidate', async (template) => {
        const { user, domain } = await user_and_domain(template.domain_id);
        const dname = normalizeSlug(domain.name);
        const name = normalizeSlug(template.name);
        const locale = normalizeSlug(template.locale || domain.locale || user.locale || '');
        template.slug ||= `${dname}${locale ? '-' + locale : ''}-${name}`;
        if (!template.filename) {
            const parts = [dname, 'tx-template'];
            if (locale)
                parts.push(locale);
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
