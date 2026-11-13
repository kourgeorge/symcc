import io
import unittest

from inv import Inventory
from inv.cli import main


class R05ValueCommand(unittest.TestCase):
    def test_value_command_with_price_option(self):
        inv, out = Inventory(), io.StringIO()
        main(["add", "pen", "3", "--price", "1.5"], inv=inv, out=out)
        main(["add", "cup", "2", "--price", "4"], inv=inv, out=out)
        main(["value"], inv=inv, out=out)
        self.assertIn("total: 12.50", out.getvalue())
