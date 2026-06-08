import { BrowserAction, ActionResult, ToolDefinition } from '../interface';
import * as readline from 'readline';

export const askForHumanConfirmationTool: ToolDefinition = {
    name: 'askForHumanConfirmation',
    description: 'Yêu cầu sự can thiệp của con người khi gặp khó khăn như CAPTCHA, xác thực 2 bước, hoặc các trang web phức tạp không thể tự động hóa.',
    parameters: {
        type: 'object',
        properties: {
            question: { type: 'string', description: 'Câu hỏi hoặc mô tả lý do cần con người trợ giúp' }
        },
        required: ['question']
    }
};

export async function performAskForHumanConfirmation(action: BrowserAction): Promise<ActionResult> {
    if (!action.question) {
        return { success: false, message: "Thiếu câu hỏi cho người dùng", errorType: 'missing_parameter' };
    }

    console.log(`\n[HUMAN INTERVENTION REQUIRED]: ${action.question}`);
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question('Nhập phản hồi của bạn để LLM tiếp tục: ', (answer) => {
            rl.close();
            resolve({ 
                success: true, 
                message: `Người dùng đã phản hồi: ${answer}` 
            });
        });
    });
}
