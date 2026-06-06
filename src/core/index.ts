import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { ICore, BrowserConfig, BrowserAction, BrowserState } from './interface';

// Tạm thời áp dụng plugin stealth
(chromium as any).use(stealth());

export class Core implements ICore {
    private browser: any;
    private page: any;

    async launch(config: BrowserConfig): Promise<void> {
        this.browser = await chromium.launch({ 
            headless: config.headless,
            executablePath: config.executablePath,
            channel: config.channel
        });
        this.page = await this.browser.newPage();
    }

    async close(): Promise<void> {
        await this.browser.close();
    }

    async performAction(action: BrowserAction): Promise<void> {
        switch (action.type) {
            case 'navigate':
                if (action.url) await this.page.goto(action.url);
                break;
            case 'click':
                if (action.selector) await this.page.click(action.selector);
                break;
            case 'type':
                if (action.selector && action.text) await this.page.fill(action.selector, action.text);
                break;
            // Add other actions...
        }
    }

    async getCurrentState(): Promise<BrowserState> {
        return {
            url: this.page.url(),
            title: await this.page.title(),
            screenshot: await this.page.screenshot(),
            domSnapshot: await this.page.content()
        };
    }
}

