"""The stock list: item names and how many of each are in stock."""


class Inventory:
    def __init__(self):
        self._qty = {}

    def add(self, name, qty=1):
        """Add `qty` of item `name`."""
        if qty <= 0:
            raise ValueError("qty must be positive")
        self._qty[name] = self._qty.get(name, 0) + qty

    def remove(self, name, qty=1):
        """Take `qty` of item `name` out of stock."""
        self._qty[name] = self._qty.get(name, 0) - qty

    def count(self, name):
        """How many of `name` are in stock (0 if unknown)."""
        return self._qty.get(name, 0)

    def items(self):
        """(name, qty) pairs, in the order they were first added."""
        return list(self._qty.items())
