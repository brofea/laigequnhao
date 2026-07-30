<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->

## Sub-Agent Dispatch Protocol

### Git Safety (MANDATORY)

**Sub-agents MUST NEVER use destructive git operations.** This rule prevents parallel agents from wiping each other's changes.

**FORBIDDEN** for all sub-agents:
- `git checkout` / `git restore` / `git reset` — anything that modifies the working tree
- `git stash` / `git stash pop` — anything that moves changes between stacks
- `git clean` — anything that deletes untracked files
- `git rebase --abort` — anything that discards in-progress work

**ALLOWED** for sub-agents:
- `Edit` tool — the ONLY way to modify files
- `Write` tool — for creating new files only
- `git status` / `git diff` / `git log` — read-only inspection
- `git add` — only when explicitly part of a commit step

### Why This Matters

When multiple sub-agents run in parallel and edit overlapping files, a single `git restore` by one agent wipes ALL changes from ALL agents. This has caused entire batches of work to be silently lost.

### Conflict Resolution

If a sub-agent encounters a conflict (file was edited since it started):
- **Do NOT use git to resolve it** — that destroys other agents' work
- Re-read the file with the `Read` tool to get the latest state
- Re-apply edits using the `Edit` tool against the current file content
- If the conflict is too complex to resolve, **report to the main agent and stop**
