import { GoogleGenerativeAI } from "@google/generative-ai";
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

        // Cấu hình mô hình Gemini
        const model = this.genAI.getGenerativeModel({ model: this.modelName });

        // Loop cơ bản: thực hiện 1 bước để demo
        const state = await core.getCurrentState();

        const response = await model.generateContent(`
            Bạn là một trợ lý duyệt web thông minh.
            Trạng thái hiện tại: Title: ${state.title}, URL: ${state.url}
            Yêu cầu người dùng: ${prompt}

            Hãy trả về JSON với format: { "action": "navigate" | "click" | "type", "selector": string, "text": string, "url": string }
        `);

        console.log("LLM Decision:", response.response.text());

        // Parse kết quả từ LLM (cần xử lý JSON an toàn ở bước thực tế)
        // await core.performAction(parsedAction);
    }
}
