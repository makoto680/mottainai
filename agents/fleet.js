/**
 * エージェント・フリート（ADK Workflow）
 *
 * 構成の原則は1つ。ARCHITECTURE.md に書いた通り、
 *   「モデルは見る・言葉にする。決めるのはコード」
 * 金額に触れる判断は必ず決定論のノード（verdict）が行い、モデルは一切関与しない。
 *
 *   START ─┬─ scan      (画像 → 部品名)          … モデル
 *          └─ workload  (文章 → 用途プロファイル) … モデル
 *                  └──→ resolve (部品名 → スコア)  … コード
 *                          └──→ verdict          … コード（★ここが金額を決める）
 *                                  └──→ narrate  … モデル（数字は作らない）
 */

import { Workflow, node } from '@google/adk';
import { judge } from '../core/verdict.js';
import { WORKLOAD_LIST } from '../core/workloads.js';

const SCAN_PROMPT = `You are looking at a photo or screenshot from someone's computer.
It may be: the inside of a desktop PC, a Device Manager / System Information screen,
a spec sheet, or a photo of a laptop label.

Identify what you can actually read. Never guess a model number you cannot see.

Return this shape:
{
  "cpu":     { "name": "<exact string as printed, or null>", "confidence": "high|medium|low" },
  "gpu":     { "name": "<exact string, or 'integrated' if clearly integrated, or null>", "confidence": "..." },
  "ramGB":   <number or null>,
  "storage": { "type": "hdd|ssd|nvme|null", "gb": <number or null> },
  "tpm":     "enabled|disabled|unknown",
  "os":      "<what is printed, or null>",
  "unreadable": ["<what a human would need to check manually>"]
}

If the image does not show a computer at all, return every field as null and put a note in "unreadable".`;

const WORKLOAD_PROMPT = (text) => `A person describes what they do with their computer:

"${text}"

Map it onto these workload profiles:
${WORKLOAD_LIST.map(w => `- ${w.id}: ${w.labelEn}`).join('\n')}

Rule that matters: when the description is ambiguous, choose the LIGHTER profile.
Underestimating costs this person nothing. Overestimating sells them hardware they
do not need, which is the exact failure this tool exists to prevent.

Return: { "workloads": ["<id>", ...], "reasoning": "<one short sentence>" }`;

/** 画像から部品を読む（モデル） */
async function scanNode(ctx, { input, llm }) {
  const { image, mimeType } = input ?? {};
  if (!image) return { skipped: true, reason: '画像なし。手入力の値を使う。' };
  return llm.visionJson(SCAN_PROMPT, image, mimeType);
}

/** 文章から用途を決める（モデル） */
async function workloadNode(ctx, { input, llm }) {
  const { useText, workloads } = input ?? {};
  // 画面で明示的に選ばれているならモデルに聞く必要がない
  if (workloads?.length) return { workloads, reasoning: '画面で選択済み' };
  if (!useText) return { workloads: ['office'], reasoning: '入力が無いので最も軽い用途を仮置き' };
  return llm.json(`workload\n${WORKLOAD_PROMPT(useText)}`);
}

/**
 * 部品名を正規化してスコアを引く（コード）
 * ここをモデルにやらせない理由は、似た型番へのすり替えが起きた瞬間に
 * 判定全体が嘘になるため。引けなければ「不明」で通す。
 */
