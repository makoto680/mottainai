/**
 * モデル層
 *
 * 呼び出し側から見た形を1つに固定し、実体を差し替えられるようにしてある。
 *   - gemini : 本番（Gemini API・Interactions形式）
 *   - mock   : APIキー無しで全経路を通すためのもの。返す値は固定で、推論はしない
 *
 * 差し替え可能にしている理由は2つ。キーが無い環境でもワークフロー全体を検証できること。
 * そして STACK.md の退避経路（ADKで詰まったらGenAI SDK単体に落とす）を、
 * この1ファイルの差し替えだけで済ませられるようにしておくこと。
 */

import { MODEL_ID } from './config.js';

/** JSONで答えさせたい時に使う共通の縛り。モデルは前置きを付けたがるので明示的に禁じる。 */
const JSON_RULE =
  'Reply with a single JSON object and nothing else. ' +
  'No prose, no markdown fence, no explanation before or after.';

function extractJson(text) {
  if (!text) throw new Error('モデルの返答が空');
  // ```json ... ``` で包まれてきた場合に備える
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error(`JSONが見つからない: ${body.slice(0, 200)}`);
  return JSON.parse(body.slice(start, end + 1));
}

/** 本番：Gemini API */
export function geminiLlm(apiKey) {
  if (!apiKey) throw new Error('GEMINI_API_KEY が無い');
  let client;

  async function getClient() {
    if (!client) {
      const { GoogleGenAI } = await import('@google/genai');
      client = new GoogleGenAI({ apiKey });
    }
    return client;
  }

  async function call(input) {
    const ai = await getClient();
    const res = await ai.interactions.create({ model: MODEL_ID, input });
    return res.output_text ?? '';
  }

  return {
    id: `gemini:${MODEL_ID}`,

    /** テキストからJSONを得る */
    async json(prompt) {
      return extractJson(await call(`${prompt}\n\n${JSON_RULE}`));
    },

    /**
     * 画像＋テキストからJSONを得る（画像はbase64のdataURLでもrawでも受ける）
     *
     * Interactions API の入力は {type,...} のブロックを並べる形。
     * 旧 generateContent の {role, parts:[{inlineData}]} を渡すと
     * 400 Unknown parameter 'parts' で弾かれる（実測）。
     */
    async visionJson(prompt, imageBase64, mimeType = 'image/jpeg') {
      const data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
      const input = [
        { type: 'image', data, mime_type: mimeType },
        { type: 'text', text: `${prompt}\n\n${JSON_RULE}` },
      ];
      return extractJson(await call(input));
    },

    /** 素のテキストを得る（説明文の生成用） */
    async text(prompt) {
      return (await call(prompt)).trim();
    },
  };
}

/**
 * 検証用。APIキー無しでワークフローの配線を確かめるためだけのもの。
 * 「それらしい嘘」を返すと検証にならないので、必ず mocked:true を混ぜて
 * 本物の推論結果と取り違えられないようにする。
 */
export function mockLlm(fixtures = {}) {
  return {
    id: 'mock',
    async json(prompt) {
      if (prompt.includes('workload')) {
        return fixtures.workload ?? { workloads: ['office'], confidence: 'mock', mocked: true };
      }
      return fixtures.json ?? { mocked: true };
    },
    async visionJson() {
      return fixtures.scan ?? {
        mocked: true,
        cpu: { name: 'TEST-CPU', confidence: 'mock' },
        gpu: { name: 'integrated', confidence: 'mock' },
        ramGB: 8,
        storage: { type: 'hdd', gb: 1000 },
        unreadable: [],
      };
    },
    async text() {
      return fixtures.text ?? '[mock] 検証用の固定文。実際の推論はしていない。';
    },
  };
}

/** 環境変数があれば本番、無ければモック。どちらを使ったかは必ずログに出す。 */
export function autoLlm({ quiet = false } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (key) {
    if (!quiet) console.log(`[llm] Gemini (${MODEL_ID})`);
    return geminiLlm(key);
  }
  if (!quiet) console.log('[llm] モック（GEMINI_API_KEY が未設定のため、推論はしていない）');
  return mockLlm();
}
