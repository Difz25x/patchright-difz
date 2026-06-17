# Stealth & Turnstile Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `patchright-difz` undetected by Cloudflare managed challenges at `turnstile.zeroclover.io/token`, reliably click Turnstile checkbox, and obtain `cf_clearance` cookie.

**Architecture:** Two independent changes that converge: (1) rewrite `src/stealth.ts` to remove detectable launch flags and inject a modern stealth script with Proxy-based `navigator.webdriver` hiding, complete `chrome.runtime` emulation, and smarter WebGL spoofing; (2) reorder `src/turnstile.ts` click strategy to prioritize the proven `x+30` checkbox-click approach, remove heavy guards (`isTurnstileFrameReady`, `page.bringToFront`, CDP network monitor) that slow things down or look suspicious.

**Tech Stack:** TypeScript, patchright-core (Playwright fork), CDP (Chrome DevTools Protocol)

## Global Constraints

- No new npm dependencies.
- Public API unchanged — all existing exports remain.
- No changes to `cursor.ts`, `mainWorld.ts`, `headless.ts`, or `artifacts.ts`.
- Existing `RealCursor` implementation untouched.
- `STEALTH_LAUNCH_ARGS` still exported (with fewer flags).

---

### Task 1: Launch Args — Remove Red Flags

**Files:**
- Modify: `src/stealth.ts:4-9`

**Interfaces:**
- Consumes: nothing from other tasks
- Produces: clean `STEALTH_LAUNCH_ARGS` (only `--disable-blink-features=AutomationControlled`)

- [ ] **Step 1: Remove offending flags**

Change the `STEALTH_LAUNCH_ARGS` array from:

```ts
export const STEALTH_LAUNCH_ARGS: readonly string[] = [
  "--disable-blink-features=AutomationControlled",
  "--disable-web-security",
  "--no-sandbox",
  "--disable-gpu",
];
```

To:

```ts
// Launch args for stealth. Removed flags that are automation magnets:
//   --disable-web-security — no real browser has this enabled
//   --no-sandbox           — real browsers always sandbox
//   --disable-gpu          — real browsers use GPU
// Users who need these (Docker, CI) can pass them manually in launch options.
export const STEALTH_LAUNCH_ARGS: readonly string[] = [
  "--disable-blink-features=AutomationControlled",
];
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit 2>&1
```

Expected: clean exit, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/stealth.ts
git commit -m "fix: remove automation-indicating launch args

Remove --disable-web-security, --no-sandbox, --disable-gpu from
STEALTH_LAUNCH_ARGS. These flags are strong automation signals that
Cloudflare actively checks. Users who need them (Docker, CI) can
pass them explicitly.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Stealth Script — Proxy-Based webdriver + Complete chrome Runtime

**Files:**
- Modify: `src/stealth.ts:14-181`

**Interfaces:**
- Consumes: `STEALTH_LAUNCH_ARGS` from Task 1 (unchanged in shape)
- Produces: Rewritten `STEALTH_SCRIPT` string with improved anti-detection patches

- [ ] **Step 1: Rewrite the STEALTH_SCRIPT**

Replace the entire `STEALTH_SCRIPT` const (lines 14-181) with the new version below.

**Key changes:**
1. `navigator.webdriver` — Proxy-based hiding (not `delete` + `defineProperty`)
2. `window.chrome` — Full runtime: `connect`, `sendMessage`, `onMessage`, `onConnect`, `csi`, `loadTimes`
3. WebGL — Keep extension, spoof to Intel GPU, add subtle float noise
4. Canvas noise — Increase from ~1% to 2-3%

