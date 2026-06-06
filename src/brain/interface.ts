/**
 * Contract cho Brain Module
 * Tư duy và điều khiển: phân tích trạng thái và quyết định hành động
 */
import { ICore, ToolDefinition } from "../core/interface";

export interface IBrain {
    // Nhận prompt từ người dùng và ICore để điều khiển trình duyệt
    process(prompt: string, core: ICore): Promise<void>;

    // Tuỳ chỉnh model
    setModel(modelName: string): void;

    // Lấy danh sách công cụ từ Core
    getAvailableTools(): ToolDefinition[];
}

