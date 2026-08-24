/**
 * Decide whether a CPU is on Microsoft's official Windows 11 supported list.
 *
 * Microsoft publishes three lists (Intel / AMD / Qualcomm). They are not the same shape:
 *   - AMD and Qualcomm list individual models      -> exact match after normalisation
 *   - Intel lists SERIES names ("Celeron N4000 Series", "8th Generation Core i5 Processors")
 *     -> a model has to be mapped onto a series before it can be matched
 *
 * That mapping is an interpretation, so every answer carries `matchedBy`: the exact list
 * entry the decision came from. If a name cannot be mapped, the answer is `null`
 * (unknown) and never `false` — an unsupported guess and a real absence look identical
 * to a reader, and only one of them is honest.
 *
 * Absence from the list DOES mean unsupported: Microsoft states the listed processors are
 * the supported ones. So a name that parses cleanly but matches nothing is `false`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const VENDOR = path.join(DIR, 'vendor');

const load = f => JSON.parse(fs.readFileSync(path.join(VENDOR, f), 'utf8'));

const INTEL = load('ms_win11_intel.json');
const AMD = load('ms_win11_amd.json');
const QUALCOMM = load('ms_win11_qualcomm.json');

/** Lowercase, strip everything that is not a letter or digit. */
const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The AMD and Qualcomm tables split a part across two columns: brand ("Ryzen 5") and
 * model ("2600"). Neither half matches a real CPU name on its own, so index the join.
 * The generic "AMD" brand rows (3015e, 3020e) carry the whole name in `model`.
 */
function indexByModel(list) {
  const map = new Map();
  const add = (key, label) => { if (key && !map.has(key)) map.set(key, label); };
  for (const e of list.entries) {
    const full = e.brand && e.brand !== 'AMD' && e.brand !== e.manufacturer
      ? `${e.brand} ${e.model}`
      : e.model;
    const label = `${e.manufacturer} ${full}`.replace(/\s+/g, ' ').trim();
    add(norm(full), label);
    add(norm(label), label);
    // Microsoft writes some rows longer than the name anyone actually uses:
    // "Ryzen 5 3500 Processor", "Ryzen 3 3200G with Radeon Vega 8 Graphics".
    const short = full.replace(/\s+with\s+.*$/i, '').replace(/\s+processors?$/i, '').trim();
    add(norm(short), label);
  }
  return map;
}
const AMD_MODELS = indexByModel(AMD);
const QUALCOMM_MODELS = indexByModel(QUALCOMM);

/**
 * Model numbers where only the PRO variant is listed (e.g. "Ryzen 7 PRO 8845HS" is on
 * the list, plain "Ryzen 7 8845HS" is not). The two are the same silicon with different
 * management features, but Microsoft listed one and not the other. Claiming the plain
 * part is supported would go beyond the list; claiming it is unsupported would read the
 * omission as a decision. Both overstate what the list says, so these resolve to unknown.
 */
const AMD_PRO_ONLY = (() => {
  const map = new Map();
  for (const e of AMD.entries) {
    if (!/\bPRO\b/i.test(e.brand ?? '')) continue;
    const withoutPro = `${e.brand.replace(/\s*\bPRO\b\s*/i, ' ').trim()} ${e.model}`;
    const key = norm(withoutPro);
    if (!AMD_MODELS.has(key) && !map.has(key)) map.set(key, `AMD ${e.brand} ${e.model}`);
  }
  return map;
})();

/**
 * Listed parts grouped by tier and bare model number, so a suffix the list never wrote
 * down can be told apart from a part the list turned away.
 *
 * "Ryzen 5 5600F" is not on the list, but "Ryzen 5 5600", "5600G" and "5600X" all are —
 * the same silicon under a different suffix. That is the list being incomplete, not
 * Microsoft ruling the chip out, and printing "Windows 11 will not run" over a
 * transcription gap is the kind of wrong that costs the reader's trust in every other
 * number on the page. Compare against "Ryzen 3 2200G", which really is absent on purpose:
 * no 2200-numbered Ryzen 3 appears at all, so nothing here fires and it stays false.
 */
