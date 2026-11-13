"""Grading a project folder: hidden tests per request, the repo's own tests, lint and type errors.

The hidden tests never enter the project folder the agents work in. Grading copies the project (its
working tree, without .git and .symcc) to a new temp folder, adds the hidden tests there as package
_eval_hidden, and runs them. The same goes for both arms.
"""
import os
import shutil
import subprocess
import sys
import tempfile

SKIP = shutil.ignore_patterns(".git", ".symcc", "__pycache__", "*.pyc", ".mypy_cache")
TIMEOUT = 120


def _cmd(cmd):
    """Use this Python for "python3", so grading does not depend on PATH."""
    return [sys.executable if c in ("python3", "python") else c for c in cmd]


def _run(cmd, cwd):
    try:
        p = subprocess.run(_cmd(cmd), cwd=cwd, capture_output=True, text=True, timeout=TIMEOUT)
        return p.returncode, p.stdout + p.stderr
    except subprocess.TimeoutExpired:
        return 124, "timed out"
    except FileNotFoundError as e:
        return 127, str(e)


def _missing_tool(code, text):
    return code == 127 or "No module named" in text


def _module(test_file):
    return "_eval_hidden." + os.path.splitext(test_file)[0]


def grade_copy(project, session, session_dir):
    """A temp copy of the project's working tree with the hidden tests added. Caller removes it."""
    d = tempfile.mkdtemp(prefix="symcc-eval-grade-")
    dst = os.path.join(d, "project")
    shutil.copytree(project, dst, ignore=SKIP)
    hidden_src = os.path.join(session_dir, session["hidden_tests"])
    hd = os.path.join(dst, "_eval_hidden")
    os.makedirs(hd, exist_ok=True)
    open(os.path.join(hd, "__init__.py"), "w").close()
    for r in session["requests"]:
        shutil.copy(os.path.join(hidden_src, r["hidden_test"]), hd)
    return d, dst


def hidden_results(project, session, session_dir, ids=None):
    """{request id: True/False} for the given requests (all if ids is None)."""
    d, dst = grade_copy(project, session, session_dir)
    try:
        out = {}
        for r in session["requests"]:
            if ids is not None and r["id"] not in ids:
                continue
            cmd = [c.replace("{test_module}", _module(r["hidden_test"])) for c in session["hidden_test_command"]]
            code, _ = _run(cmd, dst)
            out[r["id"]] = code == 0
        return out
    finally:
        shutil.rmtree(d, ignore_errors=True)


def count_lint(text):
    return sum(1 for l in text.splitlines() if l.strip())


def count_type_errors(text):
    return sum(1 for l in text.splitlines() if ": error:" in l)


def final_grade(project, session, session_dir):
    """Everything measured at the end of a run."""
    hidden = hidden_results(project, session, session_dir)
    d, dst = grade_copy(project, session, session_dir)
    try:
        shutil.rmtree(os.path.join(dst, "_eval_hidden"), ignore_errors=True)
        code, text = _run(session["test_command"], dst)
        visible_ok = code == 0
        lint, lint_tool = None, ""
        for key in ("lint_command", "lint_fallback_command"):
            if not session.get(key):
                continue
            code, text = _run(session[key], dst)
            if _missing_tool(code, text):
                continue
            lint, lint_tool = (0 if code == 0 else count_lint(text)), session[key][2] if len(session[key]) > 2 else session[key][0]
            break
        types = None
        if session.get("type_command"):
            code, text = _run(session["type_command"], dst)
            if not _missing_tool(code, text):
                types = 0 if code == 0 else max(1, count_type_errors(text))
    finally:
        shutil.rmtree(d, ignore_errors=True)
    return {"hidden": hidden, "visible_tests_ok": visible_ok, "lint_errors": lint, "lint_tool": lint_tool, "type_errors": types}


def changed_files(project, start_commit):
    """Files changed since the start commit: committed, staged, unstaged or new."""
    files = set()
    for cmd in (["git", "diff", "--name-only", start_commit], ["git", "ls-files", "--others", "--exclude-standard"]):
        code, text = _run(cmd, project)
        if code == 0:
            files.update(l.strip() for l in text.splitlines() if l.strip())
    return sorted(files)


def forgotten(session, hidden, changed):
    """Requests that fail their hidden test and whose files were not touched at all: likely never done."""
    return [r["id"] for r in session["requests"]
            if not hidden.get(r["id"]) and not any(f in changed for f in r.get("files", []))]


def regressions(passed_at_checkpoint, hidden_final):
    """Requests whose hidden test passed at some checkpoint during the run but fails at the end."""
    return sorted(rid for rid in passed_at_checkpoint if not hidden_final.get(rid))
