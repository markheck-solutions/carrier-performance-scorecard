# Operations Runbook

This runbook covers basic operation for the Carrier Performance Intelligence Scorecard portfolio app.

## Local startup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in local values. Do not commit `.env.local`.

3. Seed the fictional demo dataset when a database is configured:

   ```bash
   npm run db:seed
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

5. Open `http://127.0.0.1:3100`.

## Local services

This portfolio app does not require Docker Compose or a local Postgres container. Local database access is Supabase backed through `DATABASE_URL`, and the seeded dataset is fictional. Keep `NEXT_PUBLIC_DEMO_MODE=true` and `AI_PROVIDER=mock` for public demo review unless you are intentionally testing the backend only local provider.

An optional devcontainer is available under `.devcontainer/`. It installs Node tooling and forwards port `3100`, but it does not provision local services or copy secrets.

## Local verification

Run these checks before opening or merging a change:

```bash
npm run lint
npm run typecheck
npm run test -- --run
npm run test:coverage
npm run build
npm run readme:verify
npm run safety
npm run quality:check
```

Use `npm run format` to apply Prettier formatting.

## Vercel deployment

- The public demo is intended to run in demo mode with fictional data.
- Configure runtime environment values in Vercel project settings, not in source files.
- Keep `NEXT_PUBLIC_DEMO_MODE=true` for the public demo.
- Keep `AI_PROVIDER=mock` unless a backend only provider is intentionally configured.
- Use Vercel preview deployments for pull request review when the GitHub integration is enabled.
- For manual deployment, use the Vercel CLI from a clean working tree:

  ```bash
  npx vercel@latest
  npx vercel@latest --prod
  ```

## GitHub Actions

The repository has multiple workflow surfaces:

- `CI` runs npm install, lint, typecheck, tests, coverage, build, README verification, and audit checks.
- `CodeQL` runs automated JavaScript and TypeScript security analysis.
- `Release Notes` generates GitHub release notes with the repository token.
- `Release` validates the repo and can create or update a GitHub release after a dry run.
- `CI Failure Issue` opens or updates one issue per failing CI branch so failures have an owner visible from GitHub.
- `Deploy Vercel` is manual and skips safely unless the Vercel GitHub secrets already exist.
- `QA` runs the Factory QA skill for pull requests when the required Factory secret is configured.
- `Droid Wiki Refresh` refreshes generated wiki content on pushes to `master`.

If CI fails, open the failed job and start with the first failing command. Reproduce the same command locally before changing code.

## Common failures

### Dependency install fails

- Confirm the branch has a committed `package-lock.json`.
- Run `npm install` locally and commit any intended lockfile updates.
- Avoid mixing package managers. This repo uses npm only.

### Typecheck fails

- Run `npm run typecheck` locally.
- Check for changed API route types, Next.js generated types, and path alias imports.
- If Next.js APIs are involved, read the local docs under `node_modules/next/dist/docs/` before changing code.

### Tests fail

- Run `npm run test -- --run` for unit and integration coverage.
- Keep test data fictional and deterministic.
- For browser coverage, run `npm run test:browser` after installing Playwright browsers.

### Build fails

- Verify required environment variables are set in the local shell or Vercel project settings.
- Keep database access in server only modules and avoid build time secret printing.
- Review recent changes to `src/app`, API routes, and server utilities.

### Safety or secret checks fail

- Remove committed env files or secret looking literals.
- Use placeholders in `.env.example` only.
- Rotate any real secret that was committed or printed in logs.

## Secret handling

- Never commit `.env.local` or real service credentials.
- Never paste secret values into issues, pull requests, logs, screenshots, or generated docs.
- Use Vercel environment variables and GitHub Actions secrets for runtime configuration.
- Prefer mock AI mode for the public demo.
- Redact tokens, database URLs, API keys, and authorization headers before logging or sharing output.
