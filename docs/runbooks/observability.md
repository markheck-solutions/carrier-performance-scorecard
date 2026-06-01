# Observability Runbook

This app is a public portfolio demo, so observability must be useful without pretending that a production telemetry stack exists.

## Signals in the repo

- Structured server logs are built through `src/lib/observability/logger.ts` and redact token, password, database URL, and API key shaped values.
- Trace helpers in `src/lib/observability/trace.ts` create request IDs and safe trace summaries that can be attached to responses, logs, or error insights.
- Metrics helpers in `src/lib/observability/metrics.ts` track in-process counters and histograms with redacted labels. They are safe aggregate values only.
- Error insight helpers in `src/lib/observability/error-insights.ts` classify errors, attach trace context, redact sensitive fields, and create stable fingerprints.
- Product analytics helpers in `src/lib/analytics/product-analytics.ts` build privacy-safe events with bucketed identifiers. No outbound analytics provider is configured.
- Resilience helpers in `src/lib/resilience/retry.ts` provide bounded retry, backoff, and circuit breaker primitives for optional dependency calls.

## Failure insight path

The `CI Failure Issue` workflow opens or updates one GitHub issue for each failing CI branch. The issue includes the workflow name, branch, commit, run URL, and current conclusion. This is the app's lightweight error-to-insight pipeline for repository health.

## Alerts

- GitHub Actions failures are visible in the Actions tab.
- CI failures create or update a deduplicated issue.
- CodeQL findings are reported as GitHub code scanning alerts.
- Dependabot pull requests are rate limited with cooldowns so newly released packages age before review.

## Deployment observability

The manual Vercel deploy workflow checks for `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` before doing any deploy work. Missing secrets cause a notice and a successful skip, not a failed CI run.

## Performance tracking

- `npm run build:performance` runs a timed production build and fails when it exceeds `BUILD_PERFORMANCE_BUDGET_MS`.
- `npm run test:performance` runs the unit test suite and fails when it exceeds `TEST_PERFORMANCE_BUDGET_MS`.
- `npm run bundle:check` checks direct runtime dependency count, heavy dependency additions, and `.next/static` JavaScript budgets when build artifacts exist.
- Playwright retries and report files are enabled in CI to make flaky browser tests easier to identify.

## Privacy rules

- Do not log `.env.local` values or secret values.
- Do not send raw user identifiers to product analytics. Use bucketed values only.
- Do not add external telemetry services unless the public demo has a clear owner, retention policy, and secret management path.
