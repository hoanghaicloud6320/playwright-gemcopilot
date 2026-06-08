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
            const locator = page.locator(action.selector);
            const count = await locator.count();

            if (count === 0) {
                return {
                success: false,
                    message: `Không tìm thấy phần tử nào với selector: ${action.selector}`,
                    errorType: 'element_not_found',
                    suggestion: 'Kiểm tra lại selector, có vẻ như nó không khớp với bất kỳ phần tử nào trên trang.'
            };
        }

            if (count > 1) {
                return {
                    success: false,
                    message: `Tìm thấy ${count} phần tử với selector: ${action.selector}.`,
                    errorType: 'multiple_elements_found',
                    suggestion: 'Selector quá chung chung, vui lòng chọn một selector cụ thể hơn hoặc sử dụng các bộ lọc như :nth-child() hoặc các thuộc tính định danh khác.'
                };
    }

            await locator.fill(action.text);
            return { success: true, message: `Đã nhập văn bản vào ${action.selector}` };
        } catch (e: unknown) {
            const error = e instanceof Error ? e.message : String(e);
            return {
                success: false,
                message: `Không thể nhập văn bản vào ${action.selector}: ${error}`,
                errorType: 'error',
                suggestion: 'Selector có thể đã thay đổi hoặc phần tử không khả dụng để nhập.'
            };
        }
    }
    return { success: false, message: "Thiếu selector hoặc text để nhập", errorType: 'selector_not_found' };
}

