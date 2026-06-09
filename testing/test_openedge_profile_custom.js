// open-edge-mybotprofile.js
// Chạy: node open-edge-mybotprofile.js

import fs from "node:fs";
import path from "node:path";

import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";

chromium.use(stealth());

const EDGE_PATHS = [
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

const USER_DATA_DIR = path.resolve("./test_profile");

async function main() {
  const executablePath = EDGE_PATHS.find((p) => fs.existsSync(p));

  if (!executablePath) {
    console.error("Không tìm thấy Microsoft Edge.");
    console.error("Đã kiểm tra:");
    for (const p of EDGE_PATHS) {
      console.error(" -", p);
    }
    process.exit(1);
  }

  console.log("Edge executable:", executablePath);
  console.log("Bot profile dir:", USER_DATA_DIR);

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    executablePath,
    headless: false,
    viewport: null,

    // Bỏ --no-sandbox
    chromiumSandbox: true,

    args: [
      "--start-maximized",
    ],
  });

  const page = context.pages()[0] || (await context.newPage());

  await page.goto("https://www.google.com", {
    waitUntil: "domcontentloaded",
  });

  console.log("Đã mở Edge bằng Playwright + stealth + profile mybotprofile.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});