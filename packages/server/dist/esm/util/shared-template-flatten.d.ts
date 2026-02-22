export type FlattenedAsset = {
    filename: string;
    path: string;
    cid?: string;
};
export type FlattenWithAssetsOptions = {
    domainRoot: string;
    templateKey: string;
    baseUrl: string;
    assetFormatter: (urlPath: string) => string;
    normalizeInlineCid?: (urlPath: string) => string;
};
export type FlattenWithAssetsResult = {
    html: string;
    assets: FlattenedAsset[];
};
export declare function flattenTemplateWithAssets(options: FlattenWithAssetsOptions): FlattenWithAssetsResult;
