"""Command line tool: python3 -m inv.cli [--file PATH] <command> ..."""
import argparse
import os
import sys

from .store import Inventory


def main(argv=None, inv=None, out=None):
    out = out or sys.stdout
    p = argparse.ArgumentParser(prog="inv")
    p.add_argument("--file", default="inventory.json")
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add")
    a.add_argument("name")
    a.add_argument("qty", type=int, nargs="?", default=1)
    a.add_argument("--price", type=float)
    r = sub.add_parser("remove")
    r.add_argument("name")
    r.add_argument("qty", type=int, nargs="?", default=1)
    sub.add_parser("list")
    sub.add_parser("value")
    args = p.parse_args(argv)
    use_file = inv is None
    if use_file:
        inv = Inventory.load(args.file) if os.path.exists(args.file) else Inventory()
    if args.cmd == "add":
        inv.add(args.name, args.qty, price=args.price)
    elif args.cmd == "remove":
        inv.remove(args.name, args.qty)
    elif args.cmd == "list":
        for name, qty in sorted(inv.items(), key=lambda i: i[0].lower()):
            print(f"{name}: {qty} @ {inv.price(name):.2f}", file=out)
    elif args.cmd == "value":
        print(f"total: {inv.total_value():.2f}", file=out)
    if use_file and args.cmd in ("add", "remove"):
        inv.save(args.file)
    return 0


if __name__ == "__main__":
    sys.exit(main())
