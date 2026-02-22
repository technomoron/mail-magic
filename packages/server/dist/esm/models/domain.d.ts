import { Sequelize, Model } from 'sequelize';
import { z } from 'zod';
export declare const api_domain_schema: z.ZodObject<{
    domain_id: z.ZodNumber;
    user_id: z.ZodNumber;
    name: z.ZodString;
    sender: z.ZodDefault<z.ZodString>;
    locale: z.ZodDefault<z.ZodString>;
    is_default: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type api_domain_input = z.input<typeof api_domain_schema>;
export type api_domain_type = z.output<typeof api_domain_schema>;
export type api_domain_creation_type = Omit<api_domain_input, 'domain_id'> & {
    domain_id?: number;
};
export declare class api_domain extends Model<api_domain_type, api_domain_creation_type> {
    domain_id: number;
    user_id: number;
    name: string;
    sender: string;
    locale: string;
    is_default: boolean;
}
export declare function init_api_domain(api_db: Sequelize): Promise<typeof api_domain>;
