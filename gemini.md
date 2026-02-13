# Gemini Agent Instructions

Follow all instructions in `CLAUDE.md` — they apply equally to you.

## Bug Logging

When you discover a bug during development that is **not directly related to your current task**, do not stop to fix it. Instead:

1. Log it in `bugs.md` at the project root following the existing format:
   - Assign the next `B###` ID
   - Include: severity, component, discovery date, description with code example, and any known workaround
2. Continue with your current task, using a workaround if needed
3. Mention the new bug ID in your commit message if your code works around it

Severity levels:
- **High** — Produces incorrect output or crashes
- **Medium** — Feature gap or type system issue with workaround available
- **Low** — Cosmetic or minor behavioral difference

This keeps the workflow unblocked while ensuring nothing is forgotten.
