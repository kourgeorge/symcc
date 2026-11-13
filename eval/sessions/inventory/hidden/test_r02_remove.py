import unittest

from inv import Inventory


class R02Remove(unittest.TestCase):
    def test_removing_too_many_raises_and_keeps_count(self):
        inv = Inventory()
        inv.add("pen", 2)
        with self.assertRaises(ValueError):
            inv.remove("pen", 3)
        self.assertEqual(inv.count("pen"), 2)

    def test_removing_unknown_item_raises(self):
        with self.assertRaises(ValueError):
            Inventory().remove("cup", 1)

    def test_removing_the_last_one_drops_the_item(self):
        inv = Inventory()
        inv.add("pen", 2)
        inv.remove("pen", 2)
        self.assertEqual(inv.count("pen"), 0)
        self.assertEqual([n for n, *_ in inv.items()], [])
