/**
 * Merge what several screenshots said about ONE machine.
 *
 * Two screens are needed to cover this tool's four inputs, and neither covers all of them:
 *   Settings > System > About      → processor, installed RAM, Windows edition
 *   Task Manager > Performance     → graphics card, and whether C: is an SSD or a hard disk
 *
 * So the model reads each image on its own, and THIS code decides what the set of images
 * adds up to. The merge lives here, in code, for the same reason the verdict does: a
 * disagreement between two screenshots must not be settled by whichever answer the model
 * happened to write last.
 *
 * The rule everywhere below is the same one the rest of the engine follows — when the
 * images disagree, the merged value is null. Null means "not read", and "not read" is
 * carried all the way to the screen as UNKNOWN. Guessing in either direction is worse:
 * guessing high sells hardware, guessing low calls a working machine broken.
 *
 * One exception, and it is not a guess: values that differ only by how Windows rounds
 * them are the same value. "Installed RAM 16.0 GB" and Task Manager's "15.9 GB" are one
 * machine with 16 GB, not a conflict.
 */

/** How far two readings of the same physical number may drift and still be one number. */
const NUMERIC_TOLERANCE = 1.15;

/**
 * Memory sizes that actually exist, in GB. Memory is not a continuous quantity — it is
 * sold in sticks, and a machine holds a sum of them.
 */
const REAL_MEMORY_SIZES = [1, 2, 3, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96, 128, 192, 256];

/**
 * The largest gap, in GB, between what Windows says it can use and what is installed.
 *
 * Windows subtracts what the hardware reserved for itself — mostly the integrated GPU,
 * which takes a few hundred megabytes and, on the heaviest machines, about a gigabyte.
 * So Task Manager on a 16 GB machine reads 15.9, and Settings > About on a 4 GB one
 * reads 3.9.
 *
 * This is not a rounding preference. Without it a real 16 GB machine reads as 15.9,
 * falls one tenth of a gigabyte under a workload that needs 16, and gets told to buy
 * memory it already has — the exact failure this tool exists to prevent.
 *
 * The rule is deliberately narrow: only upward, only onto a size that exists, and only
 * across a gap the hardware reserve can actually explain. A reading of 14 GB is left at
 * 14 GB, because nothing reserves two gigabytes.
 */
const RESERVED_HEADROOM_GB = 1.0;

/**
 * Read a memory figure as the installed size.
 * Returns { value, readAs } — readAs is set only when the two differ, so the screen can
 * show both and the correction never has to be taken on trust.
 */
export function installedMemory(reported) {
  if (reported == null) return { value: null, readAs: null };
  if (REAL_MEMORY_SIZES.includes(reported)) return { value: reported, readAs: null };
  const size = REAL_MEMORY_SIZES.find(s => s >= reported && s - reported <= RESERVED_HEADROOM_GB);
  return size ? { value: size, readAs: reported } : { value: reported, readAs: null };
}

const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 };
const rankOf = c => CONFIDENCE_RANK[String(c ?? '').toLowerCase()] ?? 0;

/** Strings the model uses for "there is nothing here", which are not part names. */
const EMPTY_NAME = /^(null|none|n\/a|na|unknown|not visible|not shown|-{1,})$/i;

const cleanName = s => {
  const t = String(s ?? '').trim();
  return !t || EMPTY_NAME.test(t) ? null : t;
};

const nameKey = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/** Parse a number that may arrive as "16", 16, "16.0 GB" or "15.9/16.0 GB". */
function toNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  // "15.9/16.0 GB" — the installed size is the larger side, so take the last number.
  const all = String(v).match(/\d+(\.\d+)?/g);
  if (!all?.length) return null;
  const n = Math.max(...all.map(Number));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Collapse several readings of one physical quantity.
 * Within tolerance they are the same thing measured twice → keep the larger (the
 * installed size; the smaller reading is Windows subtracting what is reserved).
 */
function mergeNumeric(values, label) {
  const nums = values.map(toNumber).filter(n => n != null);
  if (!nums.length) return { value: null, conflict: null };
  const max = Math.max(...nums), min = Math.min(...nums);
  if (max / min <= NUMERIC_TOLERANCE) return { value: max, conflict: null };
  return {
    value: null,
    conflict: `${label}: the screenshots do not agree (${[...new Set(nums)].join(' / ')}). `
            + 'Not used, because there is no way to tell from here which one is this machine.',
  };
}

/**
 * Drive type. nvme and ssd are not a conflict — nvme is the more specific reading of
 * the same fact ("this is not a spinning disk"), and that fact is what the verdict uses.
 * hdd against ssd IS a conflict: usually the machine has both drives and the shots are
 * looking at different ones, and only the drive holding C: decides how the machine feels.
 */
