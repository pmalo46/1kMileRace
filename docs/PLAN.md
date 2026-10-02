# 1000-Mile Race: Product & Engineering Plan

## Context

You want an app for a year-long social challenge: each participant runs or walks 1,000 cumulative miles within a race's 365-day window. There are two winners:
1. **First to finish**: the first person whose counted miles reach 1,000.
2. **Fastest finisher**: the finisher with the **least total moving time** across their 1,000 counted miles.

The real point is community: helping as many people as possible cross the finish line. The app has to record runs or import them, keep honest live leaderboards, make cheering and sharing easy, let anyone create and invite people to a race, and feel like a celebration every time it opens.

**Decisions so far:** community-first v1 (up to a few hundred people, built so anyone can create races later), native iOS and Android, and a fixed start date per race (365-day window).

`/Users/patrickmaloney/Github/1kMileRace` is empty. Your **home directory is itself a git repo**, so this folder is currently tracked by it. Step one is a `git init` inside the project so it gets its own repo.

---

## Key research findings (these shape the stack)

| Source | Status (Oct 2026) | Implication |
|---|---|---|
| **Strava API** | Terms since Nov 2024: third-party apps may show a user's Strava data **only to that user** | Strava data **cannot feed a shared leaderboard**. Skip it for v1. |
| **Garmin Connect API** | New developer sign-ups **paused** (Sept 2026), and personal-use apps aren't accepted | We can't get a direct Garmin integration right now. |
| **Apple HealthKit / Android Health Connect** | Open and free. Garmin, Coros, Polar, Suunto, Wahoo, Apple Watch, Nike Run Club and Strava all write workouts to them. Health Connect exposes routes (`READ_EXERCISE_ROUTES`) and background reads. | **This is the main sync path.** One integration per OS covers almost every watch. |
| Polar AccessLink | Free, open to all developers | A possible direct integration later |
| Terra (aggregator) | From about $499/month | Too expensive for v1. Keep it as a fallback if direct paths fail. |

So the plan is: **record runs in the app, import from Apple Health / Health Connect, upload GPX/FIT/TCX files, and log treadmill runs manually with a photo**. Cloud APIs can be added later.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Mobile | **Expo (React Native) + TypeScript**, expo-router, EAS dev builds | One codebase for iOS and Android; native modules for GPS and health data |
| GPS recording | `expo-location` + `expo-task-manager` (background), local buffer in `expo-sqlite` | Background tracking that works offline and survives crashes |
| Health sync | `@kingstinct/react-native-healthkit` (iOS: workouts + `HKWorkoutRoute` + observer queries), `react-native-health-connect` (Android) | Covers watches and wearables |
| File import | FIT/GPX/TCX parsers in a shared package (`fit-file-parser`, `@tmcw/togeojson`) | Universal fallback, e.g. exports from Garmin Connect |
| Backend | **Supabase**: Postgres (+PostGIS), Auth, Realtime, Storage, Edge Functions | Relational data suits races and standings; Realtime powers live leaderboards; row-level security; cheap ($0–25/month) |
| Auth | Sign in with Apple, Google, email magic link | Easy signup; Apple sign-in is required on iOS if other social logins are offered |
| Visuals | `react-native-reanimated`, `@shopify/react-native-skia` (progress rings, route art), Lottie (confetti), `expo-haptics` | The celebration feel |
| Maps | `@rnmapbox/maps` or MapLibre with MapTiler tiles | Polished route maps; free tier is enough |
| Sharing | `react-native-view-shot` + `expo-sharing` (Instagram Story or square cards); web share pages with OG images | Easy posting to social media |
| Web | Small **Next.js** app: invite-link landing pages, deep-link fallback to app stores, opt-in public progress pages with OG images (`@vercel/og`) | Invite links must work for people who don't have the app yet |
| Push | Expo Notifications | Cheers, milestones, nudges |
| Ops | EAS Build/Submit/Update (OTA), Sentry, PostHog (optional) | |
| Repo | pnpm + Turborepo monorepo | Shares the rules engine and types between app, server and web |

```
1kMileRace/
  apps/mobile/        Expo app
  apps/web/           Next.js (invites, share pages)
  packages/core/      rules engine, pace/units math, zod schemas, file parsers (shared)
  supabase/           migrations/, functions/ (edge), seed.sql, tests/
```

---

## Data model (Postgres)

All distances are stored in **meters**, times in **seconds**, and timestamps as `timestamptz` (UTC). Each race stores a timezone that sets its window boundaries.

