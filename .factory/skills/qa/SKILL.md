---
name: qa
description: >
  Run functional QA for carrier-performance-scorecard. Analyze the git diff,
  route changed app areas to qa-web and qa-api, capture evidence, and write a
  concise report for PR review or production smoke testing.
---

# QA Orchestrator

**Scope: This skill performs manual/functional QA only. Verify that the application actually works by interacting with it as a real user or API client would. Do not run or report lint, typecheck, unit tests, Playwright suites, static analysis, builds, or security scanners. Those checks are handled outside this skill.**

## Step 1: Load Configuration

Read `.factory/skills/qa/config.yaml` before deciding what to test. Use it for:

- Environment URLs and restrictions
- Default target environment
- Persona names and test focus
- App path patterns
- Sub-skill routing
- Cleanup and failure learning settings

If the config cannot be read, report QA as `:no_entry: BLOCKED` and write `qa-results/report.md` with the reason.

## Step 2: Determine Target Environment

Use `default_target: local` unless the user or CI prompt explicitly requests another target.

Target rules:

- `local` is the default for PRs and branch code. Start the app from the checked-out branch with `npm run dev`, then test `http://127.0.0.1:3100`.
- `production` is only for explicit production smoke testing at `https://carrier-performance-scorecard.vercel.app`.
- No preview deployments were detected. Do not wait for a preview URL.
- For PR branch testing, never fall back to production. Production runs different code and cannot validate the branch.

Required CI env for local QA:

- `DATABASE_URL`
- `NEXT_PUBLIC_DEMO_MODE=true`
- `AI_PROVIDER=mock`
- `CI=true`

Do not read or print `.env.local`. Do not write secrets to reports or logs.

## Step 3: Analyze Git Diff

Use the current git diff to decide scope:

1. Determine the base ref from CI if available. For pull requests, prefer `origin/${{ github.base_ref }}` or the merge base of the checked-out branch and `origin/master`.
2. Run `git diff --name-only` for the relevant range.
3. Match changed files against `apps.web.path_patterns` and `apps.api.path_patterns` from config.
4. Run only the affected app sub-skills.

Files that do not match any app pattern, such as `.factory/skills/**`, `.github/**`, markdown-only docs, or repository metadata, are not app code. If no app code changed, write an INCONCLUSIVE report:

> No app code changed. QA is not applicable for this diff.

Do not load or run sub-skills for unaffected apps.

## Step 4: Route To Relevant Sub-Skills

For each affected app:

- `web`: read `.factory/skills/qa-web/SKILL.md` and run only flows relevant to the changed UI or client behavior.
- `api`: read `.factory/skills/qa-api/SKILL.md` and run only flows relevant to changed API, data, environment, or safety behavior.

If both web and API files changed, run both sub-skills. If a shared file such as `src/lib/scoring/**` changed, run the web flows that display score behavior and the API flows that expose score data.

## Step 5: Local Dev Server Rules

For local PR testing:

1. Start the server from the checked-out branch with `npm run dev`.
2. Poll `http://127.0.0.1:3100/api/health` until ready.
3. Verify the response contains `service: carrier-performance-scorecard` and `demoMode: true`.
4. If port 3100 already responds but the health response does not match, report BLOCKED because a stale listener may be running.
5. Keep the server running only for the QA run.

Do not seed, reset, or mutate data unless explicitly requested. Tests are read-only.

## Step 6: Execute Diff-Relevant Functional Tests

For each affected app, select tests from the sub-skill menu based on the diff:

- Prioritize tests that directly verify the changed behavior.
- Include adjacent integration checks that prove the changed behavior works in context.
- Include at least one negative or recovery test when the change can affect errors, invalid input, empty states, or route recovery.
- Do not run unrelated flows.
- Do not run automated suites such as `npm run test`, `npm run lint`, or `npm run typecheck`.

Never silently skip a flow. If a flow cannot complete, report it as BLOCKED with what was tried and how the user can fix it.

## Step 7: Capture Evidence

Create `qa-results/` if it does not exist. Use text evidence as primary proof.

For web flows:

- Use agent-browser accessibility snapshots after meaningful interactions.
- Save screenshots under `qa-results/` when helpful.
- Reference screenshot filenames in the report. Do not embed image links.

For API flows:

- Save request command summaries and sanitized JSON snippets.
- Include status code, key response fields, and any controlled error shape.
- Never include secrets, database URLs, tokens, or full environment dumps.

## Step 8: Generate Report

Write `qa-results/report.md` using `.factory/skills/qa/REPORT-TEMPLATE.md`.

Report rules:

- Start with `## QA Report`.
- Use result values exactly: `:white_check_mark: PASS`, `:x: FAIL`, `:no_entry: BLOCKED`, `:warning: FLAKY`, `:grey_question: INCONCLUSIVE`.
- Keep the table concise.
- Add `### Action Required` only when a reviewer must do something.
- Put all evidence in one collapsed `<details>` block.
- Do not include setup steps as test rows.

## Step 9: Failure Learning

The configured strategy is `suggest_in_report`.

When a FAIL or BLOCKED result reveals a new testing environment insight not already covered by the relevant sub-skill Known Failure Modes, add a concise `## Suggested Skill Updates (N issues found)` section to the report. Include:

- Severity
- Target file
- Short issue
- A collapsed copyable prompt that tells Droid exactly what to add

Do not write `skill-updates.json` for `suggest_in_report`. Do not suggest updates for bad selectors, skill typos, or expected behavior changes from the diff.
