import io
import unittest

from inv import Inventory
from inv.cli import main


class StoreTest(unittest.TestCase):
    def test_add_and_count(self):
        inv = Inventory()
        inv.add("pen", 3)
        inv.add("pen", 2)
        self.assertEqual(inv.count("pen"), 5)
        self.assertEqual(inv.count("cup"), 0)

    def test_add_needs_positive_qty(self):
        with self.assertRaises(ValueError):
            Inventory().add("pen", 0)

    def test_remove(self):
        inv = Inventory()
        inv.add("pen", 3)
        inv.remove("pen", 1)
        self.assertEqual(inv.count("pen"), 2)

    def test_cli_add_then_list_shows_the_item(self):
        inv, out = Inventory(), io.StringIO()
        main(["add", "pen", "2"], inv=inv, out=out)
        main(["list"], inv=inv, out=out)
        self.assertIn("pen", out.getvalue())


if __name__ == "__main__":
    unittest.main()
