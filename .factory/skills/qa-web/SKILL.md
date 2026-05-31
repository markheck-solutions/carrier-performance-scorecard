---
name: qa-web
description: >
  Functional browser QA for the Carrier Performance Intelligence Scorecard web
  dashboard. Uses agent-browser to verify dashboard, filters, carrier detail,
  evidence, QBR brief generation, keyboard access, and recovery flows.
---

# QA Web

Use this sub-skill only when the orchestrator identifies web app changes. This is manual/functional QA. Do not run lint, typecheck, unit tests, browser test suites, builds, or static analysis.

## Testing Target

Default PR target: local dev server running branch code at `http://127.0.0.1:3100`.

No preview deployments were detected. For PR branch testing:

1. Start the app with `npm run dev`.
2. Poll `http://127.0.0.1:3100/api/health` until it returns JSON.
3. Verify `service` is `carrier-performance-scorecard`.
4. Verify `demoMode` is `true`.
5. Use `http://127.0.0.1:3100` for all browser flows.

Production target: `https://carrier-performance-scorecard.vercel.app` only when the user or CI prompt explicitly asks for production smoke. Never use production as a fallback for PR branch testing.

Required env for local QA:

- `DATABASE_URL`
- `NEXT_PUBLIC_DEMO_MODE=true`
- `AI_PROVIDER=mock`
- `CI=true`

Do not read or print `.env.local`.

## Evidence Rules

- Use agent-browser accessibility snapshots as primary evidence.
- Save screenshots under `qa-results/` for important visual states.
- Reference screenshot filenames in the report instead of embedding image links.
- Close browser sessions at the end of the run.
- Keep evidence focused on the changed behavior and adjacent flows.

## Personas

- `executive-reviewer`: verifies first impression, summary KPIs, carrier comparison, and executive readability.
- `qbr-analyst`: verifies filters, carrier detail, evidence, and QBR brief output.
- `it-security-reviewer`: verifies read-only posture, demo disclosure, controlled errors, and no secret exposure.
- `keyboard-user`: verifies keyboard navigation, focus movement, drawer close, and reset behavior.
- `malicious-deeplink-user`: verifies invalid query parameters and deep links recover without crashing.

## Menu Of Available Test Flows

Select only the flows relevant to the diff, plus adjacent checks needed to prove integration.

### Flow W1: Dashboard First Visit

Persona: `executive-reviewer`

1. Open `/`.
2. Wait for the dashboard to finish loading.
3. Verify the page shows:
   - `Executive QBR dashboard`
   - `Carrier Performance Intelligence Scorecard`
   - `Read-only demo`
   - Demo disclosure text that says the dataset is fictional and mock AI is used
   - `Carrier health spectrum`
   - Leadership KPI cards and carrier comparison content
4. Verify no visible error boundary or unhandled crash appears.
5. Capture an accessibility snapshot and a screenshot.

Pass criteria: a first-time portfolio reviewer can understand the purpose, public demo posture, and primary dashboard areas without interaction.

### Flow W2: Scope Filters

Persona: `qbr-analyst`

1. Open `/`.
2. Use the `Scope filters` region.
3. Change one or more controls:
   - Carrier
   - Region
   - Product
   - Period
4. Verify the URL query string updates.
5. Verify active filter pills appear.
6. Verify carrier comparison and summary content update or show a controlled empty state.
7. Use `Reset` or `Reset filters` and verify filters clear.
8. Capture snapshots before and after filtering.

Pass criteria: filters are usable, update the dashboard, and can be reset without stale selection or broken state.

### Flow W3: Carrier Comparison And Detail

Persona: `qbr-analyst`

1. Open `/`.
2. Scroll the comparison list into view.
3. Before clicking a comparison card, ensure it is visible. If a card is offscreen, scroll it into view first.
4. Select a carrier card with an accessible name like `Select carrier ...`.
5. Verify the selected state is visible on the card.
6. Verify `Selected carrier detail` loads for the same carrier.
7. Verify the detail panel shows score, grade, relationship tier, region focus, driver breakdown, and evidence ID controls when available.
8. Capture snapshots of selected card and loaded detail.

Pass criteria: selecting a carrier updates the detail panel and keeps the selected context consistent.

### Flow W4: Health Spectrum Selection

Persona: `executive-reviewer`

1. Open `/`.
2. Locate `Carrier health spectrum`.
3. Select a carrier marker with an accessible name like `Select carrier ...`.
4. Verify the marker has selected state or `aria-pressed=true`.
5. Verify the selected carrier detail loads.
6. Verify spectrum labels and grade bands remain visible.
7. Capture an accessibility snapshot.

