---
name: qa-api
description: >
  Functional curl QA for the Carrier Performance Intelligence Scorecard API.
  Verifies health, demo data, scorecards, carrier detail, evidence, QBR brief,
  read-only method handling, and no secret leakage.
---

# QA API

Use this sub-skill only when the orchestrator identifies API, data, scoring, QBR, environment, or safety changes. This is manual/functional QA using HTTP calls. Do not run lint, typecheck, unit tests, browser test suites, builds, or static analysis.

## Testing Target

Default PR target: local dev server running branch code at `http://127.0.0.1:3100`.

No preview deployments were detected. For PR branch testing:

1. Start the app with `npm run dev`.
2. Poll `http://127.0.0.1:3100/api/health` until it returns JSON.
3. Verify `service` is `carrier-performance-scorecard`.
4. Verify `demoMode` is `true`.
5. Use `http://127.0.0.1:3100` as `BASE_URL`.

Production target: `https://carrier-performance-scorecard.vercel.app` only when the user or CI prompt explicitly asks for production smoke. Never use production as a fallback for PR branch testing.

Required env for local QA:

- `DATABASE_URL`
- `NEXT_PUBLIC_DEMO_MODE=true`
- `AI_PROVIDER=mock`
- `CI=true`

Do not read or print `.env.local`. Do not print `DATABASE_URL` or any secret values.

## Evidence Rules

- Use curl for requests.
- Capture status code, selected response fields, and sanitized JSON snippets.
- Save larger sanitized responses under `qa-results/` when useful.
- Never include tokens, connection strings, environment dumps, or secret values.

## Setup Helper

Use this base variable in shell examples:

```sh
BASE_URL="${BASE_URL:-http://127.0.0.1:3100}"
```

To extract a carrier id without adding dependencies, use Node 22:

```sh
curl -fsS "$BASE_URL/api/scorecards/options" > qa-results/options.json
node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync('qa-results/options.json','utf8')); console.log(j.carriers?.[0]?.id || '')"
```

## Menu Of Available Test Flows

Select only the flows relevant to the diff, plus adjacent checks needed to prove integration.

### Flow A1: Health Endpoint

Persona: `it-security-reviewer`

1. Request `GET /api/health`.
2. Verify HTTP 200.
3. Verify JSON includes:
   - `ok: true`
   - `service: carrier-performance-scorecard`
   - `demoMode: true`
   - `dependencies.databaseConfigured: true` for local CI
4. Verify no secret-like values appear.

Example:

```sh
curl -fsS "$BASE_URL/api/health" -o qa-results/health.json -w "%{http_code}\n"
```

Pass criteria: health confirms the expected service and demo mode.

### Flow A2: Demo Data Fingerprint

Persona: `it-security-reviewer`

1. Request `GET /api/demo-data`.
2. Verify HTTP 200.
3. Verify `ok: true` and `demoMode: true`.
4. Verify `dataset.id`, `seedVersion`, `fingerprint`, and counts are present.
5. Verify counts for carriers, periods, delivery records, and evidence items are positive.
6. Verify no real carrier, customer, address, contact, pricing, contract, secret, or connection-string data is returned.

Pass criteria: demo metadata is present and safe for public review.

### Flow A3: Scorecards Summary And Options

Persona: `qbr-analyst`

1. Request `GET /api/scorecards/options`.
2. Verify HTTP 200 and `ok: true`.
3. Verify carriers and periods are present.
4. Request `GET /api/scorecards/summary`.
5. Verify HTTP 200 and `ok: true`.
6. Verify summary contains carrier records, counts, and scope filters.
7. Request summary with one valid filter from options, such as region or period.
8. Verify the response remains controlled and scoped.
9. Request summary with an invalid filter value.
10. Verify controlled 400 behavior or safe validation response, not a crash.

Pass criteria: scorecard listing and filter options are coherent and validation is controlled.

### Flow A4: Carrier Detail

Persona: `qbr-analyst`

1. Use `/api/scorecards/options` to choose a valid carrier id.
2. Request `GET /api/carriers/{carrierId}/scorecard`.
3. Verify HTTP 200 and `ok: true`.
4. Verify carrier identity, scorecard, grade, components, drivers, and evidence IDs are present when records exist.
5. Request `GET /api/carriers/not-a-real-carrier/scorecard`.
6. Verify the response is controlled and does not expose internals.

Pass criteria: valid carrier detail works and invalid carrier detail fails safely.

### Flow A5: Evidence Valid And Invalid IDs

Persona: `qbr-analyst`

