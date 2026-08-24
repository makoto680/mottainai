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
  return enough.reduce((best, o) => (o.yen < best.yen ? o : best));
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

/** 余裕率から状態を決める。ratio = 現在値 / 必要値 */
function classify(ratio, enoughRatio) {
  if (ratio < 1) return STATUS.BLOCKER;
  if (ratio < 1.15) return STATUS.TIGHT;
  if (enoughRatio >= 1) return STATUS.OVERKILL;
  return STATUS.KEEP;
}

/**
 * 「あと何年戦えるか」の目安。
 * 必要スペックは年あたりおよそ8%上がるという前提を置き、余裕がそれを何年吸収できるかで出す。
 * 正確な予言ではなく桁感を示すための数字なので、UI側でも「目安」と明示すること。
 */
const YEARLY_CREEP = 1.08;
function yearsOfHeadroom(ratio) {
  if (ratio < 1) return 0;
  const years = Math.log(ratio) / Math.log(YEARLY_CREEP);
  return Math.max(0, Math.min(10, Math.round(years * 10) / 10));
}

function judgeScored(current, req, label, opts = {}) {
  const { unit = '', formatter = v => `${v}${unit}` } = opts;
  if (!req.need) {
    return {
      key: label, status: STATUS.KEEP, required: 0, current,
      headroomYears: null,
      verdict: 'この用途では性能を問われない項目。今のままでいい。',
    };
  }
  const ratio = current / req.need;
  const enoughRatio = req.enough ? current / req.enough : 0;
  const status = classify(ratio, enoughRatio);
  return {
    key: label,
    status,
    current,
    required: req.need,
    enough: req.enough,
    ratio: Math.round(ratio * 100) / 100,
    headroomYears: yearsOfHeadroom(ratio),
    currentLabel: formatter(current),
    requiredLabel: formatter(req.need),
  };
}

/**
 * Windows 11 の可否を判定する。
 * ここが2026年10月時点で一番金が動くポイントなので、
 * 「BIOSの設定を変えるだけで済む（＝0円）」ケースを最優先で拾う。
 */
export function judgeWindows11(machine, win11Data) {
  const { cpu, tpm, secureBoot, os } = machine;
  const out = { cost: 0, actions: [], blockers: [] };

  const cpuSupported = cpu?.win11 === true;
  // TPMが「無効」なだけなら有効化で解決する＝買い替え不要の最大要因
  const tpmFixableInBios = tpm === 'disabled' || tpm === 'unknown';

  if (cpuSupported && tpm === 'enabled' && secureBoot !== false) {
    out.eligible = true;
    out.headline = 'Windows 11 にそのまま上げられる。買い替えは不要。';
    return out;
  }

  if (cpuSupported && tpmFixableInBios) {
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

  if (!cpuSupported) {
    out.eligible = false;
    out.blockers.push('CPUが Microsoft の公式対応リストに入っていない');
    out.headline = 'Windows 11 の公式対応から外れている。ただし選択肢は買い替えだけではない。';
    // ここで「だから買い替えろ」と言わないのがこのツールの立場
    out.alternatives = [
      { cost: win11Data?.esu?.consumerPriceYen ?? null, label: 'ESU（拡張セキュリティ更新）で延長する',
        detail: 'Windows 10 のまま、有償のセキュリティ更新だけを受け取る。'
              + '期限が切れるまでの間に判断を先送りできる。' },
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

  parts.cpu = judgeScored(machine.cpu?.score ?? 0, req.cpu, 'CPU', {
    formatter: v => `スコア ${v.toLocaleString()}`,
  });
  parts.cpu.name = machine.cpu?.name ?? '不明';

  // GPU: 内蔵で足りる用途なら、そもそも「買う」対象から外す
  const gpuScore = machine.gpu?.score ?? 0;
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
      const vram = machine.gpu?.vram ?? 0;
      parts.gpu.vram = {
        current: vram, required: req.gpu.vramNeed,
        ok: vram >= req.gpu.vramNeed,
        note: 'この用途はVRAM容量で動く・動かないが決まる。GPUの速さより優先。',
      };
    }
  }

  parts.ram = judgeScored(machine.ramGB ?? 0, req.ram, 'メモリ', { unit: 'GB' });
  if (parts.ram.status === STATUS.BLOCKER) {
    const pick = cheapestSufficient(prices.memory, req.ram.need);
    if (pick) {
      parts.ram.fixCost = pick.yen;
      parts.ram.fixWith = pick;
      const worth = upgradeWorthIt(pick.yen, opts.usedMachineYen);
      if (worth && !worth.worthIt) {
        parts.ram.warning = worth.note;
        parts.ram.fixCost = null;   // 勧められないものを必要出費に足さない
      }
    }
  }

  // ストレージは「容量」より「SSDかどうか」が体感を決める
  const st = machine.storage ?? {};
  const isSsd = st.type === 'ssd' || st.type === 'nvme';
  if (req.storage.ssdRequired && !isSsd) {
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
    const capOk = (st.gb ?? 0) >= req.storage.need;
    parts.storage = {
      key: 'ストレージ',
      status: capOk ? STATUS.KEEP : STATUS.TIGHT,
      current: `${st.type === 'nvme' ? 'NVMe SSD' : 'SSD'} ${st.gb ?? '?'}GB`,
      required: `${req.storage.need}GB`,
      verdict: capOk
        ? 'SSDが入っていて容量も足りている。替える理由がない。'
        : '容量は手狭だが、外付けや増設で足りる。本体を替える理由にはならない。',
    };
  }

  const win11 = win11Data ? judgeWindows11(machine, win11Data) : null;

  // ---- 集計 ----
  const blockers = Object.values(parts).filter(p => p.status === STATUS.BLOCKER);
  const overkill = Object.values(parts).filter(p => p.status === STATUS.OVERKILL);

  // 実際に必要な出費＝下限を割っている部位だけ
  const needSpend = blockers.reduce((sum, p) => sum + (p.fixCost ?? 0), 0);

  // 販売サイトが薦めてくる金額との差＝「使わずに済んだ額」
  const marketSpend = market?.totalYen ?? null;
  const saved = marketSpend != null ? Math.max(0, marketSpend - needSpend) : null;

  return {
    workloads: req.workloads.map(w => ({ id: w.id, label: w.label, note: w.note })),
    parts,
    win11,
    summary: {
      keepEverything: blockers.length === 0,
      blockerCount: blockers.length,
      overkillCount: overkill.length,
      needSpend,
      marketSpend,
      saved,
      headline: buildHeadline(blockers, overkill, needSpend, win11),
    },
  };
}

function buildHeadline(blockers, overkill, needSpend, win11) {
  // 「0円で解決」と言えるのは、本当に他に出費が無い時だけ。
  // Windows 11 の話だけを見て 0円 と書くと、足りていない部位の出費を隠すことになる。
  const biosOnly = win11 && win11.eligible === true && win11.cost === 0 && win11.actions.length;
  if (biosOnly && blockers.length === 0) {
    return '0円で解決する。BIOSの設定を1つ変えるだけ。';
  }
  if (biosOnly && blockers.length) {
    const yen = needSpend ? `${needSpend.toLocaleString()}円` : '';
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
    const yen = needSpend ? `約${needSpend.toLocaleString()}円で済む。` : '';
    return `替えるのは「${blockers[0].key}」の1点だけ。${yen}本体の買い替えは不要。`;
  }
  return `足りていないのは${blockers.length}点。それ以外は今のままでいい。`;
}
