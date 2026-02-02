declare module '@technomoron/mail-magic-admin' {
	export const registerAdmin:
		| ((server: unknown, options?: Record<string, unknown>) => unknown)
		| undefined;
	export const AdminAPI: (new () => unknown) | undefined;
}
