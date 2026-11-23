# TERRANOVA multiplayerserver (prototype). Bouwen: docker compose -f docker-compose.multiplayer.yml build
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY protocol.mjs mp-server.mjs ./
# niet als root draaien; gegevens (bouwacties per wereld, back-ups) in /data
RUN mkdir -p /data && chown node:node /data
USER node
ENV MP_PORT=8787 MP_HOST=0.0.0.0 MP_DATA=/data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8787/health || exit 1
CMD ["node", "mp-server.mjs"]
