import { Sequelize, Model } from 'sequelize';
import { z } from 'zod';
import { StoredFile } from '../types.js';
export declare const api_txmail_schema: z.ZodObject<{
    template_id: z.ZodNumber;
    user_id: z.ZodNumber;
    domain_id: z.ZodNumber;
    name: z.ZodString;
    locale: z.ZodDefault<z.ZodString>;
    template: z.ZodDefault<z.ZodString>;
    filename: z.ZodDefault<z.ZodString>;
    sender: z.ZodString;
    subject: z.ZodString;
    slug: z.ZodDefault<z.ZodString>;
    part: z.ZodDefault<z.ZodBoolean>;
    files: z.ZodDefault<z.ZodArray<z.ZodObject<{
        filename: z.ZodString;
        path: z.ZodString;
        cid: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type api_txmail_input = z.input<typeof api_txmail_schema>;
export type api_txmail_type = z.output<typeof api_txmail_schema>;
export type api_txmail_creation_type = Omit<api_txmail_input, 'template_id'> & {
    template_id?: number;
};
export declare class api_txmail extends Model<api_txmail_type, api_txmail_creation_type> {
    template_id: number;
    user_id: number;
    domain_id: number;
    name: string;
    locale: string;
    template: string;
    filename: string;
    sender: string;
    subject: string;
    slug: string;
    part: boolean;
    files: StoredFile[];
}
export declare function upsert_txmail(record: api_txmail_type): Promise<api_txmail>;
export declare function init_api_txmail(api_db: Sequelize): Promise<typeof api_txmail>;
