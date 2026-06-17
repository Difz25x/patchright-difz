import * as patchright from "patchright";
import type { Browser, BrowserContext, chromium as ChromiumBrowserType } from "patchright";
import type { TurnstileOption } from "./turnstile.js";
export * from "patchright";
export { clearBrowserArtifacts, clearSessionArtifacts, } from "./artifacts.js";
export { getHeadlessUserAgent } from "./headless.js";
export { createCursor, installMouseHelper, installRealCursor, installRealCursorContext, } from "./cursor.js";
export { installMainWorldEvaluateDefaults } from "./mainWorld.js";
export { applyStealthToPage, installStealth } from "./stealth.js";
export { checkTurnstile, countTurnstileTokens, getCloudflareData, hasTurnstile, installTurnstileAutoSolver, isCloudflareManagedChallenge, isTurnstileSolved, } from "./turnstile.js";
export type { ClearBrowserArtifactsOptions, ClearBrowserArtifactsResult, ClearSessionArtifactsOptions, } from "./artifacts.js";
export type { CursorBox, CursorClickOptions, CursorMoveOptions, CursorPoint, CursorTarget, RealClick, RealCursor, } from "./cursor.js";
export type { CheckTurnstileOptions, CloudflareCookie, CloudflareData, CloudflareDataOptions, CloudflareFieldData, CloudflareStorageEntry, HasTurnstileOptions, IsCloudflareManagedChallengeOptions, IsTurnstileSolvedOptions, TurnstileResponseData, TurnstileAutoOptions, TurnstileOption, TurnstileWidgetData, } from "./turnstile.js";
type LaunchOptions = Parameters<typeof patchright.chromium.launch>[0];
type LaunchPersistentContextOptions = Parameters<typeof patchright.chromium.launchPersistentContext>[1];
type BrowserNewContextOptions = Parameters<Browser["newContext"]>[0];
type BrowserNewPageOptions = Parameters<Browser["newPage"]>[0];
type WithTurnstile<T> = T & {
    turnstile?: TurnstileOption;
};
type BrowserWithTurnstile = Omit<Browser, "newContext" | "newPage"> & {
    newContext(options?: WithTurnstile<BrowserNewContextOptions>): Promise<BrowserContext>;
    newPage(options?: WithTurnstile<BrowserNewPageOptions>): ReturnType<Browser["newPage"]>;
};
type ChromiumWithTurnstile = Omit<typeof ChromiumBrowserType, "launch" | "launchPersistentContext"> & {
    launch(options?: WithTurnstile<LaunchOptions>): Promise<BrowserWithTurnstile>;
    launchPersistentContext(userDataDir: string, options?: WithTurnstile<LaunchPersistentContextOptions>): Promise<BrowserContext>;
};
export declare const chromium: ChromiumWithTurnstile;
