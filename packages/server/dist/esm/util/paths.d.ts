export declare const SEGMENT_PATTERN: RegExp;
export declare function normalizeSubdir(value: string): string;
export declare function assertSafeRelativePath(filename: string, label: string): string;
export declare function buildFormSlugAndFilename(params: {
    domainName: string;
    domainLocale: string;
    idname: string;
    locale: string;
}): {
    localeSlug: string;
    slug: string;
    filename: string;
};
export declare function buildAssetUrl(baseUrl: string, route: string, domainName: string, assetPath: string): string;
