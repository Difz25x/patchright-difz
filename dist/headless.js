import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
export function getHeadlessUserAgent(options) {
    const env = process.env.PATCHRIGHT_DIFZ_HEADLESS_USER_AGENT;
    if (env === "0")
        return undefined;
    if (env)
        return env;
    const version = readChromeVersion(options) ?? readBundledChromiumVersion() ?? "148.0.0.0";
    const major = version.match(/\d+/)?.[0] ?? "148";
    return [
        "Mozilla/5.0",
        `(${platformToken()})`,
        "AppleWebKit/537.36",
        "(KHTML, like Gecko)",
        `Chrome/${major}.0.0.0`,
        "Safari/537.36",
    ].join(" ");
}
export function withHeadlessUserAgent(options) {
    const source = (options ?? {});
    if (source.headless === false || source.userAgent)
        return options;
    const userAgent = getHeadlessUserAgent(source);
    if (!userAgent)
        return options;
    return {
        ...source,
        userAgent,
    };
}
export function withDefaultUserAgent(options, userAgent) {
    if (!userAgent)
        return options;
    const source = (options ?? {});
    if (source.userAgent)
        return options;
    return {
        ...source,
        userAgent,
    };
}
function readChromeVersion(options) {
    if (typeof options?.executablePath === "string") {
        return readExecutableVersion(options.executablePath);
    }
    const channel = typeof options?.channel === "string" ? options.channel : "";
    for (const path of chromePaths(channel)) {
        const version = existsSync(path) ? readExecutableVersion(path) : undefined;
        if (version)
            return version;
    }
    return undefined;
}
function readExecutableVersion(path) {
    if (process.platform === "win32") {
        return readWindowsFileVersion(path);
    }
    const result = spawnSync(path, ["--version"], {
        encoding: "utf8",
    });
    return parseVersion(`${result.stdout ?? ""} ${result.stderr ?? ""}`);
}
function readWindowsFileVersion(path) {
    try {
        const script = `(Get-Item -LiteralPath ${JSON.stringify(path)}).VersionInfo.ProductVersion`;
        const output = execFileSync("powershell.exe", ["-NoProfile", "-Command", script], {
            encoding: "utf8",
            windowsHide: true,
        });
        return parseVersion(output);
    }
    catch (_error) {
        return undefined;
    }
}
function chromePaths(channel) {
    if (process.platform !== "win32") {
        if (channel.includes("edge"))
            return ["microsoft-edge", "microsoft-edge-stable"];
        return ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
    }
    const dirs = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LocalAppData]
        .filter(Boolean);
    const subPaths = {
        edge: join("Microsoft", "Edge", "Application", "msedge.exe"),
        canary: join("Google", "Chrome SxS", "Application", "chrome.exe"),
        beta: join("Google", "Chrome Beta", "Application", "chrome.exe"),
        dev: join("Google", "Chrome Dev", "Application", "chrome.exe"),
    };
    const variant = Object.keys(subPaths).find((k) => channel.includes(k));
    const sub = variant ? subPaths[variant] : join("Google", "Chrome", "Application", "chrome.exe");
    if (variant === "canary") {
        return [join(process.env.LocalAppData ?? "", sub)];
    }
    return dirs.map((base) => join(base, sub));
}
function readBundledChromiumVersion() {
    try {
        const packagePath = require.resolve("patchright-core/package.json");
        const browsersPath = join(dirname(packagePath), "browsers.json");
        const data = JSON.parse(readFileSync(browsersPath, "utf8"));
        return data.browsers?.find((browser) => browser.name === "chromium")
            ?.browserVersion;
    }
    catch (_error) {
        return undefined;
    }
}
function parseVersion(value) {
    return value.match(/\d+(?:\.\d+){1,3}/)?.[0];
}
function platformToken() {
    if (process.platform === "darwin")
        return "Macintosh; Intel Mac OS X 10_15_7";
    if (process.platform === "linux")
        return "X11; Linux x86_64";
    return "Windows NT 10.0; Win64; x64";
}
//# sourceMappingURL=headless.js.map