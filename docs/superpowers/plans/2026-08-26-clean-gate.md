# Clean Gate and CI Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `mcp-doctor` repository reproducible from a clean checkout and expose one canonical verification command that an external OSS Agent Factory can consume without treating a dirty workspace as evidence.

**Architecture:** Keep the CLI's compiled-output integration tests, because the published package points at `dist/cli.js`, and make the required order explicit as `install → lint → typecheck → build → test → audit`. Put the ordered project gates in a checked-in Node runner and have GitHub Actions invoke that runner after the frozen install. The external factory implementation is not present in this checkout, so repository changes will provide a deterministic verification contract and document the missing factory-side state-machine integration instead of fabricating it.

**Tech Stack:** Node.js 24, pnpm 11, TypeScript, Vitest, ESLint, GitHub Actions, `pnpm audit`.

**Spec:** `docs/spec.md`

## Global Constraints

- The CLI remains an offline inspector for local JSON MCP configuration files.
- Do not connect to remote MCP servers, execute configured MCP tools, mutate target configuration files, add YAML support, or auto-fix findings.
- Preserve TypeScript strictness, the existing JSON output schema, and exit codes 0–3.
- Use the package manager declared by the project; this repository is pnpm-based and must use the frozen lockfile.
- Do not move or rewrite the public `v0.1.0` tag.
- Do not report a gate or release as passed without command or remote-run evidence.

---

### Task 1: Establish the canonical clean verification contract

**Files:**
- Create: `scripts/verify.mjs`
- Create: `scripts/verification.json`
- Modify: `package.json`
- Modify: `.npmrc`
- Modify: `.gitignore`
- Modify: `.github/workflows/ci.yml`
- Delete: `mcp-doctor-0.1.0.tgz`
- Test: `test/verification-contract.test.ts`

**Interfaces:**
- Consumes: `package.json` scripts, the repository lockfile, and the current process environment.
- Produces: `pnpm verify` with the fixed ordered gates `lint`, `typecheck`, `build`, `test`, and `audit`; a workflow that runs the same command after `pnpm install --frozen-lockfile`.

- [ ] **Step 1: Write the failing contract test**

  Add tests that read `package.json`, `scripts/verification.json`, `scripts/verify.mjs`, and `.github/workflows/ci.yml`, then assert the exact ordered commands are represented once and that `build` precedes `test` in the canonical manifest and workflow contract. Assert the project declares `packageManager: "pnpm@11.23.0"`, the workflow pins Node 24 and pnpm 11, and ignored generated package/install directories include `dist/`, `.pnpm-store/`, and `*.tgz`.

- [ ] **Step 2: Run the contract test and observe the current failure**

  Run `pnpm exec vitest run test/verification-contract.test.ts` after dependencies are available. It must fail against the current workflow because the workflow currently places `pnpm test` before `pnpm build` and has no canonical verifier.

- [ ] **Step 3: Implement the canonical verifier**

  Create `scripts/verification.json` with the ordered gate names and package-manager arguments, then create `scripts/verify.mjs` that loads that manifest, executes the list with `spawnSync`, and stops on the first non-zero result:

  ```js
  const gates = [
    ["lint", ["run", "lint"]],
    ["typecheck", ["run", "typecheck"]],
    ["build", ["run", "build"]],
    ["test", ["run", "test"]],
    ["audit", ["audit", "--audit-level", "high"]],
  ];
  ```

  Resolve the executable from `npm_execpath` when present and otherwise use `pnpm`, print `VERIFY stage: <name>` before each gate, preserve the child exit code, and emit `VERIFY FAILED stage: <name> command: pnpm <args>` on failure. Do not run installation from this script; the caller must perform the frozen install in an isolated checkout.

- [ ] **Step 4: Pin project tooling and ignore generated artifacts**

  Add `"packageManager": "pnpm@11.23.0"` to `package.json`; keep `"node": ">=24"`. Add `.pnpm-store/` and `*.tgz` to `.gitignore`. Keep `.npmrc`'s `ignore-workspace=true` and add a comment explaining that the project is intentionally isolated from parent workspaces. Remove the tracked `mcp-doctor-0.1.0.tgz`, which is a generated package artifact rather than source.

- [ ] **Step 5: Align GitHub Actions with the contract**

  Keep the explicit frozen install and invoke the canonical verifier:

  ```yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm verify
  ```

  The verifier must execute lint, typecheck, build, test, and audit in that order. Retain checkout, Node 24, pnpm 11, and pnpm cache setup. Do not use `continue-on-error`.

- [ ] **Step 6: Run the contract test and the repository checks**

  Run `pnpm exec vitest run test/verification-contract.test.ts`, `pnpm lint`, and `pnpm typecheck`. Confirm the workflow and runner assertions pass and no generated artifact is tracked.

