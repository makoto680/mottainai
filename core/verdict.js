/**
 * 判定エンジン
 *
 * 世の中のツールとの違いは出力の向き。
 *   よくあるツール : 用途 → 「このパーツを買え」（上に外れるほど売上が増える）
 *   MOTTAINAI     : 現状 → 「これは替えなくていい」を先に確定させ、
 *                          どうしても足りない1点だけを最小コストで示す
 *
 * 判定は3値ではなく4値。「足りている」と「余りすぎている」を分けるのが肝で、
 * 余りすぎ＝過去に売りつけられた証拠なので、次に同じ手に乗らないための材料になる。
 */

import { mergeRequirements } from './workloads.js';

export const STATUS = {
  BLOCKER:  'BLOCKER',   // 下限割れ。ここだけ直せばいい
  TIGHT:    'TIGHT',     // 足りてはいるが余裕が薄い（今すぐ替える必要はない）
  KEEP:     'KEEP',      // 足りている。買うな
  OVERKILL: 'OVERKILL',  // 必要量を大きく超えている。過去の買いすぎ
  UNKNOWN:  'UNKNOWN',   // 読めていない。「足りている」とも「足りない」とも言わない
};

/**
 * 用途に足りる中で一番安いものを選ぶ。
 *
 * ここがこの道具の思想そのもの。1TBのHDDが入っているからといって1TBのSSDを充てるのは
 * 同型の置き換えであって、必要量ではない。事務用途なら500GBで足りる。
 * 「同じ容量に揃える」という発想が、要らない出費を生む一番よくある形。
 */
export function cheapestSufficient(options, neededGb) {
  const enough = (options ?? []).filter(o => o.gb >= neededGb && o.yen != null);
  if (!enough.length) return null;

  // 調査側が信頼度に疑いを付けた値段は答えに使わない。
  // 「その値段で買える」と言えないものを根拠に「買うな」と言うと、道具の前提が崩れる。
  const trusted = enough.filter(o => !o.lowConfidence);
  const pool = trusted.length ? trusted : enough;
  const pick = pool.reduce((best, o) => (o.yen < best.yen ? o : best));

  // 信頼できるものが1つも無く、やむを得ず疑わしい値を使った場合は、その事実を持たせる
  return trusted.length ? pick : { ...pick, unverifiedPrice: true };
}

/**
 * その部品を買い足す額が、機体そのものの値段に届いていないかを見る。
 * 2026年はメモリが上がっていて、増設代が中古機の相場に並ぶことが実際に起きている。
 * 並んでいるなら「増設は勧められない」と言うのが正直な答えになる。
 */
function upgradeWorthIt(fixYen, wholeMachineYen) {
  if (fixYen == null || wholeMachineYen == null) return null;
  const ratio = fixYen / wholeMachineYen;
  if (ratio >= 0.8) {
    return {
      worthIt: false,
      ratio: Math.round(ratio * 100) / 100,
      note: `この増設に${fixYen.toLocaleString()}円かかる。`
          + `中古で機体ごと買える額（${wholeMachineYen.toLocaleString()}円前後）とほぼ変わらないので、`
          + `増設は勧められない。今のまま使い切るか、機体ごと見直すかの二択になる。`,
    };
  }
  return { worthIt: true, ratio: Math.round(ratio * 100) / 100 };
}

/**
 * 余裕率から状態を決める。ratio = 現在値 / 必要値
 *
 * NaNはどの比較もfalseになるため、以前はここを素通りして最後のKEEPに落ちていた。
 * 「読めなかった」が「足りている＝買うな」に化ける＝間違う方向が一番悪い側だった。
 * 不明のフェイルセーフは必ずUNKNOWN。買えとも買うなとも言わない。
 */
function classify(ratio, enoughRatio) {
  if (!Number.isFinite(ratio)) return STATUS.UNKNOWN;
  if (ratio < 1) return STATUS.BLOCKER;
  if (ratio < 1.15) return STATUS.TIGHT;
  if (enoughRatio >= 1) return STATUS.OVERKILL;
  return STATUS.KEEP;
}

