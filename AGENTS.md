<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## obsidian-memory

This project uses Obsidian as the architecture and knowledge memory source at `obsidian/`.

Rules:
- Before answering architecture or codebase questions, read:
  - `obsidian/50_Engineering/Architecture.md`
  - `obsidian/30_Resources/Codebase-Graph-Snapshot/Codebase Graph Snapshot - 2026-05-15.md`
- For cross-module "how does X relate to Y" questions, prefer:
  - architecture note links
  - ADRs in `obsidian/50_Engineering/ADRs/`
  - RFCs in `obsidian/50_Engineering/RFCs/`
- After modifying code files, update `obsidian/50_Engineering/Architecture.md` if module boundaries, critical paths, or bridge utilities changed.
