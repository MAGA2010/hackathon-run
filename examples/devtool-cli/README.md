# Example: Devtool CLI (Node ESM)

A minimal Node CLI that reads JSON from stdin and pretty-prints it with a
timestamp prefix. Demonstrates Hackathon Surgeon applied to a "cli"
demo_format.

## Stack

Node 20+ ESM. Zero dependencies.

## Project structure

```
examples/devtool-cli/
├── README.md
├── package.json          # "bin": { "demo-cli": "src/cli.mjs" }
├── src/cli.mjs           # the whole CLI
├── fixtures/sample.json  # a small JSON input for the demo
└── scripts/smoke.mjs     # pipes fixtures/sample.json into cli.mjs and asserts the output
```

## Quick start

```bash
cd examples/devtool-cli
echo '{"hello":"world"}' | node src/cli.mjs
```

## What Hackathon Surgeon says about this project

```bash
hackathon match "we want to ship a small CLI tool today"
hackathon status --cwd examples/devtool-cli
```
