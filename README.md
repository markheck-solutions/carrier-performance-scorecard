# Carrier Performance Intelligence Scorecard

Executive style carrier performance intelligence, built as a portfolio app.

- Public demo (read only): https://carrier-performance-scorecard.vercel.app
- Local dev: http://127.0.0.1:3100

## What this is

Carrier Performance Intelligence Scorecard turns a fictional telecom delivery dataset into:

- A deterministic, explainable carrier health score and grade
- Evidence backed executive insights (not a ticket queue)
- A demo safe QBR brief generator (mock AI by default)

This project is intentionally built for hiring manager review and IT reviewer confidence:

- Clear module boundaries (data, scoring, filters, API, UI, QBR)
- Read only public posture
- No real carriers, customers, circuits, orders, routes, addresses, contacts, pricing, or contracts

## Tech stack

- Next.js (App Router) + TypeScript
- Supabase hosted Postgres (demo data)
- Drizzle ORM (server side queries and schema)
- Vitest (unit and integration tests)
- Playwright (browser tests)

## Quick start (local)

### 1) Install

```bash
npm install
```

### 2) Configure environment

Copy `.env.example` to `.env.local` and fill in the placeholders:

```bash
copy .env.example .env.local
```

Required for seeded Supabase data:

- `DATABASE_URL`
- `DEMO_SEED_ALLOWLIST=carrier-performance-scorecard-demo` (first seed run safety guard)

Public safe flag:

- `NEXT_PUBLIC_DEMO_MODE=true`

Default public AI posture:

- `AI_PROVIDER=mock`

Optional local OpenAI compatible provider (backend only, never required for the public demo):

- `OPENAI_COMPATIBLE_BASE_URL`
- `OPENAI_COMPATIBLE_API_KEY`
- `OPENAI_COMPATIBLE_MODEL`

### 3) Seed demo data

```bash
npm run db:seed
```

The seed output includes a dataset version and fingerprint. The app also exposes the same metadata at:

- `GET /api/demo-data`

### 4) Run the app

```bash
npm run dev
```

Open http://127.0.0.1:3100

## Scripts

```bash
npm run lint
npm run typecheck
npm run test -- --run
npm run build
npm run test:browser
npm run db:seed
```

## Public demo posture and safety notes

- The deployed demo runs in demo mode with fictional data.
- The QBR brief is clearly labeled as mock AI in demo mode.
- API routes are read only. Unsupported mutation methods return controlled JSON errors.

## Deployment notes (Vercel)

This repo is deployed to Vercel. In this environment, deployments were CLI driven:

```bash
npx vercel@latest
npx vercel@latest --prod
```

If you want automatic deploys on push, connect the GitHub repo in the Vercel dashboard (Project Settings -> Git) and enable the Git integration.

## README verification (reject template leftovers)

```bash
npm run readme:verify
```

This command fails if the README still contains default template quickstart instructions that do not apply to this npm-only repo.
