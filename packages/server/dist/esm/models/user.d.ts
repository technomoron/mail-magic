import { Sequelize, Model } from 'sequelize';
import { z } from 'zod';
export declare const api_user_schema: z.ZodObject<{
    user_id: z.ZodNumber;
    idname: z.ZodString;
    token: z.ZodOptional<z.ZodString>;
    token_hmac: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    email: z.ZodString;
    domain: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    locale: z.ZodDefault<z.ZodString>;
}, z.core.$strip>;
export type api_user_input = z.input<typeof api_user_schema>;
export type api_user_type = z.output<typeof api_user_schema>;
export type api_user_creation_type = Omit<api_user_input, 'user_id'> & {
    user_id?: number;
};
export declare class api_user extends Model<api_user_type, api_user_creation_type> {
    user_id: number;
    idname: string;
    token: string | undefined;
    token_hmac: string | undefined;
    name: string;
    email: string;
    domain: number | null | undefined;
    locale: string;
}
export declare function apiTokenToHmac(token: string, pepper: string): string;
export declare function migrateLegacyApiTokens(pepper: string): Promise<{
    migrated: number;
    cleared: number;
}>;
export declare function init_api_user(api_db: Sequelize): Promise<typeof api_user>;
