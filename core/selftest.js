/**
 * 判定ロジックの自己検証
 *
 * 実在の型番は使わない（実データが揃う前に本物の名前へ偽のスコアを結びつけると、
 * それ自体が「盛った数字」になるため）。ここで確かめるのは計算の筋だけ。
 * 実データでの検証は data/parts.json が入ってから別途行う。
 */

import { judge, STATUS, judgeWindows11, cheapestSufficient } from './verdict.js';
import { mergeRequirements, WORKLOADS } from './workloads.js';
import { mergeScans, installedMemory } from './merge_scan.js';

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
  check('先の年数を語る言葉が混ざらない',
    !/年|将来|この先|もつ/.test(a.headroom ?? ''), `(${a.headroom})`);
  console.log(`       → "${a.headroom}"`);
}

console.log('\n[7b] 5段階の札と、境目で崖にならないこと');
{
  const m = s => ({ cpu: { score: s, win11: true }, gpu: { score: 0 }, ramGB: 16,
                    storage: { type: 'ssd', gb: 512 }, tpm: 'enabled', secureBoot: true });
  const need = WORKLOADS.office.cpu.need;
  const at = r => judge(m(Math.round(need * r)), ['office']).parts.cpu;

  check('足りない',           at(0.9).level === 'short');
  check('ぎりぎり足りている', at(1.1).level === 'barely');
  check('足りている',         at(1.6).level === 'enough');
  check('余裕がある',         at(3.0).level === 'comfort');
  check('明らかに過剰',       at(6.0).level === 'excessive');

  // 境目の1点差で判定が反転したように見えないこと。
  // 札は変わっても、倍率が併記され「境目あたり」と添えられていれば連続量だと伝わる。
  const below = at(1.96), above = at(2.04);
  check('境目をまたぐと札は変わる', below.level !== above.level);
  check('その両側に「境目あたり」と添える',
    /境目/.test(below.headroom) && /境目/.test(above.headroom));
  check('両側で倍率の表示は同じ（＝連続量だと分かる）',
    below.headroom.match(/約[\d.]+倍/)[0] === above.headroom.match(/約[\d.]+倍/)[0]);
  console.log(`       → 下: "${below.headroom}"`);
  console.log(`       → 上: "${above.headroom}"`);
}

