const DEFAULT_OVERSHOOT_THRESHOLD = 500;
const DEFAULT_JITTER = 1.5;
const DEFAULT_WIND_STRENGTH = 0.25;
function gaussianClamp(mean, std, min, max) {
    return clamp(gaussianRandom(mean, std), min, max);
}
const cursorContexts = new WeakSet();
function wait(page, ms) {
    if (!ms || ms <= 0)
        return Promise.resolve();
    return page.waitForTimeout(ms).catch(() => undefined);
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function dist(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
}
const add = (a, b) => ({
    x: a.x + b.x,
    y: a.y + b.y,
});
const sub = (a, b) => ({
    x: a.x - b.x,
    y: a.y - b.y,
});
const mult = (a, s) => ({
    x: a.x * s,
    y: a.y * s,
});
const magnitude = (a) => Math.hypot(a.x, a.y);
const unit = (a) => {
    const m = magnitude(a);
    return m === 0 ? { x: 0, y: 0 } : { x: a.x / m, y: a.y / m };
};
const perp = (a) => ({ x: -a.y, y: a.x });
function gaussianRandom(mean = 0, std = 1) {
    let u = 0, v = 0;
    while (u === 0)
        u = Math.random();
    while (v === 0)
        v = Math.random();
    return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function randBetween(min, max) {
    return min + Math.random() * (max - min);
}
function easeInOut(t) {
    return (1 - Math.cos(Math.PI * t)) / 2;
}
function inverseEaseInOut(y) {
    return Math.acos(1 - 2 * clamp(y, 0, 1)) / Math.PI;
}
function applyEasing(t, type) {
    switch (type) {
        case "ease-in":
            return t * t;
        case "ease-out":
            return 1 - (1 - t) * (1 - t);
        case "ease-in-out":
            return easeInOut(t);
        default:
            return t;
    }
}
function fittsTime(distance, targetWidth, speed) {
    const b = 150;
    const id = Math.log2(distance / targetWidth + 1);
    const base = (b * id) / Math.max(0.01, speed);
    const jitter = 1 + gaussianRandom(0, 0.05);
    return Math.max(50, base * jitter);
}
function cubicBezierPoint(P0, P1, P2, P3, t) {
    const u = 1 - t;
    return {
        x: u * u * u * P0.x +
            3 * u * u * t * P1.x +
            3 * u * t * t * P2.x +
            t * t * t * P3.x,
        y: u * u * u * P0.y +
            3 * u * u * t * P1.y +
            3 * u * t * t * P2.y +
            t * t * t * P3.y,
    };
}
function generateControlPoints(start, end) {
    const len = dist(start, end);
    const dir = sub(end, start);
    const spread = clamp(len * 0.35, 5, 220);
    const perpDir = perp(unit(dir));
    // asymmetric — each control point picks its own side independently
    const side1 = Math.random() < 0.5 ? 1 : -1;
    const side2 = Math.random() < 0.35 ? -side1 : side1;
    const t1 = randBetween(0.15, 0.45);
    const t2 = randBetween(0.55, 0.85);
    const o1 = spread * randBetween(0.2, 1.0) * side1;
    const o2 = spread * randBetween(0.2, 0.9) * side2;
    return [
        add(add(start, mult(dir, t1)), mult(perpDir, o1)),
        add(add(start, mult(dir, t2)), mult(perpDir, o2)),
    ];
}
function applyTremor(points, amplitude) {
    if (amplitude <= 0 || points.length < 3)
        return points;
    return points.map((p, i) => {
        if (i === points.length - 1)
            return p;
        const prev = points[Math.max(0, i - 1)];
        const next = points[Math.min(points.length - 1, i + 1)];
        const dir = unit(sub(next, prev));
        const perpDir = perp(dir);
        const noisePerp = gaussianRandom(0, amplitude);
        const noisePara = gaussianRandom(0, amplitude * 0.25);
        return {
            x: p.x + perpDir.x * noisePerp + dir.x * noisePara,
            y: p.y + perpDir.y * noisePerp + dir.y * noisePara,
        };
    });
}
function applyWind(points, strength) {
    if (strength <= 0 || points.length < 3)
        return points;
    const n = points.length;
    const result = [...points];
    let wx = 0;
    let wy = 0;
    const cap = strength * 10;
    for (let i = 1; i < n - 1; i++) {
        const progress = i / (n - 1);
        const decay = 1 - Math.pow(progress, 1.5);
        wx += gaussianRandom(0, strength * 0.6);
        wy += gaussianRandom(0, strength * 0.6);
        const wm = Math.hypot(wx, wy);
        if (wm > cap) {
            wx = (wx / wm) * cap;
            wy = (wy / wm) * cap;
        }
        result[i] = {
            x: result[i].x + wx * decay,
            y: result[i].y + wy * decay,
        };
    }
    return result;
}
function generateSpatialPath(start, end, options) {
    const len = dist(start, end);
    if (len < 1)
        return [{ ...end }];
    const speed = options?.moveSpeed && options.moveSpeed > 0 ? options.moveSpeed : 1.0;
    const jitter = options?.jitter ?? DEFAULT_JITTER;
    const windStrength = options?.windStrength ?? DEFAULT_WIND_STRENGTH;
    const totalMs = fittsTime(len, 80, speed);
    // variable velocity — multiply speed slightly along the path
    const speedVariation = 1 + gaussianRandom(0, 0.08);
    const steps = clamp(Math.ceil((totalMs * speedVariation) / 8), 8, 250);
    const [ctrl1, ctrl2] = generateControlPoints(start, end);
    const rawPoints = [];
    for (let i = 1; i <= steps; i++) {
        rawPoints.push(cubicBezierPoint(start, ctrl1, ctrl2, end, i / steps));
    }
    rawPoints[rawPoints.length - 1] = { ...end };
    const windPoints = applyWind(rawPoints, windStrength);
    const noisyPoints = applyTremor(windPoints, jitter);
    noisyPoints[noisyPoints.length - 1] = { ...end };
    return noisyPoints;
}
function stampPath(points, totalMs) {
    const n = points.length;
    if (n === 0)
        return [];
    const now = Date.now();
    if (n === 1)
        return [{ ...points[0], timestamp: now }];
    // inject 0-2 micro-pauses at random positions to simulate human hesitation
    const pauseCount = Math.random() < 0.4 ? 0 : Math.random() < 0.7 ? 1 : 2;
    const pauseIndices = new Set();
    for (let p = 0; p < pauseCount; p++) {
        pauseIndices.add(Math.floor(randBetween(n * 0.2, n * 0.8)));
    }
    let accumulated = 0;
    return points.map((pt, i) => {
        const spatialFraction = i / (n - 1);
        const timeFraction = inverseEaseInOut(spatialFraction);
        let ts = now + Math.round(timeFraction * totalMs);
        if (pauseIndices.has(i)) {
            accumulated += Math.round(randBetween(8, 35));
        }
        ts += accumulated;
        return { ...pt, timestamp: ts };
    });
}
function microCorrectionPath(current, target) {
    const d = dist(current, target);
    if (d < 0.5)
        return { points: [{ ...target }], durationMs: 15 };
    const overshootFactor = randBetween(0.06, 0.22);
    const overshootPt = add(target, mult(sub(target, current), overshootFactor));
    return {
        points: [
            {
                x: overshootPt.x + gaussianRandom(0, 0.8),
                y: overshootPt.y + gaussianRandom(0, 0.8),
            },
            {
                x: target.x + gaussianRandom(0, 0.4),
                y: target.y + gaussianRandom(0, 0.4),
            },
            { ...target },
        ],
        durationMs: clamp(d * 2, 20, 80),
    };
}
function overshootPoint(start, end) {
    const len = dist(start, end);
    if (len < 1)
        return end;
    const dir = unit(sub(end, start));
    const perpDir = perp(dir);
    const overshootDist = randBetween(8, Math.min(60, len * 0.08));
    const lateralDrift = gaussianRandom(0, 6);
    return {
        x: end.x + dir.x * overshootDist + perpDir.x * lateralDrift,
        y: end.y + dir.y * overshootDist + perpDir.y * lateralDrift,
    };
}
function idleJitterPath(center, durationMs, amplitude = 1.2) {
    if (durationMs <= 0)
        return [];
    const hz = 15;
    const count = Math.max(2, Math.floor((durationMs / 1000) * hz));
    const interval = durationMs / count;
    const now = Date.now();
    const path = [];
    for (let i = 0; i < count; i++) {
        path.push({
            x: center.x + gaussianRandom(0, amplitude),
            y: center.y + gaussianRandom(0, amplitude),
            timestamp: now + i * interval,
        });
    }
    path.push({ ...center, timestamp: now + durationMs });
    return path;
}
function buildScrollSteps(total, steps, easing, jitter) {
    if (steps <= 1)
        return [total];
    const sizes = [];
    let acc = 0;
    for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        const delta = applyEasing(t1, easing) - applyEasing(t0, easing);
        const noise = jitter > 0 ? gaussianRandom(0, jitter) : 0;
        sizes.push(total * delta + noise);
        acc += total * delta + noise;
    }
    const corr = (total - acc) / steps;
    return sizes.map((s) => s + corr);
}
function isCursorBox(value) {
    const box = value;
    return Boolean(value &&
        typeof value === "object" &&
        typeof box.x === "number" &&
        typeof box.y === "number" &&
        typeof box.width === "number" &&
        typeof box.height === "number");
}
function isCursorPoint(value) {
    const point = value;
    return Boolean(value &&
        typeof value === "object" &&
        typeof point.x === "number" &&
        typeof point.y === "number" &&
        typeof value.width !== "number");
}
function isLocator(value) {
    const locator = value;
    return Boolean(value &&
        typeof value === "object" &&
        typeof locator.boundingBox === "function" &&
        typeof locator.elementHandle === "function");
}
function isElementHandle(value) {
    const handle = value;
    return Boolean(value &&
        typeof value === "object" &&
        typeof handle.boundingBox === "function" &&
        typeof handle.evaluate === "function");
}
function isClickOptions(value) {
    return Boolean(value &&
        typeof value === "object" &&
        !isCursorPoint(value) &&
        !isCursorBox(value) &&
        !isLocator(value) &&
        !isElementHandle(value));
}
function pointInBox(box, options) {
    if (options?.destination) {
        return {
            x: box.x + options.destination.x,
            y: box.y + options.destination.y,
        };
    }
    const pct = clamp(options?.paddingPercentage ?? 20, 0, 100);
    const padX = (box.width * pct) / 100;
    const padY = (box.height * pct) / 100;
    return {
        x: box.x + padX / 2 + Math.random() * Math.max(1, box.width - padX),
        y: box.y + padY / 2 + Math.random() * Math.max(1, box.height - padY),
    };
}
async function resolveElementPoint(element, options) {
    await element.scrollIntoViewIfNeeded().catch(() => undefined);
    const box = await element.boundingBox();
    if (!box)
        throw new Error("target element has no bounding box");
    return pointInBox(box, options);
}
async function resolveTargetPoint(page, target, options) {
    if (typeof target === "string") {
        const element = options?.waitForSelector === undefined
            ? await page.$(target)
            : await page.waitForSelector(target, {
                timeout: options.waitForSelector,
            });
        if (!element)
            throw new Error(`could not find element matching selector "${target}"`);
        try {
            return await resolveElementPoint(element, options);
        }
        finally {
            await element.dispose().catch(() => undefined);
        }
    }
    if (isCursorBox(target))
        return pointInBox(target, options);
    if (isCursorPoint(target))
        return target;
    if (isLocator(target)) {
        await target
            .scrollIntoViewIfNeeded({ timeout: options?.waitForSelector })
            .catch(() => undefined);
        const box = await target
            .boundingBox({ timeout: options?.waitForSelector })
            .catch(() => null);
        if (!box)
            throw new Error("target locator has no bounding box");
        return pointInBox(box, options);
    }
    return resolveElementPoint(target, options);
}
export function createCursor(page, start = {
    x: Math.round(100 + Math.random() * 400),
    y: Math.round(80 + Math.random() * 300),
}) {
    let location = { ...start };
    let cdpSessionPromise = null;
    const getCdp = async () => {
        if (!cdpSessionPromise) {
            cdpSessionPromise = page.context().newCDPSession(page);
        }
        return cdpSessionPromise;
    };
    const dispatchMovePath = async (timedPath) => {
        if (timedPath.length === 0)
            return;
        const cdp = await getCdp();
        const dispatchStart = Date.now();
        const baseTs = timedPath[0].timestamp;
        for (const point of timedPath) {
            if (page.isClosed())
                return;
            const scheduled = point.timestamp - baseTs;
            const elapsed = Date.now() - dispatchStart;
            const delay = scheduled - elapsed;
            if (delay > 0)
                await wait(page, delay);
            try {
                const tsJitter = gaussianRandom(0, 0.002);
                await cdp.send("Input.dispatchMouseEvent", {
                    type: "mouseMoved",
                    x: point.x,
                    y: point.y,
                    timestamp: point.timestamp / 1000 + tsJitter,
                });
            }
            catch (err) {
                if (!page.isClosed())
                    throw err;
                return;
            }
        }
    };
    const moveDirect = async (destination, options) => {
        const len = dist(location, destination);
        if (len < 0.5) {
            location = { ...destination };
            return;
        }
        const speed = options?.moveSpeed && options.moveSpeed > 0 ? options.moveSpeed : 1.0;
        const totalMs = fittsTime(len, 80, speed);
        const spatialPath = generateSpatialPath(location, destination, options);
        const timedPath = stampPath(spatialPath, totalMs);
        const useMicro = options?.microCorrections !== false;
        if (useMicro && len > 5) {
            const lastPt = timedPath[timedPath.length - 1];
            const { points: corrPts, durationMs: corrMs } = microCorrectionPath(lastPt, destination);
            const corrBase = lastPt.timestamp;
            const corrTimed = corrPts.map((p, i) => ({
                ...p,
                timestamp: corrBase + Math.round(((i + 1) / corrPts.length) * corrMs),
            }));
            await dispatchMovePath([...timedPath.slice(0, -1), ...corrTimed]);
        }
        else {
            await dispatchMovePath(timedPath);
        }
        location = { ...destination };
    };
    const moveTo = async (destination, options) => {
        const threshold = options?.overshootThreshold ?? DEFAULT_OVERSHOOT_THRESHOLD;
        if (dist(location, destination) > threshold) {
            const overshoot = overshootPoint(location, destination);
            await moveDirect(overshoot, {
                ...options,
                microCorrections: false,
                moveSpeed: (options?.moveSpeed ?? 1) * 1.3,
            });
        }
        await moveDirect(destination, options);
        const moveDelay = options?.moveDelay ?? 0;
        const delay = options?.randomizeMoveDelay === false
            ? moveDelay
            : moveDelay * Math.random();
        await wait(page, delay);
    };
    const hesitateWithJitter = async (ms, amplitude = 0.9) => {
        if (ms <= 0)
            return;
        const jitterPath = idleJitterPath(location, ms, amplitude);
        await dispatchMovePath(jitterPath);
    };
    const mouseButtonAction = async (action, options) => {
        const cdp = await getCdp();
        // sub-pixel offset so click coords aren't snapped to integer grid
        const subX = location.x + gaussianRandom(0, 0.3);
        const subY = location.y + gaussianRandom(0, 0.3);
        try {
            const tsJitter = gaussianRandom(0, 0.0015);
            await cdp.send("Input.dispatchMouseEvent", {
                type: action,
                x: subX,
                y: subY,
                button: options?.button ?? "left",
                clickCount: options?.clickCount ?? 1,
                timestamp: Date.now() / 1000 + tsJitter,
            });
        }
        catch (err) {
            if (!page.isClosed())
                throw err;
        }
    };
    const cursor = {
        click: async (targetOrOptions, clickOptions) => {
            const target = isClickOptions(targetOrOptions)
                ? undefined
                : targetOrOptions;
            const options = isClickOptions(targetOrOptions)
                ? targetOrOptions
                : clickOptions;
            if (target !== undefined) {
                const point = await resolveTargetPoint(page, target, options);
                await moveTo(point, options);
            }
            if (options?.hesitate && options.hesitate > 0) {
                await hesitateWithJitter(options.hesitate);
            }
            const clickCount = Math.max(1, options?.clickCount ?? 1);
            for (let index = 1; index <= clickCount; index++) {
                await cursor.mouseDown({ button: options?.button, clickCount: index });
                const holdMs = options?.waitForClick ??
                    options?.delay ??
                    Math.round(gaussianClamp(85, 20, 45, 140));
                await wait(page, holdMs);
                await cursor.mouseUp({ button: options?.button, clickCount: index });
                if (index < clickCount) {
                    const interMs = options?.waitForClick ??
                        options?.delay ??
                        Math.round(gaussianClamp(70, 15, 35, 110));
                    await wait(page, interMs);
                }
            }
        },
        doubleClick: async (target, options) => {
            if (target !== undefined) {
                const point = await resolveTargetPoint(page, target, options);
                await moveTo(point, options);
            }
            if (options?.hesitate && options.hesitate > 0) {
                await hesitateWithJitter(options.hesitate);
            }
            await cursor.mouseDown({ button: options?.button, clickCount: 1 });
            await wait(page, Math.round(randBetween(55, 90)));
            await cursor.mouseUp({ button: options?.button, clickCount: 1 });
            await wait(page, Math.round(randBetween(90, 200)));
            const driftDst = {
                x: location.x + gaussianRandom(0, 1.2),
                y: location.y + gaussianRandom(0, 1.2),
            };
            await moveDirect(driftDst, {
                moveSpeed: 4,
                microCorrections: false,
                jitter: 0,
                windStrength: 0,
            });
            await cursor.mouseDown({ button: options?.button, clickCount: 2 });
            await wait(page, Math.round(randBetween(55, 90)));
            await cursor.mouseUp({ button: options?.button, clickCount: 2 });
        },
        getLocation: () => ({ ...location }),
        move: async (target, options) => {
            const point = await resolveTargetPoint(page, target, options);
            await moveTo(point, options);
        },
        moveBy: async (delta, options) => {
            await moveTo({
                x: location.x + (delta.x ?? 0),
                y: location.y + (delta.y ?? 0),
            }, options);
        },
        moveTo,
        mouseDown: async (options = {}) => {
            await mouseButtonAction("mousePressed", options);
        },
        mouseUp: async (options = {}) => {
            await mouseButtonAction("mouseReleased", options);
        },
        scroll: async (target, options) => {
            const point = await resolveTargetPoint(page, target);
            await moveTo(point);
            const deltaX = options?.deltaX ?? 0;
            const deltaY = options?.deltaY ?? 300;
            const steps = clamp(options?.steps ?? 6, 1, 50);
            const baseDelay = options?.stepDelay ?? 60;
            const easing = options?.easing ?? "ease-in-out";
            const stepJitter = options?.stepJitter ?? 8;
            const stepsX = buildScrollSteps(deltaX, steps, easing, 0);
            const stepsY = buildScrollSteps(deltaY, steps, easing, stepJitter);
            const cdp = await getCdp();
            for (let i = 0; i < steps; i++) {
                if (page.isClosed())
                    return;
                const delay = baseDelay + gaussianRandom(0, baseDelay * 0.2);
                await wait(page, delay);
                try {
                    await cdp.send("Input.dispatchMouseEvent", {
                        type: "mouseWheel",
                        x: location.x,
                        y: location.y,
                        deltaX: stepsX[i],
                        deltaY: stepsY[i],
                        timestamp: Date.now() / 1000,
                    });
                }
                catch (err) {
                    if (!page.isClosed())
                        throw err;
                    return;
                }
            }
        },
        drag: async (from, to, options) => {
            const fromPoint = await resolveTargetPoint(page, from, options);
            const toPoint = await resolveTargetPoint(page, to, options);
            await moveTo(fromPoint, options);
            await wait(page, options?.dragDelay ?? Math.round(randBetween(80, 160)));
            await cursor.mouseDown({ button: "left" });
            const falseStart = {
                x: fromPoint.x + gaussianRandom(0, 1.8),
                y: fromPoint.y + gaussianRandom(0, 1.8),
            };
            await moveDirect(falseStart, {
                moveSpeed: 0.4,
                microCorrections: false,
                jitter: 0.5,
                windStrength: 0,
            });
            await wait(page, Math.round(randBetween(30, 70)));
            await moveDirect(toPoint, {
                ...options,
                moveSpeed: (options?.moveSpeed ?? 1) * 0.65,
                jitter: (options?.jitter ?? DEFAULT_JITTER) * 1.6,
                windStrength: (options?.windStrength ?? DEFAULT_WIND_STRENGTH) * 0.5,
            });
            await wait(page, options?.releaseDelay ?? Math.round(randBetween(40, 110)));
            await cursor.mouseUp({ button: "left" });
        },
        hover: async (target, options) => {
            const point = await resolveTargetPoint(page, target, options);
            await moveTo(point, options);
            const duration = options?.duration ?? 500;
            const amplitude = options?.jitter ?? DEFAULT_JITTER;
            const jitterPath = idleJitterPath(point, duration, amplitude);
            await dispatchMovePath(jitterPath);
        },
    };
    return cursor;
}
export async function installMouseHelper(page) {
    const attachListener = () => {
        if (document.getElementById("p-mouse-pointer"))
            return;
        const dot = document.createElement("p-mouse-pointer");
        dot.id = "p-mouse-pointer";
        const style = document.createElement("style");
        style.textContent = `
      p-mouse-pointer {
        pointer-events: none;
        position: fixed;
        top: 0; left: 0;
        z-index: 2147483647;
        width: 20px; height: 20px;
        background: rgba(0, 0, 0, 0.45);
        border: 1.5px solid rgba(255, 255, 255, 0.9);
        border-radius: 50%;
        box-sizing: border-box;
        transform: translate(-50%, -50%);
        transition: background 0.1s, border-color 0.1s;
        will-change: left, top;
      }
      p-mouse-pointer.btn-left   { background: rgba(30, 120, 255, 0.8); border-color: #4af; }
      p-mouse-pointer.btn-right  { border-color: rgba(255, 80, 80, 0.9); }
      p-mouse-pointer.btn-middle { border-radius: 4px; border-color: rgba(255, 200, 0, 0.9); }
    `;
        document.head.appendChild(style);
        document.body.appendChild(dot);
        document.addEventListener("mousemove", (e) => {
            dot.style.left = `${e.clientX}px`;
            dot.style.top = `${e.clientY}px`;
        }, true);
        document.addEventListener("mousedown", (e) => {
            if (e.button === 0)
                dot.classList.add("btn-left");
            if (e.button === 1)
                dot.classList.add("btn-middle");
            if (e.button === 2)
                dot.classList.add("btn-right");
        }, true);
        document.addEventListener("mouseup", (e) => {
            if (e.button === 0)
                dot.classList.remove("btn-left");
            if (e.button === 1)
                dot.classList.remove("btn-middle");
            if (e.button === 2)
                dot.classList.remove("btn-right");
        }, true);
    };
    await page.addInitScript(`(${attachListener.toString()})();`);
    await page.evaluate(attachListener).catch(() => undefined);
}
export function installRealCursor(page) {
    if (page.realCursor)
        return page.realCursor;
    const cursor = createCursor(page);
    const realClick = cursor.click.bind(cursor);
    Object.defineProperties(page, {
        realCursor: {
            configurable: true,
            enumerable: false,
            value: cursor,
            writable: false,
        },
        realClick: {
            configurable: true,
            enumerable: false,
            value: realClick,
            writable: false,
        },
    });
    return cursor;
}
export function installRealCursorContext(context) {
    if (cursorContexts.has(context))
        return;
    cursorContexts.add(context);
    context.pages().forEach(installRealCursor);
    context.on("page", installRealCursor);
}
//# sourceMappingURL=cursor.js.map