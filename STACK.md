# STACK — 確定した技術選択と根拠

公式ドキュメントで実地確認したもののみ記載（2026-08-24 確認）。
このファミリーはモデル名が頻繁に改名・廃止されるため、記憶で書かず必ず出典を残す。

## 採用構成

| ハッカソン要件 | 採用 | 根拠 |
|---|---|---|
| Gemini 3.5 以降 | **`gemini-3.7-flash`** | 無料枠あり・画像入力対応。[モデル一覧](https://ai.google.dev/gemini-api/docs/models) / [価格](https://ai.google.dev/gemini-api/docs/pricing) |
| Google エージェントフレームワーク | **Google ADK (TypeScript)** `@google/adk` | [ADK TS入門](https://adk.dev/get-started/typescript/) |
| Google Cloud インフラ | **Cloud Run** | [デプロイ手順](https://adk.dev/deploy/cloud-run/) |
| ホスト済みURL | Cloud Run のURL（`--with_ui`） | 同上 |

## モデルIDの落とし穴（重要）

要件は「Gemini **3.5** 以降」。`gemini-3.1-*` や `gemini-3-*` は**ブランド上は新しく見えても数字が 3.5 未満**で、
審査で要件未達と読まれる余地がある。

- ✅ 使う: **`gemini-3.7-flash`**（明示指定）
- ❌ 使わない: `gemini-flash-latest` 等のエイリアス（提出時にどのモデルを使ったか証明できない）
- ❌ 使わない: `gemini-3.1-*`, `gemini-3-*`（数字が 3.5 未満）
- ❌ 使わない: Pro 系（無料枠なし）

## API 形式の落とし穴

Gemini 3 世代から **Interactions API** が正式版になった。古い `generateContent` 形式のサンプルを
持ってくると動かない。

```javascript
import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({});              // GEMINI_API_KEY を環境変数から自動取得
const r = await ai.interactions.create({
  model: "gemini-3.7-flash",
  input: "...",
});
console.log(r.output_text);
```

出典: [Gemini 3 developer guide](https://ai.google.dev/gemini-api/docs/gemini-3) / [quickstart](https://ai.google.dev/gemini-api/docs/quickstart)

## 費用（実質0円で完走できる）

| 項目 | 無料枠 | 今回の使用量 | 実費 |
|---|---|---|---|
| Gemini API（Flash系） | 入出力とも無料・**画像入力も無料** | デモと開発の数百回 | **0円** |
| Cloud Run リクエスト | 200万/月 | 数百〜数千 | **0円** |
| Cloud Run CPU | 180,000 vCPU秒/月 | 1回2秒として9万回分 | **0円** |
| Cloud Run メモリ | 360,000 GB秒/月 | 同上 | **0円** |
| Cloud Build | 2,500ビルド分/月 | 数十回 | **0円** |
| Artifact Registry | 0.5GB/月 | 古いイメージを消せば収まる | **0円** |

出典: [無料枠の一次情報](https://docs.cloud.google.com/free/docs/free-cloud-features) / [Gemini価格](https://ai.google.dev/gemini-api/docs/pricing)

**注意点**
- GCPの新規$300クレジットは**Gemini APIには効かない**（対象外プロダクトと明記）。Gemini側は無料枠に収める前提で設計する。
- 無料トライアルは**支払い方法の登録が必須**（本人確認用。トライアル中は課金されず、手動でアップグレードしない限り課金に移行しない）。
- Artifact Registry は古いリビジョンのイメージが溜まると 0.5GB を超えるので、デプロイのたびに古いものを消す。

## レート制限（未確認・着手初日に実測すること）

公式は2026年版で数値テーブルを廃止し、[AI Studio の画面](https://aistudio.google.com/rate-limit)で
各自の実数を見る方式に変わった。過去の値（Flash系で 10 RPM / 250 RPD 前後）は**現在の値として引用しない**。
→ キーを入れたら最初に実数を確認し、デモが上限に当たらないか確かめる。

## デプロイ手順（確定）

```bash
# 1. gcloud CLI（Windows）
#    https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe

# 2. 初期設定
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
gcloud config set run/region us-central1

# 3. デプロイ（UI付きの公開URLがそのまま手に入る）
npx adk deploy cloud_run \
  --project=$GOOGLE_CLOUD_PROJECT \
  --region=us-central1 \
  --service_name=mottainai \
  --with_ui
```

## 退避経路（ADKで詰まった場合）

ADK の TypeScript 版は Python 版より新しく、非公式の情報が少ない。
そのため**モデル呼び出し層は `@google/genai` で直接書ける形に切り出しておく**。

要件は「ADK 必須」ではなく「ADK / GenAI SDK / Antigravity SDK / GenKit のいずれか1つ」なので、
最悪 Express + `@google/genai` に差し替えれば **GenAI SDK** として要件を満たせる。
この逃げ道があるので ADK に賭けてよい。

## 環境（実測）

- Node.js v24.13.0 / npm 11.6.2 — ADK TypeScript の要件を満たす
- gcloud CLI — **未インストール**（デプロイ前に導入が必要）
