/**
 * 判定ロジックの自己検証
 *
 * 実在の型番は使わない（実データが揃う前に本物の名前へ偽のスコアを結びつけると、
 * それ自体が「盛った数字」になるため）。ここで確かめるのは計算の筋だけ。
 * 実データでの検証は data/parts.json が入ってから別途行う。
 */

import { judge, STATUS, judgeWindows11, cheapestSufficient } from './verdict.js';
import { mergeRequirements, WORKLOADS } from './workloads.js';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}

console.log('\n[1] 用途のマージ（重い方に合わせる）');
{
  const r = mergeRequirements(['office', 'game_fhd']);
  check('CPU下限は重い用途側を採用',
    r.cpu.need === Math.max(WORKLOADS.office.cpu.need, WORKLOADS.game_fhd.cpu.need));
  check('専用GPU必須の用途が混ざると内蔵不可になる', r.gpu.integratedOk === false);
  const r2 = mergeRequirements(['office', 'meeting']);
  check('内蔵で足りる用途だけなら内蔵可のまま', r2.gpu.integratedOk === true);
}

console.log('\n[2] 事務用途に十分な機体は「買うな」と言う');
{
  const machine = {
    cpu: { name: 'TEST-CPU-A', score: 6000, win11: true },
    gpu: { name: '内蔵', score: 1200, integrated: true },
    ramGB: 16,
    storage: { type: 'ssd', gb: 512 },
    tpm: 'enabled', secureBoot: true,
  };
  const r = judge(machine, ['office']);
  check('買う必要なしと判定される', r.summary.keepEverything === true);
  check('足りない部位が0件', r.summary.blockerCount === 0);
  check('GPUは「買う対象ですらない」扱い', r.parts.gpu.status === STATUS.KEEP);
  check('必要な出費は0円', r.summary.needSpend === 0);
  console.log(`       → "${r.summary.headline}"`);
}

console.log('\n[3] HDDが唯一の足かせなら、そこ1点だけを指す');
{
  const machine = {
    cpu: { name: 'TEST-CPU-B', score: 5500, win11: false },
    gpu: { name: '内蔵', score: 900, integrated: true },
    ramGB: 8,
    storage: { type: 'hdd', gb: 1000 },
    tpm: 'unknown', secureBoot: false,
  };
  // 用途に足りる最小容量が選ばれるか（同容量への置き換えではなく）
  const storage = [
    { gb: 256,  yen: 5000,  label: 'TEST-SSD-256' },
    { gb: 512,  yen: 9000,  label: 'TEST-SSD-512' },
    { gb: 1024, yen: 20000, label: 'TEST-SSD-1TB' },
  ];
  const r = judge(machine, ['office'], { prices: { storage } });
  check('ストレージが足りないと判定', r.parts.storage.status === STATUS.BLOCKER);
  check('足りない部位はその1点だけ', r.summary.blockerCount === 1);
  check('CPUは据え置き判定', r.parts.cpu.status !== STATUS.BLOCKER);
  check('1TBのHDDでも用途に足りる最小容量を選ぶ',
    r.parts.storage.fixWith?.gb === 256, `(選ばれたのは ${r.parts.storage.fixWith?.gb}GB)`);
  check('必要な出費はその最小構成の額', r.summary.needSpend === 5000, `(${r.summary.needSpend})`);
  console.log(`       → "${r.summary.headline}"`);
}

