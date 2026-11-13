#!/usr/bin/env python3
"""Play one scripted project session on each arm (plain Claude Code, symcc) and collect the numbers.

    python3 eval/harness/run.py --agent fake --runs 2              # dry run, no model calls
    python3 eval/harness/run.py --agent claude --runs 2 --model claude-opus-5-5 --yes   # real pilot (costs money)

See eval/README.md. Per run: a fresh copy of the start repo in its own new folder (so its Claude Code
logs never mix with another run's), the requests sent at their set minutes, scripted answers to
questions, a time and token budget, then hidden tests and the token count from that folder's logs.
"""
import argparse
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import agents  # noqa: E402
import grade  # noqa: E402
import logs  # noqa: E402
import results  # noqa: E402

EVAL_DIR = os.path.dirname(HERE)
SYMCC_DIR = os.path.dirname(EVAL_DIR)
ARMS = ("plain", "symcc")


def load_session(path):
    d = os.path.abspath(path)
    with open(os.path.join(d, "session.json")) as f:
        s = json.load(f)
    ids = {r["id"] for r in s["requests"]}
    for r in s["requests"]:
        bad = [a for a in r.get("after", []) if a not in ids]
        if bad:
            raise SystemExit(f"{r['id']}: unknown request in after: {bad}")
        if not os.path.exists(os.path.join(d, s["hidden_tests"], r["hidden_test"])):
            raise SystemExit(f"{r['id']}: hidden test missing: {r['hidden_test']}")
    return s, d


def git(project, *args):
    env = dict(os.environ, GIT_AUTHOR_NAME="eval", GIT_AUTHOR_EMAIL="eval@example.invalid",
               GIT_COMMITTER_NAME="eval", GIT_COMMITTER_EMAIL="eval@example.invalid",
               GIT_AUTHOR_DATE="2026-01-01T00:00:00Z", GIT_COMMITTER_DATE="2026-01-01T00:00:00Z")
    return subprocess.run(["git", *args], cwd=project, capture_output=True, text=True, check=True, env=env).stdout.strip()


def prepare(session, session_dir, project):
    """A fresh git repo at the start commit. The commit is the same every time (fixed author and date)."""
    shutil.copytree(os.path.join(session_dir, session["repo"]), project)
    git(project, "init", "-q", "-b", "main")
    git(project, "add", "-A")
    git(project, "commit", "-q", "-m", "start")
    return git(project, "rev-parse", "HEAD")


def last_commit_epoch(project, start_commit):
    try:
        out = git(project, "log", "-1", "--format=%ct", "main")
        head = git(project, "rev-parse", "main")
    except subprocess.CalledProcessError:
        return None
    return int(out) if out and head != start_commit else None


def looks_like_question(reply):
    """True if the end of the reply asks something. Crude on purpose: the same rule for both arms."""
    tail = [p for p in re.split(r"\n\s*\n", (reply or "").strip()) if p.strip()][-1:]
    return bool(tail) and "?" in tail[0]


def pick_answer(session, question, request_id):
    """(answer, scripted?) from the answer sheet: the entry for this request whose keywords match most."""
    q = (question or "").lower()
    best, score = None, 0
    for a in session.get("answers", []):
        hits = sum(1 for k in a["keywords"] if k.lower() in q)
        if hits and request_id in a.get("for", []):
            hits += 10
        if hits > score:
            best, score = a, hits
    if best:
        return best["answer"], True
    return session.get("default_answer", "Decide yourself."), False


