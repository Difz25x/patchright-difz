import type {
  BrowserContext,
  ElementHandle,
  Locator,
  Page,
  CDPSession,
} from "patchright";

export type CursorPoint = {
  x: number;
  y: number;
};

export type TimedVector = CursorPoint & { timestamp: number };

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

function wait(page: Page, ms: number | undefined): Promise<void> {
  if (!ms || ms <= 0) return Promise.resolve();
  return page.waitForTimeout(ms).catch(() => undefined);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function distance(left: CursorPoint, right: CursorPoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

const sub = (a: CursorPoint, b: CursorPoint): CursorPoint => ({ x: a.x - b.x, y: a.y - b.y });
const mult = (a: CursorPoint, b: number): CursorPoint => ({ x: a.x * b, y: a.y * b });
const add = (a: CursorPoint, b: CursorPoint): CursorPoint => ({ x: a.x + b.x, y: a.y + b.y });
const perpendicular = (a: CursorPoint): CursorPoint => ({ x: a.y, y: -1 * a.x });
const magnitude = (a: CursorPoint): number => Math.hypot(a.x, a.y);
const unit = (a: CursorPoint): CursorPoint => {
  const mag = magnitude(a);
  return mag === 0 ? { x: 0, y: 0 } : { x: a.x / mag, y: a.y / mag };
};
const setMagnitude = (a: CursorPoint, amount: number): CursorPoint => mult(unit(a), amount);

const direction = (a: CursorPoint, b: CursorPoint): CursorPoint => sub(b, a);

const extrapolate = (a: CursorPoint, b: CursorPoint): CursorPoint => add(b, sub(b, a));

function randomVectorOnLine(a: CursorPoint, b: CursorPoint): CursorPoint {
  const vec = direction(a, b);
  const multiplier = Math.random();
  return add(a, mult(vec, multiplier));
}

function generateBezierAnchors(
  a: CursorPoint,
  b: CursorPoint,
  spread: number
): [CursorPoint, CursorPoint] {
  const side = Math.round(Math.random()) === 1 ? 1 : -1;
  const calc = (): CursorPoint => {
    const randMid = randomVectorOnLine(a, b);
    const normalV = setMagnitude(perpendicular(direction(a, randMid)), spread);
    const choice = mult(normalV, side);
    return randomVectorOnLine(randMid, add(randMid, choice));
  };
  return [calc(), calc()].sort((a, b) => a.x - b.x) as [CursorPoint, CursorPoint];
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

function bezierCurveSpeed(
  t: number,
  P0: CursorPoint,
  P1: CursorPoint,
  P2: CursorPoint,
  P3: CursorPoint
): number {
  const B1 = 3 * (1 - t) ** 2 * (P1.x - P0.x) + 6 * (1 - t) * t * (P2.x - P1.x) + 3 * t ** 2 * (P3.x - P2.x);
  const B2 = 3 * (1 - t) ** 2 * (P1.y - P0.y) + 6 * (1 - t) * t * (P2.y - P1.y) + 3 * t ** 2 * (P3.y - P2.y);
  return Math.sqrt(B1 ** 2 + B2 ** 2);
}

function fitts(distance: number, width: number): number {
  return Math.log2(distance / width + 1);
}

function generateTimestamps(
  vectors: CursorPoint[],
  P0: CursorPoint,
  P1: CursorPoint,
  P2: CursorPoint,
  P3: CursorPoint,
  options?: CursorMoveOptions
): TimedVector[] {
  const speed = options?.moveSpeed && options.moveSpeed > 0 ? (25 / options.moveSpeed) : (Math.random() * 0.5 + 0.5);
  const timeToMove = (p0: CursorPoint, p1: CursorPoint, p2: CursorPoint, p3: CursorPoint, samples: number): number => {
    let total = 0;
    const dt = 1 / samples;

    for (let t = 0; t < 1; t += dt) {
      const v1 = bezierCurveSpeed(t * dt, p0, p1, p2, p3);
      const v2 = bezierCurveSpeed(t, p0, p1, p2, p3);
      total += (v1 + v2) * dt / 2;
    }

    return Math.round(total / speed);
  };

  const timedVectors: TimedVector[] = [];

  for (let i = 0; i < vectors.length; i++) {
    if (i === 0) {
      timedVectors.push({ ...vectors[i], timestamp: Date.now() });
    } else {
      const p0 = vectors[i - 1];
      const p1 = vectors[i];
      const p2 = i + 1 < vectors.length ? vectors[i + 1] : extrapolate(p0, p1);
      const p3 = i + 2 < vectors.length ? vectors[i + 2] : extrapolate(p1, p2);
      const time = timeToMove(p0, p1, p2, p3, vectors.length);

      timedVectors.push({
        ...vectors[i],
        timestamp: timedVectors[i - 1].timestamp + time
      });
    }
  }

  return timedVectors;
}

function movementPath(
  start: CursorPoint,
  end: CursorPoint,
  options: CursorMoveOptions | undefined,
): TimedVector[] {
  const length = distance(start, end);
  if (length < 1) return [{ ...end, timestamp: Date.now() }];

  const minSpread = 2;
  const maxSpread = 200;
  const spread = clamp(length, minSpread, maxSpread);
  const [controlA, controlB] = generateBezierAnchors(start, end, spread);

  const minSteps = 25;
  const targetWidth = 100;
  const speed = options?.moveSpeed && options.moveSpeed > 0 ? (25 / options.moveSpeed) : Math.random();
  const baseTime = speed * minSteps;
  const steps = clamp(Math.ceil((fitts(length, targetWidth) + baseTime) * 3), 8, 200);

  const points: CursorPoint[] = [];

  for (let step = 1; step <= steps; step++) {
    const point = cubicBezier(start, controlA, controlB, end, step / steps);
    points.push({
      x: Math.max(0, point.x),
      y: Math.max(0, point.y)
    });
  }

  return generateTimestamps(points, start, controlA, controlB, end, options);
}

function overshootPoint(start: CursorPoint, end: CursorPoint, radius: number = 120): CursorPoint {
  const length = distance(start, end);
  if (length < 1) return end;

  const a = Math.random() * 2 * Math.PI;
  const rad = radius * Math.sqrt(Math.random());
  const vector = { x: rad * Math.cos(a), y: rad * Math.sin(a) };
  return add(end, vector);
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
  let cdpSessionPromise: Promise<CDPSession> | null = null;

  const getCdp = async (): Promise<CDPSession> => {
    if (!cdpSessionPromise) {
      cdpSessionPromise = page.context().newCDPSession(page);
    }
    return await cdpSessionPromise;
  };

  const moveDirect = async (
    destination: CursorPoint,
    options?: CursorMoveOptions,
  ): Promise<void> => {
    const path = movementPath(location, destination, options);
    const cdp = await getCdp();

    for (const point of path) {
      try {
        await cdp.send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: point.x,
          y: point.y,
          timestamp: point.timestamp,
        });
      } catch (err) {
        if (!page.isClosed()) throw err;
        return;
      }
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

  const mouseButtonAction = async (
    action: "mousePressed" | "mouseReleased",
    options?: Pick<CursorClickOptions, "button" | "clickCount">
  ): Promise<void> => {
    const cdp = await getCdp();
    try {
      await cdp.send("Input.dispatchMouseEvent", {
        type: action,
        x: location.x,
        y: location.y,
        button: options?.button || "left",
        clickCount: options?.clickCount || 1,
      });
    } catch (err) {
      if (!page.isClosed()) throw err;
    }
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
      await mouseButtonAction("mousePressed", options);
    },

    mouseUp: async (options = {}): Promise<void> => {
      await mouseButtonAction("mouseReleased", options);
    },
  };

  return cursor;
}

export async function installMouseHelper(page: Page): Promise<void> {
  const attachListener = (): void => {
    if (document.getElementById('p-mouse-pointer')) return;
    const box = document.createElement('p-mouse-pointer');
    const styleElement = document.createElement('style');
    styleElement.innerHTML = `
      p-mouse-pointer {
        pointer-events: none;
        position: absolute;
        top: 0;
        z-index: 10000;
        left: 0;
        width: 20px;
        height: 20px;
        background: rgba(0,0,0,.4);
        border: 1px solid white;
        border-radius: 10px;
        box-sizing: border-box;
        margin: -10px 0 0 -10px;
        padding: 0;
        transition: background .2s, border-radius .2s, border-color .2s;
      }
      p-mouse-pointer.button-1 {
        transition: none;
        background: rgba(0,0,0,0.9);
      }
      p-mouse-pointer.button-2 {
        transition: none;
        border-color: rgba(0,0,255,0.9);
      }
      p-mouse-pointer.button-3 {
        transition: none;
        border-radius: 4px;
      }
      p-mouse-pointer.button-4 {
        transition: none;
        border-color: rgba(255,0,0,0.9);
      }
      p-mouse-pointer.button-5 {
        transition: none;
        border-color: rgba(0,255,0,0.9);
      }
      p-mouse-pointer-hide {
        display: none;
      }
    `;
    document.head.appendChild(styleElement);
    document.body.appendChild(box);

    document.addEventListener('mousemove', (event: MouseEvent) => {
      box.style.left = `${event.pageX}px`;
      box.style.top = `${event.pageY}px`;
      box.classList.remove('p-mouse-pointer-hide');
    }, true);

    document.addEventListener('mousedown', (event: MouseEvent) => {
      box.classList.add(`button-${event.which}`);
      box.classList.remove('p-mouse-pointer-hide');
    }, true);

    document.addEventListener('mouseup', (event: MouseEvent) => {
      box.classList.remove(`button-${event.which}`);
      box.classList.remove('p-mouse-pointer-hide');
    }, true);
  };

  await page.addInitScript(`(${attachListener.toString()})();`);
  await page.evaluate(attachListener).catch(() => undefined);
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
