# Landing page

The landing page for Discord AI Bot. It is built with Vite, React, TypeScript and Tailwind CSS, prerendered to static HTML and hosted on Cloudflare Pages.

The site is a separate pnpm project. It has its own lockfile and is not part of the bot's workspace, so installing the bot never installs the site's dependencies.

## Commands

Run these in `site/`:

| Command              | What it does                                             |
| -------------------- | -------------------------------------------------------- |
| `pnpm install`       | Installs the site's dependencies                         |
| `pnpm dev`           | Starts the dev server on http://localhost:5173           |
| `pnpm build`         | Type-checks, builds and prerenders the page into `dist/` |
| `pnpm preview`       | Serves `dist/` on http://localhost:4173                  |
| `pnpm test:prettier` | Checks formatting                                        |
| `pnpm test:lint`     | Lints with oxlint                                        |
| `pnpm test:tsc`      | Type-checks                                              |
| `pnpm prettier`      | Formats every file                                       |

## How the build works

1. `vite build` bundles the browser code into `dist/`.
2. `vite build --ssr src/entry-server.tsx` builds a server copy of the page into `dist-ssr/`.
3. `scripts/prerender.mjs` renders the page to HTML, writes it into `dist/index.html` and deletes `dist-ssr/`.

The browser then hydrates the prerendered HTML, so the content, search engines and first paint don't wait for JavaScript.

## Design

The page follows screens that were designed and approved in Google Stitch: desktop and mobile, each in light and dark. The Stitch project ID is `12002179735415995189`.

- **Colours:** semantic tokens in `src/index.css`. They switch with the visitor's `prefers-color-scheme` setting, and every text colour meets WCAG AA on the surfaces it is used on.
- **Fonts:** Geist and JetBrains Mono, self-hosted through Fontsource.
- **Icons:** Material Symbols path data (Apache-2.0) in `src/components/icons.ts`, drawn as inline SVG.

## Content

The copy lives in `src/content/`. Check it against the bot's code before changing it:

- Commands come from `src/commands/*.ts`.
- Features are described in the main README.

Keep these in mind:

- There is no hosted bot to invite.
- The only backends are Ollama and AUTOMATIC1111.
- Streaming is experimental.

## Deployment

Cloudflare Pages builds this folder from `main` and creates a preview deployment for each pull request. The project uses these settings:

- Root directory: `site`
- Build command: `pnpm build`
- Output directory: `dist`
- Environment variables: `NODE_VERSION=24` and `PNPM_VERSION=12.16.1`
- Build watch path: `site/*`

Security and cache headers are set in `public/_headers`.
