---
name: turnstile-solver-optimizations
description: Speed and reliability improvements made to the Turnstile solver in June 2026
metadata:
  type: project
---

# Turnstile Solver Optimizations (June 2026)

## Frame Readiness Detection
- 3-phase approach replaces single parallel scan with 8×3s timeouts
- Phase 1: `document.readyState` check via evaluate (zero selector overhead, <1ms)
- Phase 2: Rapid parallel probe with 600ms timeout per indicator
- Phase 3: Sequential deep probe of top-3 indicators with 2s timeout
- Typical check for loaded frames: <100ms (was up to 3s)

## CDP Network Monitoring
- `setupChallengeCDPMonitor()` listens for `Network.responseReceived` events
- Detects `cf_clearance` cookie via Set-Cookie headers before next poll cycle
- Used in `watchTurnstilePage` managed challenge handler with race-based detection

## Selector Prioritization
- Iframe selectors (`iframe[src*="challenges.cloudflare.com"]`, etc.) tried first
- Widget containers (`.cf-turnstile`, `[data-sitekey]`) tried second
- Each tier shuffled internally for anti-detection
- Extracted `tryClickSelector()` helper to reduce duplication

## Stealth Enhancements
- WebGL vendor/renderer spoofing via `getParameter` interception
- Canvas fingerprint noise (1% pixel perturbation on `toDataURL`)
- AudioContext subtle noise
- PluginArray/MimeTypeArray with `item()`/`namedItem()` methods
- Chrome Headless → Chrome UA replacement
- Better permissions API coverage

## API Changes
- `getCloudflareData`: Added 2-minute timeout to prevent infinite wait on initial solve
- `getCloudflareData`: Default `timeoutMs` remains 7000ms for post-solve cookie wait

## Test Suite
- Multi-target support (`--all`, `--2captcha`, `--url=`)
- Structured timing metrics (load, challenge, solve, total)
- Summary table with color-coded pass/fail
- Verbose mode (`--verbose`) for solver logging

**Why:** The Turnstile solver needed faster detection and more reliable resolution, especially for managed challenges and hardened Cloudflare pages.

**How to apply:** Build + run tests: `npm run build && npm test`. For comprehensive testing: `npm run test:all -- --verbose`.
