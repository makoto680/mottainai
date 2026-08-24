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

const app = express();
// 画像を base64 で受けるので既定の 100kb では足りない
app.use(express.json({ limit: '12mb' }));

// 静的配信は web/ の中だけに限定する（ルート直下を配ると設定ファイルまで出る）
app.use(express.static(path.join(ROOT, 'web')));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    model: MODEL_ID,
    llm: process.env.GEMINI_API_KEY ? 'gemini' : 'mock',
    data: { cpus: parts.cpus.length, gpus: parts.gpus.length, builtAt: parts.meta.builtAt },
  });
});

/** 画面が用途一覧を出すために使う */
app.get('/api/workloads', (_req, res) => {
  res.json(WORKLOAD_LIST.map(w => ({
    id: w.id, label: w.label, labelEn: w.labelEn, note: w.note,
  })));
});

/** 型番の候補を返す（手入力の補助） */
app.get('/api/parts', (req, res) => {
  const q = String(req.query.q ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const kind = req.query.kind === 'gpu' ? 'gpus' : 'cpus';
  if (!q) return res.json([]);
  const hits = parts[kind]
    .filter(p => (p.aliases ?? []).some(a => a.includes(q)))
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
      market: input.market ?? null,
    });
    res.json({ ...result, elapsedMs: Date.now() - started });
  } catch (e) {
    console.error('[judge]', e);
    res.status(500).json({ error: e.message });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`MOTTAINAI listening on :${port}`);
  console.log(`  model=${MODEL_ID} llm=${process.env.GEMINI_API_KEY ? 'gemini' : 'mock'}`);
  console.log(`  data: CPU ${parts.cpus.length} / GPU ${parts.gpus.length}`);
});
