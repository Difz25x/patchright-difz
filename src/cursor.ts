import type {
  BrowserContext,
  ElementHandle,
  Locator,
  Page,
} from "patchright";

export type CursorPoint = {
  x: number;
  y: number;
};

export type CursorBox = CursorPoint & {
  width: number;
  height: number;
};

export type CursorTarget =
  | string
  | CursorPoint
  | CursorBox
  | ElementHandle<Element>
  | Locator;

export type CursorClickOptions = CursorMoveOptions & {
  button?: "left" | "right" | "middle";
  clickCount?: number;
  delay?: number;
  hesitate?: number;
  waitForClick?: number;
};

export type CursorMoveOptions = {
  destination?: CursorPoint;
  maxTries?: number;
  moveDelay?: number;
  moveSpeed?: number;
  overshootThreshold?: number;
  paddingPercentage?: number;
  randomizeMoveDelay?: boolean;
  waitForSelector?: number;
};

export type RealClick = {
  (options?: CursorClickOptions): Promise<void>;
  (target: CursorTarget, options?: CursorClickOptions): Promise<void>;
};

export type RealCursor = {
  click: RealClick;
  getLocation(): CursorPoint;
  move(target: CursorTarget, options?: CursorMoveOptions): Promise<void>;
  moveBy(delta: Partial<CursorPoint>, options?: CursorMoveOptions): Promise<void>;
  moveTo(destination: CursorPoint, options?: CursorMoveOptions): Promise<void>;
  mouseDown(options?: Pick<CursorClickOptions, "button" | "clickCount">): Promise<void>;
  mouseUp(options?: Pick<CursorClickOptions, "button" | "clickCount">): Promise<void>;
};

declare module "patchright" {
  interface Page {
    realCursor?: RealCursor;
    realClick?: RealClick;
  }
}

const cursorContexts = new WeakSet<BrowserContext>();
const DEFAULT_OVERSHOOT_THRESHOLD = 500;
const DEFAULT_MOVE_STEP_LENGTH = 14;