const AMD_NUMBER_SIBLINGS = (() => {
  const map = new Map();
  for (const e of AMD.entries) {
    const tier = String(e.brand ?? '').match(/^Ryzen [3579]/i)?.[0];
    const digits = String(e.model).match(/\b(\d{4})\b/)?.[1];
    if (!tier || !digits) continue;
    const key = norm(`${tier} ${digits}`);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(`AMD ${e.brand} ${e.model}`);
  }
  return map;
})();

/** The Intel series entries, kept as written so `matchedBy` can quote them verbatim. */
const INTEL_SERIES = new Set(INTEL.entries.map(e => e.model));
const hasSeries = name => INTEL_SERIES.has(name) ? name : null;

/**
 * How far the list reaches, read off the list itself rather than hard-coded, so a
 * re-fetch moves the edges on its own.
 *
 * Falling off the bottom and falling off the top are not the same event. Microsoft had
 * 7th generation Core in front of it and left it out: that is a decision, and "not
 * supported" is a fair reading. Ryzen 9000 desktop parts appear nowhere on the list at
 * all — the consumer Ryzen entries stop at the 8000 series — and reading that silence as
 * "not supported" would put "Windows 11 will not run" next to a current flagship. One is
 * an exclusion, the other is a list that has not caught up, and only the first is a fact.
 */
const INTEL_CORE_GENS = (() => {
  const gens = [];
  for (const model of INTEL_SERIES) {
    const m = model.match(/(\d+)(?:st|nd|rd|th) Generation/i);
    if (m) gens.push(Number(m[1]));
  }
  return { min: Math.min(...gens), max: Math.max(...gens) };
})();

const AMD_RYZEN_SERIES = (() => {
  const series = [];
  for (const e of AMD.entries) {
    if (!/^Ryzen [3579](\s+PRO)?$/i.test(e.brand ?? '')) continue;
    const m = String(e.model).match(/^(\d)\d{3}/);
    if (m) series.push(Number(m[1]));
  }
  return { min: Math.min(...series), max: Math.max(...series) };
})();

/** Families that stopped being made long before the list's floor. Absence is not news. */
const PRE_LIST_INTEL = /\bcore\s*2\b|pentium\s*(4|d\b|dual|iii|ii)\b|celeron\s*(d|dual)\b|\batom\s*[DNZ]\d/i;
const PRE_LIST_AMD = /\bA\d{1,2}[\s-]|\bAthlon\s*(II|X[24])\b|\bphenom\b|\bsempron\b|\bturion\b|\bE[12]-\d{4}\b|\bFX-\d{4}\b/i;

const answer = (supported, matchedBy, reason, source) =>
  ({ supported, matchedBy, reason, source });

const UNKNOWN = reason => answer(null, null, reason, null);

/**
 * Intel Core i3/i5/i7/i9 generation from the model number.
 *
 * The digit count carries the meaning, and getting it wrong is dangerous in one
 * specific direction: i7-920 and i5-750 are 1st generation parts from 2009. Reading
 * their leading digit as a generation would call them 9th and 7th gen, and the 9th
 * gen answer would flip an unsupported machine to "supported".
 *
 *   3 digits  (i7-920, i3-530)          -> 1st generation
 *   4 digits starting 2-9 (i5-8250U)    -> leading digit
 *   4 digits starting 1  (i5-1235U)     -> leading two digits, i.e. 10th-19th
 *   5 digits  (i5-10400, i9-14900K)     -> leading two digits
 *
 * The 4-digit case splits on the leading digit rather than on a G suffix: 11th gen
 * mobile parts wear one (i5-1135G7) but 12th and 13th gen mobile parts do not
 * (i5-1235U, i5-1335U), and reading those as 1st generation would call a current
 * laptop unsupported. No 1st generation part ever had a 4-digit number, so a leading
 * 1 in four digits is always a 10-and-up generation.
 */
