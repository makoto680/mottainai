/**
 * The verdict engine
 *
 * What separates this from every other tool is the direction of its output.
 *   The usual tool : workload → "buy this part" (the further up it misses, the more it sells)
 *   MOTTAINAI      : current machine → first settle "you do not need to replace this",
 *                    then point at the one thing that truly falls short, at minimum cost
 *
 * The verdict has five states, not three. Splitting "sufficient" from "far more than
 * needed" is the point — overkill is evidence of having been oversold in the past,
 * and naming it is what keeps the same trick from working twice.
 */

import { mergeRequirements } from './workloads.js';

export const STATUS = {
  BLOCKER:  'BLOCKER',   // below the floor. Fix this one thing and nothing else
  TIGHT:    'TIGHT',     // sufficient, but with little slack (no need to replace it today)
  KEEP:     'KEEP',      // sufficient. Do not buy
  OVERKILL: 'OVERKILL',  // far beyond what the workload needs. A past overspend
  UNKNOWN:  'UNKNOWN',   // could not be read. Neither "enough" nor "not enough" is claimed
};

/**
 * Pick the cheapest option that satisfies the workload.
 *
 * This function IS the philosophy of the tool. A 1TB HDD in the machine does not
 * mean a 1TB SSD is the answer — that is like-for-like replacement, not need.
 * Office work is fine on 500GB. "Match the capacity you already have" is the
 * single most common way unnecessary spending gets created.
 */
export function cheapestSufficient(options, neededGb) {
  const enough = (options ?? []).filter(o => o.gb >= neededGb && o.yen != null);
  if (!enough.length) return null;

  // Prices the survey side flagged as doubtful are never used in an answer.
  // Telling someone "don't buy" on the basis of a price you cannot stand behind
  // breaks the premise of the whole tool.
  const trusted = enough.filter(o => !o.lowConfidence);
  const pool = trusted.length ? trusted : enough;
  const pick = pool.reduce((best, o) => (o.yen < best.yen ? o : best));

  // If nothing trustworthy existed and a doubtful price had to be used, carry that fact.
  return trusted.length ? pick : { ...pick, unverifiedPrice: true };
}

/**
 * Check whether the cost of the upgrade approaches the price of a whole machine.
 * Memory prices climbed in 2026, and an upgrade genuinely can cost as much as a
 * used machine. When it does, the honest answer is "this upgrade is not worth it".
 */
function upgradeWorthIt(fixYen, wholeMachineYen) {
  if (fixYen == null || wholeMachineYen == null) return null;
  const ratio = fixYen / wholeMachineYen;
  if (ratio >= 0.8) {
    return {
      worthIt: false,
      ratio: Math.round(ratio * 100) / 100,
      note: `This upgrade costs ¥${fixYen.toLocaleString()} — `
          + `about what a whole used machine goes for (around ¥${wholeMachineYen.toLocaleString()}), `
          + `so it cannot be recommended. The real choice is between using this machine as it is, `
          + `or rethinking the machine itself.`,
    };
  }
  return { worthIt: true, ratio: Math.round(ratio * 100) / 100 };
}

/**
 * Turn a headroom ratio into a status. ratio = current / needed
 *
 * NaN fails every comparison, so this used to fall straight through to the final
 * KEEP — "could not read it" silently became "sufficient, don't buy", which is
 * the worst possible direction to be wrong in. The fail-safe for unknown is
 * always UNKNOWN: no "buy", no "don't buy".
 */
function classify(ratio, enoughRatio) {
  if (!Number.isFinite(ratio)) return STATUS.UNKNOWN;
  if (ratio < 1) return STATUS.BLOCKER;
  if (ratio < 1.15) return STATUS.TIGHT;
  if (enoughRatio >= 1) return STATUS.OVERKILL;
  return STATUS.KEEP;
}

/**
 * Headroom is expressed as "how many times the needed amount" — never as years.
 *
 * An earlier version printed "roughly N years left". It assumed requirements grow
 * 8% per year — a number with no source — and then capped the result at 10 years,
 * so "about 10 years" on screen meant nothing more than "hit the invented ceiling",
 * while looking like it had evidence behind it.
 *
 * A ratio is just a division: a measured benchmark (sourced) over a workload's
 * needed line (declared as editorial judgement on screen). Anyone can redo it.
 */
