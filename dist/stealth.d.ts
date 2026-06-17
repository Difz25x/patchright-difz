import type { Page, BrowserContext } from "patchright";
export declare const STEALTH_LAUNCH_ARGS: readonly string[];
export declare function applyStealthToPage(page: Page): Promise<void>;
export declare function installStealth(context: BrowserContext): void;
