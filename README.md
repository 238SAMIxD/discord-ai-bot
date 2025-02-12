<div align="center">
   <h1>Discord AI Bot</h1>
   <h2>Repository is now in maintanance mode - rewriting project to Typescript</h2>
   <h3 align="center">Discord bot to interact with <a href="https://github.com/jmorganca/ollama">Ollama</a> and <a href="https://github.com/AUTOMATIC1111/stable-diffusion-webui">AUTOMATIC1111 Stable Diffusion</a> as a chatbot</h3>
   <img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/238samixd/discord-ai-bot?style=social">
</div>

The project started thanks to [mekb](https://github.com/mekb-turtle).

## Roadmap

- Rewrite old options to work with the new codebase
- Add message history (storing, clearing)
- Setup channels ids to allow the bot only in specific channels
- Implement multiple servers support (copying commands?)
- Check (and fix if necessary) `Dockerfile` and `docker-compose` setup
- Review installation and usage instructions
- Create docs with examples for the bot
- Handle text attachments
- Handle image attachments (only working with vision models)
- Add slow mode option to prevent spam and GPU overload
- Write unit tests
- Create a RAG to extract information from _PDFs_ and/or docs
- Implement [OpenWebUI](https://github.com/open-webui/open-webui) interactions (web search, youtube loader)
- ? Implement [fabric](https://github.com/danielmiessler/fabric) integration (patterns, youtube video extraction if needed)
- Fix streaming issues `/chat ... stream: True`

### Set-up instructions (TO BE REVIEWED)

1. Install [Node.js](https://nodejs.org) (if you have a package manager, use that instead to install this)
   - Make sure to install at least v18 of Node.js (v20+ recommended)
2. Install [Ollama](https://github.com/ollama/ollama)
3. Pull (download) a model, `ollama pull MODEL` e.g `ollama pull llama3.1` - [Model list](https://ollama.com/search)
4. Start Ollama by running `ollama serve` if not already running
5. [Create a Discord bot](https://discord.com/developers/applications)
   - Under Application » Bot
     - Enable Message Content Intent
     - Enable Server Members Intent (for replacing user mentions with the username)
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
   - Set the channels to the channel ID, comma separated
     1. In Discord, go to User Settings » Advanced, and enable Developer Mode
     2. Right click on a channel you want to use, and click Copy Channel ID
   - You can edit the system message the bot uses, or disable it entirely
8. Install the required dependencies with `npm i`
9. Start the bot with `npm start`
10. You can interact with the bot by @mentioning it with your message
11. Install [Stable Diffusion](https://github.com/AUTOMATIC1111/stable-diffusion-webui)
12. Run the script `./webui.sh --api --listen`

### Set-up instructions with Docker (TO BE CHECKED)

1. Install [Docker](https://docs.docker.com/get-docker/)
   - Should be atleast compatible with version 3 of compose (docker engine 1.13.0+)
2. Repeat steps 2—7 from the other setup instructions
3. Start the bot with `make compose-up` if you have Make installed
   - Otherwise, try `docker compose -p discord-ai up` instead
4. You can interact with the bot by @mentioning it with your message
