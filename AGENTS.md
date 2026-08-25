# AGENTS.md — guidance for coding agents working in mcp-doctor

- Read `docs/spec.md` before changing anything; the specification defines the scope.
- Keep changes minimal and aligned with the spec; do not broaden features silently.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before claiming success.
- Report only results you actually observed; never fabricate command output.
- If blocked by a missing external requirement, state the blocker explicitly instead of improvising.
