# LLM proxy image (D-031). No dependencies: node:http + fetch.
FROM node:24.13.0-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY llm-proxy ./llm-proxy
USER node
EXPOSE 8090
HEALTHCHECK --interval=10s --timeout=3s --retries=6 CMD wget -qO- http://localhost:8090/health >/dev/null || exit 1
CMD ["node", "llm-proxy/server.js"]
