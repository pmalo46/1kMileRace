/**
 * The words the app encourages runners with: a quote of the day, one before and after each
 * run, and one for every milestone.
 *
 * Attributed quotes are limited to proverbs and authors long in the public domain, quoted
 * from the source work, because inspirational quotes are misattributed more often than not.
 * Lines without an author are the app's own voice.
 */
export interface Quote {
  text: string;
  /** Who said it. Absent for lines written for the app. */
  author?: string;
}

/** Miles at which a runner reaches a milestone. Mirrors milestone_miles() in the database. */
export const MILESTONE_MILES = [
  1, 50, 100, 200, 250, 300, 400, 500, 600, 700, 750, 800, 900, 950, 975, 990, 995, 1000,
] as const;

const MILESTONE_QUOTES: Record<(typeof MILESTONE_MILES)[number], Quote> = {
  1: { text: "A journey of a thousand miles begins with a single step.", author: "Lao Tzu" },
  50: { text: "Well begun is half done.", author: "Aristotle" },
  100: { text: "No great thing is created suddenly.", author: "Epictetus" },
  200: { text: "To climb steep hills requires slow pace at first.", author: "William Shakespeare" },
  250: { text: "Slow and steady wins the race.", author: "Aesop" },
  300: { text: "Dripping water hollows out a stone.", author: "Ovid" },
  400: { text: "Great works are performed, not by strength, but perseverance.", author: "Samuel Johnson" },
  500: { text: "To travel hopefully is a better thing than to arrive.", author: "Robert Louis Stevenson" },
  600: { text: "They can because they think they can.", author: "Virgil" },
  700: { text: "Fall seven times, stand up eight.", author: "Japanese proverb" },
  750: {
    text: "It is not because things are difficult that we do not dare; it is because we do not dare that they are difficult.",
    author: "Seneca",
  },
  800: { text: "Great things are done when men and mountains meet.", author: "William Blake" },
  900: { text: "Does the road wind up-hill all the way? Yes, to the very end.", author: "Christina Rossetti" },
  950: { text: "If your Nerve, deny you — Go above your Nerve.", author: "Emily Dickinson" },
  975: { text: "Twenty-five miles to go. You have already covered that distance thirty-nine times." },
  990: { text: "Ten miles. One long run or a few short ones. Either way, it is yours." },
  995: { text: "5 miles to go. The finish line is in sight!" },
  1000: {
    text: "Great is the art of beginning, but greater the art is of ending.",
    author: "Henry Wadsworth Longfellow",
  },
};

/** Shown at any milestone the list above doesn't cover (a race with a different goal). */
const ANY_MILESTONE: Quote = { text: "Every mile behind you was once a mile ahead of you." };

export function milestoneQuote(miles: number): Quote {
  return (MILESTONE_QUOTES as Record<number, Quote>)[miles] ?? ANY_MILESTONE;
}