function intelCoreGeneration(digits) {
  if (digits.length === 3) return 1;
  if (digits.length === 5) return parseInt(digits.slice(0, 2), 10);
  if (digits.length === 4) {
    return digits[0] === '1'
      ? parseInt(digits.slice(0, 2), 10)
      : parseInt(digits[0], 10);
  }
  return null;
}

function matchIntel(raw) {
  const src = INTEL.source;
  const s = raw.replace(/\s+/g, ' ').trim();

  // Core Ultra — every Series 1/2/3 part is listed.
  if (/core\s+ultra/i.test(s)) {
    const hit = hasSeries('Core Ultra Processors (Series 1)');
    return answer(true, hit, 'Core Ultra parts are listed by series', src);
  }

  // Core 3/5/7/9 without the "i" (Series 1 / Series 2, e.g. "Core 7 150U").
  const plainCore = s.match(/\bcore\s+([3579])\s*[- ]?\s*(\d{3})\b/i);
  if (plainCore && !/\bi[3579]\b/i.test(s)) {
    const hit = hasSeries('Core Processors (Series 1)');
    return answer(true, hit, 'Core Series 1/2 parts are listed by series', src);
  }

  // Core i3/i5/i7/i9.
  const core = s.match(/\bi([3579])[\s-]*(\d{3,5})([A-Za-z]*\d*)/);
  if (core) {
    const tier = core[1];
    const gen = intelCoreGeneration(core[2]);
    if (gen === null) return UNKNOWN(`could not read a generation from "i${tier}-${core[2]}"`);
    // The list spells 8th-13th one way and 14th another; try both spellings.
    const candidates = [
      `${gen}th Generation Core i${tier} Processors`,
      `Core i${tier} Processors (${gen}th Generation)`,
      `Core i${tier} processors (${gen}th Generation)`,
    ];
    const hit = candidates.map(hasSeries).find(Boolean);
    if (hit) return answer(true, hit, `read as Intel Core ${gen}th generation`, src);
    if (gen > INTEL_CORE_GENS.max) {
      return UNKNOWN(
        `read as Intel Core ${gen}th generation, past the ${INTEL_CORE_GENS.max}th generation ` +
        `where this list stops — later than the list reaches, not excluded by it`,
      );
    }
    return answer(false, null,
      `read as Intel Core ${gen}th generation; the list starts at the ` +
      `${INTEL_CORE_GENS.min}th and does not include it`, src);
  }

  // Celeron — series named by the leading digit, with an optional letter prefix.
  const celeron = s.match(/\bceleron\s+([A-Za-z]?)(\d)(\d{3})\b/i);
  if (celeron) {
    const prefix = (celeron[1] || '').toUpperCase();
    const series = `Celeron ${prefix}${celeron[2]}000 Series`;
    const hit = hasSeries(series);
    if (hit) return answer(true, hit, 'matched the Celeron series', src);
    return answer(false, null, `read as "${series}", which is not on the list`, src);
  }

  // Pentium Gold / Silver / plain, same series shape.
  const pentium = s.match(/\bpentium\s+(gold|silver)?\s*([A-Za-z]?)(\d)(\d{3})([A-Za-z]*)/i);
  if (pentium) {
    const brand = pentium[1] ? pentium[1][0].toUpperCase() + pentium[1].slice(1).toLowerCase() : null;
    const prefix = (pentium[2] || '').toUpperCase();
    const lead = pentium[3];
    const tail = (pentium[5] || '').toUpperCase();
    const stems = brand
      ? [`Pentium ${brand} ${prefix}${lead}000${tail} Series`, `Pentium ${brand} ${prefix}${lead}000 Series`]
      : [`Pentium ${prefix}${lead}${pentium[4]} Series`, `Pentium ${prefix}${lead}000 Series`];
    const hit = stems.map(hasSeries).find(Boolean);
    if (hit) return answer(true, hit, 'matched the Pentium series', src);
    return answer(false, null, `read as "${stems[0]}", which is not on the list`, src);
  }

  // Intel Processor N-series and U300 (the current budget line).
  const nSeries = s.match(/\bintel\b[^a-z0-9]*\b(N\d{2,3}|U300)\b/i);
  if (nSeries) {
    const model = nSeries[1].toUpperCase();
    const hit = ['N100', 'N200', 'N300', 'N90']
      .filter(p => model.startsWith(p))
      .map(p => hasSeries(`${p} Series`)).find(Boolean)
      ?? (model === 'U300' ? hasSeries('U300 series') : null);
    if (hit) return answer(true, hit, 'matched the Intel Processor series', src);
    return answer(false, null, `read as Intel Processor "${model}", which is not on the list`, src);
  }

  // Atom — only the X7000 series is listed.
  const atom = s.match(/\batom\b\s*([A-Za-z]?)(\d)(\d{3})/i);
  if (atom) {
    const series = `Atom ${(atom[1] || '').toUpperCase()}${atom[2]}000 Series`;
    const hit = hasSeries(series);
    if (hit) return answer(true, hit, 'matched the Atom series', src);
    return answer(false, null, `read as "${series}", which is not on the list`, src);
  }

  if (/\bxeon\b/i.test(s)) return UNKNOWN('Xeon series mapping is not implemented');

  // Anything clearly pre-dating the list: Core 2, Pentium 4/D, Celeron Dual-Core.
  if (PRE_LIST_INTEL.test(s)) {
    return answer(false, null, 'a pre-Core-i generation part, which is not on the list', src);
  }

  return UNKNOWN(`could not read an Intel family out of "${raw}"`);
}

