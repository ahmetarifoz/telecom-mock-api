FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node server.js index.html AGENT_API_CHAINS.md ./

USER node

EXPOSE 3000

CMD ["node", "server.js"]
