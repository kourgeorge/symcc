import json
import os
import tempfile
import unittest

from inv import Inventory


class R03SaveLoad(unittest.TestCase):
    def test_round_trip_keeps_counts_and_prices(self):
        inv = Inventory()
        inv.add("pen", 3, price=1.5)
        inv.add("cup", 2)
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "stock.json")
            inv.save(path)
            with open(path) as f:
                json.load(f)  # it is JSON
            back = Inventory.load(path)
        self.assertEqual(back.count("pen"), 3)
        self.assertEqual(back.count("cup"), 2)
        self.assertEqual(back.price("pen"), 1.5)
        self.assertAlmostEqual(back.total_value(), 4.5)
