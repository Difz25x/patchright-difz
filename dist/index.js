import * as patchright from "patchright";
import { getHeadlessUserAgent, withDefaultUserAgent, withHeadlessUserAgent, } from "./headless.js";
import { installRealCursor, installRealCursorContext, } from "./cursor.js";
import { installMainWorldEvaluateDefaults } from "./mainWorld.js";
import { installTurnstileAutoSolver } from "./turnstile.js";
import { installStealth, STEALTH_LAUNCH_ARGS } from "./stealth.js";
installMainWorldEvaluateDefaults();
export * from "patchright";
export { clearBrowserArtifacts, clearSessionArtifacts, } from "./artifacts.js";
export { getHeadlessUserAgent } from "./headless.js";
export { createCursor, installMouseHelper, installRealCursor, installRealCursorContext, } from "./cursor.js";
export { installMainWorldEvaluateDefaults } from "./mainWorld.js";
export { applyStealthToPage, installStealth } from "./stealth.js";
export { checkTurnstile, countTurnstileTokens, getCloudflareData, hasTurnstile, installTurnstileAutoSolver, isCloudflareManagedChallenge, isTurnstileSolved, } from "./turnstile.js";
function splitTurnstileOption(options) {
    if (!options)
        return { patchrightOptions: undefined, turnstile: undefined };
    const { turnstile, ...rest } = options;
    return { patchrightOptions: rest, turnstile: turnstile };
}
async function setupContext(context, turnstile) {
    await installStealth(context);
    installRealCursorContext(context);
    if (turnstile)
        installTurnstileAutoSolver(context, turnstile);
}
function wrapBrowser(browser, defaultTurnstile, defaultUserAgent) {
    return new Proxy(browser, {
        get(target, property, receiver) {
            if (property === "newContext") {
                return async (options) => {
                    const { patchrightOptions, turnstile } = splitTurnstileOption(options);
                    const context = await target.newContext(withDefaultUserAgent(patchrightOptions, defaultUserAgent));
                    await setupContext(context, turnstile ?? defaultTurnstile);
                    return context;
                };
            }
            if (property === "newPage") {
                return async (options) => {
                    const { patchrightOptions, turnstile } = splitTurnstileOption(options);
                    const page = await target.newPage(withDefaultUserAgent(patchrightOptions, defaultUserAgent));
                    installRealCursor(page);
                    await setupContext(page.context(), turnstile ?? defaultTurnstile);
                    return page;
                };
            }
            const value = Reflect.get(target, property, receiver);
            return typeof value === "function" ? value.bind(target) : value;
        },
    });
}
function ensureStealthArgs(options) {
    if (!options)
        return { args: [...STEALTH_LAUNCH_ARGS] };
    const existing = options.args || [];
    const combined = existing.length > 0
        ? [...existing, ...STEALTH_LAUNCH_ARGS.filter((a) => !existing.includes(a))]
        : [...STEALTH_LAUNCH_ARGS];
    return { ...options, args: combined };
}
function wrapChromium(browserType) {
    return new Proxy(browserType, {
        get(target, property, receiver) {
            if (property === "launchPersistentContext") {
                return async (userDataDir, options) => {
                    const { patchrightOptions, turnstile } = splitTurnstileOption(options);
                    const context = await target.launchPersistentContext(userDataDir, ensureStealthArgs(withHeadlessUserAgent(patchrightOptions)));
                    await setupContext(context, turnstile);
                    return context;
                };
            }
            if (property === "launch") {
                return async (options) => {
                    const { patchrightOptions, turnstile } = splitTurnstileOption(options);
                    const ua = patchrightOptions?.headless === false ? undefined : getHeadlessUserAgent(patchrightOptions);
                    return wrapBrowser(await target.launch(ensureStealthArgs(patchrightOptions)), turnstile, ua);
                };
            }
            const value = Reflect.get(target, property, receiver);
            return typeof value === "function" ? value.bind(target) : value;
        },
    });
}
export const chromium = wrapChromium(patchright.chromium);
//# sourceMappingURL=index.js.map