/**
 * 余力は「必要量の何倍あるか」で表す。年数には変換しない。
 *
 * 以前はここで「あと何年使えるか」を出していた。年8%ずつ必要スペックが上がるという
 * 前提を置いた式だったが、その8%には出典が無く、しかも出た値を上限10年で頭打ちにしていた。
 * 結果として画面の「あと約10年」は「勝手に決めた天井に当たった」以上の意味を持たず、
 * 数字の形をしているぶん、根拠があるかのように読めてしまっていた。
 *
 * 倍率なら、実測ベンチ（出典あり）と用途ごとの必要ライン（編集判断だと画面に明示）の
 * 割り算でしかなく、読む側がそのまま検算できる。
 */
/**
 * 5段階の読み札。倍率そのものは必ず横に併記する。
 *
 * 段階だけを見せると、境目の1点差が判定を反転させたように見えてしまう
 * （15,000は「余裕」で14,900は「普通」なのか、という問い）。
 * 実際には連続量なので、札は読みやすさのための丸めでしかないことが
 * 分かる形で出す。だから札・倍率・基準機との比較を必ず3点セットで返す。
 */
const LEVELS = [
  { min: 0,   key: 'short',      label: '足りていない' },
  { min: 1.0, key: 'barely',     label: 'ぎりぎり足りている' },
  { min: 1.3, key: 'enough',     label: '足りている' },
  { min: 2.0, key: 'comfort',    label: '余裕がある' },
  { min: 4.0, key: 'excessive',  label: '明らかに過剰' },
];

function levelOf(ratio) {
  if (!isFinite(ratio)) return LEVELS[0];
  return [...LEVELS].reverse().find(l => ratio >= l.min) ?? LEVELS[0];
}

/** 境目に近いかどうか。近ければ「境目あたり」と添えて、札の断定を弱める。 */
function nearBoundary(ratio) {
  return LEVELS.some(l => l.min > 0 && Math.abs(ratio - l.min) / l.min < 0.05);
}

/**
 * 余力の説明を組み立てる。
 * 言えるのは「今の要求に対して、今どの位置にいるか」だけ。
 * 何年もつかは書かない — 過去の性能推移は分かっても、この先の要求は誰にも読めない。
 */
function headroomLabel(ratio, refRatio) {
  if (!isFinite(ratio) || ratio < 1) return null;
  const lv = levelOf(ratio);
  const times = ratio >= 10 ? '10倍以上' : `約${ratio.toFixed(1)}倍`;
  let s = `${lv.label}（この用途の必要ラインの${times}）`;
  if (nearBoundary(ratio)) s += '※次の段階との境目あたり';
  if (refRatio != null && isFinite(refRatio)) {
    s += ` — 今売られている入門機と比べて約${refRatio.toFixed(1)}倍`;
  }
  return s;
}

function judgeScored(current, req, label, opts = {}) {
  const { unit = '', formatter = v => `${v}${unit}` } = opts;

  // 値は数値だけを受ける。"4GB" のような文字列が入ると割り算がNaNになり、
  // かつてはそれがKEEP（買うな）として画面に出ていた。数値化できないものは
  // 測定値ではないので、判定せず「読めていない」で止める。
  const value = (typeof current === 'string' && current.trim() !== '')
    ? Number(String(current).replace(/[^\d.]/g, ''))
    : current;
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return {
      key: label, status: STATUS.UNKNOWN, current: null,
      required: req.need || null,
      verdict: `${label}が読めていない。ここは「足りている」とも「足りない」とも言えない。`,
    };
  }

  if (!req.need) {
    return {
      key: label, status: STATUS.KEEP, required: 0, current: value,
      headroom: null,
      verdict: 'この用途では性能を問われない項目。今のままでいい。',
    };
  }
  const ratio = value / req.need;
  const enoughRatio = req.enough ? value / req.enough : 0;
  const status = classify(ratio, enoughRatio);
  const refScore = opts.referenceScore ?? null;
  const refRatio = refScore ? value / refScore : null;
  return {
    key: label,
    status,
    level: levelOf(ratio).key,
    levelLabel: levelOf(ratio).label,
    current: value,
    required: req.need,
    enough: req.enough,
    ratio: Math.round(ratio * 100) / 100,
    vsReference: refRatio != null ? Math.round(refRatio * 100) / 100 : null,
    headroom: headroomLabel(ratio, refRatio),
    currentLabel: formatter(value),
    requiredLabel: formatter(req.need),
  };
}

