import type { ApiModule, ApiServer } from '@technomoron/api-server-base';

export type AdminRegisterOptions = {
	apiBasePath?: string;
	assetRoute?: string;
	appPath?: string;
	logger?: (message: string) => void;
};

export declare class AdminAPI extends ApiModule {
	defineRoutes(): {
		method: 'get';
		path: string;
		handler: () => Promise<[number, { status: string }]>;
		auth: { type: 'yes'; req: 'any' };
	}[];
}

export declare function registerAdmin(
	server: ApiServer,
	options?: AdminRegisterOptions
): { api: boolean; ui: boolean; distPath: string | null };
