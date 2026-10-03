# 1K Miles

A year-long social race: run or walk 1,000 cumulative miles in 365 days, and help as many people as possible cross the finish line.

Two winners per race:
1. **First to 1,000**: decided by when the miles were run, not when they were uploaded.
2. **Fastest 1,000**: least total moving time across a finisher's first 1,000 counted miles.

See [docs/PLAN.md](docs/PLAN.md) for the full product and engineering plan.

## Repo layout

| Path | What |
|---|---|
| `apps/mobile` | Expo (React Native) app for iOS and Android |
| `packages/core` | Shared TypeScript: race rules engine, dedup, pace/projection math, leaderboard ordering |
| `supabase/migrations` | Postgres schema, row-level security, standings triggers |
| `supabase/tests` | Database tests that run the migrations in-process with PGlite (no Docker needed) |

Units: distances are stored in meters (what every device and API reports) and shown in miles.

## Getting started

```bash
npm install
npm test          # core + database tests
npm run typecheck
```

### Backend (Supabase)

1. Create a project at supabase.com.
2. Apply the schema: `npx supabase link --project-ref <ref>` then `npx supabase db push`.
3. Push auth settings: `npx supabase config push`. This allows the app's deep links (`onekmiles://`, and `exp://` for Expo Go) as sign-in redirects. The app signs in with an emailed link that opens the app.
4. Copy `apps/mobile/.env.example` to `apps/mobile/.env` and fill in the URL and publishable key.

### Mobile app

```bash
cd apps/mobile
npx expo start
```

Running on a simulator needs Xcode (iOS) or Android Studio. Once GPS recording and Apple Health / Health Connect land, the app needs a development build (`npx eas-cli build --profile development`) instead of Expo Go.

## Status

Phase 0 (foundations) is in place:
- rules engine with tests
- schema with standings, milestones, feed, review and RLS, with tests
- app shell: email sign-in link, home with progress ring and pace-to-finish, live leaderboards (distance and time), create race, join race

Next up (Phase 1): in-app GPS recording, the `ingest-activity` edge function, treadmill logging with photo, the social feed with cheers and comments, and push notifications.
