/**
 * research_raw.json（調査の生データ）→ parts.json（判定エンジンが引く形）
 *
 * 変換だけを行い、数字は一切作らない。生データに無い値は null のまま通す。
 * 実行: node data/build_parts.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(fs.readFileSync(path.join(DIR, 'research_raw.json'), 'utf8'));

/** 検索用の正規化キー。型番のゆらぎ（空白・ハイフン・大小）を吸収する */
const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const cpus = (raw.cpus ?? []).map(c => ({
  name: c.model,
  fullName: c.passmark_name ?? c.model,
  vendor: c.vendor ?? null,
  score: c.cpu_mark ?? null,           // 判定に使う総合スコア
  singleThread: c.single_thread_mark ?? null,
  cores: c.cores ?? null,
  threads: c.threads ?? null,
  tdp: c.tdp_w ?? null,
  formFactor: c.form_factor ?? null,
  generation: c.generation ?? null,
  win11: c.win11_supported ?? null,
  year: c.release_year ?? null,
  source: c.source ?? null,
  // 別名でも引けるようにしておく（"Core i5-7500" と "i5-7500" の両方）
  aliases: [c.model, c.passmark_name, `Core ${c.model}`, `${c.vendor} ${c.model}`]
    .filter(Boolean).map(norm),
}));

const gpus = (raw.gpus ?? []).map(g => ({
  name: g.model,
  fullName: g.passmark_name ?? g.model,
  vendor: g.vendor ?? null,
  score: g.g3d_mark ?? null,
  vram: g.vram_gb ?? null,
  tdp: g.tdp_w ?? null,
  integrated: g.type === 'integrated',
  year: g.release_year ?? null,
  source: g.source ?? null,
  aliases: [g.model, g.passmark_name, `${g.vendor} ${g.model}`]
    .filter(Boolean).map(norm),
}));

/** "500GB" / "1TB" → GB数。読めないものは null で落とす。 */
function capacityGb(s) {
  const t = String(s ?? '');
  const tb = t.match(/([\d.]+)\s?TB/i);
  if (tb) return Math.round(parseFloat(tb[1]) * 1024);
  const gb = t.match(/([\d.]+)\s?GB/i);
  return gb ? Math.round(parseFloat(gb[1])) : null;
}

/**
 * ストレージは「容量ごとの選択肢の一覧」として持つ。
 * 判定側が用途に足りる最小容量を選べるようにするため。
 * 1TBのHDDを1TBのSSDで置き換えるのは同型の置換であって、必要量ではない。
 *
 * 価格は price_typical_jpy を優先する。price_low_jpy は日替わり特価が混じるため、
 * 「その値段で買える」と言い切れない（生データの注記にもその旨がある）。
 */
/**
 * 値段の根拠を必ず一緒に持つ。代表値があればそれ、無ければ最安値を使い、
 * どちらを見たのかを basis に残す。「その値段で買える」と言い切れるかが変わるため。
 */
function priceOf(x) {
  if (x.price_typical_jpy != null) return { yen: x.price_typical_jpy, basis: 'typical' };
  if (x.price_low_jpy != null)     return { yen: x.price_low_jpy,     basis: 'low' };
  return null;
}

/**
 * 調査側が信頼度に疑いを付けた行を見分ける。
 *
 * 実例：ノート用DDR4 8GBの4,980円は「2018年登録のバルク品で2026年の相場と不整合」と
 * 生データ側に警告が書かれていた。これを黙って採用すると、
 * 「この値段で買える」と言えないものを答えとして出すことになる。
 * この道具は金額を根拠に「買うな」と言うので、そこが崩れると存在意義ごと消える。
 */
function isLowConfidence(x) {
  const t = `${x.note ?? ''} ${x.confidence ?? ''}`;
  return /LOW CONFIDENCE|信頼度低|要裏取り|DO NOT SHIP/i.test(t);
}

const storageOptions = (raw.prices?.storage ?? [])
  .filter(x => /SSD/i.test(x.type ?? ''))
  .map(x => {
    const p = priceOf(x);
    return p && {
      type: /NVMe/i.test(x.type) ? 'nvme' : 'ssd',
      label: `${x.type} ${x.capacity}`,
      gb: capacityGb(x.capacity),
      yen: p.yen, basis: p.basis,
      lowConfidence: isLowConfidence(x),
      source: x.source ?? null,
      note: x.note ?? null,
    };
  })
  .filter(x => x && x.gb != null)
  .sort((a, b) => a.yen - b.yen);

/** メモリも同じ考え方で一覧にする */
const memoryOptions = (raw.prices?.memory ?? [])
  .map(x => {
    const p = priceOf(x);
    return p && {
      label: `${x.type} ${x.capacity}`,
      gb: capacityGb(x.capacity),
      yen: p.yen, basis: p.basis,
      lowConfidence: isLowConfidence(x),
      source: x.source ?? null,
      note: x.note ?? null,
    };
  })
  .filter(x => x && x.gb != null)
  .sort((a, b) => a.yen - b.yen);

/**
 * 機体そのものの相場。「その増設、機体ごと買うのと同じ額では?」を言うための基準。
 * 中古Win11ノートの代表値を使う（一番安く「Win11で動く機体」が手に入る線）
 */
const wholePc = (raw.prices?.whole_pc ?? []).map(x => {
  const p = priceOf(x);
  return p && { type: x.type, yen: p.yen, basis: p.basis, low: x.price_low_jpy ?? null,
                source: x.source ?? null, note: x.note ?? null };
}).filter(Boolean);

const usedWin11 = wholePc.find(x => /used/i.test(x.type) && /laptop/i.test(x.type))
              ?? wholePc.find(x => /used/i.test(x.type));

const prices = {
  storage: storageOptions,
  memory: memoryOptions,
  wholePc,
  usedMachineYen: usedWin11?.yen ?? null,
  usedMachineNote: usedWin11 ? `${usedWin11.type}の代表値` : null,
  _currency: raw.prices?.currency ?? 'JPY',
  _observed: raw.prices?.observed ?? null,
  _caveat: raw.prices?.caveat ?? null,
};

const out = {
  meta: {
    builtFrom: 'research_raw.json',
    builtAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    cpuCount: cpus.length,
    gpuCount: gpus.length,
    note: '数値は調査の生データをそのまま移送したもの。このスクリプトは値を作らない。',
  },
  win11: raw.win11 ?? null,
  cpus,
  gpus,
  prices,
  sources: raw.sources ?? [],
};

fs.writeFileSync(path.join(DIR, 'parts.json'), JSON.stringify(out, null, 1), 'utf8');

const withScore = cpus.filter(c => c.score != null).length;
const gWithScore = gpus.filter(g => g.score != null).length;
const igpu = gpus.filter(g => g.integrated).length;
console.log(`parts.json 生成`);
console.log(`  CPU ${cpus.length}件（スコアあり ${withScore}）`);
console.log(`  GPU ${gpus.length}件（スコアあり ${gWithScore} / 内蔵 ${igpu}）`);
console.log(`  ストレージ候補 ${storageOptions.length}件: ${storageOptions.map(o => `${o.gb}GB/${o.yen.toLocaleString()}円`).join(', ') || 'なし'}`);
console.log(`  メモリ候補 ${memoryOptions.length}件: ${memoryOptions.map(o => `${o.gb}GB/${o.yen.toLocaleString()}円`).join(', ') || 'なし'}`);
