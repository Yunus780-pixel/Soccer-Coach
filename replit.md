# PANNA — Soccer Leg Trainer

AI soccer coach: pick a drill, the camera watches your body and the ball, counts your reps, and scores your form with honest, real measurements.

## Run & Operate

- `./start-app.sh` — local development: starts API (port 5000) + web app (port 3000) using the PGlite folder database; open http://localhost:3000
- `pnpm --filter @workspace/api-server run dev` — run the API server (needs `PORT`, `DATABASE_URL`)
- `pnpm --filter @workspace/soccer-trainer run dev` — run the web app (needs `PORT`, `BASE_PATH`; set `API_PROXY_TARGET=http://localhost:5000` locally)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run test` — run all tests (scoring brain + fuzzy search)
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/db run seed` — insert the starter drills (skips if drills already exist)
- Required env: `DATABASE_URL` — Postgres connection string, OR `pglite://<absolute-folder-path>` for the local embedded database

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM (PGlite embedded mode for local dev)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (ESM bundle)
- Pose AI in browser: TensorFlow.js MoveNet (body) + coco-ssd (ball)

## Where things live

- `artifacts/soccer-trainer` — React web app (pages: home, train, sessions, stats, leaderboard)
- `artifacts/soccer-trainer/src/components/pose-camera.tsx` — camera, pose + ball detection, skeleton drawing, rep counting
- `artifacts/api-server/src/routes/` — API routes; `feedback.ts` holds the form-scoring logic
- `lib/db/src/schema/` — source of truth for DB tables (drills, sessions)
- `lib/db/src/seed.ts` — starter drill data
- `lib/api-spec/openapi.yaml` — source of truth for API contracts (Orval generates client hooks + Zod from it)

## Architecture decisions

- **Honest scoring:** the client sends only metrics the camera really measured (averaged over the whole drill); unmeasured fields are `null`. The server scores only measured components and reports "not measured" for the rest — no invented numbers.
- **Both legs tracked:** knee/hip angles computed for left AND right leg (left-footed players matter).
- **PGlite dev mode:** `DATABASE_URL=pglite://<path>` runs an embedded Postgres in a folder — no DB server needed on a laptop. Real Postgres URLs work unchanged (used on Replit).
- **Rep counting:** ball velocity from coco-ssd; juggling drills count down-to-up direction changes, other drills count speed bursts.
- Platform-specific binary excludes in `pnpm-workspace.yaml` keep linux-only excludes but allow darwin (Mac) for local dev.

## Product

- Pick a drill (corver, dribbling, juggling, shooting, passing), camera tracks your skeleton live, reps count automatically with a beep, AI scores knee/hip/balance at the end, feedback is read aloud, personal bests per drill, plus leaderboard and stats pages.

## User preferences

- The developer is Yunus (9 years old) — keep explanations simple and fun, but build real engineering.

## Gotchas

- PGlite allows ONE process at a time on the data folder — stop the API server before running `push` or `seed`.
- Vite and the API server both REQUIRE `PORT` (and Vite `BASE_PATH`) or they refuse to start.
- The camera can't see foot/ankle detail (MoveNet has no toe keypoint) — `footContact` is honestly reported as "not tracked yet".

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
