# FAQ

**Q: Is Hackathon Run an AI agent?**
A: No. It's a pack of skills that runs inside any agent that supports the
[Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
open standard — Codex, Claude Code, Cursor, our CLI.

**Q: Does it work without an agent?**
A: Yes. Each skill has standalone scripts (`scripts/*.py`) you can call
directly. The CLI wraps them.

**Q: Do I have to use all fifteen skills?**
A: No. Run any one. The skill design is **independently invokable**.

**Q: Where does state live?**
A: `.hackathon/state/*.json` in your project. Inspect with any text editor.

**Q: Will this slow down my agent?**
A: No. Layer 1 of progressive disclosure is just metadata (name +
description). The body is only loaded when the skill is triggered.

**Q: What languages can I write skills in?**
A: Anything executable. Python and TypeScript are first-class. Bash scripts
also work via `bash scripts/x.sh`.

**Q: How do I add a new skill?**
A: See [the skill template](../contributing/skill-template.md).

**Q: Is there a hosted version?**
A: No. The pack is local-first. Cloud features are out of scope for v1.