```ts
const STEALTH_SCRIPT = `
(function(){
  // ═══════════════════════════════════════════════════════════════
  // 1. navigator.webdriver — Proxy hiding (gold standard)
  //    Real browser: 'webdriver' property doesn't exist at all.
  //    Using Proxy on navigator.__proto__ so property descriptor
  //    is identical to a real browser (not a redefined property).
  // ═══════════════════════════════════════════════════════════════
  try {
    var navProto = navigator.__proto__;
    var proxyHandler = {
      get: function(target, key) {
        if (key === 'webdriver') return undefined;
        return target[key];
      },
      has: function(target, key) {
        if (key === 'webdriver') return false;
        return key in target;
      },
      getOwnPropertyDescriptor: function(target, key) {
        if (key === 'webdriver') return undefined;
        return Object.getOwnPropertyDescriptor(target, key);
      }
    };
    // Store original proto first, then proxy it
    var origProto = Object.create(navProto);
    Object.setPrototypeOf(navigator, new Proxy(origProto, proxyHandler));
  } catch(e) {}

  // ═══════════════════════════════════════════════════════════════
  // 2. Navigator language properties
  // ═══════════════════════════════════════════════════════════════
  try{Object.defineProperty(navigator,'languages',{get:function(){return['en-US','en']},configurable:true})}catch(e){}
  try{Object.defineProperty(navigator,'language',{get:function(){return'en-US'},configurable:true})}catch(e){}

  // ═══════════════════════════════════════════════════════════════
  // 3. User Agent — strip HeadlessChrome if present
  // ═══════════════════════════════════════════════════════════════
  try{
    var ua=navigator.userAgent;
    if(ua.includes('HeadlessChrome')){
      Object.defineProperty(navigator,'userAgent',{get:function(){return ua.replace('HeadlessChrome','Chrome')},configurable:true});
    }
  }catch(e){}

  // ═══════════════════════════════════════════════════════════════
  // 4. Plugins array — fully emulate PluginArray
  // ═══════════════════════════════════════════════════════════════
  try{
    var plugins=[
      {name:'Chrome PDF Plugin',filename:'internal-pdf-viewer',description:'Portable Document Format',length:0},
      {name:'Chrome PDF Viewer',filename:'mhjfbmdgcfjbbpaeojofohoefgiehjai',description:'',length:0},
      {name:'Native Client',filename:'internal-nacl-plugin',description:'',length:0}
    ];
    var pa=Object.create(PluginArray.prototype);
    Object.defineProperty(pa,'length',{value:plugins.length});
    for(var i=0;i<plugins.length;i++){
      Object.defineProperty(pa,i,{value:plugins[i]});
    }
    pa.item=function(i){return this[i]||null};
    pa.namedItem=function(n){for(var j=0;j<this.length;j++){if(this[j].name===n)return this[j]}return null};
    Object.defineProperty(navigator,'plugins',{get:function(){return pa},configurable:true});
  }catch(e){}

  // ═══════════════════════════════════════════════════════════════
  // 5. Mime types
  // ═══════════════════════════════════════════════════════════════
  try{
    var mt=Object.create(MimeTypeArray.prototype);
    Object.defineProperty(mt,'length',{value:1});
    Object.defineProperty(mt,0,{value:{type:'application/pdf',suffixes:'pdf',description:'Portable Document Format'}});
    mt.item=function(i){return this[i]||null};
    mt.namedItem=function(n){for(var j=0;j<this.length;j++){if(this[j].type===n)return this[j]}return null};
    Object.defineProperty(navigator,'mimeTypes',{get:function(){return mt},configurable:true});
  }catch(e){}

  // ═══════════════════════════════════════════════════════════════
  // 6. Hardware concurrency
  // ═══════════════════════════════════════════════════════════════
  try{Object.defineProperty(navigator,'hardwareConcurrency',{get:function(){return 4+Math.floor(Math.random()*5)},configurable:true})}catch(e){}

  // ═══════════════════════════════════════════════════════════════
  // 7. Device memory
  // ═══════════════════════════════════════════════════════════════
  try{Object.defineProperty(navigator,'deviceMemory',{get:function(){return 8},configurable:true})}catch(e){}

  // ═══════════════════════════════════════════════════════════════
  // 8. Platform normalization
  // ═══════════════════════════════════════════════════════════════
  try{
    Object.defineProperty(navigator,'platform',{get:function(){
      var p=navigator.platform;
      if(p==='Win32'||p==='Win64')return'Win32';
      if(p==='MacIntel'||p==='MacPPC')return'MacIntel';
      return'Linux x86_64';
    },configurable:true});
  }catch(e){}

  // ═══════════════════════════════════════════════════════════════
  // 9. Connection
  // ═══════════════════════════════════════════════════════════════
  try{
    if(!navigator.connection||!navigator.connection.effectiveType){
      Object.defineProperty(navigator,'connection',{value:{effectiveType:'4g',downlink:10,rtt:50,saveData:false},writable:false,configurable:true});
    }
  }catch(e){}

  // ═══════════════════════════════════════════════════════════════
  // 10. Screen properties
  // ═══════════════════════════════════════════════════════════════
  try{
    Object.defineProperty(screen,'colorDepth',{value:30,writable:false,configurable:true});
    Object.defineProperty(screen,'pixelDepth',{value:30,writable:false,configurable:true});
  }catch(e){}

  // ═══════════════════════════════════════════════════════════════
  // 11. Chrome runtime — complete emulation
  // ═══════════════════════════════════════════════════════════════
  try{
    if(!window.chrome) window.chrome = {};
    var c = window.chrome;

    // chrome.app
    c.app = { isInstalled: false };

    // Event helper — mimics Chrome's internal Event class
    function makeEvent() {
      var listeners = [];
      return {
        addListener: function(fn) { if(typeof fn==='function') listeners.push(fn); },
        removeListener: function(fn) { listeners=listeners.filter(function(l){return l!==fn}); },
        hasListeners: function() { return listeners.length>0; },
        _fire: function() { for(var i=0;i<listeners.length;i++) listeners[i].apply(null,arguments); }
      };
    }

    // chrome.runtime
    c.runtime = {
      connect: function() {
        var result = {
          onMessage: makeEvent(),
          postMessage: function(){},
          disconnect: function(){}
        };
        return result;
      },
      sendMessage: function() {
        var cb = arguments[arguments.length-1];
        if(typeof cb==='function') setTimeout(cb, 0);
      },
      onMessage: makeEvent(),
      onConnect: makeEvent(),
      onInstalled: makeEvent(),
      onStartup: makeEvent(),
      id: 'nkeimhogjdpnpccoofpliimaahmaaome'
    };

    // chrome.csi()
    c.csi = function() {
      var t = performance.timing || {};
      return {
        onloadT: t.loadEventEnd || 0,
        startE: t.navigationStart || 0,
        pageT: Date.now(),
        tran: 15
      };
    };

    // chrome.loadTimes()
    c.loadTimes = function() {
      return {
        requestTime: 0,
        startLoadTime: 0,
        commitLoadTime: 0,
        finishDocumentLoadTime: 0,
        finishLoadTime: 0,
        firstPaintTime: 0,
        firstPaintAfterLoadTime: 0,
        navigationType: 'other',
        wasFetchedViaSpdy: true,
        wasNpnNegotiated: true,
        npnNegotiatedProtocol: 'h2',
        wasAlternateProtocolAvailable: false,
        connectionInfo: 'http/2'
      };
    };
  } catch(e){}

  // ═══════════════════════════════════════════════════════════════
  // 12. Permissions API override
  // ═══════════════════════════════════════════════════════════════
  try{
    var _oq=Permissions.prototype.query.bind(Permissions.prototype);
    Permissions.prototype.query=async function(d){
      var n=d.name;
      if(n==='notifications')return{state:'prompt',onchange:null};
      if(n==='clipboard-read'||n==='clipboard-write')return{state:'granted',onchange:null};
      if(n==='geolocation')return{state:'prompt',onchange:null};
      if(n==='camera'||n==='microphone')return{state:'prompt',onchange:null};
      return _oq(d);
    };
  }catch(e){}

  // ═══════════════════════════════════════════════════════════════
  // 13. WebGL — spoof vendor/renderer, keep extension accessible
  // ═══════════════════════════════════════════════════════════════
  try{
    var _getContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(){
      var ctx=_getContext.apply(this,arguments);
      if(ctx&&(arguments[0]==='webgl'||arguments[0]==='experimental-webgl')){
        // Keep WEBGL_debug_renderer_info accessible (don't null it)
        var _getParam=ctx.getParameter;
        ctx.getParameter=function(p){
          // UNMASKED_VENDOR_WEBGL
          if(p===37445) return 'Google Inc. (Intel)';
          // UNMASKED_RENDERER_WEBGL
          if(p===37446) return 'Intel Iris OpenGL Engine';
          // Add subtle float noise to shader precision hint
          if(p===0x8A8F) {
            var orig=_getParam.call(this,p);
            if(orig && typeof orig=== 'number') return orig + 0.0001 * (Math.random()-0.5);
            return orig;
          }
          return _getParam.call(this,p);
        };
      }
      return ctx;
    };
  }catch(e){}

  // ═══════════════════════════════════════════════════════════════
  // 14. Canvas fingerprint — 2-3% pixel perturbation
  // ═══════════════════════════════════════════════════════════════
  try{
    var _toDataURL=HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL=function(){
      // 2-3% chance of perturbation (up from ~1%)
      if(Math.random()<0.025){
        var ctx=this.getContext('2d');
        if(ctx){
          var w=this.width,h=this.height;
          var imgData=ctx.getImageData(0,0,1,1);
          // Perturb a random channel slightly
          var ch=Math.floor(Math.random()*3);
          imgData.data[ch]=Math.min(255,Math.max(0,imgData.data[ch]+Math.round(Math.random()*2+1)));
          ctx.putImageData(imgData,0,0);
        }
      }
      return _toDataURL.apply(this,arguments);
    };
  }catch(e){}

  // ═══════════════════════════════════════════════════════════════
  // 15. AudioContext — subtle fingerprint noise (keep existing)
  // ═══════════════════════════════════════════════════════════════
  try{
    var _createOscillator=AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator=function(){
      var osc=_createOscillator.apply(this,arguments);
      var _origConnect=osc.connect;
      osc.connect=function(){
        if(Math.random()<0.01){
          var now=performance.now()*0.001;
          var noiseNode=this.context.createGain();
          noiseNode.gain.setValueAtTime(0.0001,now);
          noiseNode.connect(this.context.destination);
        }
        return _origConnect.apply(this,arguments);
      };
      return osc;
    };
  }catch(e){}
})();
`;
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit 2>&1
```

