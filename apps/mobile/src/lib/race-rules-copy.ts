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

const mileOrMore = (minMiles: number) => (minMiles === 1 ? 'a mile or more' : `${minMiles} miles or more`);

export interface IntroSlide {
  art: ArtName;
  heading: string;
  /** Paragraphs. A paragraph is a list of runs; `strong` runs are bold. */
  body: { text: string; strong?: boolean }[][];
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
      art: 'intro-rules',
      heading: "Here's what counts.",
      body: [
        [{ text: `Run it or walk it, ${mileOrMore(x.minMiles)} at a time. Log it within a week.` }],
        [{ text: 'On a treadmill? Take a photo of the screen.' }],
        [{ text: 'Same rules for all of us.' }],
      ],
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
    {
      art: 'intro-crew',
      heading: "We don't do this alone.",
      body: [
        [{ text: "Some weeks you'll carry the group. Some weeks the group carries you." }],
        [{ text: "That's the whole idea." }],
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
        `${mileOrMore(x.minMiles).replace(/^a/, 'A')}, run or walk.`,
        `Log it within ${x.lateLogDays} days.`,
        rules.requireTreadmillPhoto ? 'Treadmill runs you log by hand need a photo of the screen.' : '',
      ].filter(Boolean),
    },
    {
      heading: 'Running or walking',
      lines: [`Slower than ${formatPace(WALK_PACE_S_PER_MI)} a mile counts as walking. Both count toward your ${n(x.goalMiles)}.`],
    },
    {
      heading: 'Reviews',
      lines: [
        `Faster than ${formatPace(rules.fastestPaceSecPerMile)} or slower than ${formatPace(rules.slowestPaceSecPerMile)} a mile gets a second look from the organizer.`,
        "It isn't an accusation. It keeps the race honest.",
      ],
    },
    {
      heading: 'Winning',
      lines: [
        `First to ${n(x.goalMiles)}, by when you ran it. Fastest ${n(x.goalMiles)}, by moving time.`,
        'Your clock stops the moment you cross the line.',
      ],
    },
    {
      heading: 'Streaks and milestones',
      lines: [
        'Days in a row with a run. Weeks on pace.',
        `Milestones from mile 1 to mile ${n(x.goalMiles)}, and the group sees every one.`,
      ],
    },
  ];
}
