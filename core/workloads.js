/**
 * 用途プロファイル定義
 *
 * ここが MOTTAINAI の芯。世の中のツールは「用途→おすすめ構成（高い方）」を返すが、
 * ここでは「用途→本当に必要な最低ライン」と「それ以上は体感が変わらない天井」の
 * 両方を持つ。天井があるから「これ以上は要らない」と言い切れる。
 *
 * need   … これを下回ると実用にならない下限
 * enough … これを超えたら体感がほぼ変わらない（＝買い足す価値が消える）天井
 *
 * スコアは data/parts.json と同じ出典（PassMark系）に揃える。混ぜると比較が壊れる。
 */

export const WORKLOADS = {
  office: {
    id: 'office',
    label: 'Web・動画視聴・Office（事務）',
    labelEn: 'Web, video, office work',
    cpu:  { need: 2500,  enough: 8000 },
    gpu:  { need: 0,     enough: 0,     integratedOk: true },
    ram:  { need: 8,     enough: 16 },
    storage: { ssdRequired: true, need: 256 },
    note: '一番人が金を払いすぎる用途。CPUの余力より、SSDかどうかで体感が決まる。',
  },

  meeting: {
    id: 'meeting',
    label: 'ビデオ会議（Zoom・Teams）',
    labelEn: 'Video meetings',
    cpu:  { need: 3500,  enough: 10000 },
    gpu:  { need: 0,     enough: 0,     integratedOk: true },
    ram:  { need: 8,     enough: 16 },
    storage: { ssdRequired: true, need: 256 },
    note: '背景ぼかしでCPUを食うが、近年は内蔵GPU/NPUが処理する。専用GPUは不要。',
  },

  photo: {
    id: 'photo',
    label: '写真編集・RAW現像',
    labelEn: 'Photo editing / RAW',
    cpu:  { need: 6000,  enough: 20000 },
    gpu:  { need: 0,     enough: 4000,  integratedOk: true },
    ram:  { need: 16,    enough: 32 },
    storage: { ssdRequired: true, need: 512 },
    note: 'メモリが効く。GPUは効くソフトと効かないソフトが分かれるので過剰投資しやすい。',
  },

  video_fhd: {
    id: 'video_fhd',
    label: 'フルHD動画編集',
    labelEn: '1080p video editing',
    cpu:  { need: 8000,  enough: 25000 },
    gpu:  { need: 2000,  enough: 9000,  integratedOk: true },
    ram:  { need: 16,    enough: 32 },
    storage: { ssdRequired: true, need: 512 },
    note: 'ハードウェアエンコード（QSV/NVENC）が効くので、内蔵GPUでも実用になる場合が多い。',
  },

  video_4k: {
    id: 'video_4k',
    label: '4K動画編集',
    labelEn: '4K video editing',
    cpu:  { need: 15000, enough: 40000 },
    gpu:  { need: 6000,  enough: 20000, integratedOk: false },
    ram:  { need: 32,    enough: 64 },
    storage: { ssdRequired: true, need: 1024 },
    note: '本当に4Kを常用するなら投資する価値がある数少ない用途。ただし「たまに」なら不要。',
  },

  game_light: {
    id: 'game_light',
    label: '軽いゲーム（VALORANT・Minecraft・原神）',
    labelEn: 'Light gaming',
    cpu:  { need: 5000,  enough: 15000 },
    gpu:  { need: 1500,  enough: 8000,  integratedOk: true },
    ram:  { need: 8,     enough: 16 },
    storage: { ssdRequired: true, need: 512 },
    note: '最新の内蔵GPU（Iris Xe / Radeon 780M）で普通に動く。ここでGPUを売られるのが最頻の過剰投資。',
  },

  game_fhd: {
    id: 'game_fhd',
    label: 'フルHD 60fpsでゲーム',
    labelEn: '1080p 60fps gaming',
    cpu:  { need: 8000,  enough: 22000 },
    gpu:  { need: 7000,  enough: 22000, integratedOk: false },
    ram:  { need: 16,    enough: 32 },
    storage: { ssdRequired: true, need: 512 },
    note: 'フルHDならGPUの上位帯は完全に無駄になる。モニタの解像度を先に確認すべき用途。',
  },

  game_4k: {
    id: 'game_4k',
    label: '4K・高リフレッシュでゲーム',
    labelEn: '4K / high-refresh gaming',
    cpu:  { need: 15000, enough: 35000 },
    gpu:  { need: 20000, enough: 60000, integratedOk: false },
    ram:  { need: 16,    enough: 32 },
    storage: { ssdRequired: true, need: 1024 },
    note: 'ここだけは上位GPUに意味がある。ただし4Kモニタを持っていることが前提。',
  },

  dev: {
    id: 'dev',
    label: 'プログラミング・開発',
    labelEn: 'Software development',
    cpu:  { need: 6000,  enough: 25000 },
    gpu:  { need: 0,     enough: 0,     integratedOk: true },
    ram:  { need: 16,    enough: 32 },
    storage: { ssdRequired: true, need: 512 },
    note: 'メモリとSSDが効く。GPUはローカルLLMを回さない限り不要。',
  },

  ai_local: {
    id: 'ai_local',
    label: 'ローカルで生成AIを動かす',
    labelEn: 'Local AI / LLM inference',
    cpu:  { need: 8000,  enough: 25000 },
    gpu:  { need: 10000, enough: 50000, integratedOk: false, vramNeed: 8, vramEnough: 24 },
    ram:  { need: 16,    enough: 64 },
    storage: { ssdRequired: true, need: 1024 },
    note: 'VRAM容量が全て。GPUの速さよりVRAMが足りているかで動く/動かないが決まる。',
  },
};

/** 複数用途を選んだ場合は、各項目の最大値を取る（一番重い用途に合わせる） */
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
      // 1つでも専用GPU必須の用途があれば内蔵では不可
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
