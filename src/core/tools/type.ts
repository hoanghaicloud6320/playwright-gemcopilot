import { BrowserAction, ActionResult, ToolDefinition } from '../interface';
import { Page } from 'playwright-core';

export const typeTool: ToolDefinition = {
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
};

export async function performType(page: Page, action: BrowserAction): Promise<ActionResult> {
    if (action.selector && action.text) {
        try {
            await page.waitForSelector(action.selector, { timeout: 5000 });
            await page.fill(action.selector, action.text);
            return { success: true, message: `Đã nhập văn bản vào ${action.selector}` };
        } catch (e: unknown) {
            const error = e instanceof Error ? e.message : String(e);
            return {
                success: false,
                message: `Không thể nhập văn bản vào ${action.selector}: ${error}`,
                errorType: 'timeout',
                suggestion: 'Selector có thể đã thay đổi hoặc phần tử không khả dụng để nhập.'
            };
        }
    }
    return { success: false, message: "Thiếu selector hoặc text để nhập", errorType: 'selector_not_found' };
}
