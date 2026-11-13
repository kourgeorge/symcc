import unittest

from inv import Inventory


class R01Price(unittest.TestCase):
    def test_price_and_total(self):
        inv = Inventory()
        inv.add("pen", 3, price=1.5)
        inv.add("cup", 2, price=4.0)
        self.assertEqual(inv.price("pen"), 1.5)
        self.assertAlmostEqual(inv.total_value(), 3 * 1.5 + 2 * 4.0)

    def test_last_price_wins_and_no_price_is_zero(self):
        inv = Inventory()
        inv.add("pen", 1, price=1.0)
        inv.add("pen", 1, price=2.0)
        inv.add("cup", 5)
        self.assertEqual(inv.price("pen"), 2.0)
        self.assertAlmostEqual(inv.total_value(), 4.0)

    def test_add_without_price_still_works(self):
        inv = Inventory()
        inv.add("pen", 2)
        self.assertEqual(inv.count("pen"), 2)