function matchAmd(raw) {
  const src = AMD.source;
  // Strip the marketing prefix and any clock speed PassMark appends.
  const cleaned = raw.replace(/^AMD\s+/i, '').replace(/@.*$/, '').trim();
  const direct = AMD_MODELS.get(norm(cleaned));
  if (direct) return answer(true, direct, 'exact match on the AMD list', src);

  // PassMark sometimes carries a suffix the list does not ("Ryzen 5 5600G with Radeon Graphics").
  const trimmed = cleaned.replace(/\s+with\s+.*$/i, '').trim();
  const viaTrim = AMD_MODELS.get(norm(trimmed));
  if (viaTrim) return answer(true, viaTrim, 'exact match on the AMD list', src);

  const proOnly = AMD_PRO_ONLY.get(norm(trimmed)) ?? AMD_PRO_ONLY.get(norm(cleaned));
  if (proOnly) {
    return UNKNOWN(`the list carries "${proOnly}" but not this non-PRO version of the same model number`);
  }

  // Ryzen numbering carries the series in its leading digit, so the list's own span says
  // whether an absence is an exclusion or a gap the list has not reached yet.
  const ryzen = trimmed.match(/^(Ryzen\s+[3579])\s+(?:PRO\s+)?((\d)\d{3})/i);
  if (ryzen) {
    const siblings = AMD_NUMBER_SIBLINGS.get(norm(`${ryzen[1]} ${ryzen[2]}`));
    if (siblings?.length) {
      return UNKNOWN(
        `the list carries ${siblings.slice(0, 3).join(', ')} but not this suffix — ` +
        `a gap in the list rather than a part it turned away`,
      );
    }
    const series = Number(ryzen[3]);
    if (series > AMD_RYZEN_SERIES.max) {
      return UNKNOWN(
        `a Ryzen ${series}000-series part, past the ${AMD_RYZEN_SERIES.max}000 series ` +
        `where this list stops — later than the list reaches, not excluded by it`,
      );
    }
    return answer(false, null,
      `a Ryzen ${series}000-series part; the list carries the ` +
      `${AMD_RYZEN_SERIES.min}000 series onward and does not include it`, src);
  }

  // Pre-Ryzen AMD: A-series APUs, Phenom, Sempron, Turion, FX.
  if (PRE_LIST_AMD.test(cleaned)) {
    return answer(false, null, 'a pre-Ryzen AMD part, which is not on the list', src);
  }

  if (/ryzen|athlon|epyc|threadripper|\b30[12]0e\b/i.test(cleaned)) {
    return answer(false, null, 'an AMD part that is not on the list', src);
  }
  return UNKNOWN(`could not read an AMD model out of "${raw}"`);
}

