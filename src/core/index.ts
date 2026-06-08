import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { ICore, BrowserConfig, BrowserAction, BrowserState, ToolDefinition, ActionResult } from './interface';
import { navigateTool, performNavigate } from './tools/navigate';
import { clickTool, performClick } from './tools/click';
import { typeTool, performType } from './tools/type';
import { scrollTool, performScroll } from './tools/scroll';
import { doneTool, performDone } from './tools/done';
import { keypressTool, performKeypress } from './tools/keypress';
import { askForHumanConfirmationTool, performAskForHumanConfirmation } from './tools/askForHumanConfirmation';

// Tạm thời áp dụng plugin stealth
(chromium as any).use(stealth());

export class Core implements ICore {
    private browser: any;
    private page: any;

    async launch(config: BrowserConfig): Promise<void> {
        if (config.userDataDir) {
            // Dùng launchPersistentContext để load profile có sẵn
            const context = await (chromium as any).launchPersistentContext(config.userDataDir, {
                headless: config.headless,
                channel: config.channel,
                args: [
                    '--disable-blink-features=AutomationControlled',
                ],
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });
            this.browser = context.browser();
            this.page = context.pages()[0] || await context.newPage();
        } else {
            this.browser = await (chromium as any).launch({
                headless: config.headless,
                executablePath: config.executablePath,
                channel: config.channel,
                args: [
                    '--disable-blink-features=AutomationControlled', // Quan trọng để tránh dấu vết automation
                ]
            });
            const context = await this.browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });

            this.page = await context.newPage();
        }

        // Đảm bảo User-Agent không bị lộ là headless
        await this.page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });
    }

    async close(): Promise<void> {
        await this.browser.close();
    }

    async performAction(action: BrowserAction): Promise<ActionResult> {
        try {
            const actionType = action.type;
            switch (actionType) {
                case 'navigate':
                    return await performNavigate(this.page, action);
                case 'click':
                    return await performClick(this.page, action);
                case 'type':
                    return await performType(this.page, action);
                case 'scroll':
                    return await performScroll(this.page);
                case 'keypress':
                    return await performKeypress(this.page, action);
                case 'askForHumanConfirmation':
                    return await performAskForHumanConfirmation(action);
                case 'done':
                    return await performDone();
                default:
                    return { success: false, message: `Hành động không xác định: ${actionType}`, errorType: 'unknown' };
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            return { success: false, message: `Lỗi hệ thống khi thực thi hành động ${action.type}: ${message}`, errorType: 'unknown' };
        }
    }

    async getCurrentState(): Promise<BrowserState> {
        const page = this.page; // instance của Playwright/Puppeteer

        // Trích xuất DOM rút gọn
        const domSnapshot = await page.evaluate(() => {
            const selector = 'button, a, input, select, textarea, [role="button"], [contenteditable="true"]';

            const elements = Array.from(document.querySelectorAll(selector))
                .filter((el: any) => {
                    const rect = el.getBoundingClientRect();
                    const style = window.getComputedStyle(el);

                    return (
                        rect.width > 0 &&
                        rect.height > 0 &&
                        style.visibility !== 'hidden' &&
                        style.display !== 'none'
                    );
                });

            return elements.map((el: any, index) => {
                const rect = el.getBoundingClientRect();
                return {
                    index,
                    tag: el.tagName.toLowerCase(),
                    role: el.getAttribute('role'),
                    id: el.id || null,
                    class: typeof el.className === 'string' ? el.className : null,
                    text: el.innerText?.trim().slice(0, 100) || null,
                    ariaLabel: el.getAttribute('aria-label'),
                    title: el.getAttribute('title'),
                    placeholder: el.placeholder || null,
                    type: el.type || null,
                    name: el.name || null,
                    value: el.value || null,
                    checked: el.checked ?? null,
                    disabled: el.disabled || false,
                    href: el.href || null,
                    label: el.labels?.[0]?.innerText?.trim() || null,
                    bbox: {
                        x: Math.round(rect.x),
                        y: Math.round(rect.y),
                        w: Math.round(rect.width),
                        h: Math.round(rect.height)
                    }
                };
            }).map(el => JSON.stringify(el)).join('\n');
        });
        return {
            url: page.url(),
            title: await page.title(),
            screenshot: await page.screenshot(),
            domSnapshot: domSnapshot, // Đây là cái Brain sẽ nhận được
            availableTools: this.getTools()
        };
    }

    getTools(): ToolDefinition[] {
        return [
            navigateTool,
            clickTool,
            typeTool,
            scrollTool,
            keypressTool,
            askForHumanConfirmationTool,
            doneTool
        ];
    }
}

