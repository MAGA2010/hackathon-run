# Example: Data Engineering (Python ETL)

A minimal Python ETL pipeline that ingests a CSV, cleans rows, and writes
a TSV. Demonstrates Hackathon Surgeon applied to a "data" demo_format.

## Stack

Python 3.11+ with stdlib only (no pandas / pyarrow needed for the demo).

## Project structure

```
examples/data-eng/
├── README.md
├── requirements.txt
├── src/etl.py        # the whole pipeline; runnable as a CLI
├── data/sample.csv   # 20 rows of fake customer events
├── scripts/smoke.sh  # runs the pipeline end-to-end
└── .hackathon/state/plan.json
```

## Quick start

```bash
cd examples/data-eng
python3 src/etl.py --in data/sample.csv --out /tmp/out.tsv
```

## What Hackathon Surgeon says about this project

Run from the repo root:

```bash
hackathon match "we have 6 hours left and a CSV to clean"
hackathon status --cwd examples/data-eng
```
