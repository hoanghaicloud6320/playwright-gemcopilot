import { GoogleGenerativeAI, FunctionDeclaration, Tool } from "@google/generative-ai";
import { IBrain } from "./interface";
import { ICore } from "../core/interface";

export class Brain implements IBrain {
    private genAI: GoogleGenerativeAI;
    private modelName: string = "gemini-1.5-flash";

    constructor(apiKey: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
    }

    setModel(modelName: string): void {
        this.modelName = modelName;
    }

    private getTools(): Tool[] {
        return [{
            functionDeclarations: [
                {
                    name: "navigate",
                    description: "Điều hướng đến một URL cụ thể",
                    parameters: {
                        type: "OBJECT",
                        properties: { url: { type: "STRING" } },
                        required: ["url"]
                    }
                },
                {
                    name: "click",
                    description: "Click vào một phần tử trên trang",
                    parameters: {
                        type: "OBJECT",
                        properties: { selector: { type: "STRING" } },
                        required: ["selector"]
                    }
                },
                {
                    name: "type",
                    description: "Nhập văn bản vào một phần tử",
                    parameters: {
                        type: "OBJECT",
                        properties: {
                            selector: { type: "STRING" },
                            text: { type: "STRING" }
                        },
                        required: ["selector", "text"]
                    }
                }
            ]
        }];
    }

    async process(prompt: string, core: ICore): Promise<void> {
        console.log("Brain processing prompt:", prompt);

        const model = this.genAI.getGenerativeModel({
            model: this.modelName,
            tools: this.getTools()
        });

        // Chat session để lưu context và hỗ trợ function calling tốt hơn
        const chat = model.startChat();

        let running = true;
        let turn = 0;
        while (running && turn < 10) {
            turn++;
        const state = await core.getCurrentState();
            const screenshotBase64 = state.screenshot.toString("base64");

            const promptText = `Nhiệm vụ: ${prompt}. Trạng thái hiện tại: URL: ${state.url}, Title: ${state.title}.`;

            const result = await chat.sendMessage([
                { text: promptText },
                { inlineData: { mimeType: "image/png", data: screenshotBase64 } }
            ]);

            // Sử dụng functionCalls() (SDK v0.2+)
            const calls = result.response.functionCalls();

            if (calls && calls.length > 0) {
                const call = calls[0];
                console.log("LLM Requested Tool:", call.name, call.args);

                // Thực thi action qua core
                await core.performAction({
                    type: call.name as any,
                    ...call.args as any
                });
                    await new Promise(r => setTimeout(r, 2000));

                // Gửi FunctionResponse về cho LLM
                await chat.sendMessage([{
                    functionResponse: {
                        name: call.name,
                        response: { result: { success: true } }
                    }
                }]);
            } else {
                console.log("Agent Final Response:", result.response.text());
                running = false;
        }
    }
}
}

