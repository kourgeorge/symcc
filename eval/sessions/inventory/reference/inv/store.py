"""The stock list: item names, how many of each are in stock, and their unit prices."""
import json


class Inventory:
    def __init__(self):
        self._items = {}  # lower-case name -> {"name", "qty", "price"}

    def add(self, name, qty=1, price=None):
        """Add `qty` of item `name`; a given `price` replaces the old one."""
        if qty <= 0:
            raise ValueError("qty must be positive")
        item = self._items.setdefault(name.lower(), {"name": name, "qty": 0, "price": None})
        item["qty"] += qty
        if price is not None:
            item["price"] = float(price)

    def remove(self, name, qty=1):
        """Take `qty` of item `name` out of stock; ValueError if there are not that many."""
        key = name.lower()
        have = self.count(name)
        if qty > have:
            raise ValueError(f"only {have} of {name} in stock")
        self._items[key]["qty"] -= qty
        if self._items[key]["qty"] == 0:
            del self._items[key]

    def count(self, name):
        """How many of `name` are in stock (0 if unknown)."""
        item = self._items.get(name.lower())
        return item["qty"] if item else 0

    def price(self, name):
        """Unit price of `name` (0 if none was given)."""
        item = self._items.get(name.lower())
        return (item["price"] or 0.0) if item else 0.0

    def total_value(self):
        return sum(i["qty"] * (i["price"] or 0.0) for i in self._items.values())

    def items(self):
        """(name, qty) pairs, in the order they were first added."""
        return [(i["name"], i["qty"]) for i in self._items.values()]

    def save(self, path):
        with open(path, "w") as f:
            json.dump(list(self._items.values()), f, indent=2)

    @classmethod
    def load(cls, path):
        inv = cls()
        with open(path) as f:
            for i in json.load(f):
                inv.add(i["name"], i["qty"], price=i.get("price"))
        return inv
