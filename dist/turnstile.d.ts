import type { BrowserContext, Page } from "patchright";
export type TurnstileOption = boolean | TurnstileAutoOptions;
export type TurnstileAutoOptions = {
    timeoutMs?: number;
    intervalMs?: number;
    selectors?: string[];
    maxCandidatesPerSelector?: number;
    foreground?: boolean;
    clickDelayMs?: number;
    mouseMoveSteps?: number;
    waitAfterClickMs?: number;
    clickCooldownMs?: number;
    maxClickCooldownMs?: number;
    logger?: (message: string) => void;
};
export type CheckTurnstileOptions = {
    page: Page;
    timeoutMs?: number;
    selectors?: string[];
    maxCandidatesPerSelector?: number;
    foreground?: boolean;
    clickDelayMs?: number;
    mouseMoveSteps?: number;
    waitAfterClickMs?: number;
    clickCooldownMs?: number;
    maxClickCooldownMs?: number;
};
export type HasTurnstileOptions = {
    page: Page;
    selectors?: string[];
    maxCandidatesPerSelector?: number;
    includeFallback?: boolean;
};
export type IsTurnstileSolvedOptions = {
    page?: Page;
    context?: BrowserContext;
    urls?: string | string[];
    minTokenLength?: number;
};
export type IsCloudflareManagedChallengeOptions = {
    page: Page;
};
export type CloudflareDataOptions = {
    page?: Page;
    context?: BrowserContext;
    urls?: string | string[];
    minTokenLength?: number;
    timeoutMs?: number;
};
export type CloudflareCookie = {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
};
export type TurnstileResponseData = {
    source: "field" | "attribute";
    value: string;
};
export type TurnstileWidgetData = {
    sitekey?: string;
    action?: string;
    cData?: string;
    callback?: string;
    theme?: string;
    size?: string;
    language?: string;
};
export type CloudflareFieldData = {
    name?: string;
    value: string;
};
export type CloudflareStorageEntry = {
    key: string;
    value: string;
};
export type CloudflareData = {
    url: string;
    userAgent: string;
    documentCookieNames: string[];
    cookies: CloudflareCookie[];
    cloudflareCookies: CloudflareCookie[];
    clearanceCookie: string;
    turnstile: {
        present: boolean;
        solved: boolean;
        responses: TurnstileResponseData[];
        tokens: string[];
        sitekeys: string[];
        widgets: TurnstileWidgetData[];
        iframes: string[];
        scripts: string[];
    };
    challenge: {
        cleared: boolean;
        managed: boolean;
        fields: CloudflareFieldData[];
        rayIds: string[];
        options: unknown;
    };
    storage: {
        local: CloudflareStorageEntry[];
        session: CloudflareStorageEntry[];
    };
};
/**
 * Identifier for a Turnstile widget on the page.
 * Generated from sitekey + DOM path to uniquely identify each widget.
 */
export type TurnstileWidgetId = string;
/**
 * Info about a detected Turnstile widget.
 */
export type TurnstileWidgetInfo = {
    widgetId: TurnstileWidgetId;
    sitekey?: string;
    solved: boolean;
};
export declare function hasTurnstile({ page, selectors, maxCandidatesPerSelector, includeFallback, }: HasTurnstileOptions): Promise<boolean>;
export declare function isTurnstileSolved({ page, context, urls, minTokenLength, }: IsTurnstileSolvedOptions): Promise<boolean>;
/**
 * Count how many valid Turnstile tokens are currently in the DOM.
 * Useful for multi-widget pages: each widget produces one token, so
 * counting tokens reveals how many widgets have been solved so far.
 */
export declare function countTurnstileTokens(page: Page, minTokenLength?: number): Promise<number>;
export declare function _getCloudflareDataRaw({ page, context, urls, minTokenLength, }: CloudflareDataOptions): Promise<CloudflareData>;
export declare function getCloudflareData(options: CloudflareDataOptions): Promise<CloudflareData>;
export declare function isCloudflareManagedChallenge({ page, }: IsCloudflareManagedChallengeOptions): Promise<boolean>;
export declare function checkTurnstile({ page, ...options }: CheckTurnstileOptions): () => void;
export declare function installTurnstileAutoSolver(context: BrowserContext, option?: TurnstileOption): () => void;
