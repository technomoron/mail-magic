import { Sequelize, Model } from 'sequelize';
import { z } from 'zod';
export declare const api_recipient_schema: z.ZodObject<{
    recipient_id: z.ZodNumber;
    domain_id: z.ZodNumber;
    form_key: z.ZodDefault<z.ZodString>;
    idname: z.ZodString;
    email: z.ZodString;
    name: z.ZodDefault<z.ZodString>;
}, z.core.$strip>;
export type api_recipient_input = z.input<typeof api_recipient_schema>;
export type api_recipient_type = z.output<typeof api_recipient_schema>;
export type api_recipient_creation_type = Omit<api_recipient_input, 'recipient_id'> & {
    recipient_id?: number;
};
export declare class api_recipient extends Model<api_recipient_type, api_recipient_creation_type> {
    recipient_id: number;
    domain_id: number;
    form_key: string;
    idname: string;
    email: string;
    name: string;
}
export declare function init_api_recipient(api_db: Sequelize): Promise<typeof api_recipient>;
