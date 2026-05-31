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

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