Expected: clean exit, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/stealth.ts
git commit -m "fix: rewrite stealth script with better anti-detection

- Proxy-based navigator.webdriver hiding (not delete+defineProperty)
  making 'webdriver in navigator' return false and property
  descriptor match real browser
- Complete window.chrome runtime emulation with proper Event API
  for onMessage/onConnect, csi(), loadTimes()
- WebGL: keep WEBGL_debug_renderer_info accessible, spoof values
  to Intel Iris OpenGL Engine, add subtle float noise
- Canvas noise increased to 2-3% from ~1% for better fingerprint
  diversity

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Turnstile Click Priority — Reorder and Simplify

**Files:**
- Modify: `src/turnstile.ts`

**Interfaces:**
- Consumes: stealth context from Tasks 1-2 (independent, no direct coupling)
- Produces: reordered `solveTurnstileOnce()` with Priority 1 = response-input-parent, Priority 2 = empty-div, Priority 3 = selector-based, Priority 4 = generic fallback

- [ ] **Step 1: Remove `isTurnstileFrameReady()` and `FRAME_READY_INDICATORS`**

Delete lines 624-690 (the `FRAME_READY_INDICATORS` constant and the entire `isTurnstileFrameReady()` function).

Also remove the `isTurnstileFrameReady` call in `clickLocatorBox` and `clickElementOrParentBox`.

