"""The agents the driver talks to. All have the same small interface:

    start(project, arm)      before the first message
    send(text) -> reply      one owner message; returns the agent's reply text
    pending() -> dict        work still open (symcc: tasks not finished, questions, tasks in review)
    stop()                   after the run

FakeAgent: makes no model calls, so a dry run costs nothing. "noop" changes no code; "reference" copies
the session's reference solution in at the end, to check the grading path. Both write a small made-up
Claude Code log into the given claude home, so the token reader is exercised too.

ClaudeAgent: real Claude Code, headless (`claude --print`, then `--resume` with the same session id).
UNTESTED with symcc: whether symcc's lead, board and workers keep running under --print is the first
thing a pilot must check (see eval/README.md).
"""
import json
import os
import random
import shutil
import subprocess
import uuid

from logs import folder_name

OPEN = ("todo", "doing", "waiting", "paused", "review")


def board_pending(project):
    """Open symcc tasks, tasks waiting for approval and open questions, from .symcc/board.json."""
    path = os.path.join(project, ".symcc", "board.json")
    try:
        with open(path) as f:
            board = json.load(f)
    except (OSError, ValueError):
        return {"open": [], "review": [], "questions": []}
    tasks = board.get("tasks", []) if isinstance(board, dict) else []
    return {
        "open": [t.get("id") for t in tasks if t.get("status") in OPEN],
        "review": [t.get("id") for t in tasks if t.get("status") == "review"],
        "questions": [(t.get("id"), t.get("question")) for t in tasks if t.get("question")],
    }


class FakeAgent:
    def __init__(self, mode="noop", claude_home=None, seed=0, session_dir=None):
        self.mode, self.home, self.rng, self.session_dir = mode, claude_home, random.Random(seed), session_dir
        self.name = f"fake-{mode}"

    def start(self, project, arm):
        self.project, self.arm = project, arm
        self.sid = str(uuid.UUID(int=self.rng.getrandbits(128)))
        self.dir = os.path.join(self.home, "projects", folder_name(project))
        os.makedirs(self.dir, exist_ok=True)
        self.calls = 0

    def _log(self, path, sidechain):
        self.calls += 1
        mid = f"msg_fake_{self.sid[:8]}_{self.calls}"
        line = json.dumps({"type": "assistant", "isSidechain": sidechain, "sessionId": self.sid,
                           "message": {"id": mid, "model": "fake-model", "usage": {
                               "input_tokens": self.rng.randint(5, 50),
                               "output_tokens": self.rng.randint(100, 600),
                               "cache_creation_input_tokens": self.rng.randint(500, 3000),
                               "cache_read_input_tokens": self.rng.randint(5000, 30000)}}})
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "a") as f:
            f.write(line + "\n" + line + "\n")  # written twice, like Claude Code does; must count once

    def send(self, text):
        self._log(os.path.join(self.dir, self.sid + ".jsonl"), False)
        if self.arm == "symcc":  # a made-up worker, to show subagent logs are counted
            self._log(os.path.join(self.dir, self.sid, "subagents", f"agent-{self.calls}.jsonl"), True)
        return "OK."

    def pending(self):
        return {"open": [], "review": [], "questions": []}

    def stop(self):
        if self.mode == "reference":
            src = os.path.join(self.session_dir, "reference")
            shutil.copytree(src, self.project, dirs_exist_ok=True)


class ClaudeAgent:
    def __init__(self, model, plugin_dir=None, permission_mode="bypassPermissions", max_budget_usd=None, extra_args=()):
        self.model, self.plugin_dir, self.permission_mode = model, plugin_dir, permission_mode
        self.max_budget_usd, self.extra_args = max_budget_usd, list(extra_args)
        self.name = "claude"

    def start(self, project, arm):
        self.project, self.arm = project, arm
        self.sid = str(uuid.uuid4())
        self.first = True
        self.timeout_s = None

    def send(self, text):
        cmd = ["claude", "--print", "--output-format", "json", "--permission-mode", self.permission_mode]
        cmd += ["--session-id", self.sid] if self.first else ["--resume", self.sid]
        if self.model:
            cmd += ["--model", self.model]
        if self.arm == "symcc" and self.plugin_dir:
            cmd += ["--plugin-dir", self.plugin_dir]
        if self.max_budget_usd:
            cmd += ["--max-budget-usd", str(self.max_budget_usd)]
        cmd += self.extra_args + [text]
        self.first = False
        try:
            p = subprocess.run(cmd, cwd=self.project, capture_output=True, text=True, timeout=self.timeout_s)
        except subprocess.TimeoutExpired:
            return "[eval: the call ran out of time]"
        try:
            return str(json.loads(p.stdout).get("result", ""))
        except ValueError:
            return p.stdout + p.stderr

    def pending(self):
        return board_pending(self.project) if self.arm == "symcc" else {"open": [], "review": [], "questions": []}

    def stop(self):
        pass
