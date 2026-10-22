"""Greedy (SlotScorer-like) vs CP-SAT on synthetic weeks. Not Needt's engine:
a model of it, to see whether global packing is worth a spike."""
import random, statistics as st, sys, time
from ortools.sat.python import cp_model

DAYS, SLOT, START_H, END_H = 5, 15, 9, 17
PER_DAY = (END_H - START_H) * 60 // SLOT
H = DAYS * PER_DAY
LEVEL = {"high": 0, "medium": 1, "low": 2}

def energy(slot):  # neutral curve, local hours
    h = START_H + (slot % PER_DAY) * SLOT / 60
    return "high" if h < 12 else "medium" if h < 13 else "low" if h < 15 else "medium"

def week(n, seed):
    r = random.Random(seed)
    busy = set()
    for d in range(DAYS):
        for _ in range(r.randint(1, 4)):
            s = d * PER_DAY + r.randrange(PER_DAY - 2)
            for k in range(r.choice([2, 4, 6])):
                if (s + k) // PER_DAY == d: busy.add(s + k)
    tasks = []
    for i in range(n):
        dur = r.choice([2, 2, 4, 4, 6, 8, 12])
        dl_day = r.randint(0, DAYS - 1)
        tasks.append(dict(id=i, dur=dur, pri=r.choice([1, 2, 2, 3, 4]),
                          en=r.choice(["high", "medium", "low"]),
                          deadline=(dl_day + 1) * PER_DAY))
    return busy, tasks

def starts(t, busy):
    out = []
    for s in range(H - t["dur"] + 1):
        if s // PER_DAY != (s + t["dur"] - 1) // PER_DAY: continue
        if any(s + k in busy for k in range(t["dur"])): continue
        out.append(s)
    return out

def score(t, s):
    e = 1 - abs(LEVEL[t["en"]] - LEVEL[energy(s)]) / 2
    early = 0.5 ** ((s / PER_DAY) / 7)
    on_time = 1.0 if s + t["dur"] <= t["deadline"] else -2.0
    return 1.5 * e + 1.0 * early + 2.0 * on_time

def evaluate(tasks, plan):
    placed = [t for t in tasks if t["id"] in plan]
    late = sum(1 for t in placed if plan[t["id"]] + t["dur"] > t["deadline"])
    match = sum(1 for t in placed if energy(plan[t["id"]]) == t["en"])
    weight = sum(t["pri"] for t in placed)
    return dict(placed=len(placed), late=late, match=match, weight=weight,
                unplaced_pri=sum(t["pri"] for t in tasks if t["id"] not in plan))

def greedy(busy, tasks):
    used, plan = set(busy), {}
    for t in sorted(tasks, key=lambda t: (-t["pri"], t["deadline"])):
        cand = [s for s in starts(t, used)]
        if cand:
            s = max(cand, key=lambda s: score(t, s))
            plan[t["id"]] = s
            used.update(range(s, s + t["dur"]))
    return plan

def cpsat(busy, tasks, limit=5.0):
    m = cp_model.CpModel(); x = {}; cover = {}
    for t in tasks:
        for s in starts(t, busy):
            v = m.NewBoolVar(f"x{t['id']}_{s}"); x[t["id"], s] = (v, t)
            for k in range(t["dur"]): cover.setdefault(s + k, []).append(v)
        m.AddAtMostOne(v for (i, s), (v, _) in x.items() if i == t["id"])
    for vs in cover.values(): m.AddAtMostOne(vs)
    # placing a task dominates: priority * 100, then the slot score
    m.Maximize(sum(v * int(t["pri"] * 1000 + 100 * score(t, s)) for (_, s), (v, t) in x.items()))
    solver = cp_model.CpSolver(); solver.parameters.max_time_in_seconds = limit
    solver.parameters.num_workers = 8
    t0 = time.time(); status = solver.Solve(m); dt = time.time() - t0
    plan = {i: s for (i, s), (v, _) in x.items() if solver.Value(v)}
    return plan, dt, solver.StatusName(status)

rows = []
for n in (20, 40, 60):
    g, c, times, stat = [], [], [], {}
    for seed in range(15):
        busy, tasks = week(n, seed)
        g.append(evaluate(tasks, greedy(busy, tasks)))
        plan, dt, status = cpsat(busy, tasks)
        c.append(evaluate(tasks, plan)); times.append(dt); stat[status] = stat.get(status, 0) + 1
    avg = lambda L, k: st.mean(r[k] for r in L)
    print(f"n={n}: greedy placed {avg(g,'placed'):.1f} late {avg(g,'late'):.1f} energy-match {avg(g,'match'):.1f} unplaced-priority {avg(g,'unplaced_pri'):.1f} | "
          f"cpsat placed {avg(c,'placed'):.1f} late {avg(c,'late'):.1f} energy-match {avg(c,'match'):.1f} unplaced-priority {avg(c,'unplaced_pri'):.1f} | "
          f"solve {st.mean(times):.2f}s median, max {max(times):.2f}s, {stat}")
