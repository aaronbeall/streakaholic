import { MaterialCommunityIconName } from '../types';

// Word-stem -> icon suggestions, powering BOTH:
// - AddTaskScreen's auto-suggest-icon-from-habit-name convenience default (`suggestIconForName`)
// - IconPicker's own manual search box (`searchIcons`), per explicit user direction ("I want both
//   suggestion and search to use the same method -- prefer the stems, but also search against
//   icon name") -- stem matches are preferred/shown first, with a plain substring match against
//   every icon's own literal MDI name still available underneath as a fallback for anything the
//   curated stems don't cover.
//
// The installed icon library ships no search-term/tag/alias metadata of its own (confirmed
// directly against the bundled MaterialCommunityIcons.json -- it's a flat {name: codepoint} map,
// nothing else), so this stem table is the only source of synonym-aware matching either feature
// has; every icon name below was individually verified against that same glyph map before use
// (and `tsc` itself is the final backstop either way, since `MaterialCommunityIconName` is a
// strict union derived straight from those same keys -- a typo here is a compile error, not a
// silent bad suggestion).
//
// Each stem maps to one or more icons, ordered by relevance: the *first* is used as the single
// "best default" for auto-suggest; the *full* list is offered as search results, since a search
// box benefits from showing every reasonable option rather than committing to just one.
//
// Deliberately word-*start* matching (a word must literally *begin* with the stem), not a
// substring search anywhere in the word -- a substring check would wrongly fire on "read" inside
// "already" or "cat" inside "vacation". Checking whether a whole word starts with a stem still
// covers common inflections (run/runs/running, meditate/meditation/meditating) without those
// false positives, since a match has to begin at a real word boundary.
//
// Order matters beyond just "more distinctive stems first": a more *specific* stem that's also a
// prefix of a broader one needs to come first too (e.g. "workout" before "work", or "textbook"-
// triggering "text" would otherwise beat the more relevant "book"/"read") -- broad, common habit
// categories (fitness, wellness, learning) are grouped near the top of this table for exactly that
// reason, with narrower/rarer ones (social, productivity) further down.
const ICON_STEMS: [string, MaterialCommunityIconName[]][] = [
  // Fitness / movement
  ['workout', ['dumbbell', 'weight-lifter', 'arm-flex']],
  ['run', ['run-fast', 'run']],
  ['jog', ['run-fast', 'run']],
  ['sprint', ['run-fast']],
  ['walk', ['walk']],
  ['hik', ['hiking']],
  ['bike', ['bike']],
  ['bicycl', ['bike']],
  ['cycl', ['bike']],
  ['swim', ['swim']],
  ['yoga', ['yoga']],
  ['pilates', ['yoga']],
  ['stretch', ['human-handsup']],
  ['climb', ['human-handsup']],
  ['exercis', ['dumbbell', 'weight-lifter']],
  ['gym', ['dumbbell', 'weight-lifter']],
  ['lift', ['weight-lifter', 'dumbbell']],
  ['weight', ['dumbbell', 'weight-lifter']],
  ['cardio', ['run-fast', 'heart-pulse']],
  ['basketball', ['basketball']],
  ['soccer', ['soccer']],
  ['football', ['football', 'football-helmet']],
  ['rugby', ['rugby']],
  ['tennis', ['tennis', 'tennis-ball']],
  ['badminton', ['badminton']],
  ['volleyball', ['volleyball']],
  ['golf', ['golf']],
  ['baseball', ['baseball']],
  ['hockey', ['hockey-sticks', 'hockey-puck']],
  ['skateboard', ['skateboard']],
  ['surf', ['surfing']],
  ['ski', ['ski', 'ski-water']],
  ['box', ['boxing-glove']],
  ['karate', ['karate']],
  ['martial', ['karate']],
  // Mind / wellness
  ['meditat', ['meditation']],
  ['mindful', ['meditation']],
  ['pray', ['hands-pray']],
  ['gratitude', ['heart']],
  ['grateful', ['heart']],
  ['journal', ['notebook-edit', 'notebook']],
  ['relax', ['spa']],
  ['spa', ['spa']],
  ['mood', ['emoticon-happy-outline']],
  // Learning
  ['read', ['book-open-page-variant']],
  ['book', ['book-open-page-variant']],
  ['stud', ['school']],
  ['learn', ['school']],
  ['code', ['code-tags', 'code-braces']],
  ['program', ['code-tags']],
  ['writ', ['pencil']],
  ['translat', ['translate']],
  ['languag', ['translate']],
  ['podcast', ['podcast']],
  ['listen', ['headphones']],
  // Food / drink
  ['water', ['cup-water']],
  ['drink', ['cup-water']],
  ['hydrat', ['cup-water']],
  ['coffee', ['coffee', 'coffee-outline']],
  ['tea', ['tea', 'tea-outline']],
  ['breakfast', ['food-croissant']],
  ['meal', ['food']],
  ['eat', ['food-apple']],
  ['cook', ['chef-hat']],
  ['recipe', ['chef-hat']],
  ['alcohol', ['glass-cocktail']],
  ['wine', ['bottle-wine']],
  ['beer', ['beer']],
  // Sleep / hygiene
  ['sleep', ['sleep']],
  ['nap', ['sleep', 'bed']],
  ['wake', ['weather-sunny', 'alarm']],
  ['shower', ['shower-head', 'shower']],
  ['bath', ['bathtub-outline']],
  ['brush', ['toothbrush']],
  ['floss', ['toothbrush']],
  ['teeth', ['tooth-outline', 'toothbrush']],
  ['shave', ['razor-double-edge']],
  ['hair', ['hair-dryer']],
  // Chores
  ['clean', ['broom']],
  ['vacuum', ['vacuum']],
  ['dish', ['silverware-clean']],
  ['laundry', ['washing-machine']],
  ['iron', ['iron']],
  // Hobbies
  ['guitar', ['guitar-acoustic', 'guitar-electric']],
  ['piano', ['piano']],
  ['music', ['music-note']],
  ['sing', ['microphone-variant']],
  ['paint', ['palette']],
  ['draw', ['draw', 'pencil-ruler']],
  ['craft', ['scissors-cutting']],
  ['sew', ['needle']],
  ['photograph', ['camera']],
  ['garden', ['watering-can', 'sprout']],
  ['plant', ['sprout', 'flower']],
  ['chess', ['chess-king']],
  ['puzzle', ['puzzle']],
  ['game', ['controller-classic', 'gamepad-variant']],
  // Health
  ['medicine', ['pill', 'pill-multiple']],
  ['vitamin', ['pill']],
  ['pill', ['pill']],
  ['doctor', ['medical-bag', 'stethoscope']],
  ['dentist', ['tooth-outline']],
  // Habits / vices
  ['smok', ['smoking-off']],
  ['vape', ['smoking-off']],
  ['screen', ['cellphone-off']],
  // Pets / plants
  ['dog', ['dog']],
  ['cat', ['cat']],
  ['pet', ['paw']],
  ['fish', ['fish']],
  ['bird', ['bird']],
  // Money
  ['budget', ['cash']],
  ['sav', ['piggy-bank']],
  ['money', ['cash-multiple', 'cash']],
  ['invest', ['chart-line']],
  ['bank', ['bank']],
  // Social
  ['call', ['phone']],
  ['text', ['message-text']],
  ['email', ['email-outline', 'email']],
  ['friend', ['account-group']],
  ['famil', ['account-group']],
  ['date', ['account-heart-outline']],
  ['church', ['church-outline']],
  ['bible', ['book-cross']],
  // Productivity
  ['work', ['briefcase-outline']],
  ['task', ['checkbox-marked-circle-outline']],
  ['plan', ['calendar-check-outline']],
  ['schedul', ['calendar-clock']],
  ['focus', ['target']],
  ['inbox', ['inbox']],
];

