# Devcontainer

This devcontainer is optional. It gives reviewers a Node 22 environment with npm, ESLint, Prettier, and Playwright editor support.

The app does not start local Postgres or Docker Compose services. Local data access is Supabase backed through `DATABASE_URL`, and the public demo posture uses `NEXT_PUBLIC_DEMO_MODE=true` with `AI_PROVIDER=mock`.

After the container opens:

```bash
npm install
npm run dev
```

Use `.env.example` as the template for local variables. Do not commit `.env.local` or secret values.
