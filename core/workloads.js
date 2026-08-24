/**
 * Workload profile definitions
 *
 * This is the heart of MOTTAINAI. Most tools map a workload to a recommended
 * build (the expensive kind). Here every workload carries BOTH the floor it
 * really needs and the ceiling past which nothing feels different. The ceiling
 * is what lets the tool say "more than this buys you nothing" with a straight face.
 *
 * need   … below this the workload stops being practical
 * enough … above this the difference stops being felt (= buying more is waste)
 *
 * Scores use the same source as data/parts.json (PassMark family).
 * Mixing sources would break every comparison.
 *
 * The need/enough numbers are editorial judgement from decades of building
 * PCs, not an official spec — the UI says so in its footer.
 */

export const WORKLOADS = {
  office: {
    id: 'office',
    label: 'Web, video, office work',
    labelJa: 'Web・動画視聴・Office（事務）',
    cpu:  { need: 2500,  enough: 8000 },
    gpu:  { need: 0,     enough: 0,     integratedOk: true },
    ram:  { need: 8,     enough: 16 },
    storage: { ssdRequired: true, need: 256 },
    note: 'The workload people overpay for most. An SSD changes how it feels; spare CPU power does not.',
  },

  meeting: {
    id: 'meeting',
    label: 'Video meetings (Zoom, Teams)',
    labelJa: 'ビデオ会議（Zoom・Teams）',
    cpu:  { need: 3500,  enough: 10000 },
    gpu:  { need: 0,     enough: 0,     integratedOk: true },
    ram:  { need: 8,     enough: 16 },
    storage: { ssdRequired: true, need: 256 },
    note: 'Background blur costs CPU, but recent integrated GPUs/NPUs handle it. A discrete GPU is unnecessary.',
  },

  photo: {
    id: 'photo',
    label: 'Photo editing / RAW',
    labelJa: '写真編集・RAW現像',
    cpu:  { need: 6000,  enough: 20000 },
    gpu:  { need: 0,     enough: 4000,  integratedOk: true },
    ram:  { need: 16,    enough: 32 },
    storage: { ssdRequired: true, need: 512 },
    note: 'RAM is what helps. GPU acceleration depends on the app, which makes it easy to over-invest in.',
  },

  video_fhd: {
    id: 'video_fhd',
    label: '1080p video editing',
    labelJa: 'フルHD動画編集',
    cpu:  { need: 8000,  enough: 25000 },
    gpu:  { need: 2000,  enough: 9000,  integratedOk: true },
    ram:  { need: 16,    enough: 32 },
    storage: { ssdRequired: true, need: 512 },
    note: 'Hardware encoders (QSV/NVENC) do the heavy lifting, so integrated graphics are often workable.',
  },

  video_4k: {
    id: 'video_4k',
    label: '4K video editing',
    labelJa: '4K動画編集',
    cpu:  { need: 15000, enough: 40000 },
    gpu:  { need: 6000,  enough: 20000, integratedOk: false },
    ram:  { need: 32,    enough: 64 },
    storage: { ssdRequired: true, need: 1024 },
    note: 'One of the few workloads where spending is justified — if 4K is your daily format, not an occasional one.',
  },

  game_light: {
    id: 'game_light',
    label: 'Light gaming (VALORANT, Minecraft, Genshin)',
    labelJa: '軽いゲーム（VALORANT・Minecraft・原神）',
    cpu:  { need: 5000,  enough: 15000 },
    gpu:  { need: 1500,  enough: 8000,  integratedOk: true },
    ram:  { need: 8,     enough: 16 },
    storage: { ssdRequired: true, need: 512 },
    note: 'Runs fine on recent integrated GPUs (Iris Xe / Radeon 780M). Being sold a GPU here is the most common overspend.',
  },

  game_fhd: {
    id: 'game_fhd',
    label: '1080p 60fps gaming',
    labelJa: 'フルHD 60fpsでゲーム',
    cpu:  { need: 8000,  enough: 22000 },
    gpu:  { need: 7000,  enough: 22000, integratedOk: false },
    ram:  { need: 16,    enough: 32 },
    storage: { ssdRequired: true, need: 512 },
    note: 'At 1080p the upper GPU tiers are pure waste. Check your monitor resolution before your GPU.',
  },

  game_4k: {
    id: 'game_4k',
    label: '4K / high-refresh gaming',
    labelJa: '4K・高リフレッシュでゲーム',
    cpu:  { need: 15000, enough: 35000 },
    gpu:  { need: 20000, enough: 60000, integratedOk: false },
    ram:  { need: 16,    enough: 32 },
    storage: { ssdRequired: true, need: 1024 },
    note: 'The one place a high-end GPU means something — assuming you actually own a 4K monitor.',
  },

  dev: {
    id: 'dev',
    label: 'Software development',
    labelJa: 'プログラミング・開発',
    cpu:  { need: 6000,  enough: 25000 },
    gpu:  { need: 0,     enough: 0,     integratedOk: true },
    ram:  { need: 16,    enough: 32 },
    storage: { ssdRequired: true, need: 512 },
    note: 'RAM and an SSD are what matter. No GPU needed unless you run local LLMs.',
  },

  ai_local: {
    id: 'ai_local',
    label: 'Local AI / LLM inference',
    labelJa: 'ローカルで生成AIを動かす',
    cpu:  { need: 8000,  enough: 25000 },
    gpu:  { need: 10000, enough: 50000, integratedOk: false, vramNeed: 8, vramEnough: 24 },
    ram:  { need: 16,    enough: 64 },
    storage: { ssdRequired: true, need: 1024 },
    note: 'VRAM capacity is everything. Whether a model runs at all is decided by VRAM, not GPU speed.',
  },
};

/** When several workloads are picked, take the max of each requirement (fit the heaviest). */
export function mergeRequirements(workloadIds) {
  const list = workloadIds.map(id => WORKLOADS[id]).filter(Boolean);
  if (!list.length) return null;

  const pick = (path, fn) => fn(...list.map(w => path.split('.').reduce((o, k) => o?.[k], w) ?? 0));

  return {
    workloads: list,
    cpu: { need: pick('cpu.need', Math.max), enough: pick('cpu.enough', Math.max) },
    gpu: {
      need: pick('gpu.need', Math.max),
      enough: pick('gpu.enough', Math.max),
      // If any picked workload requires a discrete GPU, integrated no longer qualifies
      integratedOk: list.every(w => w.gpu.integratedOk !== false),
      vramNeed: pick('gpu.vramNeed', Math.max),
      vramEnough: pick('gpu.vramEnough', Math.max),
    },
    ram: { need: pick('ram.need', Math.max), enough: pick('ram.enough', Math.max) },
    storage: {
      ssdRequired: list.some(w => w.storage.ssdRequired),
      need: pick('storage.need', Math.max),
    },
  };
}

export const WORKLOAD_LIST = Object.values(WORKLOADS);
