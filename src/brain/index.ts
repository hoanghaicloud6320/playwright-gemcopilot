import { GoogleGenerativeAI, SchemaType, FunctionDeclarationSchemaProperty } from "@google/generative-ai";
import { IBrain } from "./interface";
import { ICore, BrowserAction } from "../core/interface";
import * as fs from 'fs/promises';
import * as path from 'path';

interface HistoryEntry {
    call: {
        name: string;
        args: object;
    };
    response: unknown;
}

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

        const history: HistoryEntry[] = [];
        let running = true;
        let turn = 0;

        while (running && turn <= 20) {
            turn++;
            const state = await core.getCurrentState();
            const screenshotBase64 = state.screenshot.toString("base64");

            const historyText = history.slice(-20).map((h, i) =>
                `Lần ${i + 1}: Gọi ${h.call.name}(${JSON.stringify(h.call.args)}) -> Kết quả: ${JSON.stringify(h.response)}`
            ).join("\n");

            const promptText = `
                HƯỚNG DẪN:
                 - nếu nhiệm vụ đã hoàn thành thì phản hồi mà ko gọi tool để kết thúc vòng lặp này!
                 - các phản hồi khi đang trong vòng lặp vẫn có thể phản hồi text nhưng cần kèm function calling để giữ cho vòng lặp sống!
                 - các selector cho các tool **nên** sử dụng các selector gắn sẵn trong SemanticUItree (runtime đã tính sẵn selector để unique nhất có thể)
                 - lịch sử các hành động cung cấp cho bạn 1 góc nhìn về quá trình thực hiện nhiệm vụ 1 cách liền mạch (bạn đóng vai như 1 statemachine)

                Nhiệm vụ: \`${prompt}\`.
                Lịch sử các hành động gần nhất của bạn (tối đa 20):
                ${historyText || "Chưa có hành động nào."}

                Cấu trúc trang rút gọn (Simplified DOM/SemanticUItree):
                \`\`\`json
                ${state.semanticUiTree}
                \`\`\`
            `;

            if (this.debug) {
                await this.logDebug(logFilename, `[TURN ${turn} - PROMPT]\n${promptText}`);
            }

            const result = await model.generateContent([
                { text: promptText },
                //{ inlineData: { mimeType: "image/png", data: screenshotBase64 } }
            ]);

            if (this.debug) {
                await this.logDebug(logFilename, `[TURN ${turn} - RESPONSE]\n${JSON.stringify(result.response, null, 2)}`);
            }

            const calls = result.response.functionCalls();

            if (calls && calls.length > 0) {
                const call = calls[0];
                console.log("LLM Requested Tool:", call.name, call.args);

                const action: BrowserAction = {
                    type: call.name as BrowserAction['type'],
                    ...(call.args as object)
                } as BrowserAction;

                const actionResult = await core.performAction(action);
                console.log("Tool execution result:", actionResult);

                history.push({
                    call: { name: call.name, args: call.args as object },
                    response: actionResult
                });

                await new Promise(r => setTimeout(r, 2000));
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

