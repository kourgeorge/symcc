import unittest

from inv import Inventory


class R06Case(unittest.TestCase):
    def test_names_ignore_case_and_keep_first_spelling(self):
        inv = Inventory()
        inv.add("Apple", 1)
        inv.add("apple", 2)
        self.assertEqual(inv.count("APPLE"), 3)
        names = [n for n, *_ in inv.items()]
        self.assertEqual(names, ["Apple"])

    def test_remove_ignores_case(self):
        inv = Inventory()
        inv.add("Pen", 3)
        inv.remove("pen", 1)
        self.assertEqual(inv.count("Pen"), 2)
