"""Reports over an Inventory."""
import csv
import io


def low_stock(inv, threshold=5):
    return sorted(name for name, qty in inv.items() if qty < threshold)


def csv_export(inv):
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(["name", "qty", "price"])
    for name, qty in sorted(inv.items(), key=lambda i: i[0].lower()):
        w.writerow([name, qty, f"{inv.price(name):.2f}"])
    return buf.getvalue()
