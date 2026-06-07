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

    async process(prompt: string, core: ICore): Promise<void> {
        console.log("Brain processing prompt:", prompt);

        const model = this.genAI.getGenerativeModel({
            model: this.modelName,
            tools: [{ functionDeclarations: core.getTools() }]
        });

        // Chat session để lưu context và hỗ trợ function calling tốt hơn
        const chat = model.startChat();

        let running = true;
        let turn = 0;
        while (running && turn <= 10) {
            turn++;
            const state = await core.getCurrentState();
            const screenshotBase64 = state.screenshot.toString("base64");

            const promptText = `
                Nhiệm vụ: \`${prompt}\`.
                Trạng thái hiện tại: URL: \`${state.url}\`, Title: \`${state.title}\`.
                Cấu trúc trang rút gọn (Simplified DOM):
                \`\`\`html
                ${state.domSnapshot}
                \`\`\`
            `;

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
                const actionResult = await core.performAction({
                    type: call.name as any,
                    ...call.args as any
                });
                console.log("Tool execution result:", actionResult);

                await new Promise(r => setTimeout(r, 2000));

                // Gửi FunctionResponse về cho LLM
                await chat.sendMessage([{
                    functionResponse: {
                        name: call.name,
                        response: { result: actionResult }
                    }
                }]);
            } else {
                console.log("Agent Final Response:", result.response.text());
                running = false;
        }
    }
}
}

