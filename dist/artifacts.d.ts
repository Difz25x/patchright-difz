import type { BrowserContext, Page } from "patchright";
type ClearCookiesOptions = Parameters<BrowserContext["clearCookies"]>[0];
export type ClearSessionArtifactsOptions = {
    page?: Page;
    context?: BrowserContext;
    pages?: Page[];
    cookies?: boolean;
    cookieOptions?: ClearCookiesOptions;
    storage?: boolean;
    headers?: boolean;
    permissions?: boolean;
    origins?: string[];
};
export type ClearBrowserArtifactsOptions = ClearSessionArtifactsOptions & {
    cache?: boolean;
    serviceWorkers?: boolean;
};
export type ClearBrowserArtifactsResult = {
    cookies: boolean;
    headers: boolean;
    permissions: boolean;
    storagePages: number;
    cachePages: number;
    serviceWorkerPages: number;
    cdpOrigins: number;
    errors: string[];
};
export declare function clearSessionArtifacts({ page, context: explicitContext, pages: explicitPages, cookies, cookieOptions, storage, headers, permissions, origins, }: ClearSessionArtifactsOptions): Promise<ClearBrowserArtifactsResult>;
export declare function clearBrowserArtifacts({ page, context: explicitContext, pages: explicitPages, cookies, cookieOptions, storage, headers, permissions, origins, cache, serviceWorkers, }: ClearBrowserArtifactsOptions): Promise<ClearBrowserArtifactsResult>;
export {};
