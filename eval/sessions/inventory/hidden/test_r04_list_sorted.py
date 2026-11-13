import io
import unittest

from inv import Inventory
from inv.cli import main


class R04ListSorted(unittest.TestCase):
    def test_list_is_sorted_by_name_as_name_colon_qty(self):
        inv, out = Inventory(), io.StringIO()
        for name, qty in [("pen", 3), ("apple", 1), ("cup", 2)]:
            inv.add(name, qty)
        main(["list"], inv=inv, out=out)
        lines = [l for l in out.getvalue().splitlines() if l.strip()]
        self.assertEqual(len(lines), 3)
        # R09 later adds " @ price" at the end, so only the start is checked here.
        for line, (name, qty) in zip(lines, [("apple", 1), ("cup", 2), ("pen", 3)]):
            self.assertTrue(line.startswith(f"{name}: {qty}"), line)