- **profiles**: id (= auth user), display_name, avatar_url, units (mi/km), bio, privacy settings
- **races**: id, slug, name, description, cover_image, `start_date`, `end_date` (start + 365 days), timezone, `goal_m` (1,609,344 m = 1,000 mi), `rules` jsonb (min distance, allowed types, treadmill policy, late-log window), visibility, `invite_code`, created_by
- **race_members**: race_id, user_id, role (`organizer | marshal | participant | supporter`), division (optional), joined_at, status
- **activities**: id, user_id, `source` (`app_gps | healthkit | health_connect | file | treadmill_manual | polar…`), `source_external_id`, type (`run | walk`), environment (`outdoor | treadmill`), started_at, ended_at, distance_m, moving_time_s, elapsed_time_s, elevation_gain_m, avg_hr, device_name, `route` (encoded polyline + PostGIS LineString), `splits` jsonb, `verification` (`gps | device | photo | pending | rejected`), `flags` jsonb. Unique on (user_id, source, source_external_id).
- **activity_evidence**: activity_id, kind (`treadmill_console | watch_screen`), storage_path, exif_taken_at
- **activity_reviews**: activity_id, reviewer_id, decision, note (marshal audit trail)
- **race_activities**: race_id, activity_id, `counted_distance_m`, `counted_moving_time_s`. One activity counts toward **every** race the user is in whose window contains it. The activity that crosses 1,000 miles counts only partially, with moving time prorated: `moving_time × remaining / distance`.
- **race_standings** (kept up to date, streamed via Realtime): race_id, user_id, total_distance_m, total_moving_time_s, activity_count, `finished_at`, `finish_moving_time_s`, finish_rank, time_rank, last_activity_at, streak_days, `required_daily_m` (pace needed to finish)
- **feed_items**: race_id, actor_id, type (`activity | milestone | finish | joined | cheer_wave`), payload, created_at
- **cheers** (reactions) and **comments** on feed items
- **milestones**: 1st mile, 100, 250, 500 (halfway), 750, 900, 1000, plus streaks. Created automatically and turned into feed items and share cards.
- **push_tokens** and **notifications**

**How standings get computed:** an activity enters through the `ingest-activity` edge function, which validates it with the rules engine, deduplicates it and inserts it. A trigger then calls `recompute_standing(race_id, user_id)`, and Realtime pushes the updated standings rows to everyone watching.

**Finish order** uses the `ended_at` of the crossing activity, i.e. when the miles were actually run, not when they were uploaded. Results stay **provisional** until the race's late-log window (e.g. 7 days) has passed. That handles watches that sync late.

---

## Rules engine & verification (`packages/core/rules`)

