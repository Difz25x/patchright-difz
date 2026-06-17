/**
 * test.js — Turnstile solver test for patchright-difz
 *
 * Usage:
 *   npx tsx test.js                          # headed mode
 *   npx tsx test.js --headless               # headless mode
 *   npx tsx test.js --url <url>              # custom URL
 *   npx tsx test.js --verbose                # show all Cloudflare data
 *   npx tsx test.js --no-solve               # don't auto-solve, just observe
 *   npx tsx test.js --timeout <ms>           # custom timeout (default: 120s)
 */

import { chromium } from "./src/index.js";

const args = process.argv.slice(2);
const flags = {
  headless: args.includes("--headless"),
  verbose: args.includes("--verbose"),
  noSolve: args.includes("--no-solve"),
  url: (() => {
    const i = args.indexOf("--url");
    return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
  })(),
  timeout: (() => {
    const i = args.indexOf("--timeout");
    return i !== -1 && i + 1 < args.length ? parseInt(args[i + 1], 10) : 120000;
  })(),
};

const TARGET_URL = flags.url || "https://turnstile.zeroclover.io/token";
const VERBOSE = flags.verbose;
const NO_SOLVE = flags.noSolve;
const HEADLESS = flags.headless;

function log(msg, data) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
  if (data !== undefined && VERBOSE) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function divider(title) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

function truncate(str, max = 80) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "..." : str;
}

async function main() {
  divider(`Launching browser (${HEADLESS ? "headless" : "headed"})`);

  const browser = await chromium.launch({
    headless: HEADLESS,
    turnstile: true, // auto-solver installed on all pages
    args: HEADLESS ? [] : ["--start-maximized"],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
    timezoneId: "America/New_York",
  });

  const page = await context.newPage();

  // ── Fingerprint snapshot (pre-nav) ─────────────────────────────────
  divider("Fingerprint Check (pre-nav)");
  const fpBefore = await page.evaluate(() => ({
    webdriver: navigator.webdriver,
    webdriverIn: "webdriver" in navigator,
    languages: navigator.languages,
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    pluginsLength: navigator.plugins?.length,
    mimeTypesLength: navigator.mimeTypes?.length,
    chromeKeys: typeof chrome !== "undefined" ? Object.keys(chrome) : "undefined",
  }));
  log("Pre-navigation fingerprint:", fpBefore);

  // ── Navigate ───────────────────────────────────────────────────────
  divider(`Navigating to ${TARGET_URL}`);
  const navStart = Date.now();

  try {
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    log(`Page loaded in ${Date.now() - navStart}ms`);
    log(`Title: ${await page.title().catch(() => "(no title)")}`);
  } catch (err) {
    log(`Navigation warning: ${err.message}`);
  }

  // ── Detect page state ─────────────────────────────────────────────
  divider("Page State");
  const isChallenge = /__cf_chl_rt_tk|challenge-platform/i.test(page.url());
  const pageHtml = await page.evaluate(() => document.documentElement?.outerHTML?.slice(0, 1000) || "").catch(() => "");
  const hasTurnstileIframe = /challenges\.cloudflare\.com/i.test(pageHtml);
  log(`URL has challenge param: ${isChallenge}`);
  log(`Has Turnstile iframe in HTML: ${hasTurnstileIframe}`);
  log(`Page title: ${await page.title().catch(() => "?")}`);

  // ── Auto-solver is watching (turnstile:true) ──────────────────────
  let solved = false;
  if (!NO_SOLVE) {
    divider("Auto-Solver");
    log("turnstile:true enabled — solver auto-installed on all pages.");
    log(`Waiting up to ${flags.timeout / 1000}s for Turnstile resolution...`);

    const { isTurnstileSolved } = await import("./src/turnstile.js");
    const deadline = Date.now() + flags.timeout;
    let lastLog = 0;

    while (Date.now() < deadline) {
      const solvedNow = await isTurnstileSolved({ page }).catch(() => false);
      if (solvedNow) {
        log("Turnstile solved by auto-solver!");
        solved = true;
        break;
      }
      // Log progress every 5s
      if (Date.now() - lastLog > 5000) {
        lastLog = Date.now();
        const elapsed = Math.round((Date.now() - deadline + flags.timeout) / 1000);
        log(`Waiting... (${elapsed}s elapsed)`);
      }
      await page.waitForTimeout(500).catch(() => {});
    }

    if (!solved) log("Auto-solver timed out");
  } else {
    log("Skipping solve (--no-solve)");
    log("Waiting 10s so you can inspect the page...");
    await page.waitForTimeout(10000);
  }

  // ── Post-solve results ────────────────────────────────────────────
  await new Promise((r) => setTimeout(r, 1500));

  divider("Results");
  const cookies = await context.cookies().catch(() => []);
  const cfClearance = cookies.find((c) => c.name === "cf_clearance");
  log(`cf_clearance: ${cfClearance ? "PRESENT" : "ABSENT"}`);
  if (cfClearance) {
    log(`  value: ${truncate(cfClearance.value, 60)}`);
    log(`  domain: ${cfClearance.domain}`);
    log(`  expires: ${cfClearance.expires ? new Date(cfClearance.expires * 1000).toISOString() : "session"}`);
  }

  if (VERBOSE && solved) {
    const { getCloudflareData } = await import("./src/turnstile.js");
    const data = await getCloudflareData({ page, context, collectSensitiveData: true, timeoutMs: 5000 })
      .catch(() => null);
    if (data) {
      log("Turnstile tokens:", data.turnstile.tokens);
    }
  }

  // ── Wait before close ─────────────────────────────────────────────
  if (!HEADLESS) {
    console.log("\n  Browser will close in 3s...");
    await page.waitForTimeout(3000);
  }

  await browser.close();
  log("\nTest complete." + (solved ? " Turnstile solved successfully." : ""));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