console.log('\n[3b] 足りる中で一番安いものを選ぶ');
{
  const opts = [
    { gb: 256, yen: 8000 }, { gb: 512, yen: 6000 }, { gb: 1024, yen: 20000 },
  ];
  check('容量順ではなく価格で選ぶ', cheapestSufficient(opts, 256)?.yen === 6000);
  check('足りないものは候補にしない', cheapestSufficient(opts, 600)?.gb === 1024);
  check('どれも足りなければ null', cheapestSufficient(opts, 5000) === null);

  // 調査側が「この値段は当てにならない」と付けた行を答えに使わない
  const mixed = [
    { gb: 8,  yen: 4980,  lowConfidence: true },
    { gb: 16, yen: 15800, lowConfidence: false },
  ];
  const p = cheapestSufficient(mixed, 8);
  check('信頼できない安値より、信頼できる値を選ぶ', p?.yen === 15800, `(選ばれたのは ${p?.yen})`);
  check('信頼できる値なら疑いの印は付かない', !p?.unverifiedPrice);

  const onlyDoubtful = [{ gb: 8, yen: 4980, lowConfidence: true }];
  const q = cheapestSufficient(onlyDoubtful, 8);
  check('他に無ければ使うが、疑いの印を残す', q?.unverifiedPrice === true);
}

console.log('\n[3c] 増設代が機体の値段に並ぶなら、増設を勧めない');
{
  const machine = {
    cpu: { name: 'TEST-CPU-E', score: 9000, win11: true },
    gpu: { name: '内蔵', score: 0, integrated: true },
    ramGB: 4,
    storage: { type: 'ssd', gb: 512 },
    tpm: 'enabled', secureBoot: true,
  };
  // 用途はメモリ16GBを要求。増設に30,000円かかるが、中古機が29,800円という状況
  const r = judge(machine, ['dev'], {
    prices: { memory: [{ gb: 32, yen: 30000, label: 'TEST-RAM' }] },
    usedMachineYen: 29800,
  });
  check('メモリは足りていないと判定される', r.parts.ram.status === STATUS.BLOCKER);
  check('勧められない増設は必要出費に入れない', r.parts.ram.fixCost === null);
  check('理由が言葉で残る', typeof r.parts.ram.warning === 'string');
  console.log(`       → ${r.parts.ram.warning}`);
}

console.log('\n[3d] 内蔵グラフィックの扱い');
{
  const base = {
    cpu: { name: 'TEST-CPU-F', score: 12000, win11: true },
    gpu: { name: '内蔵グラフィック', integrated: true, score: null },
    ramGB: 16, storage: { type: 'ssd', gb: 512 }, tpm: 'enabled', secureBoot: true,
  };
  const light = judge(base, ['game_light']);
  check('内蔵で足りる用途では買わせない', light.parts.gpu.status === STATUS.KEEP);
  const heavy = judge(base, ['game_4k']);
  check('内蔵で足りない用途では正直に足りないと言う', heavy.parts.gpu.status === STATUS.BLOCKER);
  console.log(`       → 軽: "${light.parts.gpu.verdict}"`);
}

console.log('\n[4] 過剰スペックを「余っている」と明示する');
{
  const machine = {
    cpu: { name: 'TEST-CPU-C', score: 40000, win11: true },
    gpu: { name: 'TEST-GPU-C', score: 30000, vram: 12 },
    ramGB: 64,
    storage: { type: 'nvme', gb: 2000 },
    tpm: 'enabled', secureBoot: true,
  };
  const r = judge(machine, ['office']);
  check('CPUが余りすぎと判定される', r.parts.cpu.status === STATUS.OVERKILL);
  check('メモリも余りすぎと判定される', r.parts.ram.status === STATUS.OVERKILL);
  check('余っている部位が2件以上', r.summary.overkillCount >= 2);
  console.log(`       → "${r.summary.headline}"`);
}

console.log('\n[5] 販売サイトの薦めとの差額を出す');
{
  const machine = {
    cpu: { name: 'TEST-CPU-D', score: 9000, win11: true },
    gpu: { name: '内蔵', score: 2000, integrated: true },
    ramGB: 16,
    storage: { type: 'ssd', gb: 512 },
    tpm: 'enabled', secureBoot: true,
  };
  const r = judge(machine, ['game_light'], { market: { totalYen: 150000 } });
  check('軽いゲームは内蔵GPUで足りる', r.parts.gpu.status !== STATUS.BLOCKER);
  check('使わずに済んだ額が出る', r.summary.saved === 150000);
  console.log(`       → 市場の薦め ${r.summary.marketSpend.toLocaleString()}円 / 実際に必要 ${r.summary.needSpend.toLocaleString()}円`);
}

