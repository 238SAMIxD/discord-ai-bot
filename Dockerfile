FROM node:20

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY . .
RUN pnpm i
RUN pnpm run build
USER node

CMD ["node","./dist/index.js"]