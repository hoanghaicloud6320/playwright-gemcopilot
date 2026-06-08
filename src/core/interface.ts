/**
 * Contract cho Core Module
 * Quản lý trình duyệt: khởi tạo, đóng, tương tác
 */

export interface BrowserConfig {
    headless: boolean;
    executablePath?: string;
    channel?: 'chrome' | 'msedge' | 'chrome-beta' | 'msedge-beta' | 'msedge-dev' | 'msedge-canary';
    userDataDir?: string;
}

export interface BrowserAction {
    type: 'click' | 'type' | 'navigate' | 'scroll' | 'done' | 'keypress' | 'askForHumanConfirmation';
    selector?: string;
    text?: string;
    url?: string;
    key?: string;
    question?: string;
}

export interface ActionResult {
    success: boolean;
    message: string;
    errorType?: 'timeout' | 'selector_not_found' | 'navigation_failed' | 'unknown' | 'keyboard_error' | 'missing_parameter' | 'element_not_found' | 'multiple_elements_found' | 'error';
    suggestion?: string;
}

/**
 * Định nghĩa các Tool có sẵn cho Brain
 */
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, any>;
        required: string[];
    };
}

export interface BrowserState {
    url: string;
    title: string;
    screenshot: Buffer; // Hoặc base64 string
    domSnapshot: string;
    availableTools: ToolDefinition[]; // Thêm vào để Brain biết dùng tool gì
}

export interface ICore {
    launch(config: BrowserConfig): Promise<void>;
    close(): Promise<void>;
    performAction(action: BrowserAction): Promise<ActionResult>;
    getCurrentState(): Promise<BrowserState>;
    getTools(): ToolDefinition[]; // Lấy danh sách tool
}

