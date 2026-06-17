/**
 * test.js — Turnstile solver test for patchright-difz
 *
 * Usage:
 *   npx tsx test.js                          # headed mode
 *   npx tsx test.js --headless               # headless mode
 *   npx tsx test.js --url <url>              # custom URL
 *   npx tsx test.js --verbose                # show all Cloudflare data
 *   npx tsx test.js --no-solve               # don't auto-solve, just observe
 *   npx tsx test.js --timeout <ms>           # custom timeout per attempt
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
    return i !== -1 && i + 1 < args.length ? parseInt(args[i + 1], 10) : 30000;
  })(),
};

const TARGET_URL = flags.url || "https://turnstile.zeroclover.io/token";
const VERBOSE = flags.verbose;
const NO_SOLVE = flags.noSolve;
const HEADLESS = flags.headless;

// ── Helpers ──────────────────────────────────────────────────────────

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

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  divider(`Launching browser (${HEADLESS ? "headless" : "headed"})`);

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: HEADLESS ? [] : ["--start-maximized"],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
    timezoneId: "America/New_York",
  });

  const page = await context.newPage();

  // ── Fingerprint snapshot (before navigation) ─────────────────────
  divider("Fingerprint Check (pre-nav)");

  const fpBefore = await page.evaluate(() => {
    const d = {};
    d.webdriver = navigator.webdriver;
    d.webdriverIn = "webdriver" in navigator;
    d.languages = navigator.languages;
    d.platform = navigator.platform;
    d.userAgent = navigator.userAgent;
    d.hardwareConcurrency = navigator.hardwareConcurrency;
    d.deviceMemory = navigator.deviceMemory;
    d.pluginsLength = navigator.plugins?.length;
    d.mimeTypesLength = navigator.mimeTypes?.length;
    d.chrome = typeof chrome !== "undefined" ? Object.keys(chrome) : "undefined";
    d.chromeRuntimeKeys = typeof chrome !== "undefined" && chrome.runtime
      ? Object.keys(chrome.runtime)
      : "N/A";
    // Debug chrome descriptors
    d.chromeDescriptor = JSON.stringify(Object.getOwnPropertyDescriptor(window, 'chrome'));
    d.chromeRuntimeDescriptor = typeof chrome !== "undefined"
      ? JSON.stringify(Object.getOwnPropertyDescriptor(chrome, 'runtime'))
      : "N/A";
    return d;
  });

  log("Pre-navigation fingerprint:", fpBefore);

  // ── Navigate ──────────────────────────────────────────────────────
  divider(`Navigating to ${TARGET_URL}`);

  const navStart = Date.now();
  let navResolved = false;

  try {
    await page.goto(TARGET_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    navResolved = true;
    log(`Page loaded in ${Date.now() - navStart}ms`);
    log(`Title: ${await page.title().catch(() => "(no title)")}`);
  } catch (err) {
    log(`Navigation warning: ${err.message}`);
  }

  // ── Check: is it a managed challenge? ─────────────────────────────
  divider("Challenge Detection");

  const isManaged = await page.evaluate(() => {
    const title = document.title || "";
    const body = document.body?.innerText?.slice(0, 5000) || "";
    const text = `${title}\n${body}`;
    const managed =
      /just a moment|security verification|checking your browser/i.test(text) &&
      /cloudflare|verify you are not a bot|malicious bots|ray id/i.test(text);
    return { managed, title: title.slice(0, 100), bodyPreview: body.slice(0, 200) };
  });

  const hasChallengeUrl = page.url().includes("__cf_chl_rt_tk") || page.url().includes("challenge-platform");

  log(`Managed challenge detected: ${isManaged.managed} (URL param: ${hasChallengeUrl})`);
  log(`Page title: ${isManaged.title}`);
  if (isManaged.managed || hasChallengeUrl) {
    const htmlSnippet = await page.evaluate(() => {
      return document.documentElement?.outerHTML?.slice(0, 2000) || "";
    }).catch(() => "?");
    log(`Page HTML (first 2000 chars): ${htmlSnippet.substring(0, 300)}...`);
  }

  // ── Wait for managed challenge to resolve ──────────────────────────
  if (isManaged.managed || hasChallengeUrl) {
    divider("Waiting for Managed Challenge Resolution");

    log("Challenge page detected. Waiting for cf_clearance cookie...");
    const challengeDeadline = Date.now() + 60000; // 60s max wait
    var lastTitle = "";

    while (Date.now() < challengeDeadline) {
      const cookies = await context.cookies().catch(() => []);
      const hasClearance = cookies.some((c) => c.name === "cf_clearance");
      const currentTitle = await page.title().catch(() => "");
      const currentUrl = page.url();

      if (hasClearance) {
        log(`✅ cf_clearance cookie found! Challenge resolved.`);
        break;
      }

      // Title changed from "Just a moment..." = page loaded real content
      if (!/just a moment|performing security/i.test(currentTitle) && currentTitle !== lastTitle && currentTitle) {
        log(`✅ Title changed to "${currentTitle}" — challenge resolved.`);
        break;
      }

      if (currentTitle !== lastTitle) {
        log(`Title: "${currentTitle}" | URL: ${currentUrl}`);
        lastTitle = currentTitle;
      }

      await page.waitForTimeout(1000);
    }

    const finalCookies = await context.cookies().catch(() => []);
    const finalClearance = finalCookies.find((c) => c.name === "cf_clearance");
    log(`After wait — cf_clearance: ${finalClearance ? "✅ PRESENT" : "❌ ABSENT"}`);
    log(`Current URL: ${page.url()}`);
    log(`Current title: ${await page.title().catch(() => "?")}`);
  }

  // ── Check: Turnstile elements present? ────────────────────────────
  const turnstileElements = await page.evaluate(() => {
    const iframes = document.querySelectorAll('iframe[src*="challenges.cloudflare.com"]');
    const turnstileDivs = document.querySelectorAll(".cf-turnstile");
    const sitekeys = document.querySelectorAll("[data-sitekey]");
    const responseInputs = document.querySelectorAll('[name="cf-turnstile-response"]');
    const emptyDivs = [];
    document.querySelectorAll("div").forEach((el) => {
      try {
        const r = el.getBoundingClientRect();
        if (r.width > 290 && r.width <= 310 && !el.querySelector("*")) {
          emptyDivs.push({ x: r.x, y: r.y, w: r.width, h: r.height });
        }
      } catch (_) {}
    });

    return {
      cfIframes: iframes.length,
      turnstileDivs: turnstileDivs.length,
      dataSitekeys: sitekeys.length,
      responseInputs: responseInputs.length,
      empty300pxDivs: emptyDivs.length,
      empty300pxSample: emptyDivs.slice(0, 3),
    };
  });

  log("Turnstile elements:", turnstileElements);

  // ── Show current URL ──────────────────────────────────────────────
  log(`Current URL: ${page.url()}`);

  // ── Attempt solve ─────────────────────────────────────────────────
  if (!NO_SOLVE && turnstileElements.responseInputs > 0) {
    // Strategy 1: Click parent of cf-turnstile-response (fast path)
    divider("Strategy 1: Click cf-turnstile-response parent");

    let solved = false;
    const responseInputHandles = await page.$$('[name="cf-turnstile-response"]');

    for (const el of responseInputHandles) {
      if (solved) break;
      try {
        const parentHandle = await el.evaluateHandle((el) => el.parentElement);
        const box = await parentHandle.asElement().boundingBox();
        if (box) {
          const x = box.x + 30;
          const y = box.y + box.height / 2;
          log(`Clicking at (${x.toFixed(0)}, ${y.toFixed(0)}) [response-input parent]`);

          if (page.realCursor) {
            await page.realCursor.click({ x, y }, {
              hesitate: 20 + Math.round(Math.random() * 60),
              waitForClick: 30 + Math.round(Math.random() * 30),
            });
          } else {
            await page.mouse.click(x, y);
          }

          await page.waitForTimeout(1000);

          const check = await page.evaluate(() => {
            const inputs = document.querySelectorAll('[name="cf-turnstile-response"]');
            for (const inp of inputs) {
              const val = inp.value || inp.getAttribute("data-cf-turnstile-response") || "";
              if (val.trim().length >= 20) return { solved: true, token: val.trim().slice(0, 60) };
            }
            return { solved: false, token: "" };
          });

          if (check.solved) {
            log(`✅ Solved! Token: ${truncate(check.token)}`);
            solved = true;
          } else {
            log("Click did not solve, trying next...");
          }
        }
        parentHandle.dispose().catch(() => {});
      } catch (err) {
        log(`Error: ${err.message}`);
      }
      el.dispose().catch(() => {});
    }

    if (!solved) {
      // Strategy 2: Empty 300px divs
      divider("Strategy 2: Empty 300px div click");

      for (const div of turnstileElements.empty300pxSample) {
        if (solved) break;
        const x = div.x + 30;
        const y = div.y + div.h / 2;
        log(`Clicking empty div at (${x.toFixed(0)}, ${y.toFixed(0)})`);

        try {
          if (page.realCursor) {
            await page.realCursor.click({ x, y }, {
              hesitate: 20 + Math.round(Math.random() * 60),
              waitForClick: 40 + Math.round(Math.random() * 30),
            });
          } else {
            await page.mouse.click(x, y);
          }
          await page.waitForTimeout(1000);

          const check = await page.evaluate(() => {
            const inputs = document.querySelectorAll('[name="cf-turnstile-response"]');
            for (const inp of inputs) {
              const val = inp.value || inp.getAttribute("data-cf-turnstile-response") || "";
              if (val.trim().length >= 20) return { solved: true, token: val.trim().slice(0, 60) };
            }
            return { solved: false, token: "" };
          });

          if (check.solved) {
            log(`✅ Solved! Token: ${truncate(check.token)}`);
            solved = true;
          }
        } catch (err) {
          log(`Error: ${err.message}`);
        }
      }
    }

    if (!solved) {
      // Strategy 3: Auto-solver
      divider("Strategy 3: checkTurnstile auto-solver");
      const { checkTurnstile, isTurnstileSolved } = await import("./src/turnstile.js");

      const stop = checkTurnstile({
        page,
        timeoutMs: flags.timeout,
        foreground: !HEADLESS,
        logger: (msg) => log(`[solver] ${msg}`),
      });

      const deadline = Date.now() + flags.timeout;
      while (Date.now() < deadline) {
        const solvedNow = await isTurnstileSolved({ page }).catch(() => false);
        if (solvedNow) {
          log("✅ Turnstile solved by auto-solver!");
          solved = true;
          break;
        }
        await page.waitForTimeout(500).catch(() => {});
      }

      stop();
      if (!solved) log("⏰ Auto-solver timed out");
    }

    // ── Wait for cookies ───────────────────────────────────────────
    if (solved) {
      log("Waiting for cf_clearance cookie to propagate...");
      await page.waitForTimeout(2000);
    }
  } else if (turnstileElements.empty300pxDivs > 0 && !NO_SOLVE) {
    // Only empty divs found — try them directly
    divider("Clicking empty 300px divs (no response-input found)");

    for (const div of turnstileElements.empty300pxSample) {
      const x = div.x + 30;
      const y = div.y + div.h / 2;
      log(`Clicking empty div at (${x.toFixed(0)}, ${y.toFixed(0)})`);

      try {
        if (page.realCursor) {
          await page.realCursor.click({ x, y }, {
            hesitate: 30 + Math.round(Math.random() * 60),
            waitForClick: 40 + Math.round(Math.random() * 30),
          });
        } else {
          await page.mouse.click(x, y);
        }
        await page.waitForTimeout(1000);

        const check = await page.evaluate(() => {
          const inputs = document.querySelectorAll('[name="cf-turnstile-response"]');
          for (const inp of inputs) {
            const val = inp.value || inp.getAttribute("data-cf-turnstile-response") || "";
            if (val.trim().length >= 20) return { solved: true, token: val.trim().slice(0, 60) };
          }
          return { solved: false, token: "" };
        });

        if (check.solved) {
          log(`✅ Solved! Token: ${truncate(check.token)}`);
          await page.waitForTimeout(2000);
          break;
        }
      } catch (err) {
        log(`Error: ${err.message}`);
      }
    }
  } else if (NO_SOLVE) {
    log("Skipping solve (--no-solve)");
    log("Waiting 10s so you can inspect the page...");
    await page.waitForTimeout(10000);
  } else {
    log("No turnstile elements detected");
    log("Waiting 5s to observe page...");
    await page.waitForTimeout(5000);
  }

  // ── Post-solve data ───────────────────────────────────────────────
  divider("Results");

  const cookies = await context.cookies().catch(() => []);
  const cfClearance = cookies.find((c) => c.name === "cf_clearance");

  log(`cf_clearance: ${cfClearance ? "✅ PRESENT" : "❌ ABSENT"}`);
  if (cfClearance) {
    log(`  value: ${truncate(cfClearance.value, 60)}`);
    log(`  domain: ${cfClearance.domain}`);
    log(`  expires: ${cfClearance.expires ? new Date(cfClearance.expires * 1000).toISOString() : "session"}`);
  }

  if (VERBOSE) {
    const { getCloudflareData } = await import("./src/turnstile.js");
    const data = await getCloudflareData({
      page,
      context,
      collectSensitiveData: true,
      timeoutMs: 5000,
    }).catch(() => null);
    log("Full Cloudflare data:", data);
  }

  // ── Wait before close ─────────────────────────────────────────────
  if (!HEADLESS) {
    console.log("\n🧪 Browser will close in 3s...");
    await page.waitForTimeout(3000);
  }

  await browser.close();
  log("\n✅ Test complete.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