/**
 * Five reading levels. The raw ratio is always printed beside the label.
 *
 * Showing the label alone would make a one-point difference at a boundary look
 * like a flipped verdict (is 15,000 "comfortable" while 14,900 is merely "fine"?).
 * The quantity is continuous; the label is only a rounding for readability, and
 * the display keeps that visible by always returning label + ratio + reference
 * comparison as a set of three.
 */
const LEVELS = [
  { min: 0,   key: 'short',      label: 'not enough' },
  { min: 1.0, key: 'barely',     label: 'barely enough' },
  { min: 1.3, key: 'enough',     label: 'enough' },
  { min: 2.0, key: 'comfort',    label: 'comfortable' },
  { min: 4.0, key: 'excessive',  label: 'clearly excessive' },
];

function levelOf(ratio) {
  if (!isFinite(ratio)) return LEVELS[0];
  return [...LEVELS].reverse().find(l => ratio >= l.min) ?? LEVELS[0];
}

/** Near a boundary? If so, soften the label with "around the boundary". */
function nearBoundary(ratio) {
  return LEVELS.some(l => l.min > 0 && Math.abs(ratio - l.min) / l.min < 0.05);
}

/**
 * Build the headroom sentence.
 * The only thing that can honestly be said is "where this sits against today's
 * requirement". Years are never written — past performance trends are knowable,
 * future requirements are not.
 */
function headroomLabel(ratio, refRatio) {
  if (!isFinite(ratio) || ratio < 1) return null;
  const lv = levelOf(ratio);
  const times = ratio >= 10 ? 'more than 10×' : `about ${ratio.toFixed(1)}×`;
  let s = `${lv.label} (${times} the line this workload needs)`;
  if (nearBoundary(ratio)) s += ' — right around the next level’s boundary';
  if (refRatio != null && isFinite(refRatio)) {
    s += `, and about ${refRatio.toFixed(1)}× an entry-level machine sold today`;
  }
  return s;
}