- [ ] **Step 2: Remove `page.bringToFront()` and `window.focus()` from `preparePageForClick`**

Change `preparePageForClick` (lines 250-265):

```ts
async function preparePageForClick(
  page: Page,
  options: ClickBehaviorOptions,
): Promise<void> {
  // Removed bringToFront() and window.focus() — these are suspicious
  // and not human-like.
  if (!options.foreground) return;
  await page.waitForTimeout(Math.round(20 + Math.random() * 40)).catch(() => undefined);
}
```

- [ ] **Step 3: Reorder `solveTurnstileOnce()` strategy priority**

Rewrite `solveTurnstileOnce()`:

```ts
async function solveTurnstileOnce(
  options: CheckTurnstileOptions & { attempt?: number },
): Promise<SolveTurnstileResult> {
  const {
    page,
    selectors = DEFAULT_TURNSTILE_SELECTORS,
    maxCandidatesPerSelector = 5,
    foreground = DEFAULT_CLICK_BEHAVIOR.foreground,
    clickDelayMs = DEFAULT_CLICK_BEHAVIOR.clickDelayMs,
    mouseMoveSteps = DEFAULT_CLICK_BEHAVIOR.mouseMoveSteps,
    waitAfterClickMs = DEFAULT_CLICK_BEHAVIOR.waitAfterClickMs,
    attempt = 0,
  } = options;

  const clickOptions = clickOptionsFromCheckOptions({
    foreground,
    clickDelayMs,
    mouseMoveSteps,
    waitAfterClickMs,
  });

  if (await isTurnstileSolved({ page }).catch(() => false)) {
    return { clicked: false, status: "solved" };
  }

  if (await isManagedChallengePage(page)) {
    return { clicked: false, status: "managed-challenge" };
  }

  // Strategy 1: Parent of [name="cf-turnstile-response"]
  if (await clickParentOfTurnstileResponse(page, clickOptions).catch(() => false)) {
    return verifyClickSolved(page);
  }

  // Strategy 2: Empty 300px div detection
  if (await clickTurnstileCheckboxesByDiv(page, clickOptions).catch(() => false)) {
    return verifyClickSolved(page);
  }

  // Strategy 3: Selector-based iframe/locator
  if (
    await clickTurnstileLocators(
      page,
      selectors,
      maxCandidatesPerSelector,
      clickOptions,
      attempt,
    )
  ) {
    return verifyClickSolved(page);
  }

  // Strategy 4: Generic fallback
  if (await clickTurnstileFallback(page, clickOptions, attempt)) {
    return verifyClickSolved(page);
  }

  return { clicked: false, status: "not-found" };
}
```

