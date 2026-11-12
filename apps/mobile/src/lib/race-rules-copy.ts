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
        [
          { text: 'Tap ' },
          { text: 'Start a run', strong: true },
          { text: ' and the app measures every mile for you.' },
        ],
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
      heading: 'Everyone who finishes wins.',
      body: [
        [
          {
            text: `Get to ${n(x.goalMiles)} miles and you've won. Your finish goes up for the whole group, and we'll all be there to cheer it.`,
          },
        ],
        [{ text: 'Two titles are up for grabs, too:' }],
        [
          { text: `First to ${n(x.goalMiles)}`, strong: true },
          { text: ` goes to the first person to finish all ${n(x.goalMiles)} miles.` },
        ],
        [
          { text: `Fastest ${n(x.goalMiles)}`, strong: true },
          { text: ` goes to the person who crosses ${n(x.goalMiles)} miles with the lowest total moving time.` },
        ],
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
  const goal = n(x.goalMiles);
  return [
    {
      heading: 'The goal',
      lines: [
        `Run or walk ${goal} miles ${by}. Every runner in the race chases their own ${goal}.`,
        `About ${x.perWeek} miles a week, or ${x.perDay} a day, keeps you on pace to finish on time.`,
        `Only miles from inside the race window count: from the start date until the race ends.`,
      ],
    },
    {
      heading: 'What counts',
      lines: [
        'Dedicated runs and walks only: you went out to run or walk, and that was the point.',
        "Steps from errands, work, chasing kids, or playing a game or sport don't count, even if your watch logged them.",
        `Each run or walk has to be at least ${aMile(x.minMiles)} to count toward the race. The one exception is your last run: whatever distance finishes your ${goal} counts.`,
        'A mile walked counts the same as a mile run.',
        rules.allowTreadmill ? 'Treadmill miles count.' : "Treadmill miles don't count in this race.",
      ],
    },
    {
      heading: 'Tracking your miles',
      lines: [
        'Best: tap Start a run and record it in the app. GPS measures the route, and the run counts right away.',
        'Watch runs and walks sync from Apple Health (iPhone) or Health Connect (Android): the app checks the last week each time you open it. Workouts typed into those apps by hand are skipped; add those here instead.',
        'Runs added by hand count too, but the organizer takes a second look.',
        rules.requireTreadmillPhoto
          ? 'Treadmill runs added by hand need a photo of the treadmill screen showing distance and time, taken around the time of the run. Only organizers see it. A treadmill run recorded by a watch needs no photo.'
          : '',
        'The same run recorded twice, say in the app and on your watch, counts once. The app keeps the best-measured copy.',
      ].filter(Boolean),
    },
    {
      heading: 'Logging',
      lines: [
        `Log each run within ${x.lateLogDays} days of finishing it. Anything older can't be added.`,
        'Didn\'t time a run? Turn on "I didn\'t time it" when you add it. The miles count in full.',
      ],
    },
    {
      heading: 'Running or walking',
      lines: [
        `Slower than ${formatPace(WALK_PACE_S_PER_MI)} a mile counts as walking, faster counts as running. Both count toward your ${goal}.`,
        'Runs recorded in the app measure running and walking as you go, so a run with walk breaks shows both.',
      ],
    },
    {
      heading: 'Winning',
      lines: [
        `Everyone who finishes ${goal} miles wins. Every finish goes up on the feed for the whole group to celebrate.`,
        'Two titles are up for grabs on top of that:',
        `First to ${goal}: the first person to finish all ${goal} miles. It goes by when the miles were run, not when they were uploaded, so syncing late never costs you.`,
        `Fastest ${goal}: the person who crosses ${goal} miles with the lowest total moving time. Moving time leaves out pauses and stops.`,
        `Your clock stops the moment you cross ${goal} miles, partway through a run if that's where it happens.`,
        `Untimed runs count toward Fastest ${goal} at ${formatPace(rules.slowestPaceSecPerMile)} a mile, the slowest pace the race allows, so leaving the time out never helps.`,
        `Miles past ${goal} are still saved, but the race is decided at ${goal}.`,
      ],
    },
    {
      heading: 'Reviews',
      lines: [
        `A run faster than ${formatPace(rules.fastestPaceSecPerMile)} or slower than ${formatPace(rules.slowestPaceSecPerMile)} a mile, one that was stopped for more than ${Math.round((1 - rules.minMovingRatio) * 100)}% of the time, or one added by hand gets a second look from the organizer.`,
        'It counts while it waits. If the organizer turns it down, its miles come off your total, along with any milestones it earned.',
        'Runs recorded with fake GPS are turned away.',
        'None of it is an accusation. It keeps the race honest for everybody.',
      ],
    },
    {
      heading: 'Streaks and milestones',
      lines: [
        "Day streak: days in a row with a run or walk. Week streak: weeks in a row where you hit that week's on-pace miles.",
        `Milestones run from mile 1 to mile ${goal}, and the whole group sees every one.`,
      ],
    },
    {
      heading: 'Cheering',
      lines: [
        "Cheer on the feed, comment, and check in on whoever's gone quiet. Getting everyone to the finish is the point.",
      ],
    },
  ];
}
