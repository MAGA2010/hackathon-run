# Example: Chrome Extension (Manifest V3)

A minimal Manifest V3 Chrome extension that highlights hackathon-team todo
items on any page. Demonstrates Hackathon Run applied to a
"browser-extension" demo_format.

## Stack

JavaScript only (no build step). The demo path is "load unpacked extension
-> open a page -> see highlights -> click highlight -> show toast".

## Project structure

```
examples/chrome-extension/
├── README.md
├── manifest.json          # MV3 manifest
├── src/
│   ├── background.js      # service worker
│   ├── content.js         # page-side highlighter
│   └── popup.html         # extension popup (minimal)
├── icons/icon.svg         # placeholder icon
└── scripts/smoke.mjs      # asserts every required file exists
```

## Quick start

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" -> select `examples/chrome-extension/`
4. Visit any page; the extension highlights TODO items in yellow.

## What Hackathon Run says about this project

```bash
hackathon match "we have 8 hours and want a browser extension"
hackathon status --cwd examples/chrome-extension
```