/**
 * Windows 11 の可否を判定する。
 * ここが2026年10月時点で一番金が動くポイントなので、
 * 「BIOSの設定を変えるだけで済む（＝0円）」ケースを最優先で拾う。
 */
export function judgeWindows11(machine, win11Data) {
  const { cpu, tpm, secureBoot } = machine;
  const out = { cost: 0, actions: [], blockers: [] };

  // 3値。true=リストにある / false=リストが除外した / null=リストでは決められない。
  // nullをfalseに潰すと、リストが追いついていないだけの現行CPU（Ryzen 9000等）に
  // 「公式対応から外れている」と断定することになる。それはこの道具が一番やってはいけない嘘。
  const cpuSupported = cpu ? (cpu.win11 ?? null) : null;
  // TPMが「無効」なだけなら有効化で解決する＝買い替え不要の最大要因
  const tpmFixableInBios = tpm === 'disabled' || tpm === 'unknown';

  if (cpuSupported === true && tpm === 'enabled' && secureBoot !== false) {
    out.eligible = true;
    out.headline = 'Windows 11 にそのまま上げられる。買い替えは不要。';
    return out;
  }

  if (cpuSupported === true && tpmFixableInBios) {
    out.eligible = true;
    out.headline = 'BIOS設定を変えるだけで Windows 11 に上げられる。費用は0円。';
    out.actions.push({
      cost: 0,
      label: 'BIOSでfTPM（AMD）またはPTT（Intel）を有効にする',
      detail: 'PCメーカーはこれを初期状態で無効にしていることがある。'
            + '有効にすると「TPM 2.0がない」という表示が消えて、そのままアップグレードできる。',
    });
    return out;
  }

  if (cpuSupported === null) {
    const tool = win11Data?.official_check_tool;
    out.eligible = null;
    out.headline = cpu
      ? 'Microsoft のリストではこのCPUの対応を確認できない。非対応と決まったわけではない。'
      : 'CPUが読めていないので、Windows 11 の可否はまだ判定できない。';
    if (cpu?.win11Basis?.reason) out.basis = cpu.win11Basis.reason;
    out.actions.push({
      cost: 0,
      label: tool ? `${tool.name}（Microsoft公式）で実機を確認する` : 'Microsoft公式の確認アプリで実機を確認する',
      detail: (tool?.note ?? 'どの要件で引っかかっているかを実機で正確に出せる。')
            + (tool?.source ? ` ${tool.source}` : ''),
    });
    return out;
  }

  if (cpuSupported === false) {
    out.eligible = false;
    out.blockers.push('CPUが Microsoft の公式対応リストに入っていない');
    out.headline = 'Windows 11 の公式対応から外れている。ただし選択肢は買い替えだけではない。';
    // ここで「だから買い替えろ」と言わないのがこのツールの立場
    const esu = win11Data?.consumer_esu ?? null;
    const freeEsu = (esu?.enrollment_options ?? []).find(o => o.cost_usd === 0);
    out.alternatives = [
      { cost: freeEsu ? 0 : null,
        label: `ESU（拡張セキュリティ更新）で${esu?.coverage_end ?? '期限'}まで延長する`,
        detail: (freeEsu
          ? `無料の道がある（${freeEsu.option}）。Windows 10 のままセキュリティ更新だけを受け取り、`
          : 'Windows 10 のままセキュリティ更新だけを受け取り、')
          + '期限までの間、判断を先送りできる。'
          + (esu?.source ? ` 出典: ${esu.source}` : '') },
      { cost: 0, label: 'Linux に載せ替える',
        detail: 'Web・動画・Office相当の用途しか使っていないなら、実用上ほぼ困らない。' },
      { cost: null, label: '買い替える',
        detail: '上の2つが合わない場合の最後の選択肢。'
              + '性能に不満がないなら、急いで決める必要はない。' },
    ];
    return out;
  }

  out.eligible = false;
  out.headline = 'Windows 11 の要件を一部満たしていない。';
  return out;
}

