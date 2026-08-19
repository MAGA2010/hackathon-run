#!/usr/bin/env python3
"""etl.py — minimal CSV -> TSV pipeline using stdlib only.

Usage:
    python3 etl.py --in data/sample.csv --out /tmp/out.tsv

VERSION = "1.0"
"""

VERSION = "1.0"

import argparse
import csv
import sys
from pathlib import Path


def clean_row(row):
    """Drop rows with missing required fields. Returns None to skip."""
    if not row.get("user_id") or not row.get("event"):
        return None
    if row.get("amount"):
        try:
            float(row["amount"])
        except ValueError:
            return None
    return row


def run(in_path, out_path):
    read = 0
    kept = 0
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with in_path.open(newline="", encoding="utf-8") as fin, \
         out_path.open("w", newline="", encoding="utf-8") as fout:
        reader = csv.DictReader(fin)
        writer = csv.DictWriter(fout, fieldnames=reader.fieldnames or [], delimiter="\t")
        writer.writeheader()
        for row in reader:
            read += 1
            cleaned = clean_row(row)
            if cleaned is None:
                continue
            writer.writerow(cleaned)
            kept += 1
    return read, kept


def main():
    p = argparse.ArgumentParser(description="Minimal CSV -> TSV ETL")
    p.add_argument("--in", dest="in_path", required=True, type=Path)
    p.add_argument("--out", dest="out_path", required=True, type=Path)
    args = p.parse_args()
    if not args.in_path.exists():
        print(f"ERROR: input not found: {args.in_path}", file=sys.stderr)
        return 2
    read, kept = run(args.in_path, args.out_path)
    print(f"etl: read={read} kept={kept} dropped={read - kept}")
    return 0 if kept > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
