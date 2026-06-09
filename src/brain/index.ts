import { GoogleGenerativeAI, SchemaType, FunctionDeclarationSchemaProperty } from "@google/generative-ai";
import { IBrain } from "./interface";
import { ICore, BrowserAction } from "../core/interface";
import * as fs from 'fs/promises';
import * as path from 'path';

export class Brain implements IBrain {
    private genAI: GoogleGenerativeAI;
    private modelName: string = "gemini-1.5-flash";
    private debug: boolean = false;

    constructor(apiKey: string, debug: boolean = false) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.debug = debug;
    }

    setModel(modelName: string): void {
        this.modelName = modelName;
    }

    private async logDebug(filename: string, content: string) {
        if (!this.debug) return;
        const dir = path.join(process.cwd(), 'debug_logs');
        try {
            await fs.mkdir(dir, { recursive: true });
            // Thay đổi sang append để lưu vào cùng 1 file
            await fs.appendFile(path.join(dir, filename), content + "\n\n---SEPARATOR---\n\n");
        } catch (e) {
            console.error("Failed to write debug log:", e);
        }
    }

    async process(prompt: string, core: ICore): Promise<void> {
        console.log("Brain processing prompt:", prompt);
        const sessionId = Date.now().toString();
        const logFilename = `session_${sessionId}.log`;

        const model = this.genAI.getGenerativeModel({
            model: this.modelName,
            tools: [{
                functionDeclarations: core.getTools().map(tool => ({
                    name: tool.name,
                    description: tool.description,
                    parameters: {
                        type: SchemaType.OBJECT,
                        properties: tool.parameters.properties as { [k: string]: FunctionDeclarationSchemaProperty },
                        required: tool.parameters.required
                    }
                }))
            }]
        });

        // Chat session để lưu context và hỗ trợ function calling tốt hơn
        const chat = model.startChat();
        let running = true;
        let turn = 0;
        while (running && turn <= 20) {
            turn++;
            const state = await core.getCurrentState();
            const screenshotBase64 = state.screenshot.toString("base64");

            const promptText = `
                Nhiệm vụ: \`${prompt}\`.
                Trạng thái hiện tại: URL: \`${state.url}\`, Title: \`${state.title}\`.
                Cấu trúc trang rút gọn (Simplified DOM):
                \`\`\`json
                ${state.semanticUiTree}
                \`\`\`
            `;

            if (this.debug) {
                await this.logDebug(logFilename, `[TURN ${turn} - PROMPT]\n${promptText}`);
            }

            const result = await chat.sendMessage([
                { text: promptText },
                { inlineData: { mimeType: "image/png", data: screenshotBase64 } }
            ]);

            if (this.debug) {
                await this.logDebug(logFilename, `[TURN ${turn} - RESPONSE]\n${JSON.stringify(result.response, null, 2)}`);
            }

            // Sử dụng functionCalls() (SDK v0.2+)
            const calls = result.response.functionCalls();

            if (calls && calls.length > 0) {
                const text = result.response.text();
                if (text) {
                    console.log("AI message:", text);
                }

                const call = calls[0];
                console.log("LLM Requested Tool:", call.name, call.args);

                // Thực thi action qua core
                const action: BrowserAction = {
                    type: call.name as BrowserAction['type'],
                    ...call.args
                } as BrowserAction;

                const actionResult = await core.performAction(action);
                console.log("Tool execution result:", actionResult);

                await new Promise(r => setTimeout(r, 2000));

                // Log phần Function Response trước khi gửi cho LLM
                const functionResponsePayload = {
                        name: call.name,
                        response: { result: JSON.stringify(actionResult) }
                };
                if (this.debug) {
                    await this.logDebug(logFilename, `[TURN ${turn} - FUNCTION RESPONSE]\n${JSON.stringify(functionResponsePayload, null, 2)}`);
            }

                // Gửi FunctionResponse về cho LLM
                await chat.sendMessage([{
                    functionResponse: functionResponsePayload
                }]);
            } else {
                const finalResponse = result.response.text();
                console.log("Agent Final Response:", finalResponse);

                if (this.debug) {
                    await this.logDebug(logFilename, `[FINAL RESPONSE]\n${finalResponse}`);
                }

                running = false;
        }
    }
}
}

