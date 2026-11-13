import csv
import io
import unittest

from inv import Inventory
from inv.report import csv_export


class R10CsvExport(unittest.TestCase):
    def test_csv_has_header_and_sorted_rows(self):
        inv = Inventory()
        inv.add("pen", 3, price=1.5)
        inv.add("apple", 2, price=0.25)
        rows = list(csv.reader(io.StringIO(csv_export(inv))))
        rows = [r for r in rows if r]
        self.assertEqual(rows[0], ["name", "qty", "price"])
        self.assertEqual([r[0] for r in rows[1:]], ["apple", "pen"])
        self.assertEqual(int(rows[2][1]), 3)
        self.assertAlmostEqual(float(rows[2][2]), 1.5)
