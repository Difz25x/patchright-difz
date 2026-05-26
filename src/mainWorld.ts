import { createRequire } from "node:module";
import { dirname, join } from "node:path";

type AnyFunction = (...args: unknown[]) => unknown;
type Prototype = Record<PropertyKey, unknown>;

const nodeRequire = createRequire(import.meta.url);
const methodPatchKey = Symbol.for("patchright-difz.mainWorldEvaluate.methods");
const dollarEvalPatchKey = Symbol.for("patchright-difz.mainWorldEvaluate.$eval");

function asPrototype(value: unknown): Prototype | undefined {
  return value && typeof value === "object"
    ? (value as Prototype)
    : undefined;
}

function getPatchedMethods(prototype: Prototype): Set<string> {
  let methods = prototype[methodPatchKey] as Set<string> | undefined;

  if (!methods) {
    methods = new Set<string>();
    Object.defineProperty(prototype, methodPatchKey, {
      configurable: false,
      enumerable: false,
      value: methods,
    });
  }

  return methods;
}

function patchIsolatedContextDefault(
  prototype: unknown,
  methodName: string,
  isolatedContextIndex: number,
): void {
  const target = asPrototype(prototype);
  if (!target) return;

  const patchedMethods = getPatchedMethods(target);
  const patchId = `${methodName}:${isolatedContextIndex}`;
  if (patchedMethods.has(patchId)) return;

  const original = target[methodName];
  if (typeof original !== "function") return;

  Object.defineProperty(target, methodName, {
    configurable: true,
    writable: true,
    value: function patchedMainWorldDefault(...args: unknown[]) {
      if (
        args.length <= isolatedContextIndex ||
        args[isolatedContextIndex] === undefined
      ) {
        args[isolatedContextIndex] = false;
      }

      return (original as AnyFunction).apply(this, args);
    },
  });

  patchedMethods.add(patchId);
}

function patchFrameDollarEval(framePrototype: unknown): void {
  const target = asPrototype(framePrototype);
  if (!target || target[dollarEvalPatchKey]) return;

  const original = target.$eval;
  if (typeof original !== "function") return;

  Object.defineProperty(target, "$eval", {
    configurable: true,
    writable: true,
    value: async function patchedDollarEval(
      selector: string,
      pageFunction: unknown,
      arg?: unknown,
    ) {
      const frame = this as {
        $: (selector: string) => Promise<{
          dispose: () => Promise<void> | void;
          evaluate: (
            pageFunction: unknown,
            arg?: unknown,
            isolatedContext?: boolean,
          ) => Promise<unknown>;
        } | null>;
      };
      const handle = await frame.$(selector);

      if (!handle) {
        throw new Error(`Failed to find element matching selector "${selector}"`);
      }

      try {
        return await handle.evaluate(pageFunction, arg, false);
      } finally {
        await handle.dispose();
      }
    },
  });

  Object.defineProperty(target, dollarEvalPatchKey, {
    configurable: false,
    enumerable: false,
    value: original,
  });
}

function requirePatchrightCoreModule<T extends object>(
  fileName: string,
): T | undefined {
  try {
    const patchrightPackagePath = nodeRequire.resolve("patchright/package.json");
    const patchrightRequire = createRequire(patchrightPackagePath);
    const corePackagePath = patchrightRequire.resolve(
      "patchright-core/package.json",
    );

    return patchrightRequire(join(dirname(corePackagePath), fileName)) as T;
  } catch (_error) {
    return undefined;
  }
}

export function installMainWorldEvaluateDefaults(): boolean {
  const modules = {
    page: requirePatchrightCoreModule<{ Page?: { prototype: Prototype } }>("lib/client/page.js"),
    frame: requirePatchrightCoreModule<{ Frame?: { prototype: Prototype } }>("lib/client/frame.js"),
    locator: requirePatchrightCoreModule<{ Locator?: { prototype: Prototype } }>("lib/client/locator.js"),
    jsHandle: requirePatchrightCoreModule<{ JSHandle?: { prototype: Prototype } }>("lib/client/jsHandle.js"),
    worker: requirePatchrightCoreModule<{ Worker?: { prototype: Prototype } }>("lib/client/worker.js"),
  };

  if (Object.values(modules).some((m) => !m)) return false;

  const patches: [Prototype | undefined, string, number][] = [
    [modules.page?.Page?.prototype, "evaluate", 2],
    [modules.page?.Page?.prototype, "evaluateHandle", 2],
    [modules.frame?.Frame?.prototype, "evaluate", 2],
    [modules.frame?.Frame?.prototype, "evaluateHandle", 2],
    [modules.frame?.Frame?.prototype, "$$eval", 3],
    [modules.locator?.Locator?.prototype, "evaluate", 3],
    [modules.locator?.Locator?.prototype, "evaluateHandle", 3],
    [modules.locator?.Locator?.prototype, "evaluateAll", 2],
    [modules.jsHandle?.JSHandle?.prototype, "evaluate", 2],
    [modules.jsHandle?.JSHandle?.prototype, "evaluateHandle", 2],
    [modules.worker?.Worker?.prototype, "evaluate", 2],
    [modules.worker?.Worker?.prototype, "evaluateHandle", 2],
  ];

  for (const [proto, method, idx] of patches) {
    patchIsolatedContextDefault(proto, method, idx);
  }

  patchFrameDollarEval(modules.frame?.Frame?.prototype);

  return true;
}
