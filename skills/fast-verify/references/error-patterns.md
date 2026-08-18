# Common error patterns

Cheat sheet for `diagnose.py`. Keep this file short — every entry should be
a pattern that has bitten a hackathon team in the last 6 months.

| Pattern | Cause | Fix |
|---|---|---|
| `connection refused` | Dev server not up | Start dev server |
| `EADDRINUSE` / `port already in use` | Port collision | Kill process or change port |
| `ENOENT: no such file` | Wrong cwd or missing file | `cd` to project root |
| `Cannot find module` | `node_modules` missing | `npm install` |
| `ModuleNotFoundError` | Python deps missing | `pip install` |
| `401 / 403` | API key missing/invalid | Set env var |
| `timeout` | Network slow / upstream down | Increase timeout / retry |
| `SyntaxError` | Last edit broke parse | `git diff` to see changes |
| `out of memory` | Heap too small | Lower worker count |

Add a row whenever a new pattern is seen at a real event.