The same code runs on the client (instant feedback while logging) and on the server (the server's verdict is final).

- **At least 1.0 mile** per activity. A shorter activity is rejected, with a friendly message.
- **Only dedicated workouts count.** Imports accept only *workout sessions* (HKWorkout or ExerciseSession of type running or walking), never passive step counts. A trip around the grocery store never becomes a workout unless someone starts one.
- **Sanity checks** flag an activity for marshal review instead of rejecting it:
  - pace faster than about 4:00/mi (could be cycling or driving)
  - pace slower than about 30:00/mi (not a dedicated walk)
  - moving time below 70% of elapsed time (a long stop-and-go outing)
  - GPS speed spikes
- **Dedup:** activities from the same user whose times overlap by more than 50% are merged, keeping the best source (app GPS > device import with a route > file > device without a route).
- **Verification levels:** `gps` (in-app or has a route) · `device` (watch import) · `photo` (treadmill) · `pending`.
- **Treadmill runs:** the user enters distance and time, plus a **required photo of the treadmill console** showing distance and time. The photo's EXIF timestamp is checked against the activity time. A watch-screen photo or a matching HealthKit indoor workout raises confidence. Activities count immediately but show a "pending" badge; marshals approve or reject them in a review queue.
- **Disputes:** organizers and marshals can reject any activity, and every decision is logged.

---

## Community: the heart of the app

- **Collective hero stat** on the race home screen: finishers so far vs. participants, plus combined miles. The race's main goal is *everyone finishes*.
- **Pace-to-finish** for each person: miles per day still needed (the starting pace is 2.74 mi/day, or about 19.2 mi/week), shown kindly, never as shame.
- **"Needs a boost" feed module:** shows members who are falling behind pace or haven't logged in a while, with one-tap encouragement.
- **Cheers** (emoji bursts with haptics), comments, and @mentions.
- **Run crews or buddies:** pair up or form small crews with shared crew progress.
- **Finish Line Crew:** when someone is within 25 miles, the race is notified so people can join their final run. Mile 1,000 triggers a full-screen celebration, a finisher card and a feed takeover.
- **Milestone cards:** auto-generated, shareable images (Story or square format) with a progress ring, route art and stats.
- **Year-in-review** recap at the end of the race.

## Leaderboards (live via Supabase Realtime)

1. **Distance board:** finishers first, in finish order with medals, then everyone else by miles, with progress bars and a pace indicator (on pace or behind).
2. **Time board:** finishers ranked by `finish_moving_time_s`. Non-finishers appear below with their **projected** 1,000-mile time (average pace × 1,000), clearly labeled as provisional.
3. Optional filters: division (runners vs. walkers), crew, this week.

## Design direction

- A celebratory, warm and bold look: expressive display type, energetic gradients, generous motion.
- The 1,000 miles shown as a **journey along a trail**, with avatars moving along the path.
- **Every app open rewards you:** a greeting with your progress ring animating up, new cheers, and nearby milestones.
- **Logging a run** ends with a celebration screen (confetti, the miles added, the rank change).
- Build a design system (tokens, components) first, ideally prototyped as clickable mockups before coding the screens.

---

## Delivery phases

**Phase 0: Foundations**
- `git init` the project and set up the monorepo
- Supabase project and migrations for the schema above
- Design system and brand
- Expo app shell with auth

**Phase 1: Core loop (MVP)**
- Create a race, share an invite link (deep link plus web fallback), join
- In-app GPS recording: background, offline buffer, auto-pause, splits, elevation
- Manual treadmill logging with photo upload
- Rules engine and the `ingest-activity` function
- Standings and both live leaderboards
- Feed with cheers and comments; push notifications

**Phase 2: Sync & trust**
- Apple Health import (observer query for background delivery, plus sync on app open)
- Health Connect import
- GPX/FIT/TCX upload
- Dedup
- Marshal review queue
- Milestones and share cards

**Phase 3: Celebration & community polish**
- Finish-line experience and Finish Line Crew
- Crews and buddies; "Needs a boost"
- Trail journey visualization
- Public progress pages (web, opt-in)
- Year-in-review
- Polar AccessLink

**Later:** Garmin direct API (if the program reopens), Terra (if budget allows), Strava import shown only to the owner, Apple Watch / Wear OS companion recording.

---

## Outstanding questions

1. **Divisions:** should runners and walkers compete separately for the time prize? A walker will never win on moving time. Age groups?
2. **Activity types:** do hikes, trail runs, stroller runs and wheelchair/adaptive activities count?
3. **Treadmill strictness:** is a photo enough, or photo plus watch data? Who approves: organizers, appointed marshals, or peer vouches (e.g. 2 members)?
4. **Late logging window:** how many days after an activity can it still be logged (e.g. 7)? This decides when "first to finish" becomes official.
5. **Miles after 1,000:** do they keep counting as "bonus miles" toward the collective total?
6. **Overlapping races:** can one activity count toward several races? (Recommended: yes.)
7. **Pace thresholds:** confirm the 4:00/mi and 30:00/mi flag limits, and the moving-to-elapsed ratio.
8. **Privacy:** who sees routes? (Recommended: race members only, with start and end auto-trimmed about 200 m to hide home addresses.)
9. **Money:** any entry fees or prizes? (Payments are out of scope; prizes raise legal and tax questions.)
10. **Name and brand** for the app.
11. **Race creation:** can anyone create a race in v1, or only you?

---

## Verification (how each phase gets tested)

- **Rules engine and standings math:** Vitest unit tests in `packages/core`, covering:
  - the 1-mile minimum
  - pace flags
  - dedup overlaps
  - prorated crossing activity
  - finish ordering by `ended_at`
  - provisional window
- **Database:** pgTAP / SQL tests in `supabase/tests` for the standings triggers and row-level security (a user can't edit someone else's activity; a marshal can review only in their race).
- **GPS:** play GPX tracks in the iOS Simulator and Android emulator; field-test on real runs (background, screen locked, airplane mode).
- **Health sync:** device tests with a Garmin → Apple Health workout and a Health Connect workout, checking that dedup works against in-app recordings.
- **End-to-end:** Maestro flows for sign up → create race → invite → join → log treadmill run → see the leaderboard update live on a second device → cheer → push received.
- **Seed script:** a fake race with about 50 synthetic users across the year, to stress the leaderboard UI and Realtime.

## Rough running costs (community scale)

Supabase $0–25/month · Apple Developer $99/year · Google Play $25 once · EAS free tier · MapTiler/Mapbox free tier · Sentry free tier.

## Sources

- [DC Rainmaker: Strava API changes](https://dcrainmaker.com/2024/11/stravas-changes-to-kill-off-apps.html)
- [Wandrer: Strava data changes](https://news.wandrer.earth/2024/12/09/strava-wandrer-changes.html)
- [the5krunner: Garmin API paused](https://the5krunner.com/2026/09/14/garmin-developer-api-access-paused/)
- [Terra: Garmin program pause](https://tryterra.co/blog/garmin-connect-developer-program-pause)
- [Health Connect exercise routes](https://developer.android.com/health-and-fitness/health-connect/features/exercise-routes)
- [Polar Open AccessLink](https://www.polar.com/blog/introducing-polar-open-accesslink-api/)
- [Terra pricing](https://tryterra.co/community/pricing)
