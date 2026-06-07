import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { ICore, BrowserConfig, BrowserAction, BrowserState, ToolDefinition } from './interface';

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

    async performAction(action: BrowserAction): Promise<string> {
        try {
            const actionType = action.type || (action as any).name;
            const args = action.args || action;
            switch (actionType) {
                case 'navigate':
                    if (args.url) {
                        await this.page.goto(args.url);
                        return `Đã điều hướng thành công đến ${args.url}`;
                    }
                    return "Thiếu URL để điều hướng";
                case 'click':
                    if (args.selector) {
                        await this.page.waitForSelector(args.selector, { timeout: 5000 });
                        await this.page.click(args.selector);
                        return `Đã click thành công vào ${args.selector}`;
                    }
                    return "Thiếu selector để click";
                case 'type':
                    if (args.selector && args.text) {
                        await this.page.waitForSelector(args.selector, { timeout: 5000 });
                        await this.page.fill(args.selector, args.text);
                        return `Đã nhập văn bản vào ${args.selector}`;
                    }
                    return "Thiếu selector hoặc text để nhập";
                case 'scroll':
                    await this.page.evaluate(() => window.scrollBy(0, window.innerHeight));
                    return "Đã cuộn trang";
                case 'done':
                    return "Tác vụ đã hoàn thành";
                default:
                    return `Hành động không xác định: ${actionType}`;
            }
        } catch (error: any) {
            return `Lỗi thực thi hành động ${action.type}: ${error.message}`;
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
            {
                name: 'navigate',
                description: 'Điều hướng trình duyệt đến một URL cụ thể',
                parameters: {
                    type: 'object',
                    properties: { url: { type: 'string' } },
                    required: ['url']
                }
            },
            {
                name: 'click',
                description: 'Nhấp vào một phần tử dựa trên selector',
                parameters: {
                    type: 'object',
                    properties: { selector: { type: 'string' } },
                    required: ['selector']
                }
            },
            {
                name: 'type',
                description: 'Nhập văn bản vào một phần tử dựa trên selector',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: { type: 'string' },
                        text: { type: 'string' }
                    },
                    required: ['selector', 'text']
                }
            },
            {
                name: 'scroll',
                description: 'Cuộn trang xuống',
                parameters: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            {
                name: 'done',
                description: 'Hoàn thành tác vụ',
                parameters: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            }
        ];
    }
}

