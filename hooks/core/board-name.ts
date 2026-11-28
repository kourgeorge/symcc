// T-1218: a board's own friendly name, two words joined by a dash ("power-falcon"). It is picked once and never changes
// on its own; the board's task branches are symcc/<name>/T-n, so two boards sharing a repo never meet on a branch.

const ADJECTIVES = [
  'able', 'bold', 'brave', 'bright', 'brisk', 'calm', 'clever', 'cool', 'cosy', 'crisp',
  'curious', 'daring', 'eager', 'easy', 'fair', 'fancy', 'fast', 'fine', 'fleet', 'fresh',
  'gentle', 'glad', 'golden', 'grand', 'great', 'happy', 'hardy', 'honest', 'humble', 'jolly',
  'keen', 'kind', 'lively', 'lucky', 'merry', 'mighty', 'modest', 'neat', 'nimble', 'noble',
  'patient', 'plain', 'polite', 'power', 'proud', 'quick', 'quiet', 'ready', 'rapid', 'royal',
  'sharp', 'shiny', 'silent', 'silver', 'simple', 'sleek', 'smart', 'smooth', 'snappy', 'solid',
  'speedy', 'steady', 'stout', 'sunny', 'super', 'sure', 'swift', 'tidy', 'tough', 'true',
  'trusty', 'vivid', 'warm', 'wise', 'witty', 'zany', 'zesty', 'amber', 'azure', 'coral',
  'crimson', 'dusty', 'ember', 'frosty', 'hazel', 'ivory', 'jade', 'misty', 'mossy', 'rustic',
  'sandy', 'snowy', 'stormy', 'velvet', 'windy', 'woolly', 'young', 'lunar', 'solar', 'cosmic',
]

const NOUNS = [
  'falcon', 'river', 'otter', 'maple', 'comet', 'harbor', 'badger', 'beacon', 'breeze', 'canyon',
  'cedar', 'cloud', 'clover', 'cobra', 'condor', 'cricket', 'dolphin', 'dragon', 'eagle', 'ember',
  'fern', 'finch', 'fox', 'galaxy', 'garden', 'glacier', 'gecko', 'heron', 'hill', 'horizon',
  'island', 'jaguar', 'kestrel', 'koala', 'lagoon', 'lantern', 'lark', 'lemon', 'lion', 'lotus',
  'meadow', 'meteor', 'mountain', 'newt', 'oak', 'ocean', 'orchid', 'owl', 'panda', 'parrot',
  'pebble', 'pelican', 'pine', 'planet', 'pond', 'puffin', 'rabbit', 'raven', 'reef', 'robin',
  'rocket', 'sailor', 'salmon', 'sparrow', 'spruce', 'squirrel', 'star', 'stream', 'summit', 'swan',
  'tiger', 'timber', 'trail', 'tulip', 'turtle', 'valley', 'violet', 'walrus', 'whale', 'willow',
  'wolf', 'wren', 'yak', 'zebra', 'acorn', 'aurora', 'bison', 'bridge', 'cactus', 'dune',
  'forest', 'geyser', 'lynx', 'marlin', 'mango', 'orbit', 'prairie', 'quartz', 'sunrise', 'thunder',
]

/** A board name: two lowercase words joined by a dash. */
export const isBoardName = (v: unknown): v is string => typeof v === 'string' && /^[a-z]+-[a-z]+$/.test(v)

/**
 * A new board name that `taken` says nothing uses yet (it answers whether branches with that name's prefix exist in a
 * repo). Tries a number of random names; the last one is used when all were taken (there are 10,000 of them).
 * `random` gives a number in [0, 1) (Math.random by default).
 */
export async function pickBoardName(taken: (name: string) => Promise<boolean>, random: () => number = Math.random): Promise<string> {
  const at = (list: string[]) => list[Math.min(list.length - 1, Math.floor(random() * list.length))]!
  let name = ''
  for (let i = 0; i < 100; i++) {
    name = `${at(ADJECTIVES)}-${at(NOUNS)}`
    if (!(await taken(name).catch(() => false))) return name
  }
  return name
}
