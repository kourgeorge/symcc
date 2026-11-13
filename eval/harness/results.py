"""Results table writer: results.csv (one row per run) and summary.md (per arm: mean, median, min-max).

Rebuild them from saved runs with:  python3 eval/harness/results.py <results folder>
"""
import csv
import json
import os
import statistics
import sys

COLUMNS = [
    "session", "arm", "run", "agent", "model", "status", "requests_sent",
    "input_tokens", "output_tokens", "cache_write_tokens", "cache_read_tokens",
    "billed_equiv_tokens_est", "api_calls", "subagent_calls",
    "wall_min", "last_commit_min", "owner_interventions", "scripted_answers",
    "hidden_passed", "hidden_total", "hidden_pass_rate", "regressions", "forgotten",
    "visible_tests_ok", "lint_errors", "type_errors", "billed_equiv_per_passed_request_est",
]

# What the summary averages, with a short label.
METRICS = [
    ("input_tokens", "input tokens"),
    ("output_tokens", "output tokens"),
    ("cache_write_tokens", "cache write tokens"),
    ("cache_read_tokens", "cache read tokens"),
    ("billed_equiv_tokens_est", "billed-equivalent tokens (estimate)"),
    ("billed_equiv_per_passed_request_est", "billed-equivalent per passed request (estimate)"),
    ("wall_min", "wall-clock minutes"),
    ("owner_interventions", "owner interventions"),
    ("hidden_pass_rate", "hidden test pass rate"),
    ("regressions", "regressions"),
    ("forgotten", "forgotten requests"),
    ("lint_errors", "lint errors"),
    ("type_errors", "type errors"),
]


def row_of(run):
    return {c: run.get(c, "") if run.get(c) is not None else "" for c in COLUMNS}


def load_runs(folder):
    runs = []
    root = os.path.join(folder, "runs")
    for d in sorted(os.listdir(root)) if os.path.isdir(root) else []:
        p = os.path.join(root, d, "run.json")
        if os.path.exists(p):
            with open(p) as f:
                runs.append(json.load(f))
    return runs


def _nums(runs, key):
    out = []
    for r in runs:
        v = r.get(key)
        if isinstance(v, bool):
            v = int(v)
        if isinstance(v, (int, float)):
            out.append(v)
    return out


def _fmt(v):
    if v is None:
        return "-"
    if isinstance(v, float) and not v.is_integer():
        return f"{v:,.2f}" if abs(v) < 100 else f"{v:,.0f}"
    return f"{int(v):,}"


def spread(values):
    """mean, median, min, max (None for no values)."""
    if not values:
        return None, None, None, None
    return statistics.mean(values), statistics.median(values), min(values), max(values)


def summary_md(runs):
    arms = sorted({r["arm"] for r in runs}, key=lambda a: (a != "plain", a))
    lines = ["# Eval results", ""]
    sessions = sorted({r["session"] for r in runs})
    agents = sorted({r["agent"] for r in runs})
    lines += [f"Sessions: {', '.join(sessions)}. Agent: {', '.join(agents)}. Runs: "
              + ", ".join(f"{a} {sum(1 for r in runs if r['arm'] == a)}" for a in arms) + ".", ""]
    if any(a.startswith("fake") for a in agents):
        lines += ["**Dry run with a fake agent: no model was called. These numbers only show the pipeline works.**", ""]
    lines += ["Each cell is mean / median (min-max) over runs. Billed-equivalent = input x1 + cache write x1.25 +"
              " cache read x0.1 + output x5, in input-token units: an estimate, not a bill.", ""]
    lines += ["| metric | " + " | ".join(arms) + " |", "|---|" + "---|" * len(arms)]
    for key, label in METRICS:
        cells = []
        for a in arms:
            m, med, lo, hi = spread(_nums([r for r in runs if r["arm"] == a], key))
            cells.append("-" if m is None else f"{_fmt(m)} / {_fmt(med)} ({_fmt(lo)}-{_fmt(hi)})")
        lines.append(f"| {label} | " + " | ".join(cells) + " |")
    ids = []
    for r in runs:
        for rid in r.get("hidden", {}):
            if rid not in ids:
                ids.append(rid)
    if ids:
        lines += ["", "## Hidden tests passed per request (runs passing / runs)", "",
                  "| request | " + " | ".join(arms) + " |", "|---|" + "---|" * len(arms)]
        for rid in ids:
            cells = []
            for a in arms:
                rs = [r for r in runs if r["arm"] == a and rid in r.get("hidden", {})]
                cells.append(f"{sum(1 for r in rs if r['hidden'][rid])}/{len(rs)}")
            lines.append(f"| {rid} | " + " | ".join(cells) + " |")
    bad = [r for r in runs if r.get("status") != "ok"]
    if bad:
        lines += ["", "## Runs that did not finish normally", ""]
        lines += [f"- {r['arm']} run {r['run']}: {r['status']} {r.get('status_note', '')}".rstrip() for r in bad]
    lines += ["", "Requests in one run are linked, so compare runs, not requests. With few runs the ranges matter"
              " more than the means.", ""]
    return "\n".join(lines)


def write_results(folder, runs=None):
    runs = load_runs(folder) if runs is None else runs
    with open(os.path.join(folder, "results.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        for r in runs:
            w.writerow(row_of(r))
    with open(os.path.join(folder, "summary.md"), "w") as f:
        f.write(summary_md(runs))
    return os.path.join(folder, "results.csv"), os.path.join(folder, "summary.md")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: results.py <results folder>")
    for p in write_results(sys.argv[1]):
        print(p)