/**
 * メイン。現在の構成と用途から、部位ごとの判定と「買わなくていい合計額」を出す。
 *
 * machine: { cpu:{name,score,win11}, gpu:{name,score,vram,integrated}, ramGB, storage:{type,gb}, tpm, secureBoot, os }
 * workloadIds: ['office','game_fhd'] など
 * market: 一般的な販売サイトが同じ用途で薦めてくる構成と価格（比較対象）
 */
export function judge(machine, workloadIds, opts = {}) {
  const req = mergeRequirements(workloadIds);
  if (!req) throw new Error('用途が選ばれていない');

  const { win11Data = null, market = null, prices = {} } = opts;

  const parts = {};

  parts.cpu = judgeScored(machine.cpu?.score ?? null, req.cpu, 'CPU', {
    formatter: v => `スコア ${v.toLocaleString()}`,
    referenceScore: opts.reference?.cpuScore ?? null,
  });
  parts.cpu.name = machine.cpu?.name ?? '不明';

  // GPU: 内蔵で足りる用途なら、そもそも「買う」対象から外す
  const gpuScore = machine.gpu?.score ?? null;
  const isIntegrated = machine.gpu?.integrated === true;
  if (req.gpu.need === 0) {
    parts.gpu = {
      key: 'GPU', status: STATUS.KEEP, current: gpuScore, required: 0,
      name: machine.gpu?.name ?? '内蔵',
      verdict: 'この用途はグラフィックボードを必要としない。買う対象ですらない。',
    };
  } else if (isIntegrated && req.gpu.integratedOk) {
    // 内蔵で足りる用途なら、スコアが引けていなくても「足りている」と言い切ってよい
    parts.gpu = {
      key: 'GPU', status: STATUS.KEEP, current: gpuScore || null, required: req.gpu.need,
      name: machine.gpu?.name ?? '内蔵',
      verdict: 'この用途は内蔵グラフィックで足りる。ここでグラフィックボードを勧められたら、それは要らない出費。',
    };
  } else if (isIntegrated && !req.gpu.integratedOk) {
    parts.gpu = {
      key: 'GPU', status: STATUS.BLOCKER, current: gpuScore || null, required: req.gpu.need,
      name: machine.gpu?.name ?? '内蔵',
      verdict: 'この用途は内蔵グラフィックでは足りない。ここは実際に足りていない数少ない例。',
    };
  } else {
    parts.gpu = judgeScored(gpuScore, req.gpu, 'GPU', {
      formatter: v => `スコア ${v.toLocaleString()}`,
    });
    parts.gpu.name = machine.gpu?.name ?? '不明';
    // VRAM は別軸（ローカルAI用途で効く）
    if (req.gpu.vramNeed) {
      const vram = machine.gpu?.vram ?? null;   // 読めていないものを0GBという測定値にしない
      const ok = vram == null ? null : vram >= req.gpu.vramNeed;
      parts.gpu.vram = {
        current: vram, required: req.gpu.vramNeed, ok,
        note: vram == null
          ? 'この用途はVRAM容量で動く・動かないが決まるが、VRAM容量が読めていない。'
          : 'この用途はVRAM容量で動く・動かないが決まる。GPUの速さより優先。',
      };
      // 速度が足りていてもVRAMが足りなければ動かない。計算しておいて判定に使わないのは
      // 「知っていて黙る」なので、ここで判定に反映する。
      if (ok === false && parts.gpu.status !== STATUS.BLOCKER) {
        parts.gpu.status = STATUS.BLOCKER;
        parts.gpu.verdict = `GPUの速度は足りているが、VRAMが${vram}GBで必要な${req.gpu.vramNeed}GBに届かない。この用途ではここが動く・動かないの境目。`;
      }
    }
  }

  parts.ram = judgeScored(machine.ramGB ?? null, req.ram, 'メモリ', { unit: 'GB' });
  if (parts.ram.status === STATUS.BLOCKER) {
    const pick = cheapestSufficient(prices.memory, req.ram.need);
    if (pick) {
      parts.ram.fixCost = pick.yen;
      parts.ram.fixWith = pick;
      const worth = upgradeWorthIt(pick.yen, opts.usedMachineYen);
      if (worth && !worth.worthIt) {
        parts.ram.warning = worth.note;
        parts.ram.fixCost = null;      // 勧められないものを必要出費に足さない
        parts.ram.fixDeclined = true;  // 「値段が無い」のではなく「勧めないと判定した」
      }
    }
  }

  // ストレージは「容量」より「SSDかどうか」が体感を決める
  const st = machine.storage ?? {};
  const isSsd = st.type === 'ssd' || st.type === 'nvme';
  const stKnown = st.type === 'hdd' || isSsd;
  if (!stKnown) {
    // 「わからない」をHDD確定として扱うと、実物を一度も見ずに9,990円の買い物を
    // 見出しに載せることになる。種類が読めていないなら判定しない。
    parts.storage = {
      key: 'ストレージ', status: STATUS.UNKNOWN, current: null,
      verdict: 'HDDかSSDかが読めていない。ここが分かると判定が大きく変わる'
             + '（HDD→SSDの換装は、CPUを替えるより体感が変わる一番安い一手）。',
    };
  } else if (req.storage.ssdRequired && !isSsd) {
    // 今と同じ容量に揃えるのではなく、用途に足りる中で一番安いものを充てる
    const pick = cheapestSufficient(prices.storage, req.storage.need);
    parts.storage = {
      key: 'ストレージ', status: STATUS.BLOCKER,
      current: `${st.type === 'hdd' ? 'HDD' : '不明'}${st.gb ? ' ' + st.gb + 'GB' : ''}`,
      verdict: 'ここが今一番の足かせ。HDDからSSDに替えると、CPUを替えるより体感が変わる。',
      fixCost: pick?.yen ?? null,
      fixWith: pick ?? null,
      fixNote: pick
        ? `この用途に必要なのは${req.storage.need}GB。今と同じ容量に揃える必要はない。`
        : null,
    };
  } else {
    // 容量が読めていないのに「手狭」と言わない。SSDであること自体が体感の決め手で、
    // 容量は読めた時だけ判定する。
    const capKnown = Number.isFinite(st.gb) && st.gb > 0;
    const capOk = capKnown && st.gb >= req.storage.need;
    parts.storage = {
      key: 'ストレージ',
      status: !capKnown ? STATUS.KEEP : capOk ? STATUS.KEEP : STATUS.TIGHT,
      current: `${st.type === 'nvme' ? 'NVMe SSD' : 'SSD'}${capKnown ? ' ' + st.gb + 'GB' : ''}`,
      required: `${req.storage.need}GB`,
      verdict: !capKnown
        ? 'SSDが入っている。替える理由がない（容量は読めていないが、足りなくなっても外付けで済む話）。'
        : capOk
          ? 'SSDが入っていて容量も足りている。替える理由がない。'
          : '容量は手狭だが、外付けや増設で足りる。本体を替える理由にはならない。',
    };
  }

  const win11 = win11Data ? judgeWindows11(machine, win11Data) : null;

  // ---- 集計 ----
  const blockers = Object.values(parts).filter(p => p.status === STATUS.BLOCKER);
  const overkill = Object.values(parts).filter(p => p.status === STATUS.OVERKILL);
  const unknowns = Object.values(parts).filter(p => p.status === STATUS.UNKNOWN);

  // 実際に必要な出費＝下限を割っている部位のうち、値段が引けたものの合計。
  // 値段の無い部位（CPU/GPUの交換、勧められないと判定した増設）が混ざっている時に
  // 合計だけを出すと「¥9,990で全部直る」に読める。足りない部位に値の付かないものが
  // あるなら、その名前を必ず横に持つ。¥0を「確定した答え」の顔で出さない。
  const pricedBlockers = blockers.filter(p => p.fixCost != null);
  const unpricedBlockers = blockers.filter(p => p.fixCost == null);
  const needSpend = pricedBlockers.reduce((sum, p) => sum + p.fixCost, 0);

  // 販売サイトが薦めてくる金額との差＝「使わずに済んだ額」。
  // 値の付かない不足や不明部位が残っている間は、節約額を言い切れない。
  const marketSpend = market?.totalYen ?? null;
  const saved = (marketSpend != null && unpricedBlockers.length === 0 && unknowns.length === 0)
    ? Math.max(0, marketSpend - needSpend)
    : null;

  return {
    workloads: req.workloads.map(w => ({ id: w.id, label: w.label, note: w.note })),
    parts,
    win11,
    reference: opts.reference ?? null,
    // 画面にそのまま出すための断り書き。年数を書かない理由を、道具の側から明示する。
    horizon: '判定しているのは「今の要求に対する現在地」だけ。'
           + 'この先どれだけ要求が上がるかは誰にも読めないので、何年もつかは言わない。',
    summary: {
      keepEverything: blockers.length === 0 && unknowns.length === 0,
      blockerCount: blockers.length,
      overkillCount: overkill.length,
      unknownCount: unknowns.length,
      unknownParts: unknowns.map(p => p.key),
      needSpend,
      needSpendIsComplete: unpricedBlockers.length === 0,
      unpricedParts: unpricedBlockers.map(p => p.key),
      marketSpend,
      saved,
      headline: buildHeadline({ blockers, overkill, unknowns, needSpend, unpricedBlockers, win11 }),
    },
  };
}

