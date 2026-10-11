# Spar

Find the interview patterns you're weakest at, then spend whatever time you have on exactly those. Free, local-first, with its ML running in your browser.

> Status: early development (Phase 2, Pattern Rush MVP). See [BUILD_PLAN.md](BUILD_PLAN.md).

## What works today

- **Pattern drills:** read an original problem description, name the pattern (or the Big-O), get instant feedback with the signal phrases that give it away. Keys `1`–`4` answer, `Enter` moves on.
- **Skill graph:** 14 patterns in 4 layers, each with an Elo-based mastery estimate, a 95% band, and solved counts by difficulty.
- **Local-first:** answers are stored in IndexedDB on your device. No account, no server.

## How it works

Every answer updates a per-pattern ability `theta` and a per-item difficulty `b` on the logit scale, where `P(correct) = sigmoid(theta - b)`. That is the same scale the Rasch model uses, so the planned adaptive placement test can reuse it. Skill state is rebuilt by replaying the stored responses, so the response log is the single source of truth. The math lives in [apps/web/src/engine](apps/web/src/engine) and is unit-tested.

## Repo layout

```
apps/web/     Vite + React + TypeScript app
apps/api/     Cloudflare Worker + D1 (Phase 5)
content/      patterns.yaml and one YAML file per item, validated at build time
ml/           training, evaluation, model cards (Phase 4)
```

## Local setup

Requires Node 20.17+.

```sh
npm install
npm run dev        # http://localhost:5173
npm run ci         # lint, typecheck, test, build
```

Copy `.env.example` to `.env` if you need to override settings. Nothing is required yet.

## Adding content

Add a file to `content/items/` named after its id (e.g. `pat-017.yaml`). The schema is in [apps/web/src/content/schema.ts](apps/web/src/content/schema.ts); `npm test` and `npm run build` both reject invalid items. All problem text is original. Spar links to LeetCode by slug and never copies its problems.

## License

MIT
