<div align="center">
    <h1>Discord AI Bot</h1>
    <h3 align="center">Discord bot to interact with <a href="https://github.com/jmorganca/ollama">Ollama</a> and <a href="https://github.com/AUTOMATIC1111/stable-diffusion-webui">AUTOMATIC1111 Stable Diffusion</a> as a chatbot</h3>
    <h3><img alt="Stars" src="https://img.shields.io/github/stars/238SAMIxD/discord-ai-bot?display_name=tag&style=for-the-badge" /> <a href="https://github.com/238SAMIxD/discord-ai-bot/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/238SAMIxD/discord-ai-bot/ci.yml?branch=main&style=for-the-badge&label=ci" /></a></h3>
</div>

### Set-up instructions

1. Install [Node.js](https://nodejs.org) (if you have a package manager, use that instead to install this)
   - Make sure to install at least v22.13 of Node.js
   - Install [pnpm](https://pnpm.io/installation) v12 or newer, it switches to the version pinned in `package.json` automatically
2. Install [Ollama](https://github.com/jmorganca/ollama) (ditto)
3. Pull (download) a model, e.g `ollama pull orca` or `ollama pull llama2`
4. Start Ollama by running `ollama serve`
5. [Create a Discord bot](https://discord.com/developers/applications)
   - The bot only uses slash commands, so you don't need to enable any privileged gateway intents under Application » Bot
6. Invite the bot to a server
   1. Go to Application » OAuth2 » URL Generator
   2. Enable `bot`
   3. Enable Send Messages, Read Messages/View Channels, and Read Message History
   4. Under Generated URL, click Copy and paste the URL in your browser
7. Rename `.env.example` to `.env` and edit the `.env` file
   - You can get the token from Application » Bot » Token, **never share this with anyone**
   - Make sure to change the model if you aren't using `orca`
   - Ollama URL can be kept the same unless you have changed the port
   - You can use multiple Ollama servers at the same time by separating the URLs with commas
   - Set the channels to the channel IDs, comma separated, or leave it empty to allow all channels (threads inside a listed channel are allowed too, and DMs are always allowed)
     1. In Discord, go to User Settings » Advanced, and enable Developer Mode
     2. Right click on a channel you want to use, and click Copy Channel ID
   - You can edit the system message the bot uses, or disable it entirely
   - `/chat` sends each prompt as `Name: prompt`, using the sender's server nickname or display name, so the model knows who is talking
   - `/chat` history is saved in an SQLite database at `CHAT_HISTORY_DB` (default `./data/chat-history.db`, relative to the folder you start the bot from), so conversations survive restarts. Each user has their own history in each channel, limited to their last 50 messages, and `/clearhistory` deletes yours in the current channel
   - While `/chat`, `/generate` or `/text2img` runs, its reply shows a red Stop button that only the person who ran the command can press. Stopping cancels the request, so Ollama stops generating and the server is freed for the next request. A streamed reply keeps the text generated so far, and a stopped `/chat` isn't saved to the history. `/text2img` interrupts its image only once AUTOMATIC1111 reports it as the one rendering, which needs AUTOMATIC1111 1.8 or newer started without `--nowebui`, and the Stable Diffusion server stays busy until it has finished with the stopped job
   - `/chat` and `/generate` answers end with buttons showing Ollama's stats for that answer: the model, response tokens, generation speed, prompt tokens, model load time and total time. Clicking one shows a breakdown only you can see. Set `SHOW_STATS=false` to hide the buttons
8. Install the required dependencies with `pnpm i`
9. Start the bot with `pnpm start`
10. You can interact with the bot with its slash commands: `/chat`, `/generate`, `/text2img`, `/models` and `/clearhistory`
11. Install <a href="https://github.com/AUTOMATIC1111/stable-diffusion-webui">Stable Diffusion</a>
12. Run the script `./webui.sh --api --listen`

### Set-up instructions with Docker

1. Install [Docker](https://docs.docker.com/get-docker/)
   - You need Docker Engine 20.10 or newer with Docker Compose v2
2. Repeat steps 2—7 from the other setup instructions
   - The compose file sets `OLLAMA` to `http://host.docker.internal:11434`, which points the container at the Ollama running on your computer
   - On Linux, Ollama only listens on `127.0.0.1` by default, so the container can't reach it. Start it with `OLLAMA_HOST=0.0.0.0 ollama serve`, or, if Ollama runs as a systemd service, run `sudo systemctl edit ollama`, add `Environment="OLLAMA_HOST=0.0.0.0"` under `[Service]` and restart it. Docker Desktop on Windows and macOS doesn't need this
   - For `/text2img`, set `STABLE_DIFFUSION=http://host.docker.internal:7860` in `.env`, because `localhost` inside the container is the container itself
3. Start the bot with `make compose-up` if you have Make installed
   - Otherwise, try `docker compose -p discord-ai up` instead
4. You can interact with the bot with its slash commands: `/chat`, `/generate`, `/text2img`, `/models` and `/clearhistory`
5. `/chat` history is stored in the `chat-history` volume mounted at `/app/data`, so it survives restarts, rebuilds and `make compose-down`
   - Keep `CHAT_HISTORY_DB` inside `./data` (the default) so the database is saved in that volume
   - To delete the stored history, run `docker compose -p discord-ai down -v`

### Contributing / CI

Every pull request and every push to `main` runs these GitHub Actions checks:

- `check`: `pnpm test:prettier`, `pnpm test:lint`, `pnpm test:tsc`, `pnpm test` and `pnpm build` on Node.js 22, 24 and 26
- `docker`: builds the Docker image without pushing it anywhere, then checks that the container refuses to start without a token
- `codeql`: CodeQL code scanning, which also runs weekly

Run the same checks locally before opening a pull request:

```bash
pnpm install --frozen-lockfile
pnpm test:prettier && pnpm test:lint && pnpm test:tsc && pnpm test && pnpm build
```

The repository admin can comment `/review` on a pull request to get an AI code review from an [OpenRouter](https://openrouter.ai) model. It uses the free `nvidia/nemotron-3-ultra-550b-a55b:free` model unless the `OPENROUTER_MODEL` repository variable names another one, and requests to paid models are billed to the OpenRouter account that owns the `OPENROUTER_API_KEY` secret. Any text after the command is passed to the reviewer as extra instructions, for example `/review focus on attachment handling`. The review is posted as one comment, which later runs update in place. Findings that point at a line shown in the diff are also posted as inline comments, and a later run replaces them unless someone has replied.