/** One a day, the same for everyone in the race. */
const DAILY: Quote[] = [
  { text: "A journey of a thousand miles begins with a single step.", author: "Lao Tzu" },
  { text: "Nobody crosses the finish line alone." },
  { text: "If you want to go fast, go alone. If you want to go far, go together.", author: "Proverb" },
  { text: "You don't have to go fast. You just have to go." },
  { text: "He who has begun has half done.", author: "Horace" },
  { text: "The mile you didn't feel like running counts exactly the same." },
  { text: "An early-morning walk is a blessing for the whole day.", author: "Henry David Thoreau" },
  { text: "Today's mile is the only one you have to think about." },
  { text: "In every walk with nature one receives far more than he seeks.", author: "John Muir" },
  { text: "A thousand miles is just one mile, a thousand times." },
  { text: "All truly great thoughts are conceived by walking.", author: "Friedrich Nietzsche" },
  { text: "Slow miles are still miles." },
  { text: "Great works are performed, not by strength, but perseverance.", author: "Samuel Johnson" },
  { text: "Somebody in this race is having a harder day than you. Go cheer them on." },
  { text: "The best time to plant a tree was twenty years ago. The second best time is now.", author: "Proverb" },
  { text: "You are further along than you were yesterday. That is the whole game." },
  { text: "No great thing is created suddenly.", author: "Epictetus" },
  { text: "Rest is part of the distance." },
  { text: "Fall seven times, stand up eight.", author: "Japanese proverb" },
  { text: "The finish line doesn't care how you got there. Walk, jog, shuffle. Just keep coming." },
  { text: "Afoot and light-hearted I take to the open road.", author: "Walt Whitman" },
  { text: "The tree that bends in the wind doesn't break in the storm.", author: "African proverb" },
  { text: "Hope is the thing with feathers that perches in the soul.", author: "Emily Dickinson" },
  { text: "Miles don't expire. Every one you've logged is still yours." },
  { text: "Henceforth I ask not good-fortune, I myself am good-fortune.", author: "Walt Whitman" },
  { text: "Little strokes fell great oaks.", author: "Benjamin Franklin" },
  { text: "Rise free from care before the dawn, and seek adventures.", author: "Henry David Thoreau" },
  { text: "Bad runs still count. That's the best thing about them." },
  { text: "Wisely and slow; they stumble that run fast.", author: "William Shakespeare" },
  { text: "Many hands make light work.", author: "Proverb" },
  { text: "While we are postponing, life speeds by.", author: "Seneca" },
  { text: "To strive, to seek, to find, and not to yield.", author: "Alfred, Lord Tennyson" },
  { text: "Lace up first. Decide afterwards." },
  { text: "Nothing great was ever achieved without enthusiasm.", author: "Ralph Waldo Emerson" },
  {
    text: "No one is useless in this world who lightens the burden of it for anyone else.",
    author: "Charles Dickens",
  },
  { text: "Fortune favors the bold.", author: "Virgil" },
  { text: "Some days you carry the race. Some days the race carries you." },
  { text: "I am not afraid of storms, for I am learning how to sail my ship.", author: "Louisa May Alcott" },
  { text: "And miles to go before I sleep.", author: "Robert Frost" },
  { text: "Make haste slowly.", author: "Latin proverb" },
  { text: "Well done is better than well said.", author: "Benjamin Franklin" },
  { text: "Come what come may, time and the hour runs through the roughest day.", author: "William Shakespeare" },
  { text: "The weather is rarely as bad as it looks from the window." },
  {
    text: "Never give up, for that is just the place and time that the tide will turn.",
    author: "Harriet Beecher Stowe",
  },
  { text: "The reward of a thing well done is to have done it.", author: "Ralph Waldo Emerson" },
  { text: "Shared joy is a double joy; shared sorrow is half a sorrow.", author: "Proverb" },
  { text: "Let us, then, be up and doing, with a heart for any fate.", author: "Henry Wadsworth Longfellow" },
  {
    text: "If you can fill the unforgiving minute with sixty seconds' worth of distance run…",
    author: "Rudyard Kipling",
  },
  { text: "It is always darkest just before the day dawneth.", author: "Thomas Fuller" },
  { text: "The best is yet to be.", author: "Robert Browning" },
];

/** Read on the way out of the door. */
const BEFORE_RUN: Quote[] = [
  { text: "Afoot and light-hearted I take to the open road.", author: "Walt Whitman" },
  { text: "The hardest step is the one out of the door. You're about to take it." },
  { text: "He who has begun has half done.", author: "Horace" },
  { text: "Start slow. The miles will come to you." },
  { text: "To climb steep hills requires slow pace at first.", author: "William Shakespeare" },
  { text: "You never regret the run you did." },
  { text: "They can because they think they can.", author: "Virgil" },
  { text: "One mile at a time. This is the next one." },
];

/** Read with the run just finished. */
const AFTER_RUN: Quote[] = [
  { text: "That one's in the bank. Nobody can take it back." },
  { text: "Dripping water hollows out a stone.", author: "Ovid" },
  { text: "You showed up. That is most of it." },
  { text: "Great works are performed, not by strength, but perseverance.", author: "Samuel Johnson" },
  { text: "Closer than you were this morning." },
  { text: "To travel hopefully is a better thing than to arrive.", author: "Robert Louis Stevenson" },
  { text: "Every one of these adds up. Today's just did." },
  { text: "Slow and steady wins the race.", author: "Aesop" },
];

const MS_PER_DAY = 86_400_000;
const pick = (list: Quote[], n: number): Quote => list[((Math.trunc(n) % list.length) + list.length) % list.length]!;

/** The quote for a calendar day in the runner's own time zone. */
export function quoteOfTheDay(now: Date = new Date()): Quote {
  const localMidnight = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return pick(DAILY, localMidnight / MS_PER_DAY);
}

/** A quote for the start or end of a run. `seed` picks one, e.g. the run's start time. */
export function runQuote(moment: "before" | "after", seed: number): Quote {
  return pick(moment === "before" ? BEFORE_RUN : AFTER_RUN, seed);
}

/** `"Text." — Author`, for places that take a single line of plain text. */
export function formatQuote(q: Quote): string {
  return q.author ? `“${q.text}” — ${q.author}` : q.text;
}
