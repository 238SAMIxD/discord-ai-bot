import dotenv from "dotenv";

dotenv.config({ path: ".env.test" });

process.env.DISCORD_TOKEN = process.env.DISCORD_TOKEN || "test-token";
process.env.OLLAMA = process.env.OLLAMA || "http://localhost:11434";
process.env.STABLE_DIFFUSION = process.env.STABLE_DIFFUSION || "http://localhost:7860";
process.env.CHANNELS = process.env.CHANNELS || "";
process.env.SYSTEM = process.env.SYSTEM || "You are a test assistant";
process.env.USE_SYSTEM = process.env.USE_SYSTEM || "true";
process.env.USE_MODEL_SYSTEM = process.env.USE_MODEL_SYSTEM || "true";
process.env.MAX_ATTACHMENTS = process.env.MAX_ATTACHMENTS || "3";