function mergeStorageType(values) {
  const set = new Set(values.map(v => String(v ?? '').toLowerCase()).filter(v => /^(hdd|ssd|nvme)$/.test(v)));
  if (!set.size) return { value: null, conflict: null };
  const solid = set.has('ssd') || set.has('nvme');
  if (set.has('hdd') && solid) {
    return {
      value: null,
      conflict: 'System drive: one screenshot shows a hard disk and another shows an SSD. '
              + 'If this PC has both, the one that matters is the drive holding C: — '
              + 'send the Task Manager shot with that drive selected.',
    };
  }
  if (set.has('hdd')) return { value: 'hdd', conflict: null };
  return { value: set.has('nvme') ? 'nvme' : 'ssd', conflict: null };
}

/**
 * Part names are NOT compared for equality here.
 *
 * "12th Gen Intel(R) Core(TM) i5-1235U   1.30 GHz" and "Intel Core i5-1235U" are the same
 * chip written two ways, and deciding that is exactly what core/resolve.js exists for.
 * So every distinct string is carried forward as a candidate, best-read first, and the
 * resolver decides whether they land on one row. Settling it on the raw strings here
 * would throw away the second screenshot for no reason.
 */
function mergeNames(entries) {
  const seen = new Map();
  for (const e of entries) {
    const name = cleanName(e?.name);
    if (!name) continue;
    const key = nameKey(name);
    if (!key) continue;
    const rank = rankOf(e?.confidence);
    const prev = seen.get(key);
    if (!prev || rank > prev.rank) seen.set(key, { name, rank, order: prev?.order ?? seen.size });
  }
  return [...seen.values()]
    .sort((a, b) => (b.rank - a.rank) || (a.order - b.order))
    .map(v => v.name);
}

/** TPM is a yes/no fact; two screenshots claiming both ways means we do not know. */
function mergeTpm(values) {
  const set = new Set(values.map(v => String(v ?? '').toLowerCase()).filter(v => v === 'enabled' || v === 'disabled'));
  if (set.size === 1) return [...set][0];
  return 'unknown';
}

/**
 * @param {Array<object>} scans  one raw model answer per image (may include failures)
 * @returns {object} the shape resolveNode consumes, plus the bookkeeping the screen needs
 */
export function mergeScans(scans) {
  const list = (scans ?? []).filter(s => s && typeof s === 'object');

  const ramReported = mergeNumeric(list.map(s => s.ramGB), 'Installed memory');
  const ram = installedMemory(ramReported.value);
  const storageType = mergeStorageType(list.map(s => s.storage?.type));
  // Capacity is only meaningful once the drives agree on what they are.
  const storageGb = storageType.value
    ? mergeNumeric(list.map(s => s.storage?.gb), 'System drive size')
    : { value: null, conflict: null };

  // 「この画面には映っていない」は、その画像1枚についての事実であって、
  // 全体についての事実ではない。番号を付けずに並べると、2枚目で実際に読めた
  // グラフィックの横に「グラフィックが読めなかった」が残り、画面が嘘をつく。
  const unreadable = [...new Set(list.flatMap((s, i) => {
    const own = (Array.isArray(s.unreadable) ? s.unreadable : []).map(u => String(u).trim()).filter(Boolean);
    const notes = s.readError ? [`could not be read — ${s.readError}`, ...own] : own;
    return notes.map(u => `image ${i + 1}: ${u}`);
  }))];

  const conflicts = [ramReported.conflict, storageType.conflict, storageGb.conflict].filter(Boolean);

  return {
    imageCount: list.length,
    // A failed image is not a read image. The screen says how many actually landed.
    readCount: list.filter(s => !s.readError).length,
    screens: [...new Set(list.map(s => s.screen).filter(Boolean))],

    cpuCandidates: mergeNames(list.map(s => s.cpu)),
    gpuCandidates: mergeNames(list.map(s => s.gpu)),
    ramGB: ram.value,
    // 直した時だけ、直す前の数字も持って行く。画面に両方出せば、
    // この補正を読む側が信じる必要がなくなる。
    ramReadAs: ram.readAs,
    storage: { type: storageType.value, gb: storageGb.value },
    tpm: mergeTpm(list.map(s => s.tpm)),
    os: list.map(s => cleanName(s.os)).find(Boolean) ?? null,

    unreadable,
    conflicts,
    // The mock model's answers must stay branded as mock all the way to the screen,
    // or a key-less demo quietly looks like a real reading.
    mocked: list.some(s => s.mocked === true),
  };
}

export const _internals = { mergeNumeric, mergeStorageType, mergeNames, mergeTpm, toNumber, REAL_MEMORY_SIZES };
