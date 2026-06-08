import { BrowserAction, ActionResult, ToolDefinition } from '../interface';
import { Page } from 'playwright-core';

export const scrollTool: ToolDefinition = {
    name: 'scroll',
    description: 'Cuộn trang xuống',
    parameters: {
        type: 'object',
        properties: {},
        required: []
    }
};

export async function performScroll(page: Page): Promise<ActionResult> {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    return { success: true, message: "Đã cuộn trang" };
}
