import {
  DEFAULT_GOAL_M,
  DEFAULT_RACE_RULES,
  RACE_LENGTH_DAYS,
  WALK_PACE_S_PER_MI,
  formatPace,
  metersToMiles,
} from '@1k/core';

import type { ArtName } from './art';

/**
 * The race explained, for the intro and the "How the race works" screen. Every number comes
 * from @1k/core, so the words can't drift from the rules the server actually enforces.
 *
 * Voice: a blunt coach who believes in the group. State the hard part, then turn it.
 */

const rules = DEFAULT_RACE_RULES;
const n = (x: number) => x.toLocaleString();

export function raceNumbers(goalM = DEFAULT_GOAL_M, days = RACE_LENGTH_DAYS) {
  const goalMiles = Math.round(metersToMiles(goalM));
  return {
    goalMiles,
    days,
    perDay: (goalMiles / days).toFixed(1),
    perWeek: Math.round((goalMiles / days) * 7),
    minMiles: metersToMiles(rules.minDistanceM),
    lateLogDays: rules.lateLogDays,
  };
}

const aMile = (minMiles: number) => (minMiles === 1 ? 'a mile' : `${minMiles} miles`);
const mileMinimum = (minMiles: number) => (minMiles === 1 ? 'One mile minimum.' : `${minMiles}-mile minimum.`);

export interface RuleLine {
  /** Bold lead-in, e.g. "One mile minimum." */
  strong?: string;
  text: string;
  /** Stated, but quieter than the rest. */
  muted?: boolean;
}

export interface IntroSlide {
  art: ArtName;
  heading: string;
  /** Paragraphs. A paragraph is a list of runs; `strong` runs are bold. */
  body: { text: string; strong?: boolean }[][];
  /** A short rulebook, shown as a list on the back of a bib. */
  rules?: RuleLine[];
}

/** The rules as the intro states them: the few that matter on day one. */
export function introRules(): RuleLine[] {
  const x = raceNumbers();
  return [
    { strong: 'Dedicated runs and walks only.', text: "Steps from errands, work or a game don't count." },
    {
      strong: mileMinimum(x.minMiles),
      text: `Each run or walk has to be at least ${aMile(x.minMiles)} to count toward the race.`,
    },
    ...(rules.requireTreadmillPhoto ? [{ strong: 'On a treadmill?', text: 'Take a photo of the screen.' }] : []),
    { text: `Log each run within ${x.lateLogDays === 7 ? 'a week' : `${x.lateLogDays} days`}.`, muted: true },
  ];
}

export function introSlides(): IntroSlide[] {
  const x = raceNumbers();
  return [
    {
      art: 'intro-bib',
      heading: `${n(x.goalMiles)} miles. ${x.days} days.`,
      body: [
        [{ text: `That's a lot. It's also ${x.perDay} miles a day.` }],
        [{ text: `You can do ${x.perDay} miles today. And tomorrow. And the day after that.` }],
      ],
    },
    {
      art: 'intro-crew',
      heading: 'Hard things are better together.',
      body: [
        [{ text: `${n(x.goalMiles)} miles is a lot, and every one of us will need a push at some point.` }],
        [
          {
            text: "Cheer each other on. Check in on whoever's gone quiet. Let's get as many of us across the finish line as we can.",
          },
        ],
      ],
    },
    {
      art: 'intro-anywhere',
      heading: 'Your miles, your way.',
      body: [
        [{ text: "There's no start gun. Go before work, after bedtime, around the block or on a trip." }],
        [{ text: 'Run them or walk them. A mile walked counts the same as a mile run.' }],
      ],
    },
    {
      art: 'intro-watch',
      heading: 'Track it as you go.',
      body: [
        [{ text: 'Tap ' }, { text: 'Start a run', strong: true }, { text: ' and the app measures every mile for you.' }],
        [{ text: 'Wearing a watch? Sync it from Apple Health or Health Connect. Forgot? Add it by hand.' }],
      ],
    },
    {
      art: 'intro-rules',
      heading: 'The rules.',
      body: [],
      rules: introRules(),
    },
    {
      art: 'intro-medals',
      heading: 'Two ways to win.',
      body: [
        [{ text: `First to ${n(x.goalMiles)}`, strong: true }, { text: ' goes by when you ran it, not when you synced it.' }],
        [{ text: `Fastest ${n(x.goalMiles)}`, strong: true }, { text: ' goes by time spent moving.' }],
        [{ text: "The finish line isn't for two people, though. It's for everyone who gets there." }],
      ],
    },
  ];
}

export interface RuleSection {
  heading: string;
  lines: string[];
}

/** The full rules. With a race, its own goal and end date; without one, the defaults. */
export function ruleSections(race?: { goal_m: number; starts_at: string; ends_at: string }): RuleSection[] {
  const days = race
    ? Math.round((new Date(race.ends_at).getTime() - new Date(race.starts_at).getTime()) / 86_400_000)
    : RACE_LENGTH_DAYS;
  const x = raceNumbers(race?.goal_m, days);
  const by = race
    ? `by ${new Date(race.ends_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`
    : `in ${x.days} days`;
  return [
    {
      heading: 'The goal',
      lines: [`${n(x.goalMiles)} miles ${by}. About ${x.perWeek} a week keeps you on pace.`],
    },
    {
      heading: 'What counts',
      lines: [
        "Dedicated runs and walks only. Steps from errands, work or a game don't count.",
        `Each run or walk has to be at least ${aMile(x.minMiles)} to count toward the race.`,
        'A mile walked counts the same as a mile run.',
      ],
    },
    {
      heading: 'Tracking your miles',
      lines: [
        'Best: record it in the app. GPS measures the route, and the run counts right away.',
        'Watch runs sync from Apple Health or Health Connect.',
        'Runs typed in by hand count too, but the organizer takes a second look.',
        rules.requireTreadmillPhoto ? 'Treadmill runs typed in by hand need a photo of the screen.' : '',
      ].filter(Boolean),
    },
    {
      heading: 'Running or walking',
      lines: [`Slower than ${formatPace(WALK_PACE_S_PER_MI)} a mile counts as walking. Both count toward your ${n(x.goalMiles)}.`],
    },
    {
      heading: 'Winning',
      lines: [
        `First to ${n(x.goalMiles)}, by when you ran it. Fastest ${n(x.goalMiles)}, by moving time.`,
        'Your clock stops the moment you cross the line.',
        `Didn't time a run? The miles still count. For Fastest ${n(x.goalMiles)}, it's timed at ${formatPace(rules.slowestPaceSecPerMile)} a mile, the slowest pace the race allows.`,
      ],
    },
    {
      heading: 'Reviews',
      lines: [
        `Faster than ${formatPace(rules.fastestPaceSecPerMile)} or slower than ${formatPace(rules.slowestPaceSecPerMile)} a mile gets a second look from the organizer.`,
        "It isn't an accusation. It keeps the race honest.",
      ],
    },
    {
      heading: 'Streaks and milestones',
      lines: [
        'Days in a row with a run. Weeks on pace.',
        `Milestones from mile 1 to mile ${n(x.goalMiles)}, and the group sees every one.`,
      ],
    },
    {
      heading: 'Logging',
      lines: [`Log each run within ${x.lateLogDays} days of finishing it.`],
    },
  ];
}