- [ ] **Step 4: Simplify `clickParentOfTurnstileResponse`**

Replace the existing function with cleaner ElementHandle management:

```ts
async function clickParentOfTurnstileResponse(
  page: Page,
  options: ClickBehaviorOptions,
): Promise<boolean> {
  const elements = await page.$$('[name="cf-turnstile-response"]').catch(() => []);
  if (elements.length === 0) return false;

  for (const element of elements) {
    try {
      const parentHandle = await element.evaluateHandle((el) => el.parentElement);
      const parentEl = parentHandle.asElement();
      if (!parentEl) { parentHandle.dispose().catch(() => {}); continue; }

      const box = await parentEl.boundingBox();
      parentHandle.dispose().catch(() => {});
      if (!box || box.width <= 0 || box.height <= 0) continue;

      const clickX = box.x + 30;
      const clickY = box.y + box.height / 2;

      await preparePageForClick(page, options);
      const cursor = installRealCursor(page);
      await cursor
        .move({ x: clickX, y: clickY }, { moveSpeed: 1.0 + Math.random() * 0.4 })
        .catch(() => undefined);
      await page.waitForTimeout(Math.round(20 + Math.random() * 60)).catch(() => undefined);
      await cursor
        .click(
          { x: clickX, y: clickY },
          {
            hesitate: Math.round(10 + Math.random() * 40),
            waitForClick: options.clickDelayMs + Math.round(Math.random() * 20),
          },
        )
        .catch(() => {});

      if (options.waitAfterClickMs > 0) {
        await page.waitForTimeout(
          Math.round(options.waitAfterClickMs * (0.5 + Math.random() * 0.5)),
        ).catch(() => undefined);
      }

      return true;
    } catch (_e) {
      continue;
    } finally {
      await element.dispose().catch(() => undefined);
    }
  }

  return false;
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1
```

Expected: clean exit, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/turnstile.ts
git commit -m "fix: reorder turnstile solver priority and remove heavy guards

