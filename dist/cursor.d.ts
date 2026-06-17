import type { BrowserContext, ElementHandle, Locator, Page } from "patchright";
export type CursorPoint = {
    x: number;
    y: number;
};
export type TimedVector = CursorPoint & {
    timestamp: number;
};
export type CursorBox = CursorPoint & {
    width: number;
    height: number;
};
export type CursorTarget = string | CursorPoint | CursorBox | ElementHandle<Element> | Locator;
export type CursorScrollOptions = {
    deltaX?: number;
    deltaY?: number;
    steps?: number;
    stepDelay?: number;
    stepJitter?: number;
    easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
};
export type CursorDragOptions = CursorMoveOptions & {
    dragDelay?: number;
    releaseDelay?: number;
};
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
    jitter?: number;
    microCorrections?: boolean;
    windStrength?: number;
};
export type HoverOptions = CursorMoveOptions & {
    duration?: number;
};
export type RealClick = {
    (options?: CursorClickOptions): Promise<void>;
    (target: CursorTarget, options?: CursorClickOptions): Promise<void>;
};
export type RealCursor = {
    click: RealClick;
    doubleClick(target?: CursorTarget, options?: CursorClickOptions): Promise<void>;
    getLocation(): CursorPoint;
    move(target: CursorTarget, options?: CursorMoveOptions): Promise<void>;
    moveBy(delta: Partial<CursorPoint>, options?: CursorMoveOptions): Promise<void>;
    moveTo(destination: CursorPoint, options?: CursorMoveOptions): Promise<void>;
    mouseDown(options?: Pick<CursorClickOptions, "button" | "clickCount">): Promise<void>;
    mouseUp(options?: Pick<CursorClickOptions, "button" | "clickCount">): Promise<void>;
    scroll(target: CursorTarget, options?: CursorScrollOptions): Promise<void>;
    drag(from: CursorTarget, to: CursorTarget, options?: CursorDragOptions): Promise<void>;
    hover(target: CursorTarget, options?: HoverOptions): Promise<void>;
};
declare module "patchright" {
    interface Page {
        realCursor?: RealCursor;
        realClick?: RealClick;
    }
}
export declare function createCursor(page: Page, start?: CursorPoint): RealCursor;
export declare function installMouseHelper(page: Page): Promise<void>;
export declare function installRealCursor(page: Page): RealCursor;
export declare function installRealCursorContext(context: BrowserContext): void;
