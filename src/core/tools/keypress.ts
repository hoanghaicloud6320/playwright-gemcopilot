import { BrowserAction, ActionResult, ToolDefinition } from '../interface';
import { Page } from 'playwright-core';

export const keypressTool: ToolDefinition = {
    name: 'keypress',
    description: 'Nhấn một phím hoặc tổ hợp phím (ví dụ: Enter, Escape, Control+a, ArrowDown)',
    parameters: {
        type: 'object',
        properties: {
            key: { type: 'string', description: 'Phím hoặc tổ hợp phím cần nhấn' }
        },
        required: ['key']
    }
};

export async function performKeypress(page: Page, action: BrowserAction): Promise<ActionResult> {
    if (action.key) {
        try {
            await page.keyboard.press(action.key);
            return { success: true, message: `Đã nhấn phím: ${action.key}` };
        } catch (e: unknown) {
            const error = e instanceof Error ? e.message : String(e);
            return {
                success: false,
                message: `Không thể nhấn phím ${action.key}: ${error}`,
                errorType: 'keyboard_error'
            };
        }
    }
    return { success: false, message: "Thiếu phím để nhấn", errorType: 'missing_parameter' };
}
