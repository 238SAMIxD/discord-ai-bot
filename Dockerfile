FROM node:20

COPY . .
RUN npm i --omit=dev --no-package-lock
RUN npm run build
USER node

CMD ["npm","start"]