console.log('\n[6] Windows 11：BIOS設定だけで解決するケースを最優先で拾う');
{
  const supported = { cpu: { win11: true }, tpm: 'disabled', secureBoot: false };
  const w = judgeWindows11(supported, {});
  check('対応CPU＋TPM無効は「0円で解決」', w.eligible === true && w.cost === 0);
  check('BIOS操作が案内される', w.actions.length === 1);
  console.log(`       → "${w.headline}"`);

  const unsupported = { cpu: { win11: false }, tpm: 'enabled', secureBoot: true };
  const w2 = judgeWindows11(unsupported, { esu: { consumerPriceYen: 4000 } });
  check('非対応でも買い替え以外の道を必ず示す', w2.alternatives?.length >= 2);
  check('買い替えは最後の選択肢として置かれる',
    w2.alternatives[w2.alternatives.length - 1].label.includes('買い替え'));
}

console.log('\n[7] 余力は検算できる倍率で示す（年数に変換しない）');
{
  // 「あと何年使える」は出典の無い前提を1つ挟むうえ、勝手な上限で頭打ちにしていた。
  // 倍率なら実測スコア ÷ 必要ラインでしかなく、読む側がその場で確かめられる。
  const m = s => ({ cpu: { score: s, win11: true }, gpu: { score: 0 }, ramGB: 16,
                    storage: { type: 'ssd', gb: 512 }, tpm: 'enabled', secureBoot: true });
  const need = WORKLOADS.office.cpu.need;

  const a = judge(m(need * 2), ['office']).parts.cpu;
  check('倍率が実際の割り算と一致する', a.ratio === 2, `(${a.ratio})`);
  check('倍率が文章にも出る', /2\.0倍/.test(a.headroom ?? ''), `(${a.headroom})`);

  const b = judge(m(need * 50), ['office']).parts.cpu;
  check('極端な値は「10倍以上」とだけ言う', /10倍以上/.test(b.headroom ?? ''), `(${b.headroom})`);

  const c = judge(m(need - 1), ['office']).parts.cpu;
  check('足りていない時は余力を示さない', c.headroom === null);

  // 年数を名乗るフィールドが復活していないこと（同じ間違いを繰り返さないための番人）
  check('年数のフィールドは持たない', !('headroomYears' in a));
  console.log(`       → "${a.headroom}"`);
}

console.log('\n[8] 「0円」と言えるのは本当に他の出費が無い時だけ');
{
  // Windows 11 は BIOS 設定だけで済むが、メモリは足りていない機体。
  // 「0円で解決」とだけ書くと、必要な出費を隠すことになる。
  const m = {
    cpu: { name: 'TEST-CPU-G', score: 12000, win11: true },
    gpu: { name: '内蔵', integrated: true, score: null },
    ramGB: 4,
    storage: { type: 'ssd', gb: 512 },
    tpm: 'disabled', secureBoot: false,
  };
  const r = judge(m, ['dev'], {
    win11Data: {},
    prices: { memory: [{ gb: 32, yen: 15800, label: 'TEST-RAM' }] },
  });
  check('Windows11側は0円で解決すると分かる', r.win11.cost === 0 && r.win11.actions.length === 1);
  check('メモリは足りていないと判定される', r.parts.ram.status === STATUS.BLOCKER);
  check('見出しが「0円」だけを言い切らない',
    !/^0円で解決する/.test(r.summary.headline), `(${r.summary.headline})`);
  check('見出しに足りない部位が出る',
    r.summary.headline.includes('メモリ'), `(${r.summary.headline})`);
  console.log(`       → "${r.summary.headline}"`);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
