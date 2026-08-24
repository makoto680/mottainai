/**
 * Resolve a raw part string — as a screenshot, a human, or Windows itself writes it —
 * to a row in the parts table. Or refuse, with candidates, when the string does not
 * pin down one row.
 *
 * This is the boundary that keeps screenshot input honest. The model reads pixels and
 * hands back a string like "12th Gen Intel(R) Core(TM) i5-1235U   1.30 GHz". THIS code
 * decides which part that is. The model never picks the row, so a misread cannot flow
 * straight into a price.
 *
 * Rules, in the order they were learned:
 *  - Clean BOTH sides the same way. Early versions cleaned only the input, so
 *    "Athlon Dual Core 4050e" could not match its own row (whose name still carried
 *    "Dual Core") and fell through to the 2001 "Athlon 4" by containment. 132 of
 *    6,719 names mis-resolved that way; with both sides cleaned, zero do.
 *  - A containment match must consume every digit. If removing the matched name from
 *    the input leaves a digit behind, the input names a model we did not match
 *    (a 7700X3D landing on 7700X), so hold instead of picking.
 *  - Ties are only merged when the scores agree within 10% — then the rows are the
 *    same silicon listed twice (vendor-prefix duplicates, "with Radeon Graphics"
 *    variants). Ties with real score spread stay unresolved on purpose: RTX 3060,
 *    RTX 3060 8GB and RTX 3060 12GB are different products, and Task Manager's
 *    "NVIDIA GeForce RTX 3060" genuinely does not say which one is in the machine.
 */

const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Strip what Windows, OEMs and PassMark wrap around the actual model name:
 * trademark marks, clock speeds, core counts, "12th Gen" prefixes (the model number
 * already carries the generation), "with Radeon Graphics" tails, and — for GPUs —
 * the word "Graphics" itself plus VRAM sizes, which decorate rather than identify.
 */