// Splits a query into lowercased words, the same tokenization both matching modes below build on.
const tokenize = (query: string): string[] => query.toLowerCase().match(/[a-z0-9']+/g) ?? [];

// Every icon whose own stem-mapped list matches at least one word in `query`, in table priority
// order, deduplicated -- the "prefer the stems" half of the combined search.
const matchStems = (words: string[]): MaterialCommunityIconName[] => {
  const seen = new Set<MaterialCommunityIconName>();
  const result: MaterialCommunityIconName[] = [];
  for (const [stem, icons] of ICON_STEMS) {
    if (!words.some(word => word.startsWith(stem))) continue;
    for (const icon of icons) {
      if (seen.has(icon)) continue;
      seen.add(icon);
      result.push(icon);
    }
  }
  return result;
};

// Returns the single best icon for a habit name, or `null` if nothing matches -- a convenience
// default for a brand-new habit, not a guarantee. Pure and side-effect-free so it's unit-testable
// like the rest of this app's `utils/` modules.
export function suggestIconForName(name: string): MaterialCommunityIconName | null {
  const words = tokenize(name);
  if (words.length === 0) return null;
  return matchStems(words)[0] ?? null;
}

// Powers IconPicker's own manual search box: stem matches (the curated synonym table above) come
// first, followed by a plain substring match against every icon's own literal MDI name (requiring
// *every* word in the query to appear somewhere in the icon's name -- the same AND-across-terms
// rule this search already used before stems existed) for anything the stems don't cover, with
// anything already surfaced via a stem never repeated. `allIcons` is passed in by the caller
// (IconPicker's own `ALL_ICONS`) rather than imported directly here, keeping this module's only
// dependency the icon *type*, not the full icon *list* constant.
export function searchIcons(
  query: string,
  allIcons: readonly MaterialCommunityIconName[]
): MaterialCommunityIconName[] {
  const words = tokenize(query);
  if (words.length === 0) return [];

  const stemMatches = matchStems(words);
  const stemMatchSet = new Set(stemMatches);

  const nameMatches = allIcons.filter(icon => {
    if (stemMatchSet.has(icon)) return false;
    const iconName = icon.toLowerCase();
    return words.every(word => iconName.includes(word));
  });

  return [...stemMatches, ...nameMatches];
}
