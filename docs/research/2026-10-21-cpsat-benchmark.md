# CP-SAT vs greedy slot placement — benchmark

_2026-10-21 · synthetic weeks · OR-Tools 9.15 · script: `docs/research/cpsat/bench.py`_

## Question

The auto-scheduler places tasks one at a time: highest priority first, each into its best-scoring free
slot (`SlotScorer`). A constraint solver (Google OR-Tools CP-SAT, Apache-2.0) places all of them at
once. Is the difference big enough to justify a real spike?

## Setup

This is **a model of the engine, not the engine.**

- **Week:** 5 days of 9–17 in 15-minute slots, with 1–4 random meetings a day.
- **Tasks:** 30 min to 3 h, priority 1–4, energy high/medium/low, a deadline at the end of a random day.
- **Slot score:** energy match (neutral curve: morning high, 13–15 low) + earliness + on-time bonus, or a
  penalty when late. These are the same three factors `SlotScorer` weighs most.
- **Greedy:** sort by priority, then deadline; each task takes its best free start.
- **CP-SAT:** one boolean per (task, feasible start). At most one start per task and one task per slot.
  It maximises priority × 1000 + 100 × slot score, so placing a task always beats placing it well.
  5-second limit, 8 workers.
- **Runs:** 15 seeds per size.

## Result (mean of 15 weeks)

| Tasks in the week | Placed, greedy → CP-SAT | Late, greedy → CP-SAT | In matching energy | Solve time (mean / max) |
| ----------------- | ----------------------- | --------------------- | ------------------ | ----------------------- |
| 20                | 18.9 → 19.3             | 3.5 → 1.1             | 14.4 → 15.1        | 0.9 s / 5.2 s           |
| 40                | 25.8 → 28.5             | 8.9 → 1.8             | 17.8 → 23.8        | 2.2 s / 5.1 s           |
| 60                | 27.0 → 34.2             | 9.5 → 1.4             | 19.5 → 29.1        | 3.0 s / 5.2 s           |

- **Late tasks drop 3–7×.** Greedy gives early, high-priority tasks the slots that a tighter deadline
  needed. The solver sees all deadlines at once.
- **Packing improves once the week is full.** At 40–60 tasks the solver fits 10–27 % more.
- **Energy matches rise by up to half,** with the same weights.
- **Time:** most weeks are solved to optimal within seconds. Every run that hit the 5 s limit still
  returned a feasible plan. That is fine for the worker's replanning job, and too slow for an
  interactive drag.

## What this does not show

- Real data. There is no production or staging access from here; run `bench.py` against an anonymised
  export before deciding.
- Needt's real engine. Its extra factors (buffers, chunk splitting, locked blocks, personal time,
  project grouping, multi-calendar busy time) are not modelled. The real greedy may do better than this
  model.
- Cost: CP-SAT means a Python sidecar or a WASM build next to the BullMQ worker.

## Suggestion

Worth a spike after launch:

- Run CP-SAT in the worker as an optional "replan the week" job, and keep greedy for single-task
  placement.
- Compare both on real weeks before turning it on.
