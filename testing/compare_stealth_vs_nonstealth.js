import { chromium as pwChromium } from "playwright-core";
import { chromium as extraChromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

extraChromium.use(StealthPlugin());

async function collect(label, browserType) {
  const browser = await browserType.launch({
    headless: false,
    channel: "msedge",
  });

  const page = await browser.newPage();
  await page.goto("about:blank");

  const result = await page.evaluate((labelFromNode) => {
    return {
      label: labelFromNode,
      webdriver: navigator.webdriver,
      userAgent: navigator.userAgent,
      languages: navigator.languages,
      pluginsLength: navigator.plugins.length,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory ?? null,
      chrome: !!window.chrome,
      chromeRuntime: !!window.chrome?.runtime,
    };
  }, label);

  await browser.close();
  return result;
}

const normal = await collect("normal playwright", pwChromium);
const stealth = await collect("playwright-extra stealth", extraChromium);

console.log("NORMAL:");
console.log(normal);

console.log("\nSTEALTH:");
console.log(stealth);