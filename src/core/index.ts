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

    async performAction(action: BrowserAction): Promise<void> {
        // Map các tool call từ LLM sang các hàm của Playwright
        const actionType = action.type || (action as any).name;
        const args = action.args || action;
        switch (actionType) {
            case 'navigate':
                if (args.url) await this.page.goto(args.url);
                break;
            case 'click':
                if (args.selector) await this.page.click(args.selector);
                break;
            case 'type':
                if (args.selector && args.text) {
                    await this.page.fill(args.selector, args.text);
                }
                break;
            case 'scroll':
                await this.page.evaluate(() => window.scrollBy(0, window.innerHeight));
                break;
            // Add other actions...
        }
    }

    async getCurrentState(): Promise<BrowserState> {
        return {
            url: this.page.url(),
            title: await this.page.title(),
            screenshot: await this.page.screenshot(),
            domSnapshot: await this.page.content(),
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

