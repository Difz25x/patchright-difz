import { chromium, getCloudflareData } from "./dist/index.js";

const context = await chromium.launch({
    headless: false,
    channel: "chrome",
    viewport: null,
    turnstile: true,
});

const page = await context.newPage();

await page.goto("https://turnstile.zeroclover.io/");