Pass criteria: the health spectrum is usable as an alternate carrier selection path.

### Flow W5: Evidence Drawer

Persona: `qbr-analyst`

1. Select a carrier.
2. In the score component or evidence ID area, click `View proof` or a visible evidence ID.
3. Verify the `Evidence drawer` opens.
4. Wait for evidence content to load.
5. Verify the drawer includes scope context, evidence fields, and no secret-like values.
6. Close the drawer with the `Close` button.
7. Reopen evidence and close with the Escape key.
8. Verify focus returns to the triggering control or a sensible nearby control.
9. Capture snapshots of drawer open and closed states.

Pass criteria: evidence opens, loads, closes, and preserves usable focus.

### Flow W6: QBR Brief

Persona: `qbr-analyst`

1. Select a carrier.
2. Find the `QBR brief` panel.
3. Click `Generate brief`.
4. Wait for generated content.
5. Verify the brief includes strengths, concerns, questions, and governance actions.
6. Verify the data notice is present and mock AI posture is clear.
7. Use `Change mock variation` if visible.
8. Verify variation changes the brief without switching away from mock provider.
9. Capture the generated brief snapshot.

Pass criteria: the QBR brief can be generated from selected carrier context using mock AI without leaking real data.

### Flow W7: Reset And Recovery Controls

Persona: `executive-reviewer`

1. Apply filters and select a carrier.
2. Verify active filter pills and selected state are visible.
3. Use `Reset`, `Reset filters`, or `Clear selection` depending on current state.
4. Verify the URL returns to a clean or expected query state.
5. Verify dashboard content is restored.
6. Capture before and after snapshots.

Pass criteria: reviewers can recover from scoped or empty states without a full reload.

### Flow W8: Keyboard Accessibility

Persona: `keyboard-user`

1. Open `/`.
2. Navigate through major controls with Tab and Shift+Tab.
3. Activate a filter, carrier card, health spectrum marker, evidence trigger, QBR button, and close control with keyboard input.
4. Verify focus is visible and does not become trapped except while the modal drawer is intentionally open.
5. Open the evidence drawer, then close it with Escape.
6. Verify focus returns to the trigger or a sensible nearby control.
7. Capture text snapshots that show focused controls or active states.

Pass criteria: core flows can be completed without a mouse and without focus loss.

### Flow W9: Invalid Deep-Link Recovery

Persona: `malicious-deeplink-user`

1. Open URLs with invalid or conflicting params, for example:
   - `/?carrierId=not-a-real-carrier`
   - `/?evidenceId=not-a-real-evidence-id`
   - `/?region=invalid-region`
   - `/?evidenceId=not-real&evidenceDimension=confidence`
2. Verify the app does not crash.
3. Verify a controlled recovery banner appears when applicable, such as a message that the link or filter value was not recognized and was reset.
4. Verify the URL is sanitized or the dashboard returns to a usable baseline.
5. Verify no stack trace, database details, or secret names are shown.
6. Capture recovery evidence.

Pass criteria: invalid links recover safely and keep the read-only dashboard usable.

### Flow W10: Production Smoke

Persona: `executive-reviewer`

Run only when explicitly targeting `production`.

1. Open `https://carrier-performance-scorecard.vercel.app`.
2. Verify first visit content, demo disclosure, health spectrum, and at least one carrier detail path.
3. Generate one QBR brief if the production demo is responsive.
4. Do not run exhaustive negative testing against production unless explicitly requested.

Pass criteria: the deployed portfolio smoke path is available and clearly in demo posture.

## Report Notes

For each selected flow, report one concise row with persona, result, and evidence reference. Do not add rows for setup steps such as server start or browser launch.

## Known Failure Modes

1. **Port 3100 may have a stale listener.** If `http://127.0.0.1:3100/api/health` responds but `service` is not `carrier-performance-scorecard` or `demoMode` is not `true`, report BLOCKED and ask the caller to stop the stale process before retrying.
2. **Health endpoint is the readiness source.** Always verify `/api/health` has `service: carrier-performance-scorecard` and `demoMode: true` before browser flows.
3. **Comparison cards can be offscreen.** Scroll the comparison card into view before clicking it, especially on small viewport sizes.
4. **Evidence drawer owns focus while open.** Close it with `Close` or Escape before continuing to other dashboard controls.
5. **Browser sessions must be closed.** Close agent-browser sessions at the end of each QA run so later runs do not inherit stale tabs or state.
