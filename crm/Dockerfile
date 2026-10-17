# Mock CRM image. Build context is the repo root (it shares src/, contracts/ and config/jobs/).
FROM node:24.13.0-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY crm ./crm
COPY src ./src
COPY contracts ./contracts
COPY config/jobs ./config/jobs
RUN mkdir -p /app/crm/data && chown node:node /app/crm/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=6 CMD wget -qO- http://localhost:3000/health >/dev/null || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "crm/server.js"]
