import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const EDGE_PATHS = [
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

async function main() {
  const executablePath = EDGE_PATHS.find((p) => fs.existsSync(p));

  if (!executablePath) {
    throw new Error("Cannot find Microsoft Edge executable.");
  }

  const userDataDir = path.resolve("../test_profile");

  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath,
    headless: false,
  });

  const page = context.pages()[0] ?? await context.newPage();

  await page.goto("https://chatgpt.com", {
    waitUntil: "domcontentloaded",
  });

  const snapshot = await page.ariaSnapshot({
    mode: "ai",
    boxes: true,
  });

  console.log(snapshot);

  await context.close();
}

main().catch(console.error);