/**
 * research_raw.json（調査の生データ）→ parts.json（判定エンジンが引く形）
 *
 * 変換だけを行い、数字は一切作らない。生データに無い値は null のまま通す。
 * 実行: node data/build_parts.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { win11Support, LIST_SOURCES } from './win11_match.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const VENDOR = path.join(DIR, 'vendor');
const raw = JSON.parse(fs.readFileSync(path.join(DIR, 'research_raw.json'), 'utf8'));

/** 検索用の正規化キー。型番のゆらぎ（空白・ハイフン・大小）を吸収する */
const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * 部品表はPassMarkの全件データから作る。
 *
 * 手で選んだ125件では、素人が「このPC遅い」と悩んでいる機体が1件も引けなかった。
 * Celeron・Pentium・Atom・Athlonが丸ごとゼロで、そこは安いノートの主戦場にあたる。
 * 引けない型番は「判定できない」ではなく「この道具は使えない」と同じ意味になる。
 */
const vendorCpu = JSON.parse(fs.readFileSync(path.join(VENDOR, 'passmark_cpu_full.json'), 'utf8')).data;
const vendorGpu = JSON.parse(fs.readFileSync(path.join(VENDOR, 'passmark_gpu_full.json'), 'utf8')).data;

const CPU_SOURCE = 'https://www.cpubenchmark.net/CPU_mega_page.html';
const GPU_SOURCE = 'https://www.videocardbenchmark.net/GPU_mega_page.html';

