type HeadlessSource = {
    channel?: unknown;
    executablePath?: unknown;
    headless?: unknown;
};
export declare function getHeadlessUserAgent(options?: HeadlessSource): string | undefined;
export declare function withHeadlessUserAgent<T extends object | undefined>(options: T): T;
export declare function withDefaultUserAgent<T extends object | undefined>(options: T, userAgent: string | undefined): T;
export {};
