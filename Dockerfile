# Cloud Run 用。ソースから直接ビルドするので、置いてあるだけで gcloud が拾う。
FROM node:22-slim

WORKDIR /app

# 依存だけ先に入れる（コードを変えてもここのレイヤーが再利用される）
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# ビルド時にデータを作り直し、判定ロジックの自己検証を通す。
# ここで落ちれば壊れたものが公開されない。
RUN node data/build_parts.js && node core/selftest.js

# Cloud Run は PORT を渡してくる
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server/index.js"]
