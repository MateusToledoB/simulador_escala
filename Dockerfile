# Um container com o site (Next, porta $PORT, padrão 3000) e a API (FastAPI, só interna em 127.0.0.1:8000).
# O Next repassa /api/* para a API (apps/web/next.config.mjs).

FROM node:22-bookworm-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci
COPY apps/web apps/web
RUN npm run build -w apps/web

FROM python:3.12-slim-bookworm
COPY --from=web /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY apps/api/requirements.txt apps/api/
RUN pip install --no-cache-dir -r apps/api/requirements.txt
COPY apps/api apps/api
COPY --from=web /app/node_modules node_modules
COPY --from=web /app/apps/web apps/web
COPY start.sh .

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["sh", "start.sh"]
