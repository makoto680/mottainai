# MOTTAINAI

**The agent fleet that tries to talk you out of buying a new PC.**

Every PC configurator on the internet resolves upward. You describe what you do, it
returns a build, and the more expensive that build is the more the site earns. Search
the Japanese and English tools alike and there is no exception — each one is a shopping
funnel wearing a diagnostic coat.

MOTTAINAI resolves downward. It hunts for reasons you do **not** need to spend money,
and the answer it is most pleased to reach is ¥0.

*Mottainai (もったいない) is the Japanese word for the regret of letting something
useful go to waste.*

---

## What it does

Hand it a photo — the inside of a desktop, a Device Manager screenshot, a spec label —
and say what you use the machine for. A fleet of agents fans out, and you get back:

- which parts you should **keep**, and roughly how long they will hold
- which parts are **already far beyond** what your use needs (you were oversold once)
- the **one thing**, if any, that is genuinely holding you back — and the cheapest part
  that fixes it
- for Windows 10 machines: whether the upgrade is blocked by something a **free BIOS
  setting** solves, and what the alternatives to replacing the machine are

## The one design rule

> **Models perceive and explain. Deterministic code decides.**

Every verdict that touches money is computed in [`core/verdict.js`](core/verdict.js) —
plain code, no model in the loop, 35 assertions in [`core/selftest.js`](core/selftest.js).
The language models are held to the two jobs they are good at: reading an image, and
putting a finished result into words. The narrator is explicitly forbidden from
introducing a number the engine did not produce.

This is not stylistic. A tool whose whole promise is *"you don't need to spend that"*
cannot afford a hallucinated price.

One of those 35 assertions exists because the code got it wrong first: an early version
printed **"0円で解決する"** (solved for free) for a machine whose Windows 11 block really
was a free BIOS toggle — while quietly needing ¥15,800 of RAM. The headline was true
about the thing it was looking at and false about the bill. There is now a test that
fails if a headline claims zero while any part is short.

## Decisions the engine makes that shopping tools do not

**It sizes the fix to the need, not to what you already own.** A 1 TB hard drive does
not imply a 1 TB SSD. For office use the requirement is 256 GB, so it picks the
cheapest sufficient part — ¥9,990 instead of ¥22,980 for a like-for-like swap.

**It refuses upgrades that cost as much as a machine.** DDR4 prices rose through 2026 to
the point where a 32 GB kit (¥30,980) costs more than a used Windows 11 laptop
(¥29,800). When an upgrade crosses that line the engine says so and removes it from the
total, rather than quietly recommending it.

**It separates "enough" from "far more than enough".** Four states, not three. Knowing a
part is *overkill* tells you something "fine" does not: that you were sold too much last
time, and can stop paying for that tier.

**It never recommends a product, brand, or shop.** There is no affiliate link and no
place for one.

## The fleet

```
photo ──▶ scan ──┐
                 ├──▶ resolve ──▶ verdict ──▶ narrate ──▶ answer
words ─▶ workload┘                   ▲
                                     └── deterministic, no model
```

`scan` and `workload` are independent, so they run at the same time. Full detail,
including how each agent fails safely, is in [ARCHITECTURE.md](ARCHITECTURE.md).

A note on the graph: ADK's static `edges` fire a downstream node once **per incoming
edge**, so wiring both `scan` and `workload` into `resolve` runs `resolve` twice. The
workflow therefore uses `dynamicEntry`, which lets the two perception agents run
concurrently and join exactly once.

## Data

| | count | source |
|---|---|---|
| CPUs | 6,719 | PassMark CPU Mark |
| GPUs | 3,013 (221 integrated) | PassMark G3D Mark |
| Prices | RAM / SSD / whole machines | Japanese retail, observed 2026-08-24 |
| Windows 11 support | 87 Intel / 399 AMD / 18 Qualcomm list entries | Microsoft |

Benchmark scores are **CPU Mark and G3D Mark, courtesy of PassMark Software**
([cpubenchmark.net](https://www.cpubenchmark.net/), [videocardbenchmark.net](https://www.videocardbenchmark.net/)).
Every row in `data/parts.json` carries the URL it came from. Benchmarks come from a
single provider on purpose — mixing scoring systems silently corrupts every comparison
built on them.

An earlier version shipped 125 chips chosen by hand, and the machines this tool exists
to help were the ones it could not look up: no Celeron, no Pentium, no Atom, no Athlon.
Those families are where "my laptop got slow" actually lives.

Windows 11 support is matched against Microsoft's published lists rather than a
generation rule of thumb, and each answer keeps the list entry that decided it. Where
the lists cannot settle a part, the answer is `null` and says why — Ryzen 9000 desktop
parts sit past where the list stops, and calling them unsupported would be false.

Where a figure could not be obtained it is `null` and stays `null`; nothing is
interpolated to fill a gap. The price of a part shown with only a lowest listing is
labelled as such, because "you can buy it at this price" and "someone listed it at this
price once" are different claims.

**The workload thresholds in [`core/workloads.js`](core/workloads.js) are editorial.**
They are informed by official minimums (Microsoft 365, Zoom, Teams, Ollama) but the
*enough* ceilings — the point past which more stops being felt — come from three decades
of building these machines, not from a spec sheet. They are stated as judgment, and the
interface says so too.

## Windows 10, honestly

The extended security updates run to **12 October 2027**, and the consumer path is free
if you sync settings or spend 1,000 Rewards points. So the honest headline is not
"upgrade now" — for most people it is "you have another year, and here is the cheapest
way through it."

The engine also knows the trap in the CPU boundary: support is not a proxy for speed. A
Ryzen 7 1700 (CPU Mark 14,747) is unsupported while a much slower i3-8100 (6,051) is
supported. Being told your fast machine is obsolete feels absurd because it is, and the
tool explains the reason rather than repeating the verdict.

## Running it

```bash
npm install
npm test                 # 35 assertions over the judgment engine
npm run build:data       # research_raw.json → parts.json
npm start                # http://localhost:8080
```

Without `GEMINI_API_KEY` the model layer falls back to a mock so the whole pipeline stays
runnable — the mock returns fixed values tagged `mocked: true` and the interface says the
explanation is a placeholder, so a stub is never mistaken for a real reading.

```bash
export GEMINI_API_KEY=...   # image reading and narration become real
```

Stack, model id, free-tier limits and the deploy path are pinned in [STACK.md](STACK.md).

## Layout

```
core/       judgment engine — no network, no model, fully tested
agents/     the fleet, the model layer, the runner
data/       benchmark and price data + the normalizer that builds parts.json
server/     HTTP surface (Cloud Run entry point)
web/        interface
```

## License

MIT