class Run:
    def __init__(self, session, session_dir, arm, n, agent, project, out_dir, time_scale, budget):
        self.s, self.sd, self.arm, self.n, self.agent = session, session_dir, arm, n, agent
        self.project, self.out_dir, self.scale, self.budget = project, out_dir, time_scale, budget
        self.events = []
        self.interventions = self.scripted = 0
        self.passed_ever = set()
        self.status, self.status_note = "ok", ""

    def log(self, kind, **kw):
        self.events.append({"t_min": round(self.elapsed_min(), 3), "kind": kind, **kw})

    def elapsed_min(self):
        return (time.time() - self.t0) / 60 if hasattr(self, "t0") else 0.0

    def tokens(self):
        return logs.run_usage(self.project, self.agent_home)

    def over_budget(self):
        if self.elapsed_min() > self.budget["minutes_per_run"]:
            return f"time budget ({self.budget['minutes_per_run']} min) used up"
        b = self.tokens()["billed_equiv"]
        if b > self.budget["billed_equivalent_tokens_per_run"]:
            return f"token budget ({self.budget['billed_equivalent_tokens_per_run']:,} billed-equivalent) used up"
        return ""

    def say(self, text, request_id=None, kind="request"):
        if hasattr(self.agent, "timeout_s"):
            self.agent.timeout_s = max(60, (self.budget["minutes_per_run"] - self.elapsed_min()) * 60)
        self.log(kind, request=request_id, text=text)
        reply = self.agent.send(text)
        self.log("reply", request=request_id, text=reply[-2000:])
        for _ in range(3):  # answer follow-up questions, at most 3 rounds per message
            if not looks_like_question(reply):
                break
            answer, scripted = pick_answer(self.s, reply, request_id)
            self.scripted += scripted
            self.interventions += not scripted
            self.log("answer", request=request_id, scripted=scripted, text=answer)
            reply = self.agent.send(answer)
            self.log("reply", request=request_id, text=reply[-2000:])
        return reply

    def checkpoint(self, sent_ids):
        got = grade.hidden_results(self.project, self.s, self.sd, set(sent_ids))
        self.passed_ever.update(r for r, ok in got.items() if ok)
        self.log("checkpoint", passed=sorted(r for r, ok in got.items() if ok))

    def settle(self):
        """symcc keeps working after its reply; wait (and handle approvals and questions) until the board is quiet."""
        st = self.s.get("settle", {})
        until = time.time() + st.get("max_min", 30) * 60 * self.scale
        while True:
            p = self.agent.pending()
            if not (p["open"] or p["review"] or p["questions"]):
                return
            if time.time() >= until:
                break
            why = self.over_budget()
            if why:
                self.status, self.status_note = "budget_hit", why
                return
            for tid in p["review"]:
                self.interventions += 1
                self.say(f"approve {tid}", kind="approval")
            for tid, q in p["questions"]:
                answer, scripted = pick_answer(self.s, q, None)
                self.scripted += scripted
                self.interventions += not scripted
                self.say(f"{tid}: {answer}", kind="answer")
            if not (p["review"] or p["questions"]):
                self.say(st.get("message", "Status?"), kind="status")
            time.sleep(st.get("poll_every_min", 2) * 60 * self.scale)
        self.status, self.status_note = "settle_timeout", "work still open when the settle time ran out"

    def play(self, agent_home):
        self.agent_home = agent_home
        self.start_commit = prepare(self.s, self.sd, self.project)
        self.agent.start(self.project, self.arm)
        self.t0 = time.time()
        for text in self.s.get("setup", {}).get(self.arm, []):
            self.say(text, kind="setup")
        sent = []
        try:
            for r in sorted(self.s["requests"], key=lambda r: r["send_at_min"]):
                wait = self.t0 + r["send_at_min"] * 60 * self.scale - time.time()
                if wait > 0:
                    time.sleep(wait)
                why = self.over_budget()
                if why:
                    self.status, self.status_note = "budget_hit", why
                    break
                self.say(r["text"], r["id"])
                sent.append(r["id"])
                self.checkpoint(sent)
            if self.status == "ok":
                self.settle()
        except Exception as e:  # keep what was measured so far
            self.status, self.status_note = "error", f"{type(e).__name__}: {e}"
        self.agent.stop()
        end = time.time()
        return self.collect(sent, end)

    def collect(self, sent, end):
        g = grade.final_grade(self.project, self.s, self.sd)
        hidden = g["hidden"]
        changed = grade.changed_files(self.project, self.start_commit)
        regs = grade.regressions(self.passed_ever, hidden)
        forgot = grade.forgotten(self.s, hidden, changed)
        t = self.tokens()
        logs.copy_logs(self.project, os.path.join(self.out_dir, "logs"), self.agent_home)
        passed = sum(hidden.values())
        lc = last_commit_epoch(self.project, self.start_commit)
        run = {
            "session": self.s["name"], "arm": self.arm, "run": self.n, "agent": self.agent.name,
            "model": getattr(self.agent, "model", None) or "", "status": self.status, "status_note": self.status_note,
            "project": self.project, "start_commit": self.start_commit, "requests_sent": len(sent),
            "input_tokens": t["input"], "output_tokens": t["output"],
            "cache_write_tokens": t["cache_write"], "cache_read_tokens": t["cache_read"],
            "billed_equiv_tokens_est": t["billed_equiv"], "api_calls": t["api_calls"],
            "subagent_calls": t["subagent_calls"], "log_files": t["log_files"], "tokens_by_model": t["by_model"],
            "wall_min": round((end - self.t0) / 60, 2),
            "last_commit_min": round((lc - self.t0) / 60, 2) if lc and lc >= self.t0 else None,
            "owner_interventions": self.interventions, "scripted_answers": self.scripted,
            "hidden": hidden, "hidden_passed": passed, "hidden_total": len(hidden),
            "hidden_pass_rate": round(passed / len(hidden), 3) if hidden else None,
            "regressions": len(regs), "regression_ids": regs, "forgotten": len(forgot), "forgotten_ids": forgot,
            "visible_tests_ok": g["visible_tests_ok"], "lint_errors": g["lint_errors"], "lint_tool": g["lint_tool"],
            "type_errors": g["type_errors"], "changed_files": changed,
            "billed_equiv_per_passed_request_est": round(t["billed_equiv"] / passed) if passed else None,
        }
        os.makedirs(self.out_dir, exist_ok=True)
        with open(os.path.join(self.out_dir, "run.json"), "w") as f:
            json.dump(run, f, indent=2)
        with open(os.path.join(self.out_dir, "events.json"), "w") as f:
            json.dump(self.events, f, indent=2)
        return run


