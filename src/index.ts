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
        userDataDir: process.env.EDGE_PROFILE_PATH,
    });

    await agent.run("hãy tra giá ngày hôm nay của vnindex, xăng dầu, vàng, silicon và btc", brain);

    await core.close();
}

main().catch(console.error);