function stripCommon(raw) {
  return String(raw)
    .replace(/\((R|TM|C)\)/gi, ' ')
    .replace(/[®™©]/g, ' ')
    .replace(/@?\s*\d+([.,]\d+)?\s*[GM]Hz\b/gi, ' ')
    .replace(/\b\d+[- ]?cores?\b/gi, ' ')
    .replace(/\b(dual|quad|six|eight|octa|hexa)[- ]?core\b/gi, ' ')
    .replace(/\bprocessors?\b/gi, ' ')
    .replace(/\bCPU\b/gi, ' ')
    .replace(/\bAPU\b/gi, ' ')
    .replace(/\bwith\s+radeon.*$/gi, ' ')
    .replace(/\bw\/\s*radeon.*$/gi, ' ')
    .replace(/\bwith\s+.*graphics.*$/gi, ' ')
    .replace(/\b\d{1,2}(st|nd|rd|th)\s+gen(eration)?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripGpu(raw) {
  return stripCommon(raw)
    .replace(/\bgraphics\b/gi, ' ')
    .replace(/\b\d+\s*GB\b/gi, ' ')
    .replace(/\bvideo\s*card\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Same-silicon check for tied rows: scores within 10% of the largest. */
function sameSilicon(rows) {
  const s = rows.map(r => r.part.score).filter(v => v != null);
  if (s.length !== rows.length) return false;
  const max = Math.max(...s);
  return max > 0 && (max - Math.min(...s)) / max < 0.10;
}

const hold = (basis, candidates, cleaned) =>
  ({ picked: null, basis, candidates: candidates.map(r => r.part), cleaned });

/**
 * Build a resolver over one parts array. Cleaned keys are precomputed once —
 * resolution itself is then a scan, ~1ms per call over 6,719 rows.
 *
 * @param {Array} parts    rows from parts.json (cpus or gpus)
 * @param {Function} strip the cleaning function for this kind of part
 */
function buildResolver(parts, strip) {
  const rows = parts
    .map(part => ({
      part,
      key: norm(strip(part.fullName)),
      nameKey: norm(strip(part.name)),
    }))
    // A key reduced to nothing, or to a bare generic word, can only mis-match.
    .filter(r => r.nameKey.length >= 4);

  return function resolve(raw) {
    const cleaned = strip(raw ?? '');
    const n = norm(cleaned);
    if (!n) return { picked: null, basis: 'empty', candidates: [], cleaned };

    // 1) The whole cleaned string IS a row's cleaned name.
    const exact = rows.filter(r => r.key === n || r.nameKey === n);
    if (exact.length === 1) {
      return { picked: exact[0].part, basis: 'exact', candidates: [], cleaned };
    }
    if (exact.length > 1) {
      if (sameSilicon(exact)) {
        return { picked: exact[0].part, basis: 'exact-duplicate-rows', candidates: [], cleaned };
      }
      return hold('exact-ambiguous', exact, cleaned);
    }

    // 2) The cleaned string contains a row's cleaned name. Longest name wins,
    //    but only alone, and only if it consumed every digit in the input.
    const contains = rows.filter(r => n.includes(r.nameKey));
    if (contains.length) {
      contains.sort((a, b) => b.nameKey.length - a.nameKey.length);
      const top = contains[0].nameKey.length;
      const tied = contains.filter(r => r.nameKey.length === top);
      if (tied.length === 1) {
        const leftover = n.replace(tied[0].nameKey, '');
        if (/\d/.test(leftover)) return hold('unconsumed-digits', contains.slice(0, 5), cleaned);
        return { picked: tied[0].part, basis: 'contains', candidates: [], cleaned };
      }
      if (sameSilicon(tied)) {
        return { picked: tied[0].part, basis: 'contains-duplicate-rows', candidates: [], cleaned };
      }
      return hold('contains-ambiguous', tied, cleaned);
    }

    // 2b) The row's name contains the whole input — "GTX 1070 Ti" inside
    //     "GeForce GTX 1070 Ti". People and screenshots routinely drop the brand.
    //     Accept ONLY when everything the row adds beyond the input is brand fluff:
    //     "GeForce" may be elided, a trailing "Ti"/"Super"/"XT" may not — those name
    //     a different product, and picking across them is exactly the mis-resolution
    //     this module exists to refuse.
    if (n.length >= 4 && /\d/.test(n)) {
      const BRAND_FLUFF = /(nvidia|geforce|quadro|amd|ati|radeon|intel|arc|core|ryzen|athlon|pentium|celeron|xeon|apple|qualcomm|snapdragon|gtx|rtx|rx)/g;
      const within = rows.filter(r =>
        r.nameKey.includes(n) && !r.nameKey.replace(n, '').replace(BRAND_FLUFF, '').length);
      if (within.length === 1) {
        return { picked: within[0].part, basis: 'brand-elided', candidates: [], cleaned };
      }
      if (within.length > 1) {
        if (sameSilicon(within)) {
          return { picked: within[0].part, basis: 'brand-elided-duplicate-rows', candidates: [], cleaned };
        }
        return hold('brand-elided-ambiguous', within, cleaned);
      }
    }

    // 3) Nothing. Offer near misses (shared model-number token) for a human to pick from.
    const tokens = (n.match(/[a-z]?\d{3,5}[a-z]{0,3}\d?/g) ?? []).filter(t => t.length >= 4);
    const near = tokens.length
      ? rows.filter(r => tokens.some(t => r.nameKey.includes(t))).slice(0, 5)
      : [];
    return hold('no-match', near, cleaned);
  };
}

/**
 * @param {{cpus: Array, gpus: Array}} parts  the loaded parts.json
 * @returns {{cpu: Function, gpu: Function}}  resolvers; each returns
 *   { picked, basis, candidates, cleaned } and picked is null whenever the
 *   string does not settle on one row.
 */
export function buildResolvers(parts) {
  return {
    cpu: buildResolver(parts.cpus ?? [], stripCommon),
    gpu: buildResolver(parts.gpus ?? [], stripGpu),
  };
}

export const _internals = { stripCommon, stripGpu, norm };