- Move cf-turnstile-response parent click to priority 1
- Remove isTurnstileFrameReady() — heavy waitForSelector calls
- Remove page.bringToFront() / window.focus() — suspicious
- Click coordinates consistently use x+30 for checkbox

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Managed Challenge Wait — Remove CDP Network Monitor

**Files:**
- Modify: `src/turnstile.ts`

**Interfaces:**
- Consumes: turnstile solver from Task 3
- Produces: cookie-only polling in managed challenge wait (no CDP session)

- [ ] **Step 1: Remove CDP network monitor from managed challenge block**

Replace the CDP-based managed challenge wait in `watchTurnstilePage` with cookie-only polling. The key change is removing:
- `setupChallengeCDPMonitor(page)` call
- `cdpMonitor.clearancePromise` race
- All `cdpMonitor.dispose()` calls

Replace with simple cookie polling:

```ts
if (result.status === "managed-challenge") {
  clickAttempts = 0;
  nextClickAt = Date.now() + Math.max(options.intervalMs, 15000);

  if (Date.now() - lastManagedChallengeLogAt > 30000) {
    lastManagedChallengeLogAt = Date.now();
    options.logger?.(
      "cloudflare managed challenge detected; waiting for auto-resolution...",
    );
  }

  const contextForCookies = page.context();
  const pollStart = Date.now();
  const maxWait = 45000;

  for (let i = 0; i < 90; i++) {
    if (closed || page.isClosed()) return;

    const cookies = await contextForCookies.cookies().catch(() => []);
    if (cookies.some((c) => c.name === "cf_clearance")) {
      options.logger?.("cf_clearance cookie found — challenge resolved");
      nextClickAt = 0;
      return;
    }

    const url = page.url();
    const title = await page.title().catch(() => "");
    if (
      !/just a moment|performing security|checking your browser/i.test(title) &&
      !/challenge-platform/i.test(url)
    ) {
      options.logger?.("page changed from challenge — resuming");
      nextClickAt = 0;
      return;
    }

    const hasCfWidgets = await page
      .evaluate(() => {
        const hasIframe = document.querySelector('iframe[src*="challenges.cloudflare.com"]');
        const hasTurnstile = document.querySelector(".cf-turnstile, [data-sitekey]");
        const tokenFields = document.querySelectorAll(
          '[name="cf-turnstile-response"], [name="turnstile-response"]',
        );
        return Boolean(hasIframe || hasTurnstile || tokenFields.length > 0);
      })
      .catch(() => false);
    if (hasCfWidgets) {
      options.logger?.("turnstile elements appeared after challenge — resuming");
      nextClickAt = 0;
      return;
    }

    if (Date.now() - pollStart > maxWait) {
      options.logger?.("managed challenge wait timeout; will retry");
      nextClickAt = Date.now() + 5000;
      return;
    }

    await page.waitForTimeout(600).catch(() => undefined);
  }
  return;
}
```

- [ ] **Step 2: Remove `setupChallengeCDPMonitor` and `setupTurnstileNetworkDetector`**

Delete both functions and verify they are no longer referenced.

- [ ] **Step 3: Clean up unused CDPSession imports**

Remove `CDPSession` from the patchright import at the top of `turnstile.ts` if no longer used.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1
```

Expected: clean exit, no errors.

- [ ] **Step 5: Commit**

```bash
git add src/turnstile.ts
git commit -m "fix: remove CDP network monitor from managed challenge wait

Replace CDP-based challenge detection with cookie-only polling.
Remove setupChallengeCDPMonitor() and setupTurnstileNetworkDetector().

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Build, Test, and Verify

- [ ] **Step 1: Build the project**

```bash
npm run build
```

Expected: clean build, `dist/` updated.

- [ ] **Step 2: Run headed test against target URL**

```bash
npx tsx test.js --verbose
```

Expected:
- Fingerprint: `navigator.webdriver` = `undefined`, `"webdriver" in navigator` = `false`, `chrome.runtime` = `function`
- Page navigates past "Just a moment..."
- Turnstile checkbox detected and clicked
- `cf_clearance` cookie obtained

- [ ] **Step 3: Commit final build**

```bash
git add -A
git commit -m "chore: build dist for v1.0.3

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