async function resolveNode(ctx, { parts, scan, input }) {
  scan = scan ?? {};
  const manual = input?.manual ?? {};

  const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const lookup = (kind, name) => {
    if (!name) return null;
    const table = parts?.[kind] ?? [];
    const key = norm(name);
    if (!key) return null;

    // 別名まで含めた完全一致を最優先
    const exact = table.find(p => (p.aliases ?? [norm(p.name)]).includes(key));
    if (exact) return exact;

    // 次に「型番が丸ごと含まれている」ケース。
    // 逆向き（データ側が入力に含まれる）は i5-7500 が i5-750 を掴むような事故を起こすので取らない。
    const contained = table.filter(p => (p.aliases ?? []).some(a => a.includes(key)));
    // 候補が1つに絞れる時だけ採用する。複数該当は「不明」にして黙って別型番を掴まない
    return contained.length === 1 ? contained[0] : null;
  };

  const cpuName = manual.cpu ?? scan.cpu?.name ?? null;
  const gpuName = manual.gpu ?? scan.gpu?.name ?? null;

  const cpu = lookup('cpus', cpuName);

  // 「内蔵」「integrated」のような一般名は型番ではないので、照合ではなく種別として扱う。
  // 型番が引けなくても「内蔵である」ことは判定に使える情報なので、不明として捨てない。
  const GENERIC_IGPU = /^(内蔵|オンボード|integrated|igpu|onboard|cpu内蔵|なし|none)$/i;
  const isGenericIgpu = gpuName && GENERIC_IGPU.test(String(gpuName).trim());
  const gpu = isGenericIgpu
    ? { name: '内蔵グラフィック', integrated: true, score: null, generic: true }
    : lookup('gpus', gpuName);

  const machine = {
    cpu: cpu ?? (cpuName ? { name: cpuName, score: 0, unresolved: true } : null),
    gpu: gpu ?? (gpuName ? { name: gpuName, score: 0, unresolved: true } : null),
    ramGB: manual.ramGB ?? scan.ramGB ?? null,
    storage: manual.storage ?? scan.storage ?? {},
    tpm: manual.tpm ?? scan.tpm ?? 'unknown',
    secureBoot: manual.secureBoot ?? null,
    os: manual.os ?? scan.os ?? null,
  };

  machine.unresolved = [
    ...(cpuName && !cpu ? [`CPU「${cpuName}」はベンチデータに無い`] : []),
    ...(gpuName && !gpu && !isGenericIgpu ? [`GPU「${gpuName}」はベンチデータに無い`] : []),
    ...(machine.ramGB == null ? ['メモリ容量が読めていない'] : []),
  ];

  return machine;
}

/**
 * 判定（コード・★モデル不使用）
 * 金額に関わる結論はここだけで出す。
 */
async function verdictNode(ctx, { machine, workloads, win11Data, prices, market, usedMachineYen }) {
  const ids = workloads?.workloads ?? ['office'];
  const result = judge(machine, ids, {
    win11Data: win11Data ?? null,
    prices: prices ?? {},
    market: market ?? null,
    usedMachineYen: usedMachineYen ?? null,
  });
  result.determinedBy = 'core/verdict.js (no model in loop)';
  return result;
}

/** 判定を言葉にする（モデル・数字は作らせない） */
async function narrateNode(ctx, { verdict: v, llm, input }) {
  const lang = input?.lang ?? 'ja';

  const prompt = `Put this verdict into plain ${lang === 'ja' ? 'Japanese' : 'English'} for its owner.

${JSON.stringify({ summary: v.summary, parts: v.parts, win11: v.win11 }, null, 1)}

Hard rules:
- Do NOT introduce any number that is not in the data above. No prices, no years, no scores of your own.
- Lead with what they do NOT need to buy.
- If something must be replaced, name that one thing and stop. Do not suggest anything extra.
- Never recommend a product, brand, or shop.
- Three short paragraphs at most. Speak plainly, like a friend who repairs computers.`;

  return llm.text(prompt);
}

/**
 * フリートを組み立てる。
 *
 * 静的な edges ではなく dynamicEntry を使っている。理由は合流の意味論で、
 * edges では「入ってくる辺の数だけ下流ノードが起動する」ため、
 * scan と workload の2本が resolve に入ると resolve が2回走ってしまう。
 * 知覚を本当に並列で走らせたうえで1回だけ合流させたいので、ここは明示的に書く。
 */
export function buildFleet(deps = {}) {
  const scan     = node(scanNode,     { name: 'scan' });
  const workload = node(workloadNode, { name: 'workload' });
  const resolve  = node(resolveNode,  { name: 'resolve' });
  const verdict  = node(verdictNode,  { name: 'verdict' });
  const narrate  = node(narrateNode,  { name: 'narrate' });

  return new Workflow({
    name: 'mottainai_fleet',
    description: 'Decides what you do NOT need to buy.',
    async dynamicEntry(ctx, runInput) {
      // 入力は組み立て時に渡す（runner のメッセージは文字列しか運べないため）
      const input = deps.input ?? runInput;
      const base = { ...deps, input };
      // runNode は NodeContext を返すので、実体は .output から取り出す
      const run = async (n, arg) => (await ctx.runNode(n, arg))?.output;

      // 画像の読み取りと用途の解釈は互いに独立＝同時に走らせる
      const [scanned, workloads] = await Promise.all([
        run(scan, base),
        run(workload, base),
      ]);

      const machine = await run(resolve, { ...base, scan: scanned });

      // ★ 金額に関わる判断はここだけ。モデルは関与しない
      const verdictResult = await run(verdict, { ...base, machine, workloads });

      const narration = await run(narrate, { ...base, verdict: verdictResult });

      return { scan: scanned, machine, workloads, verdict: verdictResult, narration };
    },
  });
}