/** "5,784" → 5784。読めないもの（"NA"）は null で落とす。 */
const num = s => {
  const n = Number(String(s ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
};
const yearOf = d => { const m = String(d ?? '').match(/\b(\d{4})\b/); return m ? Number(m[1]) : null; };
const textOr = s => (s == null || String(s).trim() === '' || String(s).trim() === 'NA') ? null : String(s).trim();

const vendorOf = name =>
  /\bamd\b|ryzen|athlon|epyc|threadripper/i.test(name) ? 'AMD'
  : /\bintel\b|celeron|pentium|atom|xeon|core\s*i[3579]/i.test(name) ? 'Intel'
  : /qualcomm|snapdragon/i.test(name) ? 'Qualcomm'
  : /nvidia|geforce|quadro/i.test(name) ? 'NVIDIA'
  : /radeon/i.test(name) ? 'AMD'
  : null;

/** "Intel Core i5-8250U @ 1.60GHz" → "i5-8250U"。人が口にする形に寄せる。 */
function shortName(full) {
  return String(full)
    .replace(/@.*$/, '')
    .replace(/^(Intel|AMD|Qualcomm|NVIDIA)\s+/i, '')
    .replace(/^Core\s+(?=i[3579]\b)/i, '')
    .trim();
}

/**
 * PassMarkは性能コアと効率コアを別の列に持つ。掛けて足さないと数が合わない。
 * i9-14900K は cores=8 logicals=2 secondaryCores=16 secondaryLogicals=1 で
 * 24コア32スレッド。前者だけ見ると16スレッドという実在しない石になる。
 */
function coreCount(c) {
  const p = num(c.cores), pl = num(c.logicals);
  const e = num(c.secondaryCores) ?? 0, el = num(c.secondaryLogicals) ?? 0;
  if (p == null) return { cores: null, threads: null };
  return { cores: p + e, threads: pl == null ? null : p * pl + e * el };
}

const cpusRaw = vendorCpu.map(c => {
  const { cores, threads } = coreCount(c);
  const w = win11Support(c.name);
  const short = shortName(c.name);
  const vendor = vendorOf(c.name);
  return {
    name: short,
    fullName: c.name,
    vendor,
    score: num(c.cpumark),               // 判定に使う総合スコア
    singleThread: num(c.thread),
    cores, threads,
    tdp: num(c.tdp),
    formFactor: textOr(c.cat) === 'Unknown' ? null : textOr(c.cat),
    releasedOn: textOr(c.date),
    year: yearOf(c.date),
    win11: w.supported,
    win11Basis: { matchedBy: w.matchedBy, reason: w.reason, source: w.source },
    source: CPU_SOURCE,
    aliases: [short, c.name, `Core ${short}`, `${vendor} ${short}`]
      .filter(Boolean).map(norm),
  };
}).filter(c => c.score != null);

/**
 * 「リストに載っていない」の扱いは win11_match.js 側が持つ。
 *
 * 最初は発売日で線を引こうとしたが、これは誤りだった。Ryzen 5 7640S のように
 * 古い世代の後出しモデルが2026年に登録されていて、線が未来に飛ぶ。
 * 正しい軸は日付ではなく、リストが覆っている世代の範囲そのもの。
 */
const cpus = cpusRaw;

/**
 * 内蔵グラフィックの見分け。PassMarkの bus 列は3,013件中9件しか "Integrated" と
 * 書いていないので、これだけでは使えない。名前で見分けたうえで、
 * どちらで判断したかを integratedBasis に残す。判断の出どころが消えると検算できない。
 */
const IGPU_NAME = /\b(HD Graphics|UHD Graphics|Iris|Vega \d|Radeon Graphics|Radeon \d{3}M?\b|Graphics \d{3})\b/i;
function integratedOf(g) {
  if (g.bus === 'Integrated') return { integrated: true, basis: 'PassMark bus column' };
  if (IGPU_NAME.test(g.name)) return { integrated: true, basis: 'integrated-graphics family name' };
  return { integrated: false, basis: null };
}

const gpus = vendorGpu.map(g => {
  const short = shortName(g.name);
  const vendor = vendorOf(g.name);
  const ig = integratedOf(g);
  const vramMb = num(String(g.memSize ?? '').replace(/MB/i, ''));
  return {
    name: short,
    fullName: g.name,
    vendor,
    score: num(g.g3d),
    vram: vramMb ? Math.round(vramMb / 1024) : null,
    tdp: num(g.tdp),
    integrated: ig.integrated,
    integratedBasis: ig.basis,
    releasedOn: textOr(g.date),
    year: yearOf(g.date),
    formFactor: textOr(g.cat) === 'Unknown' ? null : textOr(g.cat),
    source: GPU_SOURCE,
    aliases: [short, g.name, `${vendor} ${short}`].filter(Boolean).map(norm),
  };
}).filter(g => g.score != null);

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

/**
 * 「今売られている機体」を基準点として持つ。
 *
 * 倍率だけを見せても、分母が読者に見えていなければ意味を持たない。
 * 「必要ラインの4.8倍」より「今売っている6万円台の新品とほぼ同じ」の方が、
 * 読んだ瞬間に自分の位置が分かる。しかもこれは今の市場の事実で、未来の予測を含まない。
 */
const refRow = wholePc.find(x => /New/i.test(x.type) && /desktop/i.test(x.type));
const refCpu = cpus.find(c => c.name === 'i3-12100');
const reference = (refRow && refCpu) ? {
  cpuName: refCpu.name,
  cpuScore: refCpu.score,
  machineYen: refRow.low ?? refRow.yen,
  label: '今売られている入門デスクトップ',
  detail: 'PASOUL G-SLIM S2（Core i3-12100F / 8GB / 256GB SSD）',
  // 販売機はFつき（内蔵GPU無し）。CPUの演算性能は無印と同じなので、スコアは無印のものを使う。
  caveat: '販売機はCore i3-12100F。スコアは内蔵GPU以外が同一の i3-12100 のもの',
  cpuSource: refCpu.source,
  priceSource: refRow.source,
} : null;

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
    builtFrom: 'vendor/passmark_*_full.json + vendor/ms_win11_*.json + research_raw.json',
    builtAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    cpuCount: cpus.length,
    gpuCount: gpus.length,
    note: '数値は調査の生データをそのまま移送したもの。このスクリプトは値を作らない。',
    win11Lists: LIST_SOURCES,
  },
  win11: raw.win11 ?? null,
  reference,
  cpus,
  gpus,
  prices,
  sources: raw.sources ?? [],
};

fs.writeFileSync(path.join(DIR, 'parts.json'), JSON.stringify(out, null, 1), 'utf8');

const igpu = gpus.filter(g => g.integrated).length;
const w = k => cpus.filter(c => c.win11 === k).length;
console.log(`parts.json 生成`);
console.log(`  CPU ${cpus.length}件  Win11: 対応 ${w(true)} / 非対応 ${w(false)} / リスト外・判定不能 ${w(null)}`);
console.log(`  GPU ${gpus.length}件（内蔵 ${igpu}）`);
console.log(`  ストレージ候補 ${storageOptions.length}件: ${storageOptions.map(o => `${o.gb}GB/${o.yen.toLocaleString()}円`).join(', ') || 'なし'}`);
console.log(`  メモリ候補 ${memoryOptions.length}件: ${memoryOptions.map(o => `${o.gb}GB/${o.yen.toLocaleString()}円`).join(', ') || 'なし'}`);
console.log(`  基準点: ${reference ? reference.label+' '+reference.cpuName+' スコア'+reference.cpuScore+' / '+reference.machineYen.toLocaleString()+'円' : '取れず'}`);