---

### Task 2: Make the published CLI path a deliberate integration boundary

**Files:**
- Modify: `test/cli.test.ts`
- Modify: `test/smoke.test.ts`
- Test: `test/cli.test.ts`, `test/smoke.test.ts`, `test/verification-contract.test.ts`

**Interfaces:**
- Consumes: the compiled entry point `dist/cli.js` produced by `pnpm build`.
- Produces: regression coverage that fails clearly when the build artifact is absent and verifies the packaged CLI entry point rather than relying on stale output.

- [ ] **Step 1: Add an explicit build-artifact precondition test**

  Add a test helper that checks `dist/cli.js` exists before invoking it and throws an actionable message containing `stage: test`, `environment: build-output`, `command: pnpm build`, and `reason: dist/cli.js missing`. Keep the existing CLI behavior assertions unchanged.

- [ ] **Step 2: Add a clean-workspace contract check**

  Add a contract test that identifies the repository root from the test file, asserts no generated tarball is present in a clean checkout, and asserts the generated artifact is produced by the build gate. The test must not create or preserve a substitute artifact and must not allow a pre-existing ignored file to satisfy a source-control assertion. The factory-specific dirty-artifact fixture cannot be added here because the factory source is not part of this repository.

- [ ] **Step 3: Verify the integration test after a clean build**

  Run `pnpm build` followed by `pnpm test`. Confirm the CLI tests execute the current compiled output and the failure message is only reachable when the build stage is omitted.

---

### Task 3: Document the incident and version the corrective source

**Files:**
- Create: `POSTMORTEM_CLEAN_GATE.md`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: observed local failure evidence and the canonical verification contract.
- Produces: a corrective `0.1.1` source version and a short, evidence-based incident record.

- [ ] **Step 1: Write the postmortem**

  Include the observed sequence, root cause, why the contaminated local workspace passed, why clean GitHub Actions failed, contributing factors (tests invoking `dist/cli.js`, workflow drift, tracked tarball, no canonical verifier), the correction, regression coverage, and the new guarantee that `COMPLETE` requires remote verification. State explicitly that the failure was reproducible and not flaky. Do not claim factory state-machine changes that are not present in this checkout.

- [ ] **Step 2: Bump the package and user-facing tarball example**

  Change the package version from `0.1.0` to `0.1.1`, update the README package filename to `mcp-doctor-0.1.1.tgz`, and add a `0.1.1` changelog entry describing the clean verification order. Do not alter any `v0.1.0` tag or historical commit.

- [ ] **Step 3: Validate package metadata and smoke behavior**

  Run `pnpm build`, `pnpm pack --pack-destination <temporary-directory>`, install the resulting tarball into an empty temporary fixture, and run `mcp-doctor --help`. Record the observed tarball name and exit code.

---

### Task 4: Execute fresh-checkout evidence and report external blockers precisely

**Files:**
- Modify: `POSTMORTEM_CLEAN_GATE.md` only if new evidence changes the factual record.

**Interfaces:**
- Consumes: the corrective commit, the package manager lockfile, and GitHub Actions results for the exact commit SHA.
- Produces: reproducibility evidence, remote CI evidence, and a truthful PASS/FAIL verdict.

- [ ] **Step 1: Run the required local gates in canonical order**

  From a fresh temporary checkout of the candidate commit, run `pnpm install --frozen-lockfile`, `pnpm verify`, and the package smoke test. Separately run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` only as additional evidence; do not treat their order as the release gate.

- [ ] **Step 2: Inspect the remote workflow for the exact candidate SHA**

  After the candidate is pushed, identify the workflow run for that exact SHA, wait for it to finish within a bounded timeout, inspect its conclusion and failed job/step if any, and record the run ID and URL. A missing, pending, or failing run is not a pass.

- [ ] **Step 3: Preserve tag history and create only the next valid tag**

  Verify `v0.1.0` still resolves to `b048ae983c7a4f7b33a92aa2e140c90da676008d`. Create `v0.1.1` only after the exact candidate SHA's remote CI is green and only if the release policy allows it. If the external factory implementation, registry, quarantine state, or durable resume state is not available in this checkout, report those items as unverified rather than fabricating `COMPLETE`.

---

## Scope self-review

- The repository-side root cause, workflow ordering, artifact contamination, package-manager pin, regression coverage, postmortem, version bump, and fresh-checkout verification are covered above.
- The OSS Agent Factory state machine, registry audit, durable `.factory/` transitions, remote publication idempotency, quarantine inspection, and `pnpm factory resume` implementation are not represented in this repository and cannot be safely implemented without that source or an authenticated factory control plane. The plan explicitly treats those as external verification items and forbids claiming them as completed.
- No CLI product behavior outside the specification is added.
