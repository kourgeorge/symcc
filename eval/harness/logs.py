"""Token counts for one run, read from Claude Code's own session logs.

Claude Code writes each session to <claude home>/projects/<folder>/<session>.jsonl, and its subagents
(symcc workers and scouts too) to <session>/subagents/*.jsonl. <folder> is the project path with every
character that is not a letter or digit turned into "-". Every run uses its own fresh project path, so
the folders found here belong to that run only, for both arms.

Rules (same for both arms):
- every assistant line with message.usage counts, main chat and subagents (sidechains) alike;
- the same API message is often written on several lines, so each message.id counts once
  (the line with the biggest numbers wins);
- input, output, cache write and cache read stay separate. They cost very different amounts.
"""
import json
import os
import re
import shutil

# Weights for the billed-equivalent column, in "input token" units. An ESTIMATE: real prices differ by
# model and cache length; this only puts the four kinds on one rough scale.
WEIGHTS = {"input": 1.0, "cache_write": 1.25, "cache_read": 0.1, "output": 5.0}
KINDS = ("input", "output", "cache_write", "cache_read")


def claude_home():
    """Where Claude Code keeps its files: $CLAUDE_CONFIG_DIR, or ~/.claude."""
    return os.environ.get("CLAUDE_CONFIG_DIR") or os.path.expanduser("~/.claude")


def folder_name(project_path):
    """Claude Code's folder name under projects/ for a project path."""
    return re.sub(r"[^a-zA-Z0-9]", "-", os.path.realpath(project_path))


def log_folders(project_path, home=None):
    """The log folders of this project: its own, plus any for folders inside it (e.g. worker worktrees
    run as separate sessions). Matching is on the folder name plus "-", so .../a-r1 never takes .../a-r10."""
    root = os.path.join(home or claude_home(), "projects")
    name = folder_name(project_path)
    if not os.path.isdir(root):
        return []
    return sorted(os.path.join(root, d) for d in os.listdir(root)
                  if d == name or d.startswith(name + "-"))


def _num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else 0


def usage_of_line(line):
    """(message id or None, model, {kind: tokens}, is_subagent) for one log line, or None if it has no usage."""
    if '"usage"' not in line:
        return None
    try:
        o = json.loads(line)
    except ValueError:
        return None
    if not isinstance(o, dict) or o.get("type") != "assistant":
        return None
    m = o.get("message") or {}
    u = m.get("usage") if isinstance(m, dict) else None
    if not isinstance(u, dict):
        return None
    t = {
        "input": _num(u.get("input_tokens")),
        "output": _num(u.get("output_tokens")),
        "cache_write": _num(u.get("cache_creation_input_tokens")),
        "cache_read": _num(u.get("cache_read_input_tokens")),
    }
    if not any(t.values()):
        return None
    mid = m.get("id") if isinstance(m.get("id"), str) and m.get("id") else None
    return mid, m.get("model") or "unknown", t, o.get("isSidechain") is True


def read_usage(folders):
    """Totals over every *.jsonl under the given folders (recursively, so subagents/ is included)."""
    calls = {}
    n = 0
    files = 0
    for folder in folders:
        for dirpath, _dirs, names in os.walk(folder):
            for fn in names:
                if not fn.endswith(".jsonl"):
                    continue
                files += 1
                with open(os.path.join(dirpath, fn), errors="replace") as f:
                    for line in f:
                        got = usage_of_line(line)
                        if not got:
                            continue
                        mid, model, t, side = got
                        key = mid or f"line-{n}"
                        n += 1
                        old = calls.get(key)
                        if not old or sum(t.values()) > sum(old[1].values()):
                            calls[key] = (model, t, side)
    out = {k: 0 for k in KINDS}
    by_model = {}
    sub_calls = 0
    for model, t, side in calls.values():
        sub_calls += side
        bm = by_model.setdefault(model, {k: 0 for k in KINDS})
        for k in KINDS:
            out[k] += t[k]
            bm[k] += t[k]
    out["api_calls"] = len(calls)
    out["subagent_calls"] = sub_calls
    out["log_files"] = files
    out["billed_equiv"] = billed_equivalent(out)
    out["by_model"] = by_model
    return out


def billed_equivalent(t):
    """input x1 + cache write x1.25 + cache read x0.1 + output x5, in input-token units (an estimate)."""
    return round(sum(WEIGHTS[k] * t.get(k, 0) for k in KINDS))


def run_usage(project_path, home=None):
    return read_usage(log_folders(project_path, home))


def copy_logs(project_path, dest, home=None):
    """Copy this run's log folders to dest (Claude Code deletes old logs after cleanupPeriodDays)."""
    for folder in log_folders(project_path, home):
        shutil.copytree(folder, os.path.join(dest, os.path.basename(folder)), dirs_exist_ok=True)
