/**
 * モデルIDはここ1箇所だけで持つ。
 *
 * 理由は2つ。この系統はモデル名が改名・廃止されるので散らすと事故ること（過去に実際に踏んだ）。
 * そしてハッカソン要件が「Gemini 3.5 以降」なので、どのモデルを使ったかを1箇所で証明できること。
 *
 * ⚠ エイリアス（gemini-flash-latest 等）を使わない。提出時にどのモデルで動かしたか示せなくなる。
 * ⚠ gemini-3.1-* / gemini-3-* は数字が 3.5 未満なので要件を満たさない読み方ができる。使わない。
 * 出典: https://ai.google.dev/gemini-api/docs/models
 */
export const MODEL_ID = 'gemini-3.7-flash';

/** 利用可能なモデルを実地確認するためのエンドポイント（キーはヘッダで渡す） */
export const LIST_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
