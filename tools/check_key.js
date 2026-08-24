/**
 * APIキーの実地確認。
 *
 * 「入れたつもり」で動かないのが一番時間を食うので、
 *   ①キーが読めているか ②要件のモデルが実在するか ③実際に応答が返るか ④画像も通るか
 * を順に確かめて、どこで止まったかを日本語で言う。
 *
 * 実行: node tools/check_key.js
 * 呼ぶAPIは無料枠のモデルのみ。課金は発生しない。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL_ID, LIST_MODELS_URL } from '../agents/config.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* 無ければ環境変数を見る */ }

const key = process.env.GEMINI_API_KEY?.trim();

function die(msg, hint) {
  console.log(`\n❌ ${msg}`);
  if (hint) console.log(`   → ${hint}`);
  process.exit(1);
}

console.log('Gemini APIキーの確認\n' + '─'.repeat(46));

// ---- ① キーが読めているか ----
if (!key) {
  die('キーが読めていない。',
      `${path.join(ROOT, '.env')} の GEMINI_API_KEY= の後ろに貼って保存する。`);
}
if (key.includes('"') || key.includes("'") || key.includes(' ')) {
  die('キーに引用符かスペースが混ざっている。',
      '「GEMINI_API_KEY=AIza...」の形で、記号を付けずに貼り直す。');
}
console.log(`① キーは読めている（${key.slice(0, 6)}…${key.slice(-4)} / ${key.length}文字）`);

// ---- ② 要件のモデルが実在するか ----
let models;
try {
  const res = await fetch(`${LIST_MODELS_URL}?pageSize=1000`, {
    headers: { 'x-goog-api-key': key },
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 400 && /API key not valid/i.test(body)) {
      die('キーが有効でない（API key not valid）。',
          'コピー漏れがないか確認する。新しいキーは aistudio.google.com/apikey で作れる。');
    }
    if (res.status === 403) {
      die('キーは通ったが権限で弾かれた（403）。',
          'そのキーのプロジェクトで Generative Language API が有効か確認する。');
    }
    die(`モデル一覧が取れなかった（HTTP ${res.status}）。`, body.slice(0, 300));
  }
  models = (await res.json()).models ?? [];
} catch (e) {
  die(`通信に失敗した: ${e.message}`, 'ネットワークかプロキシを確認する。');
}

const names = models.map(m => m.name.replace(/^models\//, ''));
console.log(`② 使えるモデル ${names.length}件`);

if (!names.includes(MODEL_ID)) {
  const flash = names.filter(n => /^gemini-3\.[5-9]/.test(n)).slice(0, 8);
  console.log(`\n⚠ 要件のモデル ${MODEL_ID} がこのキーで見えない。`);
  console.log(`   このキーで使える 3.5以降のモデル: ${flash.join(', ') || '（見つからない）'}`);
  console.log(`   → agents/config.js の MODEL_ID を上のどれかに変える必要がある。`);
} else {
  console.log(`   要件のモデル ${MODEL_ID} は使える`);
}

// ---- ③ 実際に応答が返るか ----
const { geminiLlm } = await import('../agents/llm.js');
const llm = geminiLlm(key);
try {
  const t0 = Date.now();
  const out = await llm.text('Reply with exactly: OK');
  console.log(`③ 応答あり（${Date.now() - t0}ms）: "${out.slice(0, 40)}"`);
} catch (e) {
  if (/quota|rate|429/i.test(e.message)) {
    die('レート上限に当たった。', 'aistudio.google.com/rate-limit で自分の上限を確認する。');
  }
  die(`呼び出しに失敗した: ${e.message}`);
}

// ---- ④ 画像入力が通るか（写真読み取りに必須） ----
// 1x1の白いPNG。中身を読ませるのではなく、画像付きの経路が通るかだけを見る。
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
try {
  const t0 = Date.now();
  await llm.visionJson('What color is this image? Return {"color":"<name>"}', PIXEL, 'image/png');
  console.log(`④ 画像入力も通る（${Date.now() - t0}ms）`);
} catch (e) {
  console.log(`\n⚠ 画像入力で失敗した: ${e.message}`);
  console.log('   → 文字だけなら動く。写真からの読み取りだけが使えない状態。');
}

console.log('─'.repeat(46));
console.log('✅ 使える状態。 npm start でサーバーを上げれば、写真読み取りと説明文が本物になる。\n');
