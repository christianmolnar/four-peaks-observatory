# Four Peaks Observatory

Public website for Christian's observatory in the Phoenix area:
astrophotography galleries, terrestrial and smart-telescope pages, equipment,
long-form articles with audio narration (ElevenLabs), conference talks, and
observing-conditions tooling (Clear Sky Chart parsing, observation
evaluation, daily email/SMS condition reports on Vercel cron).
Next.js 15 App Router, React 19, TypeScript, Tailwind. Deployed on Vercel;
production is the public site.

Global laws and working conventions also apply: `~/Token/laws.md`,
`~/Token/global/claude-CLAUDE.md`.

## House rules (Christian's, long-standing)

- **Don't start or restart the dev server unless asked.** He manages ports.
  When asked, just do it. When work is done without a request, end with:
  "Changes complete. Restart your server to see the updates."
- **Simplify, don't stack.** Remove unnecessary steps and conversions rather
  than adding layers. Question every data transformation (the classic bug
  here was `seeing` vs `seeingRating`).
- **No new files at the repo root** (the root already has too many legacy
  scripts). Docs → `docs/`, tests → `__tests__/`, scripts → `scripts/`,
  assets → `public/`.

## Layout

- `src/app/`: pages (`astrophotography`, `terrestrial`, `smart-telescopes`,
  `resources`, `conference`, `equipment`, `admin`) and `api/` routes
  (`send-daily-report`, `send-sms-report`, `observation-evaluate`,
  `chart-proxy`, `conference-*`, `admin`).
- `src/components`, `src/lib`, `src/data`, `src/config`, `src/types`.
- `vercel.json`: two daily cron hits on `/api/send-daily-report`; `/admin`
  and `/api/admin` redirect to 404 in production.
- `astro-mvo/`: separate Astro sub-project with its own npm scripts.

## Commands

- `npm run dev` (Turbopack; only when asked), `npm run lint`,
  `npm run verify` (lint + production build via `scripts/production-build.sh`).
- Tests: Jest (`jest.config.js`), `npx jest`. Suites live in `__tests__/`
  (a partial duplicate `tests/` folder also exists).
- Husky runs lint on commit.

## Legacy

`docs/context/` and `scripts/agent-context.sh` were a Copilot-era session
context system (last touched 2026-07-19). Don't load or maintain them; Claude
Code memory replaces them. `GEMINI.md` predates this file.
