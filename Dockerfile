# Image unique : construit le site puis le sert avec l'API (Express) sur $PORT
FROM node:24-slim
WORKDIR /srv
COPY kit ./kit
COPY app/package.json app/package-lock.json ./app/
RUN cd app && npm ci --no-audit --no-fund
COPY app ./app
RUN cd app && npm run build
WORKDIR /srv/app
ENV NODE_ENV=production PORT=5000
EXPOSE 5000
CMD ["npx", "tsx", "server/index.ts"]
