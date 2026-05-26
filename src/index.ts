import * as patchright from "patchright";
import type {
  Browser,
  BrowserContext,
  BrowserType,
  chromium as ChromiumBrowserType,
} from "patchright";
import {
  getHeadlessUserAgent,
  withDefaultUserAgent,
  withHeadlessUserAgent,
} from "./headless.js";
import {
  installRealCursor,
  installRealCursorContext,
} from "./cursor.js";
import { installMainWorldEvaluateDefaults } from "./mainWorld.js";
import { installTurnstileAutoSolver } from "./turnstile.js";
import type { TurnstileOption } from "./turnstile.js";

installMainWorldEvaluateDefaults();

export * from "patchright";
export {
  clearBrowserArtifacts,
  clearSessionArtifacts,
} from "./artifacts.js";
export { getHeadlessUserAgent } from "./headless.js";
export {
  createCursor,
  installMouseHelper,
  installRealCursor,
  installRealCursorContext,
} from "./cursor.js";
export { installMainWorldEvaluateDefaults } from "./mainWorld.js";
export {
  checkTurnstile,
  getCloudflareData,
  hasTurnstile,
  installTurnstileAutoSolver,
  isCloudflareManagedChallenge,
  isTurnstileSolved,
} from "./turnstile.js";
export type {
  ClearBrowserArtifactsOptions,
  ClearBrowserArtifactsResult,
  ClearSessionArtifactsOptions,
} from "./artifacts.js";
export type {
  CursorBox,
  CursorClickOptions,
  CursorMoveOptions,
  CursorPoint,
  CursorTarget,
  RealClick,
  RealCursor,
} from "./cursor.js";
export type {
  CheckTurnstileOptions,
  CloudflareCookie,
  CloudflareData,
  CloudflareDataOptions,
  CloudflareFieldData,
  CloudflareStorageEntry,
  HasTurnstileOptions,
  IsCloudflareManagedChallengeOptions,
  IsTurnstileSolvedOptions,
  TurnstileResponseData,
  TurnstileAutoOptions,
  TurnstileOption,
  TurnstileWidgetData,
} from "./turnstile.js";

type LaunchOptions = Parameters<typeof patchright.chromium.launch>[0];
type LaunchPersistentContextOptions = Parameters<
  typeof patchright.chromium.launchPersistentContext
>[1];
type BrowserNewContextOptions = Parameters<Browser["newContext"]>[0];
type BrowserNewPageOptions = Parameters<Browser["newPage"]>[0];

type WithTurnstile<T> = T & {
  turnstile?: TurnstileOption;
};

type BrowserWithTurnstile = Omit<Browser, "newContext" | "newPage"> & {
  newContext(
    options?: WithTurnstile<BrowserNewContextOptions>,
  ): Promise<BrowserContext>;
  newPage(options?: WithTurnstile<BrowserNewPageOptions>): ReturnType<Browser["newPage"]>;
};

type ChromiumWithTurnstile = Omit<
  typeof ChromiumBrowserType,
  "launch" | "launchPersistentContext"
> & {
  launch(options?: WithTurnstile<LaunchOptions>): Promise<BrowserWithTurnstile>;
  launchPersistentContext(
    userDataDir: string,
    options?: WithTurnstile<LaunchPersistentContextOptions>,
  ): Promise<BrowserContext>;
};

function splitTurnstileOption<T extends object | undefined>(
  options: WithTurnstile<T> | undefined,
): { patchrightOptions: T | undefined; turnstile: TurnstileOption | undefined } {
  if (!options) return { patchrightOptions: undefined, turnstile: undefined };
  const { turnstile, ...rest } = options as Record<string, unknown>;
  return { patchrightOptions: rest as T, turnstile: turnstile as TurnstileOption | undefined };
}

function setupContext(
  context: BrowserContext,
  turnstile?: TurnstileOption,
): void {
  installRealCursorContext(context);
  if (turnstile) installTurnstileAutoSolver(context, turnstile);
}

function wrapBrowser(
  browser: Browser,
  defaultTurnstile?: TurnstileOption,
  defaultUserAgent?: string,
): BrowserWithTurnstile {
  return new Proxy(browser, {
    get(target, property, receiver) {
      if (property === "newContext") {
        return async (options?: WithTurnstile<BrowserNewContextOptions>) => {
          const { patchrightOptions, turnstile } = splitTurnstileOption(options);
          const context = await target.newContext(withDefaultUserAgent(patchrightOptions, defaultUserAgent));
          setupContext(context, turnstile ?? defaultTurnstile);
          return context;
        };
      }

      if (property === "newPage") {
        return async (options?: WithTurnstile<BrowserNewPageOptions>) => {
          const { patchrightOptions, turnstile } = splitTurnstileOption(options);
          const page = await target.newPage(withDefaultUserAgent(patchrightOptions, defaultUserAgent));
          installRealCursor(page);
          setupContext(page.context(), turnstile ?? defaultTurnstile);
          return page;
        };
      }

      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as BrowserWithTurnstile;
}

function wrapChromium(browserType: BrowserType): ChromiumWithTurnstile {
  return new Proxy(browserType, {
    get(target, property, receiver) {
      if (property === "launchPersistentContext") {
        return async (
          userDataDir: string,
          options?: WithTurnstile<LaunchPersistentContextOptions>,
        ) => {
          const { patchrightOptions, turnstile } = splitTurnstileOption(options);
          const context = await target.launchPersistentContext(userDataDir, withHeadlessUserAgent(patchrightOptions));
          setupContext(context, turnstile);
          return context;
        };
      }

      if (property === "launch") {
        return async (options?: WithTurnstile<LaunchOptions>) => {
          const { patchrightOptions, turnstile } = splitTurnstileOption(options);
          const ua = patchrightOptions?.headless === false ? undefined : getHeadlessUserAgent(patchrightOptions);
          return wrapBrowser(await target.launch(patchrightOptions), turnstile, ua);
        };
      }

      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as ChromiumWithTurnstile;
}

export const chromium = wrapChromium(patchright.chromium);
