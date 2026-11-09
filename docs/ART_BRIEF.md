# 1K Miles art brief: the race packet

## The idea
Joining a race should feel like picking up your packet the night before a big run. You open the envelope and spread it out on the table: your bib, the safety pins, a card with the rules, the medal you're going to earn. Every illustration in the app is one of those objects.

The race is 1,000 miles, run or walked, over 365 days. Two people win: the first to 1,000, and the fastest 1,000 by moving time. Everyone who finishes is celebrated. It's a hard thing a group of friends does together, and the art should feel warm, a little scrappy and proud. Think of a local race, not a sneaker ad.

## Look
- **Composition:** flat, top-down, objects lying on a surface. Soft shadows. Nothing in perspective.
- **Rendering:** flat vector with a bit of print texture: Tyvek fibre on the bibs, slight grain, crisp edges. No gradients except the brand gradient below. No photorealism, no 3D.
- **Palette**
  - Brand gradient ("Sunrise"): `#FF4D6D` → `#FF8A3D` → `#FFC94A`. Use it for bib stripes, medal ribbons, printed ink and accents.
  - Ink: `#1C1433` (near-black purple) for numbers and line work.
  - Paper and bib white: `#FFFFFF` and `#FBEEE2`.
  - App backgrounds the art sits on: `#FFF8F1` (light) and `#120D1F` (dark). Every illustration must read on both, so give objects a solid fill and a soft shadow rather than relying on the background.
- **Type on the objects:** a condensed, heavy race font, like a real bib (for example Barlow Condensed ExtraBold or Oswald Bold, both open licence). Numbers are big and blocky.
- **People** (only where people appear): runners and walkers of every body type, age, skin tone and pace. Someone in a knee brace, someone pushing a stroller, someone grey-haired. Walkers are shown just as proudly as runners. No one looks like a stock-photo athlete.

## Assets

| Name in code | What it is | Size and format |
|---|---|---|
| `icon` | Bib #1000 with four safety pins on the Sunrise gradient | 1024×1024 master. iOS `.icon` (Icon Composer). Android adaptive: foreground, background and a monochrome version |
| `splash` | The bib on its own, no background | 600×600 transparent PNG |
| `intro-bib` | Bib #1000, pinned at all four corners, slightly crooked | 1170×1170 transparent PNG |
| `intro-rules` | A split card / pace card, handwritten notes on it: "1 mile minimum", "log within 7 days", "treadmill? photo" | 1170×1170 transparent PNG |
| `intro-medals` | Two finisher medals on Sunrise ribbons, one stamped FIRST, one stamped FASTEST | 1170×1170 transparent PNG |
| `intro-crew` | A polaroid of a finish line. A mixed group, arms up, a homemade banner reading 1,000 | 1170×1170 transparent PNG |
| `intro-pin` | The bib again, with a hand pressing a safety pin through the corner | 1170×1170 transparent PNG |
| `no-race` | A blank bib with no number yet, loose pins scattered beside it | 1170×1170 transparent PNG |
| `invite` | A race packet envelope with "Saved for you" written on the front | 1170×1170 transparent PNG |

Deliver PNGs at @3x. The app scales them down. Keep important detail away from the outer 8% of each square.

## Dropping art into the app
Put the files in `apps/mobile/assets/images/art/` and change the matching line in `apps/mobile/src/lib/art.ts` from `null` to `require('@/assets/images/art/<name>.png')`. Until then the app shows a placeholder bib in the same spot.

The icon and splash go in `apps/mobile/app.json` (`ios.icon`, `android.adaptiveIcon`, and the `expo-splash-screen` plugin).

## Image-generation prompts
If you'd rather generate these than commission them, start from these and keep the seed fixed across the set so they match. Generate on a plain background and remove it afterwards.

Shared style line, appended to every prompt:
> flat vector illustration, top-down view, objects lying flat, soft drop shadow, subtle print grain, limited palette of coral pink #FF4D6D, orange #FF8A3D, golden yellow #FFC94A, deep purple-black #1C1433 and warm white, condensed bold athletic lettering, warm and handmade, no photorealism, no 3D, plain background

- **icon:** a white running race bib with the number 1000 in large black condensed numerals, a coral-to-yellow gradient stripe across the top, four silver safety pins at the corners, centered, filling the frame, on a coral-to-yellow gradient square
- **splash:** the same race bib, number 1000, four safety pins, alone, centered
- **intro-bib:** a race bib numbered 1000, pinned at each corner with safety pins, lying slightly crooked, a few spare pins nearby
- **intro-rules:** a small paper pace card with handwritten notes reading "1 mile minimum", "log it within 7 days" and "treadmill? take a photo", a pencil lying beside it
- **intro-medals:** two round finisher medals on gradient ribbons lying side by side, one engraved FIRST, one engraved FASTEST
- **intro-crew:** a polaroid photo lying on a table, showing a diverse group of runners and walkers of different ages and body types at a finish line, arms raised, holding a homemade banner reading 1,000
- **intro-pin:** close-up of a hand pressing a safety pin through the corner of a race bib numbered 1000
- **no-race:** a blank white race bib with no number, four loose safety pins scattered beside it
- **invite:** a kraft paper race packet envelope with "Saved for you" handwritten on the front, a bib corner peeking out

## Later
- Your bib could carry your live mile count on Home, and a pin could drop off each time you hit a milestone.