console.log('\n[7c] 読者が知っている機体と比べる');
{
  const ref = { cpuScore: 12505, cpuName: 'i3-12100', label: '今売られている入門デスクトップ' };
  const r = judge(
    { cpu: { score: 11970, win11: true }, gpu: { score: 0 }, ramGB: 16,
      storage: { type: 'ssd', gb: 512 }, tpm: 'enabled', secureBoot: true },
    ['office'], { reference: ref });
  check('基準機との倍率が出る', r.parts.cpu.vsReference === 0.96, `(${r.parts.cpu.vsReference})`);
  check('文章にも基準機が出る', /入門機と比べて/.test(r.parts.cpu.headroom));
  check('基準機の情報を結果に添える', r.reference?.cpuName === 'i3-12100');
  check('年数を語らない断り書きがある', /年数|何年/.test(r.horizon ?? ''));
  console.log(`       → "${r.parts.cpu.headroom}"`);
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

console.log('\n[9] 「読めていない」を「足りている」に化けさせない');
{
  // かつて "4GB" のような文字列が NaN になり、classify の全条件をすり抜けて
  // KEEP（買うな）として画面に出ていた。不明のフェイルセーフは必ずUNKNOWN。
  const base = {
    cpu: { name: 'TEST-CPU-H', score: 20000, win11: true },
    gpu: { name: 'TEST-GPU-H', score: 20000, integrated: false },
    storage: { type: 'nvme', gb: 1000 },
    tpm: 'enabled', secureBoot: true,
  };
  const r = judge({ ...base, ramGB: 'えへへ' }, ['video_4k']);
  check('数値化できないメモリ値はUNKNOWNになる', r.parts.ram.status === STATUS.UNKNOWN);
  check('UNKNOWNがあると「買うな」と言い切らない', r.summary.keepEverything === false);
  check('見出しが読めていない事実を言う', /読めていない/.test(r.summary.headline), `(${r.summary.headline})`);
  const r2 = judge({ ...base, ramGB: '8GB' }, ['office']);
  check('単位つき文字列 "8GB" は8として読む', r2.parts.ram.current === 8);
  console.log(`       → "${r.summary.headline}"`);
}

console.log('\n[10] 空の入力から買い物リストを作らない');
{
  // かつては何も入力しなくても「3点足りない・¥25,790」が出ていた。
  // 何も読めていないなら、判定はどちら向きにも出せない。
  const r = judge({ cpu: null, gpu: null, ramGB: null, storage: {} }, ['office'], {
    prices: { memory: [{ gb: 16, yen: 15800 }], storage: [{ gb: 500, yen: 9990 }] },
  });
  check('CPUはUNKNOWN（スコア0の捏造をしない）', r.parts.cpu.status === STATUS.UNKNOWN);
  check('ストレージはUNKNOWN（HDD扱いにしない）', r.parts.storage.status === STATUS.UNKNOWN);
  check('必要出費は積まれない', r.summary.needSpend === 0);
  check('BLOCKERは1つも無い', r.summary.blockerCount === 0);
  console.log(`       → "${r.summary.headline}"`);
}

console.log('\n[11] Windows 11 の3値：リスト外をfalseに潰さない');
{
  // リストが追いついていないCPU（win11:null）に「公式対応から外れている」と
  // 断定しない。それは「リストで確認できない」であって「非対応」ではない。
  const nullCpu = { name: 'TEST-CPU-I', score: 60000,
    win11: null, win11Basis: { reason: 'past where the list stops' } };
  const w = judgeWindows11({ cpu: nullCpu, tpm: 'enabled', secureBoot: true },
    { official_check_tool: { name: 'PC Health Check', note: 'test', source: 'https://example.com' } });
  check('eligibleはnull（falseではない）', w.eligible === null);
  check('「対応リストに入っていない」と断定しない', w.blockers.length === 0);
  check('公式の確認手段を案内する', w.actions.some(a => /PC Health Check/.test(a.label)));
  check('確認できない旨を見出しで言う', /確認できない/.test(w.headline), `(${w.headline})`);
  const wFalse = judgeWindows11({ cpu: { name: 'X', score: 1, win11: false }, tpm: 'enabled' },
    { consumer_esu: { coverage_end: '2027-10-12',
        enrollment_options: [{ option: 'Free - sync', cost_usd: 0 }] } });
  check('本当の非対応は従来どおりfalse', wFalse.eligible === false);
  check('無料のESUの道が代替案に出る',
    wFalse.alternatives?.some(a => a.cost === 0 && /ESU/.test(a.label)),
    `(${JSON.stringify(wFalse.alternatives?.map(a => [a.label, a.cost]))})`);
  console.log(`       → "${w.headline}"`);
}

console.log('\n[12] 値段の付かない不足を¥0の顔で隠さない');
{
  // CPUが足りない（＝交換価格データが無い）時、「実際に必要な出費 ¥0」ではなく
  // 「価格未取得」だと分かる形で返す。
  const r = judge({
    cpu: { name: 'TEST-CPU-J', score: 3000, win11: true },
    gpu: { name: 'TEST-GPU-J', score: 20000, integrated: false },
    ramGB: 16, storage: { type: 'ssd', gb: 500 },
  }, ['game_fhd']);
  check('CPUが足りないと判定される', r.parts.cpu.status === STATUS.BLOCKER);
  check('出費の合計が「完全ではない」と分かる', r.summary.needSpendIsComplete === false);
  check('価格未取得の部位名が入る', r.summary.unpricedParts.includes('CPU'));
  check('見出しにも価格未取得が出る', /価格未取得/.test(r.summary.headline), `(${r.summary.headline})`);
  console.log(`       → "${r.summary.headline}"`);
}

console.log('\n[13] VRAM不足は計算するだけでなく判定に効かせる');
{
  // 速度が足りていてもVRAMが足りなければその用途は動かない。
  // 計算しておいて判定に使わないのは「知っていて黙る」。
  const r = judge({
    cpu: { name: 'TEST-CPU-K', score: 30000, win11: true },
    gpu: { name: 'TEST-GPU-K', score: 25000, integrated: false, vram: 4 },
    ramGB: 32, storage: { type: 'nvme', gb: 1000 },
  }, ['ai_local']);
  // 分岐で走ったり走らなかったりするテストを置かない。画面の「自己検証N項目」は
  // このファイルの check() を数えて出しているので、実行数と数えが1でもズレたら
  // その数字自体が嘘になる。
  check('ai_localはVRAM要件を持つ（前提の確認）', mergeRequirements(['ai_local'])?.gpu?.vramNeed > 4);
  check('VRAM不足でBLOCKERになる', r.parts.gpu.status === STATUS.BLOCKER, `(${r.parts.gpu.status})`);
  check('本文がVRAMを名指しする', /VRAM/.test(r.parts.gpu.verdict ?? ''), `(${r.parts.gpu.verdict})`);
  const r2 = judge({
    cpu: { name: 'TEST-CPU-K', score: 30000, win11: true },
    gpu: { name: 'TEST-GPU-K2', score: 25000, integrated: false, vram: null },
    ramGB: 32, storage: { type: 'nvme', gb: 1000 },
  }, ['ai_local']);
  check('VRAM不明を0GBという測定値にしない', r2.parts.gpu.vram?.current == null);
  check('不明時はok=null（不足と断定しない）', r2.parts.gpu.vram?.ok === null);
}

console.log('\n[14] 複数のスクショを束ねるのはコード（モデルに決めさせない）');
{
  // 「設定→バージョン情報」には グラフィックとストレージが映っていない。だから
  // 素人向けの経路は2枚になり、2枚が食い違った時に何を答えるかが判定の入口になる。

  // 同じ数字を2回測っただけのズレ（実装16.0GB / タスクマネージャー15.9GB）は食い違いではない
  const round = mergeScans([{ ramGB: 16 }, { ramGB: 15.9 }]);
  check('丸め違いの容量は同じ値として16GBに落ちる', round.ramGB === 16, `(${round.ramGB})`);
  check('丸め違いは食い違い扱いにしない', round.conflicts.length === 0);

  // 本当に違う値なら、どちらかを採らずに「読めていない」に倒す
  const clash = mergeScans([{ ramGB: 8 }, { ramGB: 16 }]);
  check('本当に違う容量はnull（片方を勝手に採らない）', clash.ramGB === null);
  check('食い違った事実を持ち帰る', clash.conflicts.some(c => /memory/i.test(c)));

  // nvme と ssd は同じ事実の粒度違い。判定が使うのは「回転する円盤ではない」という一点
  const solid = mergeScans([{ storage: { type: 'ssd' } }, { storage: { type: 'nvme' } }]);
  check('ssdとnvmeは食い違いではなく細かい方を採る', solid.storage.type === 'nvme');

  // HDDとSSDの両方が見えているのは、たいていCドライブでない方を見ている
  const drives = mergeScans([{ storage: { type: 'hdd', gb: 1000 } }, { storage: { type: 'ssd', gb: 256 } }]);
  check('HDDとSSDが両方出たら種類はnull', drives.storage.type === null);
  check('種類が決まらないうちは容量も持たない', drives.storage.gb === null);

  // 型番は文字列の段階で潰さない。同じチップの別表記かどうかを決めるのは resolve.js
  const cpu = mergeScans([
    { cpu: { name: 'Intel Core i5-1235U', confidence: 'low' } },
    { cpu: { name: '12th Gen Intel(R) Core(TM) i5-1235U   1.30 GHz', confidence: 'high' } },
  ]);
  check('別表記は両方とも候補として残る', cpu.cpuCandidates.length === 2);
  check('読めている方が先頭に来る', /12th Gen/.test(cpu.cpuCandidates[0]));

  // 1枚読めなくても他の枚を巻き込まない。読めなかった事実は画面まで運ぶ
  const partial = mergeScans([{ readError: 'timeout' }, { ramGB: 8, cpu: { name: 'TEST-CPU-M' } }]);
  check('読めた枚数と送られた枚数を区別する', partial.imageCount === 2 && partial.readCount === 1);
  check('失敗した画像があっても読めた分は生きる', partial.ramGB === 8);
  check('読めなかった事実を黙って捨てない', partial.unreadable.some(u => u.includes('timeout')),
    `(${partial.unreadable.join(' | ')})`);

  // モックの印は最後まで落とさない（キー無しのデモが本物の読み取りに見えると、それ自体が嘘になる）
  check('mockの印は合流後も残る', mergeScans([{ mocked: true }, { ramGB: 8 }]).mocked === true);

  // 画像が1枚も無い時に、空の合流結果が「読んだ上で不明」に見えないこと
  const none = mergeScans([]);
  check('画像0枚なら全部null（0GBのような測定値を作らない）',
    none.ramGB === null && none.storage.type === null && none.cpuCandidates.length === 0);

  // 「image N:」が付いていること。2枚目で読めたものの横に、1枚目の
  // 「この画面には映っていない」が全体の話として並ぶと画面が嘘をつく。
  check('読めなかった注記は何枚目かを名乗る',
    partial.unreadable.every(u => /^image \d+: /.test(u)), `(${partial.unreadable.join(' | ')})`);
}

console.log('\n[15] Windowsが言う容量を実装容量として読み直す');
{
  // タスクマネージャーは「OSが使える量」を出す。内蔵GPUなどが取った分だけ実装より小さい。
  // 直さないと、16GBの機体が15.9GBとして必要ライン16に0.1足りず、
  // 持っているメモリを買えと言われる。この道具が一番やってはいけない間違い方。
  check('15.9GBは16GBの機体として読む', installedMemory(15.9).value === 16);
  check('直した時は直す前の数字も持つ', installedMemory(15.9).readAs === 15.9);
  check('3.9GBは4GBとして読む', installedMemory(3.9).value === 4);
  check('ちょうどの値には触らない', installedMemory(16).value === 16 && installedMemory(16).readAs === null);

  // 予約で説明できない開きは直さない。ここを緩めると「実際より多い」と言い始める
  check('14GBは16GBに繰り上げない（2GBを予約する物は無い）', installedMemory(14).value === 14);
  check('存在しない容量は作らない', installedMemory(50).value === 50);
  check('不明はそのまま不明', installedMemory(null).value === null);

  // 実際に判定まで通す。15.9のまま流れていた時は BLOCKER だった
  const raw = judge({
    cpu: { name: 'TEST-CPU-N', score: 20000, win11: true },
    gpu: { name: 'TEST-GPU-N', score: 5000, integrated: false },
    ramGB: 15.9, storage: { type: 'nvme', gb: 1000 },
  }, ['photo']);
  check('前提の確認：15.9GBのままだと16GB要求に足りない扱いになる',
    raw.parts.ram.status === STATUS.BLOCKER, `(${raw.parts.ram.status})`);
  const fixed = judge({
    cpu: { name: 'TEST-CPU-N', score: 20000, win11: true },
    gpu: { name: 'TEST-GPU-N', score: 5000, integrated: false },
    ramGB: mergeScans([{ ramGB: 15.9 }]).ramGB, storage: { type: 'nvme', gb: 1000 },
  }, ['photo']);
  check('読み直した後は増設を勧めない', fixed.parts.ram.status !== STATUS.BLOCKER, `(${fixed.parts.ram.status})`);
  check('見出しに買い物が出ない', fixed.summary.needSpend === 0 && fixed.summary.blockerCount === 0);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
