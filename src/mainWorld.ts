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
  const pageModule = requirePatchrightCoreModule<{
    Page?: { prototype: Prototype };
  }>("lib/client/page.js");
  const frameModule = requirePatchrightCoreModule<{
    Frame?: { prototype: Prototype };
  }>("lib/client/frame.js");
  const locatorModule = requirePatchrightCoreModule<{
    Locator?: { prototype: Prototype };
  }>("lib/client/locator.js");
  const jsHandleModule = requirePatchrightCoreModule<{
    JSHandle?: { prototype: Prototype };
  }>("lib/client/jsHandle.js");
  const workerModule = requirePatchrightCoreModule<{
    Worker?: { prototype: Prototype };
  }>("lib/client/worker.js");

  const modules = [
    pageModule,
    frameModule,
    locatorModule,
    jsHandleModule,
    workerModule,
  ];

  if (modules.some((module) => !module)) {
    return false;
  }

  patchIsolatedContextDefault(pageModule?.Page?.prototype, "evaluate", 2);
  patchIsolatedContextDefault(pageModule?.Page?.prototype, "evaluateHandle", 2);

  patchIsolatedContextDefault(frameModule?.Frame?.prototype, "evaluate", 2);
  patchIsolatedContextDefault(
    frameModule?.Frame?.prototype,
    "evaluateHandle",
    2,
  );
  patchIsolatedContextDefault(frameModule?.Frame?.prototype, "$$eval", 3);
  patchFrameDollarEval(frameModule?.Frame?.prototype);

  patchIsolatedContextDefault(locatorModule?.Locator?.prototype, "evaluate", 3);
  patchIsolatedContextDefault(
    locatorModule?.Locator?.prototype,
    "evaluateHandle",
    3,
  );
  patchIsolatedContextDefault(
    locatorModule?.Locator?.prototype,
    "evaluateAll",
    2,
  );

  patchIsolatedContextDefault(jsHandleModule?.JSHandle?.prototype, "evaluate", 2);
  patchIsolatedContextDefault(
    jsHandleModule?.JSHandle?.prototype,
    "evaluateHandle",
    2,
  );

  patchIsolatedContextDefault(workerModule?.Worker?.prototype, "evaluate", 2);
  patchIsolatedContextDefault(
    workerModule?.Worker?.prototype,
    "evaluateHandle",
    2,
  );

  return true;
}