1. Use a valid evidence ID from a carrier detail response or summary component response.
2. Request `GET /api/evidence?evidenceIds={id}`.
3. Verify HTTP 200 and `ok: true`.
4. Verify evidence fields are fictional and scoped.
5. Request `GET /api/evidence?evidenceIds=not-a-real-evidence-id`.
6. Verify the response is controlled, empty or not-found as designed, and does not crash.
7. Request evidence by dimension, such as `GET /api/evidence?dimension=completionReliability&cap=5`, when relevant to scoring changes.

Pass criteria: evidence lookup supports valid IDs and handles invalid IDs safely.

### Flow A6: QBR Brief Mock Default And Provider Override Rejection

Persona: `qbr-analyst`

1. Use a valid carrier id from `/api/scorecards/options`.
2. POST to `/api/qbr/brief` with only allowed fields:

```sh
curl -fsS -X POST "$BASE_URL/api/qbr/brief" \
  -H "content-type: application/json" \
  --data "{\"carrierId\":\"$CARRIER_ID\",\"variant\":0}" \
  -o qa-results/qbr-brief.json -w "%{http_code}\n"
```

3. Verify HTTP 200.
4. Verify `ok: true`.
5. Verify `provider.id` is `mock`.
6. Verify brief sections and data notice are present.
7. POST a provider override attempt, for example:

```sh
curl -sS -X POST "$BASE_URL/api/qbr/brief" \
  -H "content-type: application/json" \
  --data "{\"carrierId\":\"$CARRIER_ID\",\"provider\":\"local\"}" \
  -o qa-results/qbr-provider-override.json -w "%{http_code}\n"
```

8. Verify HTTP 400 and controlled invalid request JSON.
9. POST malformed JSON and verify controlled 400 behavior.

Pass criteria: QBR uses mock provider by default and rejects unsupported provider override inputs.

### Flow A7: Unsupported Method Rejection

Persona: `it-security-reviewer`

1. Send unsupported mutation methods to read-only endpoints:
   - `POST /api/health`
   - `POST /api/scorecards/summary`
   - `DELETE /api/scorecards/options`
   - `GET /api/qbr/brief`
   - `PUT /api/evidence`
2. Verify each returns HTTP 405.
3. Verify response JSON is controlled, with `ok: false` and an error message.
4. Verify no mutation occurs.

Pass criteria: API routes keep a read-only public posture and reject unsupported methods consistently.

### Flow A8: No Secret Leaks

Persona: `it-security-reviewer`

1. Inspect sanitized responses from all selected API flows.
2. Search response files in `qa-results/` for forbidden patterns:
   - `DATABASE_URL`
   - `OPENAI_COMPATIBLE_API_KEY`
   - `postgres://`
   - `supabase.co`
   - `sk-`
   - `password`
   - `secret`
3. If a safe public field contains an expected provider name or demo description, document why it is not a secret.
4. Report FAIL only for actual secret values, internal connection strings, stack traces, or environment dumps.

Example:

```sh
grep -R -n -E "DATABASE_URL|OPENAI_COMPATIBLE_API_KEY|postgres://|sk-|password|secret" qa-results/*.json || true
```

Pass criteria: selected API responses do not expose secrets or unsafe internals.

### Flow A9: Production Smoke

Persona: `it-security-reviewer`

Run only when explicitly targeting `production`.

1. Set `BASE_URL=https://carrier-performance-scorecard.vercel.app`.
2. Run A1, A2, and one summary or carrier detail request.
3. Optionally run one QBR brief request if production responds quickly.
4. Do not run exhaustive negative or high-volume requests against production unless explicitly requested.

Pass criteria: public deployment is healthy, in demo mode, and responds with safe read-only data.

## Report Notes

For each selected flow, report one concise row with persona, result, and evidence reference. Do not add rows for setup steps such as server start.

## Known Failure Modes

1. **Port 3100 may have a stale listener.** If `/api/health` responds but `service` is not `carrier-performance-scorecard` or `demoMode` is not `true`, report BLOCKED and ask the caller to stop the stale process before retrying.
2. **Missing `DATABASE_URL` blocks local API reads.** If local API endpoints return database configuration or connection errors, report BLOCKED and note that CI requires the `DATABASE_URL` secret.
3. **QBR provider override is intentionally rejected.** The route accepts only documented request fields. A `provider` field should return controlled HTTP 400.
4. **Production smoke is read-only.** Do not seed data, reset data, or run high-volume negative tests against production.
5. **Secret scans can have false positives.** Treat words like `secret` in a controlled error message as informational unless an actual value or connection string is exposed.
