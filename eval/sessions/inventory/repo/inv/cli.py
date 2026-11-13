"""Command line tool: python3 -m inv.cli <command> ..."""
import argparse
import sys

from .store import Inventory


def main(argv=None, inv=None, out=None):
    out = out or sys.stdout
    inv = inv if inv is not None else Inventory()
    p = argparse.ArgumentParser(prog="inv")
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add")
    a.add_argument("name")
    a.add_argument("qty", type=int, nargs="?", default=1)
    r = sub.add_parser("remove")
    r.add_argument("name")
    r.add_argument("qty", type=int, nargs="?", default=1)
    sub.add_parser("list")
    args = p.parse_args(argv)
    if args.cmd == "add":
        inv.add(args.name, args.qty)
    elif args.cmd == "remove":
        inv.remove(args.name, args.qty)
    elif args.cmd == "list":
        for name, qty in inv.items():
            print(f"{name} {qty}", file=out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
