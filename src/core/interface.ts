/**
 * Contract cho Core Module
 * Quản lý trình duyệt: khởi tạo, đóng, tương tác
 */

export interface BrowserConfig {
    headless: boolean;
    executablePath: string;
    channel?: 'chrome' | 'msedge' | 'chrome-beta' | 'msedge-beta' | 'msedge-dev' | 'msedge-canary';
}

export interface BrowserAction {
    type: 'click' | 'type' | 'navigate' | 'scroll' | 'done';
    selector?: string;
    text?: string;
    url?: string;
}

export interface BrowserState {
    url: string;
    title: string;
    screenshot: Buffer; // Hoặc base64 string
    domSnapshot: string;
}

export interface ICore {
    launch(config: BrowserConfig): Promise<void>;
    close(): Promise<void>;
    performAction(action: BrowserAction): Promise<void>;
    getCurrentState(): Promise<BrowserState>;
}

