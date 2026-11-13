"""Self-tests for the harness (no model calls):  python3 -m unittest discover -s eval/harness"""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import grade  # noqa: E402
import logs  # noqa: E402
import results  # noqa: E402
import run  # noqa: E402


def line(mid, inp=0, out=0, cw=0, cr=0, side=False, kind="assistant"):
    return json.dumps({"type": kind, "isSidechain": side, "message": {"id": mid, "model": "m", "usage": {
        "input_tokens": inp, "output_tokens": out, "cache_creation_input_tokens": cw, "cache_read_input_tokens": cr}}})


class LogsTest(unittest.TestCase):
    def test_folder_name_matches_claude_code(self):
        self.assertEqual(logs.folder_name("/a/b_c.d/e"), "-a-b-c-d-e")

    def test_counts_each_message_once_and_includes_subagents_and_worktrees(self):
        with tempfile.TemporaryDirectory() as home:
            project = os.path.join(home, "work", "arm-r1")
            os.makedirs(project)
            name = logs.folder_name(project)
            main = os.path.join(home, "projects", name)
            os.makedirs(os.path.join(main, "s1", "subagents"))
            with open(os.path.join(main, "s1.jsonl"), "w") as f:
                f.write("\n".join([line("a", 10, 5, 100, 1000), line("a", 10, 5, 100, 1000),
                                   line("u", 99, kind="user"), "not json"]) + "\n")
            with open(os.path.join(main, "s1", "subagents", "agent-1.jsonl"), "w") as f:
                f.write(line("b", 1, 2, 3, 4, side=True) + "\n")
            wt = os.path.join(home, "projects", name + "--symcc-worktrees-T-1")
            os.makedirs(wt)
            with open(os.path.join(wt, "w.jsonl"), "w") as f:
                f.write(line("c", 1) + "\n")
            other = os.path.join(home, "projects", logs.folder_name(project + "0"))  # arm-r10: not ours
            os.makedirs(other)
            with open(os.path.join(other, "x.jsonl"), "w") as f:
                f.write(line("d", 1000) + "\n")
            u = logs.run_usage(project, home)
        self.assertEqual((u["input"], u["output"], u["cache_write"], u["cache_read"]), (12, 7, 103, 1004))
        self.assertEqual((u["api_calls"], u["subagent_calls"]), (3, 1))

    def test_billed_equivalent_weights(self):
        self.assertEqual(logs.billed_equivalent({"input": 100, "cache_write": 100, "cache_read": 100, "output": 100}), 735)


class DriverTest(unittest.TestCase):
    session = {"answers": [{"keywords": ["file", "where"], "for": ["R08"], "answer": "use --file"}],
               "default_answer": "decide"}

    def test_question_detection_looks_at_the_end(self):
        self.assertTrue(run.looks_like_question("Done.\n\nWhere should I store it?"))
        self.assertFalse(run.looks_like_question("Why? Because.\n\nAll done."))

    def test_answers_from_the_sheet_or_default(self):
        self.assertEqual(run.pick_answer(self.session, "Which file?", "R08"), ("use --file", True))
        self.assertEqual(run.pick_answer(self.session, "Blue or red?", "R01"), ("decide", False))


class GradeTest(unittest.TestCase):
    def test_regressions_and_forgotten(self):
        s = {"requests": [{"id": "R1", "files": ["a.py"]}, {"id": "R2", "files": ["b.py"]}]}
        self.assertEqual(grade.regressions({"R1", "R2"}, {"R1": True, "R2": False}), ["R2"])
        self.assertEqual(grade.forgotten(s, {"R1": False, "R2": False}, ["a.py"]), ["R2"])


class ResultsTest(unittest.TestCase):
    def test_spread_and_summary(self):
        self.assertEqual(results.spread([1, 2, 6]), (3, 2, 1, 6))
        runs = [{"session": "s", "arm": a, "run": n, "agent": "fake-noop", "status": "ok", "input_tokens": n,
                 "hidden": {"R1": n == 1}} for a in ("symcc", "plain") for n in (1, 2)]
        md = results.summary_md(runs)
        self.assertIn("| metric | plain | symcc |", md)
        self.assertIn("| input tokens | 1.50 / 1.50 (1-2)", md)
        self.assertIn("| R1 | 1/2 | 1/2 |", md)


if __name__ == "__main__":
    unittest.main()