def inside(path, root):
    path, root = os.path.realpath(path), os.path.realpath(root)
    return path == root or path.startswith(root + os.sep)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--session", default=os.path.join(EVAL_DIR, "sessions", "inventory"))
    p.add_argument("--arms", default="plain,symcc", help="comma list from: plain, symcc")
    p.add_argument("--runs", type=int, default=2, help="runs per arm (pilot 2, main study 5 or more)")
    p.add_argument("--agent", choices=["fake", "fake-reference", "claude"], default="fake")
    p.add_argument("--model", default="", help="same model for both arms (claude agent)")
    p.add_argument("--permission-mode", default="bypassPermissions")
    p.add_argument("--plugin-dir", default=SYMCC_DIR, help="symcc to load in the symcc arm")
    p.add_argument("--time-scale", type=float, default=None,
                   help="multiplies every wait (send_at_min, settle). Default 1, or 0 for fake agents")
    p.add_argument("--work-dir", default=os.path.expanduser("~/.symcc-eval/work"),
                   help="where the fresh project copies go; must be outside this repo so agents can't see the hidden tests")
    p.add_argument("--out", default=None, help="results folder (default eval/results/<time>)")
    p.add_argument("--yes", action="store_true", help="needed for --agent claude: confirms you accept the cost")
    a = p.parse_args(argv)

    session, sdir = load_session(a.session)
    arms = [x.strip() for x in a.arms.split(",") if x.strip()]
    if any(x not in ARMS for x in arms):
        raise SystemExit(f"arms must be from {ARMS}")
    if inside(a.work_dir, SYMCC_DIR) or inside(a.work_dir, sdir):
        raise SystemExit("--work-dir must be outside this repo, or the agents could read the hidden tests")
    if a.agent == "claude" and not a.yes:
        raise SystemExit("--agent claude runs real sessions and costs money; read eval/README.md, then add --yes")
    scale = a.time_scale if a.time_scale is not None else (0.0 if a.agent.startswith("fake") else 1.0)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    out = os.path.abspath(a.out or os.path.join(EVAL_DIR, "results", stamp))
    work = os.path.join(os.path.realpath(os.path.expanduser(a.work_dir)), stamp)
    os.makedirs(work, exist_ok=False)
    os.makedirs(os.path.join(out, "runs"), exist_ok=True)
    budget = dict(session["budget"])

    # Fake agents write their made-up logs into a throwaway claude home, never into ~/.claude.
    fake_home = tempfile.mkdtemp(prefix="symcc-eval-claude-home-") if a.agent.startswith("fake") else None
    runs = []
    for n in range(1, a.runs + 1):
        for arm in arms:  # arms alternate within each round, so time-of-day effects spread over both
            name = f"{arm}-r{n}"
            project = os.path.join(work, name, "project")
            if a.agent == "claude":
                agent = agents.ClaudeAgent(a.model, a.plugin_dir, a.permission_mode, budget.get("max_budget_usd_per_call"))
            else:
                agent = agents.FakeAgent("reference" if a.agent == "fake-reference" else "noop",
                                         fake_home, seed=zlib.crc32(name.encode()), session_dir=sdir)
            print(f"[{name}] project {project}", flush=True)
            r = Run(session, sdir, arm, n, agent, project, os.path.join(out, "runs", name), scale, budget)
            run = r.play(fake_home)
            runs.append(run)
            print(f"[{name}] {run['status']}: hidden {run['hidden_passed']}/{run['hidden_total']}, "
                  f"billed-equiv {run['billed_equiv_tokens_est']:,}, {run['wall_min']} min", flush=True)
    with open(os.path.join(out, "config.json"), "w") as f:
        json.dump({"session": session["name"], "arms": arms, "runs": a.runs, "agent": a.agent, "model": a.model,
                   "time_scale": scale, "work_dir": work, "budget": budget,
                   "claude_version": _claude_version() if a.agent == "claude" else None}, f, indent=2)
    csv_path, md_path = results.write_results(out, runs)
    if fake_home:
        shutil.rmtree(fake_home, ignore_errors=True)
    print(csv_path)
    print(md_path)
    return out


def _claude_version():
    try:
        return subprocess.run(["claude", "--version"], capture_output=True, text=True).stdout.strip()
    except OSError:
        return None


if __name__ == "__main__":
    main()