function judgeScored(current, req, label, opts = {}) {
  const { unit = '', formatter = v => `${v}${unit}` } = opts;

  // Only numbers are accepted as values. A string like "4GB" makes the division
  // NaN, and NaN once reached the screen as KEEP ("don't buy"). Anything that
  // does not become a number is not a measurement — stop at "could not read it"
  // instead of judging.
  const value = (typeof current === 'string' && current.trim() !== '')
    ? Number(String(current).replace(/[^\d.]/g, ''))
    : current;
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return {
      key: label, status: STATUS.UNKNOWN, current: null,
      required: req.need || null,
      verdict: `${label} could not be read. Neither "enough" nor "not enough" can be said here.`,
    };
  }

  if (!req.need) {
    return {
      key: label, status: STATUS.KEEP, required: 0, current: value,
      headroom: null,
      verdict: 'This workload never asks this part a question. Keep it as it is.',
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
 * Judge Windows 11 eligibility.
 * As of October 2026 this is where the most money changes hands, so the case
 * that costs nothing — "one BIOS setting fixes it" — is picked up first.
 */
export function judgeWindows11(machine, win11Data) {
  const { cpu, tpm, secureBoot, os } = machine;
  const out = { cost: 0, actions: [], blockers: [] };

  // If the screenshot itself says Windows 11, the whole upgrade question is moot.
  // Telling a Windows 11 machine to flip a BIOS switch to get Windows 11 was a real bug.
  if (/windows\s*11/i.test(String(os ?? ''))) {
    out.eligible = true;
    out.alreadyOn11 = true;
    out.headline = 'This machine is already running Windows 11. Nothing to buy, nothing to change.';
    return out;
  }

  // Three values. true = on the list / false = the list excludes it / null = the list cannot decide.
  // Collapsing null into false would mean telling owners of current CPUs the list simply
  // has not caught up with (Ryzen 9000 etc.) that they are "officially unsupported" —
  // exactly the kind of lie this tool exists to refuse.
  const cpuSupported = cpu ? (cpu.win11 ?? null) : null;

  if (cpuSupported === true && tpm === 'enabled' && secureBoot !== false) {
    out.eligible = true;
    out.headline = 'This machine upgrades to Windows 11 as it is. No replacement needed.';
    return out;
  }

  // TPM observed as disabled: enabling it is a fact-based ¥0 fix — say so plainly.
  if (cpuSupported === true && tpm === 'disabled') {
    out.eligible = true;
    out.headline = 'One BIOS setting away from Windows 11. Cost: ¥0.';
    out.actions.push({
      cost: 0,
      label: 'Enable fTPM (AMD) or PTT (Intel) in the BIOS',
      detail: 'PC makers sometimes ship with this switched off. '
            + 'Turning it on removes the "no TPM 2.0" message, and the upgrade goes through as-is.',
    });
    return out;
  }

  // TPM was never read (none of the screens this tool asks for shows it).
  // The money answer is the same — nothing to buy — but "one BIOS setting is all it
  // takes" would be asserting an observation that was never made. TPM may already be on.
  if (cpuSupported === true && tpm === 'unknown') {
    out.eligible = true;
    out.tpmUnread = true;
    out.headline = 'The CPU is on Microsoft’s list, so nothing here needs buying. '
                 + 'TPM was not read — if the upgrade complains about it, that is a ¥0 BIOS setting, not a new PC.';
    out.actions.push({
      cost: 0,
      label: 'Only if the upgrade complains about TPM 2.0: enable fTPM (AMD) or PTT (Intel) in the BIOS',
      detail: 'PC makers sometimes ship with this switched off. Turning it on removes the '
            + '"no TPM 2.0" message. If no complaint ever appears, there is nothing to do.',
    });
    return out;
  }

  if (cpuSupported === null) {
    const tool = win11Data?.official_check_tool;
    out.eligible = null;
    out.headline = cpu
      ? 'Microsoft’s list cannot confirm this CPU either way. That is not the same as unsupported.'
      : 'The CPU could not be read, so Windows 11 eligibility cannot be judged yet.';
    if (cpu?.win11Basis?.reason) out.basis = cpu.win11Basis.reason;
    out.actions.push({
      cost: 0,
      label: tool ? `Check this machine with ${tool.name} (Microsoft’s official tool)` : 'Check this machine with Microsoft’s official checker app',
      detail: (tool?.note ?? 'It reports precisely which requirement, if any, this machine trips on.')
            + (tool?.source ? ` ${tool.source}` : ''),
    });
    return out;
  }

  if (cpuSupported === false) {
    out.eligible = false;
    out.blockers.push('The CPU is not on Microsoft’s official support list');
    out.headline = 'Outside official Windows 11 support. Replacement is not the only road, though.';
    // This is where the tool refuses to say "so buy a new one"
    const esu = win11Data?.consumer_esu ?? null;
    const freeEsu = (esu?.enrollment_options ?? []).find(o => o.cost_usd === 0);
    out.alternatives = [
      { cost: freeEsu ? 0 : null,
        label: `Extend with ESU (Extended Security Updates) until ${esu?.coverage_end ?? 'the deadline'}`,
        detail: (freeEsu
          ? `A free route exists (${freeEsu.option}). Stay on Windows 10, keep receiving security updates, `
          : 'Stay on Windows 10, keep receiving security updates, ')
          + 'and postpone the decision until the deadline.'
          + (esu?.source ? ` Source: ${esu.source}` : '') },
      { cost: 0, label: 'Move to Linux',
        detail: 'If the machine only ever does web, video and office-grade work, daily life barely changes.' },
      { cost: null, label: 'Replace the machine',
        detail: 'The last resort, for when neither of the above fits. '
              + 'If the performance itself has given no complaints, there is no rush to decide.' },
    ];
    return out;
  }

  out.eligible = false;
  out.headline = 'This machine misses part of the Windows 11 requirements.';
  return out;
}

/**
 * Main entry. From the current build and the workloads, produce per-part verdicts
 * and the total that does NOT need to be spent.
 *
 * machine: { cpu:{name,score,win11}, gpu:{name,score,vram,integrated}, ramGB, storage:{type,gb}, tpm, secureBoot, os }
 * workloadIds: e.g. ['office','game_fhd']
 * market: what a typical sales site recommends for the same workload, and its price (the comparison)
 */
export function judge(machine, workloadIds, opts = {}) {
  const req = mergeRequirements(workloadIds);
  if (!req) throw new Error('No workload was selected');

  const { win11Data = null, market = null, prices = {} } = opts;

  const parts = {};

  parts.cpu = judgeScored(machine.cpu?.score ?? null, req.cpu, 'CPU', {
    formatter: v => `score ${v.toLocaleString()}`,
    referenceScore: opts.reference?.cpuScore ?? null,
  });
  parts.cpu.name = machine.cpu?.name ?? 'unknown';

  // GPU: if integrated graphics satisfy the workload, a GPU is not even a thing to buy
  const gpuScore = machine.gpu?.score ?? null;
  const isIntegrated = machine.gpu?.integrated === true;
  if (req.gpu.need === 0) {
    parts.gpu = {
      key: 'GPU', status: STATUS.KEEP, current: gpuScore, required: 0,
      // No fabricated observation: if nothing was read about the graphics, the name
      // stays empty. The verdict is the same either way — the workload never asks.
      name: machine.gpu?.name ?? null,
      verdict: 'This workload does not call for a graphics card. It is not even a thing to buy.',
    };
  } else if (isIntegrated && !req.gpu.integratedOk) {
    parts.gpu = {
      key: 'GPU', status: STATUS.BLOCKER, current: gpuScore || null, required: req.gpu.need,
      name: machine.gpu?.name ?? 'integrated',
      verdict: 'Integrated graphics do not cover this workload. This is one of the rare places something genuinely falls short.',
    };
  } else if (isIntegrated && req.gpu.integratedOk && !Number.isFinite(gpuScore)) {
    // Only the generic "it's integrated, no model known" case gets the editorial
    // shortcut. When a score WAS measured it is used — "integrated" alone must not
    // outrank a measurement (a 2012 iGPU is not fine for FHD video editing just
    // because recent iGPUs are).
    parts.gpu = {
      key: 'GPU', status: STATUS.KEEP, current: null, required: req.gpu.need,
      name: machine.gpu?.name ?? 'integrated',
      verdict: 'Integrated graphics cover this workload. If someone offers you a graphics card here, that is money you do not need to spend.',
    };
  } else {
    parts.gpu = judgeScored(gpuScore, req.gpu, 'GPU', {
      formatter: v => `score ${v.toLocaleString()}`,
    });
    parts.gpu.name = machine.gpu?.name ?? 'unknown';
    if (isIntegrated && parts.gpu.status === STATUS.BLOCKER) {
      parts.gpu.verdict = `Integrated graphics can cover this workload when they are recent enough — `
        + `this one measures score ${Number(gpuScore).toLocaleString()} against the ${req.gpu.need.toLocaleString()} the workload needs.`;
    }
    // VRAM is a separate axis (it decides local-AI workloads)
    if (req.gpu.vramNeed) {
      const vram = machine.gpu?.vram ?? null;   // never turn "could not read it" into a measured 0GB
      const ok = vram == null ? null : vram >= req.gpu.vramNeed;
      parts.gpu.vram = {
        current: vram, required: req.gpu.vramNeed, ok,
        note: vram == null
          ? 'Whether this workload runs at all is decided by VRAM capacity — and the VRAM could not be read.'
          : 'Whether this workload runs at all is decided by VRAM capacity. It outranks GPU speed.',
      };
      // Enough speed with too little VRAM still does not run. Computing this and then
      // not using it would be knowing and staying silent — so it feeds the verdict here.
      if (ok === false && parts.gpu.status !== STATUS.BLOCKER) {
        parts.gpu.status = STATUS.BLOCKER;
        parts.gpu.verdict = `The GPU is fast enough, but ${vram}GB of VRAM does not reach the ${req.gpu.vramNeed}GB this workload needs. Here, that is the line between runs and does not run.`;
      }
    }
  }

  parts.ram = judgeScored(machine.ramGB ?? null, req.ram, 'RAM', { unit: 'GB' });
  if (parts.ram.status === STATUS.BLOCKER) {
    const pick = cheapestSufficient(prices.memory, req.ram.need);
    if (pick) {
      parts.ram.fixCost = pick.yen;
      parts.ram.fixWith = pick;
      const worth = upgradeWorthIt(pick.yen, opts.usedMachineYen);
      if (worth && !worth.worthIt) {
        parts.ram.warning = worth.note;
        parts.ram.fixCost = null;      // an upgrade the tool does not recommend is not added to the bill
        parts.ram.fixDeclined = true;  // not "no price found" — "judged not worth recommending"
      }
    }
  }

  // For storage, SSD-or-HDD decides how the machine feels; capacity comes second
  const st = machine.storage ?? {};
  const isSsd = st.type === 'ssd' || st.type === 'nvme';
  const stKnown = st.type === 'hdd' || isSsd;
  if (!stKnown) {
    // Treating "don't know" as "HDD, confirmed" would put a ¥9,990 purchase in the
    // headline without ever having seen the drive. If the type could not be read,
    // no verdict is given.
    parts.storage = {
      key: 'Storage', status: STATUS.UNKNOWN, current: null,
      verdict: 'Whether this is an HDD or an SSD could not be read — and it changes the verdict a lot '
             + '(swapping an HDD for an SSD is the cheapest single change that transforms how a PC feels, more than a new CPU).',
    };
  } else if (req.storage.ssdRequired && !isSsd) {
    // Not "match the capacity you have" — the cheapest option that covers the workload
    const pick = cheapestSufficient(prices.storage, req.storage.need);
    parts.storage = {
      key: 'Storage', status: STATUS.BLOCKER,
      current: `${st.type === 'hdd' ? 'HDD' : 'unknown'}${st.gb ? ' ' + st.gb + 'GB' : ''}`,
      verdict: 'This is the one real drag on this machine. Moving from HDD to SSD changes how it feels more than a new CPU would.',
      fixCost: pick?.yen ?? null,
      fixWith: pick ?? null,
      fixNote: pick
        ? `This workload needs ${req.storage.need}GB. There is no reason to match the capacity you have now.`
        : null,
    };
  } else {
    // Capacity is never called "tight" when it was never read. Being an SSD is what
    // decides the feel; capacity is judged only when it was actually read.
    const capKnown = Number.isFinite(st.gb) && st.gb > 0;
    const capOk = capKnown && st.gb >= req.storage.need;
    parts.storage = {
      key: 'Storage',
      status: !capKnown ? STATUS.KEEP : capOk ? STATUS.KEEP : STATUS.TIGHT,
      current: `${st.type === 'nvme' ? 'NVMe SSD' : 'SSD'}${capKnown ? ' ' + st.gb + 'GB' : ''}`,
      required: `${req.storage.need}GB`,
      verdict: !capKnown
        ? 'An SSD is in there. No reason to replace it (capacity was not read, but running short is an external-drive problem, not a new-PC problem).'
        : capOk
          ? 'An SSD is in there and the capacity covers the workload. No reason to replace it.'
          : 'Capacity is on the tight side, but an external or added drive covers it. Not a reason to replace the machine.',
    };
  }

  const win11 = win11Data ? judgeWindows11(machine, win11Data) : null;

  // ---- Roll-up ----
  const blockers = Object.values(parts).filter(p => p.status === STATUS.BLOCKER);
  const overkill = Object.values(parts).filter(p => p.status === STATUS.OVERKILL);
  const unknowns = Object.values(parts).filter(p => p.status === STATUS.UNKNOWN);

  // Actual required spend = the sum over below-floor parts that have a price.
  // When unpriced shortfalls (CPU/GPU swaps, declined upgrades) are in the mix,
  // printing only the total reads as "¥9,990 fixes everything". Any shortfall
  // without a price keeps its name right next to the number. ¥0 never wears
  // the face of a settled answer.
  const pricedBlockers = blockers.filter(p => p.fixCost != null);
  const unpricedBlockers = blockers.filter(p => p.fixCost == null);
  const needSpend = pricedBlockers.reduce((sum, p) => sum + p.fixCost, 0);

  // The gap to what sales sites recommend = "money that never had to leave".
  // While unpriced shortfalls or unread parts remain, no savings figure is claimed.
  const marketSpend = market?.totalYen ?? null;
  const saved = (marketSpend != null && unpricedBlockers.length === 0 && unknowns.length === 0)
    ? Math.max(0, marketSpend - needSpend)
    : null;

  return {
    workloads: req.workloads.map(w => ({ id: w.id, label: w.label, note: w.note })),
    parts,
    win11,
    reference: opts.reference ?? null,
    // A disclaimer the screen prints as-is: why this tool refuses to talk in years.
    horizon: 'The only thing judged here is where this machine stands against today’s requirements. '
           + 'Nobody can read how far requirements will climb, so no "years it will last" is given.',
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
  // While any part is unread, the overall conclusion is not called in either direction.
  // Neither "buy" nor "don't buy" can stand on something that was never read.
  if (unknowns.length) {
    const names = unknowns.map(u => u.key).join(' and ');
    if (blockers.length) {
      return `${blockers.map(b => b.key).join(' and ')} ${blockers.length > 1 ? 'fall' : 'falls'} short. `
           + `But ${names} could not be read, so the overall answer is not settled yet.`;
    }
    return `Nothing that was read falls short. But ${names} could not be read, `
         + `so "nothing to buy" cannot be said yet.`;
  }

  // Phrasing the spend: with unpriced shortfalls, the total never poses as final
  const spendPhrase = () => {
    if (unpricedBlockers.length) {
      const declined = unpricedBlockers.filter(b => b.fixDeclined);
      const missing = unpricedBlockers.filter(b => !b.fixDeclined);
      const bits = [];
      if (needSpend) bits.push(`¥${needSpend.toLocaleString()}`);
      if (missing.length) bits.push(`the cost of ${missing.map(b => b.key).join(' and ')} (no price on file)`);
      if (declined.length) bits.push(`${declined.map(b => b.key).join(' and ')} judged not worth upgrading (see below)`);
      return bits.join(' + ');
    }
    return needSpend ? `¥${needSpend.toLocaleString()}` : '';
  };

  // "Solved for ¥0" is only ever said when there truly is no other spend.
  // Writing ¥0 off the Windows 11 story alone would hide the cost of parts that fall short.
  const biosOnly = win11 && win11.eligible === true && win11.cost === 0 && win11.actions.length;
  if (biosOnly && blockers.length === 0) {
    // "One BIOS setting is all it takes" is only said when the disabled TPM was
    // actually observed. When TPM was never read, the setting may not even be needed.
    return win11.tpmUnread
      ? 'There is nothing to buy. Worst case, Windows 11 asks for one free BIOS setting.'
      : 'Solved for ¥0. One BIOS setting is all it takes.';
  }
  if (biosOnly && blockers.length) {
    const yen = spendPhrase();
    return `The Windows 11 side needs no purchase (${win11.tpmUnread ? 'at most ' : ''}one BIOS setting). `
         + `Separately, ${blockers.map(b => b.key).join(' and ')} ${blockers.length > 1 ? 'fall' : 'falls'} short${yen ? ` = ${yen}` : ''}.`;
  }
  if (blockers.length === 0) {
    const tail = overkill.length
      ? ' (and part of this machine far exceeds what the workload needs — a past overspend)'
      : '';
    return `There is nothing here that needs buying.${tail}`;
  }
  if (blockers.length === 1) {
    const yen = spendPhrase();
    return `Replace exactly one thing: the ${blockers[0].key}. ${yen ? `${yen}. ` : ''}The machine itself stays.`;
  }
  return `${blockers.length} parts fall short${unpricedBlockers.length ? ` (no price on file for ${unpricedBlockers.map(b => b.key).join(' and ')})` : ''}. Everything else stays as it is.`;
}
