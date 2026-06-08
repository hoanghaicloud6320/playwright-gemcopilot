import { BrowserAction, ActionResult, ToolDefinition } from '../interface';

export const doneTool: ToolDefinition = {
    name: 'done',
    description: 'Hoàn thành tác vụ',
    parameters: {
        type: 'object',
        properties: {},
        required: []
    }
};

export async function performDone(): Promise<ActionResult> {
    return { success: true, message: "Tác vụ đã hoàn thành" };
}
