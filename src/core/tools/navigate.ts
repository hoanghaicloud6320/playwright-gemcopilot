import { BrowserAction, ActionResult, ToolDefinition } from '../interface';
import { Page } from 'playwright-core';

export const navigateTool: ToolDefinition = {
    name: 'navigate',
    description: 'Điều hướng trình duyệt đến một URL cụ thể',
    parameters: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url']
    }
};

export async function performNavigate(page: Page, action: BrowserAction): Promise<ActionResult> {
    if (action.url) {
        await page.goto(action.url);
        return { success: true, message: `Đã điều hướng thành công đến ${action.url}` };
    }
    return { success: false, message: "Thiếu URL để điều hướng", errorType: 'navigation_failed' };
}
