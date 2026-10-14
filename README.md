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

New to the project? [CONTRIBUTING.md](CONTRIBUTING.md) walks through setup, running the app on your phone, and how changes get in.


```bash
npm install
npm test          # core + database tests
npm run typecheck
```

### Backend (Supabase)

1. Create a project at supabase.com.
2. Apply the schema: `npx supabase link --project-ref <ref>` then `npx supabase db push`.
3. Push auth settings: `npx supabase config push`. Email confirmation is off, so the app's email and password sign-in never sends email.
4. Deploy the edge functions: `npx supabase functions deploy ingest-activity` and `npx supabase functions deploy notify`.
5. Copy `apps/mobile/.env.example` to `apps/mobile/.env` and fill in the URL and publishable key.

### Mobile app

```bash
cd apps/mobile
npx expo start
```

Expo Go works for most screens, and records runs only while the app is open with the screen on. For recording with the screen locked (and, later, Apple Health / Health Connect), use a development build:

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest init                # first time only: links the app to your Expo account
npx eas-cli@latest build --profile development --platform android
```

Install the APK it produces on your phone, then `npx expo start` and open the 1K Miles app (press `s` in the terminal to switch between the development build and Expo Go).

### Push notifications

Push needs a development or store build; Expo Go can't receive it. Android delivers through Firebase Cloud Messaging, so, once per project:

1. Create a Firebase project and add an Android app with the package `com.onekmiles.app`.
2. Download its `google-services.json` into `apps/mobile/` and point `expo.android.googleServicesFile` in `app.json` at it.
3. In Firebase, Project settings → Service accounts → Generate new private key. Upload that JSON to EAS (expo.dev → the project → Credentials → Android → FCM V1 service account key). Don't commit it.
4. Make a new build.

The app saves each device's Expo push token with `register_push_token`. The `notify` function announces cheers and comments, and `ingest-activity` announces milestones and finishes, both through the Expo Push Service.

## Status

Phase 0 (foundations) is in place:
- rules engine with tests
- schema with standings, milestones, feed, review and RLS, with tests
- app shell: email and password sign-in, home with progress ring and pace-to-finish, live leaderboards (distance and time), create race, join race

Phase 1 so far:
- record runs and walks with GPS (the main way to log): auto-pause, route sketch, background tracking in development builds, stored on the phone until uploaded; the server re-measures the route and rejects mock-location runs
- add a run by hand as a fallback (outdoors, or treadmill with a console photo); marked for review
- the `ingest-activity` edge function applies the shared rules engine and dedup before saving
- a live race feed of runs, milestones, finishes and new members, with emoji cheers and comments
- the finish line: the clock stops the moment a run reaches the goal (not when that run ends), the finishing run counts at any length, and the phone buzzes and celebrates mid-run, even with the screen locked
- push notifications for cheers, comments, milestones and finishes (development and store builds; see below)
- runs and walks from a watch or another fitness app, imported on Android through Health Connect; a run also recorded in the app counts once, and a watch's treadmill run counts without a console photo

Next up: Apple Health import (the iPhone side of watch runs), routes for imported runs, and shareable invite links.
