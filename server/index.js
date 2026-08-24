/**
 * HTTP 層。Cloud Run はここを起動する。
 * 判定そのものは持たず、フリートを呼んで結果を返すだけに留める。
 */

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFleet } from '../agents/run.js';
import { autoLlm } from '../agents/llm.js';
import { WORKLOAD_LIST } from '../core/workloads.js';
import { MODEL_ID } from '../agents/config.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, '..');

// .env があれば読む。無くてもモックで動くので、存在しないことは失敗ではない。
// （Cloud Run では .env を置かず、環境変数を直接渡す）
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* 無ければ何もしない */ }

const parts = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'parts.json'), 'utf8'));

/**
 * 自己検証の項目数はソースから数える。
 * 画面に出す数字を手で書くと、テストを増やしたときに黙って古くなる（実際に一度そうなった）。
 */
const SELFTEST_COUNT = (() => {
  try {
    const src = fs.readFileSync(path.join(ROOT, 'core', 'selftest.js'), 'utf8');
    return (src.match(/^\s*check\(/gm) ?? []).length;
  } catch { return null; }
})();

const app = express();
// 画像を base64 で受けるので既定の 100kb では足りない。
// 画面は最大4枚を送り、送る前に長辺2560pxのJPEGへ落としている（1枚1MB弱）。
// 上限はその4枚が確実に通る側に置く。
app.use(express.json({ limit: '20mb' }));

// 静的配信は web/ の中だけに限定する（ルート直下を配ると設定ファイルまで出る）
app.use(express.static(path.join(ROOT, 'web')));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    model: MODEL_ID,
    llm: process.env.GEMINI_API_KEY ? 'gemini' : 'mock',
    selftest: SELFTEST_COUNT,
    data: { cpus: parts.cpus.length, gpus: parts.gpus.length, builtAt: parts.meta.builtAt },
  });
});

/** 画面が用途一覧を出すために使う */
app.get('/api/workloads', (_req, res) => {
  res.json(WORKLOAD_LIST.map(w => ({
    id: w.id, label: w.label, note: w.note,
  })));
});

/** 型番の候補を返す（手入力の補助） */
app.get('/api/parts', (req, res) => {
  const q = String(req.query.q ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 64);
  const kind = req.query.kind === 'gpu' ? 'gpus' : 'cpus';
  if (!q) return res.json([]);
  // 並びはPassMarkの提出数（＝実際に世の中にある数）。ファイル順のままだと、
  // 誰も持っていない組み込み向けの型番が、その人が実際に持っている主流品を
  // 12件の枠から押し出してしまう。
  const hits = parts[kind]
    .filter(p => (p.aliases ?? []).some(a => a.includes(q)))
    .sort((a, b) => (b.samples ?? 0) - (a.samples ?? 0))
    .slice(0, 12)
    .map(p => ({ name: p.name, fullName: p.fullName, score: p.score, win11: p.win11, year: p.year }));
  res.json(hits);
});

app.post('/api/judge', async (req, res) => {
  const started = Date.now();
  try {
    const input = req.body ?? {};
    const result = await runFleet(input, {
      llm: autoLlm({ quiet: true }),
      parts,
      win11Data: parts.win11,
      prices: parts.prices,
      usedMachineYen: parts.prices.usedMachineYen,
      reference: parts.reference,
      market: input.market ?? null,
    });
    res.json({ ...result, elapsedMs: Date.now() - started });
  } catch (e) {
    console.error('[judge]', e);
    res.status(500).json({ error: e.message });
  }
});

// 壊れたリクエスト（JSONの構文エラー・12MB超の画像など）にHTMLのスタックトレースを
// 返さない。フロントはJSONを期待しているので、読める言葉のJSONで返す。
app.use((err, _req, res, _next) => {
  const status = err.type === 'entity.too.large' ? 413 : 400;
  const message = err.type === 'entity.too.large'
    ? 'The images are too large (20MB limit). Send fewer of them, or shrink the photos first.'
    : 'The request could not be read. Reload the page and try again.';
  console.error('[request-error]', err.type ?? err.message);
  res.status(status).json({ error: message });
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`MOTTAINAI listening on :${port}`);
  console.log(`  model=${MODEL_ID} llm=${process.env.GEMINI_API_KEY ? 'gemini' : 'mock'}`);
  console.log(`  data: CPU ${parts.cpus.length} / GPU ${parts.gpus.length}`);
});