function wait(page: Page, ms: number | undefined): Promise<void> {
  if (!ms || ms <= 0) return Promise.resolve();

  return page.waitForTimeout(ms).catch(() => undefined);
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function distance(left: CursorPoint, right: CursorPoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function cubicBezier(
  start: CursorPoint,
  controlA: CursorPoint,
  controlB: CursorPoint,
  end: CursorPoint,
  time: number,
): CursorPoint {
  const inverse = 1 - time;
  const inverseSquared = inverse * inverse;
  const timeSquared = time * time;

  return {
    x:
      inverseSquared * inverse * start.x +
      3 * inverseSquared * time * controlA.x +
      3 * inverse * timeSquared * controlB.x +
      timeSquared * time * end.x,
    y:
      inverseSquared * inverse * start.y +
      3 * inverseSquared * time * controlA.y +
      3 * inverse * timeSquared * controlB.y +
      timeSquared * time * end.y,
  };
}

function movementPath(
  start: CursorPoint,
  end: CursorPoint,
  options: CursorMoveOptions | undefined,
): CursorPoint[] {
  const length = distance(start, end);
  if (length < 1) return [end];

  const stepLength = options?.moveSpeed && options.moveSpeed > 0
    ? options.moveSpeed
    : randomBetween(DEFAULT_MOVE_STEP_LENGTH * 0.75, DEFAULT_MOVE_STEP_LENGTH * 1.5);
  const steps = clamp(Math.ceil(length / stepLength), 8, 90);
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const perpendicular = angle + Math.PI / 2;
  const spread = clamp(length * randomBetween(0.08, 0.22), 8, 120);
  const controlA = {
    x:
      start.x +
      (end.x - start.x) * randomBetween(0.2, 0.45) +
      Math.cos(perpendicular) * randomBetween(-spread, spread),
    y:
      start.y +
      (end.y - start.y) * randomBetween(0.2, 0.45) +
      Math.sin(perpendicular) * randomBetween(-spread, spread),
  };
  const controlB = {
    x:
      start.x +
      (end.x - start.x) * randomBetween(0.55, 0.85) +
      Math.cos(perpendicular) * randomBetween(-spread, spread),
    y:
      start.y +
      (end.y - start.y) * randomBetween(0.55, 0.85) +
      Math.sin(perpendicular) * randomBetween(-spread, spread),
  };
  const points: CursorPoint[] = [];

  for (let step = 1; step <= steps; step++) {
    points.push(cubicBezier(start, controlA, controlB, end, step / steps));
  }

  return points;
}

function overshootPoint(start: CursorPoint, end: CursorPoint): CursorPoint {
  const length = distance(start, end);
  if (length < 1) return end;

  const unitX = (end.x - start.x) / length;
  const unitY = (end.y - start.y) / length;
  const overshoot = randomBetween(8, 24);
  const sideways = randomBetween(-8, 8);

  return {
    x: end.x + unitX * overshoot - unitY * sideways,
    y: end.y + unitY * overshoot + unitX * sideways,
  };
}

function isCursorBox(value: unknown): value is CursorBox {
  const box = value as CursorBox;

  return Boolean(
    value &&
      typeof value === "object" &&
      typeof box.x === "number" &&
      typeof box.y === "number" &&
      typeof box.width === "number" &&
      typeof box.height === "number",
  );
}

function isCursorPoint(value: unknown): value is CursorPoint {
  const point = value as CursorPoint;

  return Boolean(
    value &&
      typeof value === "object" &&
      typeof point.x === "number" &&
      typeof point.y === "number" &&
      typeof (value as Partial<CursorBox>).width !== "number",
  );
}

function isLocator(value: unknown): value is Locator {
  const locator = value as Locator;

  return Boolean(
    value &&
      typeof value === "object" &&
      typeof locator.boundingBox === "function" &&
      typeof locator.elementHandle === "function",
  );
}

function isElementHandle(value: unknown): value is ElementHandle<Element> {
  const handle = value as ElementHandle<Element>;

  return Boolean(
    value &&
      typeof value === "object" &&
      typeof handle.boundingBox === "function" &&
      typeof handle.evaluate === "function",
  );
}

function isClickOptions(value: unknown): value is CursorClickOptions {
  return Boolean(
    value &&
      typeof value === "object" &&
      !isCursorPoint(value) &&
      !isCursorBox(value) &&
      !isLocator(value) &&
      !isElementHandle(value),
  );
}

function pointInBox(
  box: CursorBox,
  options: CursorMoveOptions | undefined,
): CursorPoint {
  if (options?.destination) {
    return {
      x: box.x + options.destination.x,
      y: box.y + options.destination.y,
    };
  }

  const paddingPercentage = clamp(options?.paddingPercentage ?? 20, 0, 100);
  const paddingX = (box.width * paddingPercentage) / 100;
  const paddingY = (box.height * paddingPercentage) / 100;

  return {
    x: box.x + paddingX / 2 + Math.random() * Math.max(1, box.width - paddingX),
    y: box.y + paddingY / 2 + Math.random() * Math.max(1, box.height - paddingY),
  };
}

async function resolveElementPoint(
  element: ElementHandle<Element>,
  options: CursorMoveOptions | undefined,
): Promise<CursorPoint> {
  await element.scrollIntoViewIfNeeded().catch(() => undefined);

  const box = await element.boundingBox();
  if (!box) throw new Error("target element has no bounding box");

  return pointInBox(box, options);
}

async function resolveTargetPoint(
  page: Page,
  target: CursorTarget,
  options: CursorMoveOptions | undefined,
): Promise<CursorPoint> {
  if (typeof target === "string") {
    const element = options?.waitForSelector === undefined
      ? await page.$(target)
      : await page.waitForSelector(target, {
          timeout: options.waitForSelector,
        });

    if (!element) throw new Error(`could not find element matching selector "${target}"`);

    try {
      return await resolveElementPoint(element as ElementHandle<Element>, options);
    } finally {
      await element.dispose().catch(() => undefined);
    }
  }

  if (isCursorBox(target)) return pointInBox(target, options);
  if (isCursorPoint(target)) return target;

  if (isLocator(target)) {
    await target.scrollIntoViewIfNeeded({ timeout: options?.waitForSelector })
      .catch(() => undefined);

    const box = await target
      .boundingBox({ timeout: options?.waitForSelector })
      .catch(() => null);
    if (!box) throw new Error("target locator has no bounding box");

    return pointInBox(box, options);
  }

  return resolveElementPoint(target, options);
}

export function createCursor(
  page: Page,
  start: CursorPoint = { x: 0, y: 0 },
): RealCursor {
  let location = { ...start };

  const moveDirect = async (
    destination: CursorPoint,
    options?: CursorMoveOptions,
  ): Promise<void> => {
    const path = movementPath(location, destination, options);

    for (const point of path) {
      await page.mouse.move(point.x, point.y);
    }

    location = { ...destination };
  };

  const moveTo = async (
    destination: CursorPoint,
    options?: CursorMoveOptions,
  ): Promise<void> => {
    const threshold = options?.overshootThreshold ?? DEFAULT_OVERSHOOT_THRESHOLD;

    if (distance(location, destination) > threshold) {
      await moveDirect(overshootPoint(location, destination), options);
    }

    await moveDirect(destination, options);

    const moveDelay = options?.moveDelay ?? 0;
    const delay = options?.randomizeMoveDelay === false
      ? moveDelay
      : moveDelay * Math.random();
    await wait(page, delay);
  };

  const cursor: RealCursor = {
    click: async (
      targetOrOptions?: CursorTarget | CursorClickOptions,
      clickOptions?: CursorClickOptions,
    ): Promise<void> => {
      const target = isClickOptions(targetOrOptions)
        ? undefined
        : targetOrOptions;
      const options = isClickOptions(targetOrOptions)
        ? targetOrOptions
        : clickOptions;

      if (target) {
        const point = await resolveTargetPoint(page, target, options);
        await moveTo(point, options);
      }

      await wait(page, options?.hesitate);

      const clickCount = Math.max(1, options?.clickCount ?? 1);

      for (let index = 1; index <= clickCount; index++) {
        await cursor.mouseDown({
          button: options?.button,
          clickCount: index,
        });
        await wait(page, options?.waitForClick ?? options?.delay);
        await cursor.mouseUp({
          button: options?.button,
          clickCount: index,
        });

        if (index < clickCount) {
          await wait(page, options?.waitForClick ?? options?.delay);
        }
      }
    },

    getLocation: () => ({ ...location }),

    move: async (
      target: CursorTarget,
      options?: CursorMoveOptions,
    ): Promise<void> => {
      const point = await resolveTargetPoint(page, target, options);
      await moveTo(point, options);
    },

    moveBy: async (
      delta: Partial<CursorPoint>,
      options?: CursorMoveOptions,
    ): Promise<void> => {
      await moveTo({
        x: location.x + (delta.x ?? 0),
        y: location.y + (delta.y ?? 0),
      }, options);
    },

    moveTo,

    mouseDown: async (options = {}): Promise<void> => {
      const mouseOptions: Parameters<Page["mouse"]["down"]>[0] = {};
      if (options.button) mouseOptions.button = options.button;
      if (options.clickCount) mouseOptions.clickCount = options.clickCount;

      await page.mouse.down(mouseOptions);
    },

    mouseUp: async (options = {}): Promise<void> => {
      const mouseOptions: Parameters<Page["mouse"]["up"]>[0] = {};
      if (options.button) mouseOptions.button = options.button;
      if (options.clickCount) mouseOptions.clickCount = options.clickCount;

      await page.mouse.up(mouseOptions);
    },
  };

  return cursor;
}

export function installRealCursor(page: Page): RealCursor {
  if (page.realCursor) return page.realCursor;

  const cursor = createCursor(page);
  const realClick = cursor.click.bind(cursor) as RealClick;

  Object.defineProperty(page, "realCursor", {
    configurable: true,
    enumerable: false,
    value: cursor,
    writable: true,
  });
  Object.defineProperty(page, "realClick", {
    configurable: true,
    enumerable: false,
    value: realClick,
    writable: true,
  });

  return cursor;
}

export function installRealCursorContext(context: BrowserContext): void {
  if (cursorContexts.has(context)) return;

  cursorContexts.add(context);
  context.pages().forEach(installRealCursor);
  context.on("page", installRealCursor);
}
