import io
import unittest

from inv import Inventory
from inv.cli import main


class R09ListShowsPrice(unittest.TestCase):
    def test_list_shows_qty_and_price(self):
        inv, out = Inventory(), io.StringIO()
        inv.add("pen", 3, price=1.5)
        inv.add("apple", 1)
        main(["list"], inv=inv, out=out)
        lines = [l.strip() for l in out.getvalue().splitlines() if l.strip()]
        self.assertEqual(lines, ["apple: 1 @ 0.00", "pen: 3 @ 1.50"])
