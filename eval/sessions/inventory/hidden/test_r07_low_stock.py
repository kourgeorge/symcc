import unittest

from inv import Inventory
from inv.report import low_stock


class R07LowStock(unittest.TestCase):
    def test_low_stock_sorted_below_threshold(self):
        inv = Inventory()
        for name, qty in [("pen", 3), ("apple", 10), ("cup", 1), ("box", 5)]:
            inv.add(name, qty)
        self.assertEqual(low_stock(inv), ["cup", "pen"])
        self.assertEqual(low_stock(inv, threshold=11), ["apple", "box", "cup", "pen"])
