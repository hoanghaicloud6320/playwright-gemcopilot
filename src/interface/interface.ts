/**
 * Contract cho Interface Module
 * Cầu nối giữa người dùng và Agent
 */
import { IBrain } from "../brain/interface";

export interface IAgentInterface {
    // Khởi chạy Agent với cấu hình Brain
    run(prompt: string, brain: IBrain): Promise<void>;
}
