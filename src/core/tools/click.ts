import { BrowserAction, ActionResult, ToolDefinition } from '../interface';
import { Page } from 'playwright-core';

export const clickTool: ToolDefinition = {
    name: 'click',
    description: 'Nhấp vào một phần tử dựa trên selector',
    parameters: {
        type: 'object',
        properties: { selector: { type: 'string' } },
        required: ['selector']
    }
};

export async function performClick(page: Page, action: BrowserAction): Promise<ActionResult> {
    if (action.selector) {
        try {
            await page.waitForSelector(action.selector, { timeout: 5000 });
            await page.click(action.selector);
            return { success: true, message: `Đã click thành công vào ${action.selector}` };
        } catch (e: unknown) {
            const error = e instanceof Error ? e.message : String(e);
            return {
                success: false,
                message: `Không thể click vào ${action.selector}: ${error}`,
                errorType: 'timeout',
                suggestion: 'Có thể selector không tồn tại hoặc trang chưa tải xong. Hãy kiểm tra lại DOM snapshot hoặc đợi thêm.'
            };
        }
    }
    return { success: false, message: "Thiếu selector để click", errorType: 'selector_not_found' };
}
