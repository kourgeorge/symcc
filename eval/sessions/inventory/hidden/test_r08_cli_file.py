import io
import os
import tempfile
import unittest

from inv.cli import main


class R08CliRemembers(unittest.TestCase):
    def test_file_option_keeps_stock_between_runs(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "stock.json")
            main(["--file", path, "add", "pen", "2"])
            main(["--file", path, "add", "cup", "1"])
            main(["--file", path, "remove", "cup", "1"])
            out = io.StringIO()
            main(["--file", path, "list"], out=out)
            self.assertIn("pen: 2", out.getvalue())
            self.assertNotIn("cup", out.getvalue())

    def test_default_file_is_inventory_json_in_current_folder(self):
        old = os.getcwd()
        with tempfile.TemporaryDirectory() as d:
            os.chdir(d)
            try:
                main(["add", "pen", "1"])
                self.assertTrue(os.path.exists(os.path.join(d, "inventory.json")))
            finally:
                os.chdir(old)
