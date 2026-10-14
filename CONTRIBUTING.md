# Working on 1K Miles

Welcome. This gets you from a fresh clone to the app running on your phone, and explains how changes get in.

## What you need

- **Node.js 22 or newer** (24 recommended) and npm, which comes with it.
- **Git**, and access to this repo. Ask Patrick to add you as a collaborator.
- **A phone to run the app on.**
  - **Android**: install the 1K Miles development build. Ask Patrick for the install link; it's the same app he tests with.
  - **iPhone**: there's no iPhone build yet. Install **Expo Go** from the App Store instead. Every screen works in it, but a few features switch themselves off: recording with the screen locked, push notifications, and importing runs from a watch.

## First-time setup

```bash
git clone https://github.com/pmalo46/1kMileRace.git
cd 1kMileRace
npm install
cp apps/mobile/.env.example apps/mobile/.env
```

Then fill in the two values in `apps/mobile/.env`. Ask Patrick for them. They point the app at the shared Supabase backend and are safe to share between us, but **never commit `.env`**; it's already ignored by git.

Check everything works:

```bash
npm test           # rules engine and database tests
npm run typecheck  # app and shared code
```

## Running the app

```bash
cd apps/mobile
npx expo start
```

A QR code appears in the terminal.

- **Android development build**: open 1K Miles and scan it.
- **iPhone with Expo Go**: press `s` in the terminal to switch to Expo Go, then scan the code with the iPhone camera.

Your phone and computer need to be on the same Wi-Fi. If that's a problem (a work network, or testing outdoors), start it with `npx expo start --tunnel` instead.

Edits to the code show up on the phone as soon as you save. Shake the phone for the developer menu if you need to reload.

You'll be using the real backend with real data. Create your own account in the app, and ask Patrick for the race invite code to join the test race.

## Where things are

| Path | What's there |
|---|---|
| `apps/mobile/src/app/` | Screens. Every file is a route; `(app)/` holds the tabs. |
| `apps/mobile/src/components/` | Shared pieces: buttons, cards, the mile wall, quotes. |
| `apps/mobile/src/theme/tokens.ts` | Colors, spacing, corner radii and type styles. Start here for visual changes. |
| `apps/mobile/src/lib/` | Data hooks and device features (recording, notifications, Health Connect). |
| `packages/core/src/` | Shared logic with tests: race rules, milestones, quotes, leaderboard math. |
| `supabase/` | Database schema and server functions. |
| `docs/PLAN.md` | The product plan and design direction. |

`apps/mobile/AGENTS.md` has notes on Expo conventions, useful whether you're working by hand or with an AI coding assistant.

## Making a change

1. Start from an up-to-date `main` and make a branch for your change:
   ```bash
   git switch main && git pull
   git switch -c short-description-of-change
   ```
2. Commit as you go, and push the branch.
3. Open a pull request into `main`. Screenshots or a short screen recording help a lot for UI changes.
4. Checks run automatically on every pull request: typecheck and tests. They need to pass before merging.
5. Patrick reviews and merges.

## Things to check with Patrick first

- **Anything in `supabase/`.** Database and server changes are deployed by hand to the live backend, so they need coordinating.
- **New packages with native code.** Use `npx expo install <package>`, never plain `npm install`, so versions match the Expo SDK. Anything with native code also needs a new development build before it runs on a phone, so mention it early.
- **Quotes and milestones** live in `packages/core/src/quotes.ts`, and milestone changes also need a database migration.

## Known issues

- `npx expo lint` doesn't run right now: the lint tooling hasn't caught up with the TypeScript versions in this repo. Typecheck and tests are the checks that count for now.
