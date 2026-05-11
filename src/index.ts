import * as patchright from "patchright";
import type {
  Browser,
  BrowserContext,
  BrowserType,
  chromium as ChromiumBrowserType,
} from "patchright";
import { installMainWorldEvaluateDefaults } from "./mainWorld.js";
import { installTurnstileAutoSolver } from "./turnstile.js";
import type { TurnstileOption } from "./turnstile.js";

installMainWorldEvaluateDefaults();

export * from "patchright";
export { installMainWorldEvaluateDefaults } from "./mainWorld.js";
export {
  checkTurnstile,
  installTurnstileAutoSolver,
} from "./turnstile.js";
export type {
  CheckTurnstileOptions,
  TurnstileAutoOptions,
  TurnstileOption,
} from "./turnstile.js";

type LaunchOptions = Parameters<typeof patchright.chromium.launch>[0];
type LaunchPersistentContextOptions = Parameters<
  typeof patchright.chromium.launchPersistentContext
>[1];
type BrowserNewContextOptions = Parameters<Browser["newContext"]>[0];

type WithTurnstile<T> = T & {
  turnstile?: TurnstileOption;
};

type BrowserWithTurnstile = Omit<Browser, "newContext"> & {
  newContext(
    options?: WithTurnstile<BrowserNewContextOptions>,
  ): Promise<BrowserContext>;
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
  if (!options) {
    return {
      patchrightOptions: undefined,
      turnstile: undefined,
    };
  }

  const { turnstile, ...patchrightOptions } = options as Record<
    string,
    unknown
  >;

  return {
    patchrightOptions: patchrightOptions as T,
    turnstile: turnstile as TurnstileOption | undefined,
  };
}

function wrapBrowser(
  browser: Browser,
  defaultTurnstile?: TurnstileOption,
): BrowserWithTurnstile {
  return new Proxy(browser, {
    get(target, property, receiver) {
      if (property === "newContext") {
        return async (options?: WithTurnstile<BrowserNewContextOptions>) => {
          const { patchrightOptions, turnstile } =
            splitTurnstileOption(options);
          const context = await target.newContext(patchrightOptions);
          const turnstileOption = turnstile ?? defaultTurnstile;

          if (turnstileOption) {
            installTurnstileAutoSolver(context, turnstileOption);
          }

          return context;
        };
      }

      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as BrowserWithTurnstile;
}

function wrapChromium(
  browserType: BrowserType,
): ChromiumWithTurnstile {
  return new Proxy(browserType, {
    get(target, property, receiver) {
      if (property === "launchPersistentContext") {
        return async (
          userDataDir: string,
          options?: WithTurnstile<LaunchPersistentContextOptions>,
        ) => {
          const { patchrightOptions, turnstile } =
            splitTurnstileOption(options);
          const context = await target.launchPersistentContext(
            userDataDir,
            patchrightOptions,
          );

          if (turnstile) {
            installTurnstileAutoSolver(context, turnstile);
          }

          return context;
        };
      }

      if (property === "launch") {
        return async (options?: WithTurnstile<LaunchOptions>) => {
          const { patchrightOptions, turnstile } =
            splitTurnstileOption(options);
          const browser = await target.launch(patchrightOptions);

          return wrapBrowser(browser, turnstile);
        };
      }

      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as ChromiumWithTurnstile;
}

export const chromium = wrapChromium(patchright.chromium);