function matchQualcomm(raw) {
  const src = QUALCOMM.source;
  const cleaned = raw.replace(/@.*$/, '').trim();
  for (const [key, model] of QUALCOMM_MODELS) {
    if (norm(cleaned).includes(key)) return answer(true, model, 'exact match on the Qualcomm list', src);
  }
  return answer(false, null, 'a Qualcomm part that is not on the list', src);
}

/**
 * @param {string} cpuName  a PassMark-style name, e.g. "Intel Core i5-8250U @ 1.60GHz"
 * @returns {{supported: boolean|null, matchedBy: string|null, reason: string, source: string|null}}
 */
export function win11Support(cpuName) {
  const s = String(cpuName ?? '').trim();
  if (!s) return UNKNOWN('empty name');

  if (/\b(intel|celeron|pentium|atom|xeon)\b/i.test(s) || /\bcore\s*i?[3579]\b/i.test(s)) return matchIntel(s);
  if (/\b(amd|ryzen|athlon|epyc|threadripper)\b/i.test(s)) return matchAmd(s);
  if (/\b(qualcomm|snapdragon|microsoft sq)\b/i.test(s)) return matchQualcomm(s);

  return UNKNOWN(`could not tell which vendor "${cpuName}" belongs to`);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** PassMark writes release dates as "Aug 2024". Returns a sortable YYYYMM number. */
export function releaseKey(dateText) {
  const m = String(dateText ?? '').trim().match(/^([A-Za-z]{3})[a-z]*\s+(\d{4})$/);
  if (!m) {
    const yearOnly = String(dateText ?? '').match(/\b(\d{4})\b/);
    return yearOnly ? Number(yearOnly[1]) * 100 : null;
  }
  const month = MONTHS.indexOf(m[1].toLowerCase());
  return month < 0 ? Number(m[2]) * 100 : Number(m[2]) * 100 + month + 1;
}

/**
 * A list published on a date cannot describe parts that did not exist yet, and
 * Microsoft has not refreshed these lists since. Ryzen 9000 desktop parts are the clear
 * case: none of them appear, and calling a current flagship "not supported by Windows 11"
 * would be plainly false — the list simply stops before them.
 *
 * So absence only means "unsupported" for parts old enough that the list had the chance
 * to include them. `newestOnList` is measured, not assumed: it is the newest release date
 * among the parts from that vendor that DID match. Anything newer than that gets `null`.
 */
export function applyListLag(verdict, { releasedOn, newestOnList }) {
  if (verdict.supported !== false) return verdict;
  const released = releaseKey(releasedOn);
  if (released === null || newestOnList === null || released <= newestOnList) return verdict;
  return UNKNOWN(
    `released ${releasedOn}, after the newest part this list covers — ` +
    `the list stops before it rather than ruling it out`,
  );
}

export const LIST_SOURCES = {
  intel: { source: INTEL.source, entries: INTEL.entryCount, listVersion: INTEL.listVersion },
  amd: { source: AMD.source, entries: AMD.entryCount, listVersion: AMD.listVersion },
  qualcomm: { source: QUALCOMM.source, entries: QUALCOMM.entryCount, listVersion: QUALCOMM.listVersion },
};
