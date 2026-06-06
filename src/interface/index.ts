import { IAgentInterface } from "./interface";
import { IBrain } from "../brain/interface";

export class AgentInterface implements IAgentInterface {
    constructor(private core: any) {}

    async run(prompt: string, brain: IBrain): Promise<void> {
        console.log("Agent starting with prompt:", prompt);
        await brain.process(prompt, this.core);
    }
}

