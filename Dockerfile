# Cloud Run 用。ソースから直接ビルドするので、置いてあるだけで gcloud が拾う。
FROM node:22-slim

WORKDIR /app

# 依存だけ先に入れる（コードを変えてもここのレイヤーが再利用される）
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# ビルド時に判定ロジックの自己検証を通す。ここで落ちれば壊れたものが公開されない。
# parts.json はコミット済みの正本をそのまま使う。作り直し（build_parts.js）は
# data/vendor/ の生ダンプが要るが、あれは配布しないと決めたので
# このビルドはリポジトリにある物だけで完結させる（=誰がcloneしても同じに作れる）。
RUN node core/selftest.js

# Cloud Run は PORT を渡してくる
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server/index.js"]
