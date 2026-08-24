/**
 * フリートを1回走らせるための入口。server と CLI の両方から使う。
 */

import { InMemoryRunner } from '@google/adk';
import { buildFleet } from './fleet.js';
import { autoLlm } from './llm.js';

/**
 * @param {object} input  { image?, mimeType?, useText?, workloads?, manual?, lang? }
 * @param {object} deps   { llm?, parts?, win11Data?, prices?, usedMachineYen?, market? }
 */
export async function runFleet(input, deps = {}) {
  const llm = deps.llm ?? autoLlm({ quiet: true });

  const fleet = buildFleet({
    input,
    llm,
    parts: deps.parts ?? null,
    win11Data: deps.win11Data ?? null,
    prices: deps.prices ?? {},
    usedMachineYen: deps.usedMachineYen ?? null,
    reference: deps.reference ?? null,
    market: deps.market ?? null,
  });

  const runner = new InMemoryRunner({ agent: fleet, appName: 'mottainai' });
  const session = await runner.sessionService.createSession({
    appName: 'mottainai', userId: 'local', state: {},
  });

  const trace = [];
  let out = null;

  for await (const ev of runner.runAsync({
    userId: 'local',
    sessionId: session.id,
    newMessage: { role: 'user', parts: [{ text: JSON.stringify(input) }] },
  })) {
    if (ev?.author && ev.author !== 'user') trace.push(ev.author);
    // ワークフロー自身が出したイベントだけを拾う。
    // 個々のノードのイベントには実行コンテキストがぶら下がっており、循環参照を含む。
    if (ev?.author === 'mottainai_fleet' && ev.output) {
      const { machine, workloads, verdict, narration, scan } = ev.output;
      // mockの印を落とさない。キー無し環境で「画像を読んだ」顔の固定値が
      // 本物の判定と並ぶと、デモがそのまま嘘になる。
      out = { machine, workloads, verdict, narration, scanMocked: scan?.mocked === true };
    }
  }

  return {
    ...(out ?? {}),
    llmUsed: llm.id,
    trace,
  };
}
