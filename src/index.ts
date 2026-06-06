import { AgentInterface } from "./interface/index.js";
import { Brain } from "./brain/index.js";
import { Core } from "./core/index.js";
import * as dotenv from "dotenv";

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
    });

    await agent.run("kiểm tra phiên bản java mới nhất hiện tại", brain);

    await core.close();
}

main().catch(console.error);

