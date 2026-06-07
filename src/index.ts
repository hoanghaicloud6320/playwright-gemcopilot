import { AgentInterface } from "./interface/index.js";
import { Brain } from "./brain/index.js";
import { Core } from "./core/index.js";
import * as dotenv from "dotenv";
import * as readline from "readline";

dotenv.config();

async function main() {
    const core = new Core();
    console.log("GOOGLE_API_KEY present:", !!process.env.GOOGLE_API_KEY);
    const brain = new Brain(process.env.GOOGLE_API_KEY || "");

    if (process.env.model) {
        brain.setModel(process.env.model);
        console.log("Model set to:", process.env.model);
    }

    const agent = new AgentInterface(core);

    await core.launch({
        headless: false,
        channel: "msedge",
        userDataDir: process.env.EDGE_PROFILE_PATH,
    });

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const userInput = await new Promise<string>((resolve) => {
        rl.question("Nhập yêu cầu của bạn: ", (answer) => {
            resolve(answer);
            rl.close();
        });
    });
    await agent.run(userInput, brain);

    await core.close();
}

main().catch(console.error);