function buildHeadline({ blockers, overkill, unknowns, needSpend, unpricedBlockers, win11 }) {
  // 読めていない部位があるうちは、全体の結論をどちら向きにも言い切らない。
  // 「買うな」も「買え」も、読めていないものの上には乗せられない。
  if (unknowns.length) {
    const names = unknowns.map(u => u.key).join('と');
    if (blockers.length) {
      return `「${blockers.map(b => b.key).join('と')}」は足りていない。`
           + `ただし「${names}」が読めていないので、全体の結論はまだ出せない。`;
    }
    return `読めた範囲に足りない部位は無い。ただし「${names}」が読めていないので、`
         + `「買わなくていい」とはまだ言い切れない。`;
  }

  // 出費の言い方：値段が引けていない不足があるなら、合計を確定額の顔で出さない
  const spendPhrase = () => {
    if (unpricedBlockers.length) {
      const declined = unpricedBlockers.filter(b => b.fixDeclined);
      const missing = unpricedBlockers.filter(b => !b.fixDeclined);
      const bits = [];
      if (needSpend) bits.push(`${needSpend.toLocaleString()}円`);
      if (missing.length) bits.push(`「${missing.map(b => b.key).join('と')}」の代金（価格未取得）`);
      if (declined.length) bits.push(`「${declined.map(b => b.key).join('と')}」は増設を勧めない判定（本文参照）`);
      return bits.join('＋');
    }
    return needSpend ? `${needSpend.toLocaleString()}円` : '';
  };

  // 「0円で解決」と言えるのは、本当に他に出費が無い時だけ。
  // Windows 11 の話だけを見て 0円 と書くと、足りていない部位の出費を隠すことになる。
  const biosOnly = win11 && win11.eligible === true && win11.cost === 0 && win11.actions.length;
  if (biosOnly && blockers.length === 0) {
    return '0円で解決する。BIOSの設定を1つ変えるだけ。';
  }
  if (biosOnly && blockers.length) {
    const yen = spendPhrase();
    return `Windows 11 側は0円で済む（BIOS設定のみ）。`
         + `別に「${blockers.map(b => b.key).join('と')}」が足りていない${yen ? `＝${yen}` : ''}。`;
  }
  if (blockers.length === 0) {
    const tail = overkill.length
      ? '（しかも一部は必要量を大きく超えている＝過去に買いすぎている）'
      : '';
    return `買う必要のあるものは1つもない。${tail}`;
  }
  if (blockers.length === 1) {
    const yen = spendPhrase();
    return `替えるのは「${blockers[0].key}」の1点だけ。${yen ? `${yen}。` : ''}本体の買い替えは不要。`;
  }
  return `足りていないのは${blockers.length}点${unpricedBlockers.length ? `（うち「${unpricedBlockers.map(b => b.key).join('と')}」は価格未取得）` : ''}。それ以外は今のままでいい。`;
}
