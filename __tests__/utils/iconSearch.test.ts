import { searchIcons, suggestIconForName } from '../../app/utils/iconSearch';

describe('suggestIconForName', () => {
  it('matches a plain keyword', () => {
    expect(suggestIconForName('Run')).toBe('run-fast');
  });

  it('matches an inflected word via a word-start stem', () => {
    expect(suggestIconForName('Running')).toBe('run-fast');
    expect(suggestIconForName('Meditation')).toBe('meditation');
  });

  it('matches a synonym stem for the same underlying concept', () => {
    expect(suggestIconForName('Jog')).toBe('run-fast');
    expect(suggestIconForName('Gym')).toBe('dumbbell');
  });

  it('matches a keyword anywhere among multiple words', () => {
    expect(suggestIconForName('Morning Yoga Session')).toBe('yoga');
  });

  it('is case-insensitive', () => {
    expect(suggestIconForName('READ a book')).toBe('book-open-page-variant');
  });

  it('does not false-positive on a word merely containing the stem mid-word', () => {
    // "already"/"spread" both contain "read" as a substring, but neither word *starts* with it.
    expect(suggestIconForName('Already spread the word')).toBeNull();
    // "vacation" contains "cat" as a substring, but doesn't start with it.
    expect(suggestIconForName('Vacation')).toBeNull();
  });

  it('prefers "workout" over the shorter, more generic "work" stem it would otherwise be masked by', () => {
    expect(suggestIconForName('Workout')).toBe('dumbbell');
    expect(suggestIconForName('Work')).toBe('briefcase-outline');
  });

  it('returns null for an empty or whitespace-only name', () => {
    expect(suggestIconForName('')).toBeNull();
    expect(suggestIconForName('   ')).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(suggestIconForName('Xyzzy Plugh')).toBeNull();
  });

  it('prefers the earlier-listed stem when multiple words could match different stems', () => {
    // "run" is listed well before "gym" in the priority table.
    expect(suggestIconForName('Gym then run')).toBe('run-fast');
  });
});

describe('searchIcons', () => {
  it('returns an empty array for an empty or whitespace-only query', () => {
    expect(searchIcons('', ['run-fast', 'walk'])).toEqual([]);
    expect(searchIcons('   ', ['run-fast', 'walk'])).toEqual([]);
  });

  it('returns every icon a matching stem maps to, in table order, ahead of name matches', () => {
    const results = searchIcons('run', ['run-fast', 'run', 'walk']);
    expect(results).toEqual(['run-fast', 'run']);
  });

  it('falls back to a plain substring match against the icon name when no stem matches', () => {
    const results = searchIcons('fast', ['run-fast', 'walk', 'football']);
    expect(results).toEqual(['run-fast']);
  });

  it('requires every word to match for the name-substring fallback (AND, not OR)', () => {
    const results = searchIcons('book open', ['book-open-page-variant', 'book-open-variant', 'book-cross']);
    expect(results).toContain('book-open-page-variant');
    expect(results).toContain('book-open-variant');
    expect(results).not.toContain('book-cross');
  });

  it('never duplicates an icon that matches both a stem and the name search', () => {
    // The "run" stem maps to 'run-fast' AND 'run-fast' also literally contains "run" -- should
    // appear exactly once, from the stem match, not a second time from the name-substring pass.
    // 'exit-run' contains "run" too but doesn't *start* with it, so it only ever reaches the list
    // via the name-substring fallback, confirming that path still runs alongside the stem match.
    const results = searchIcons('run', ['run-fast', 'run', 'exit-run']);
    expect(results.filter(icon => icon === 'run-fast')).toHaveLength(1);
    expect(results).toContain('exit-run');
  });

  it('combines stem matches from multiple distinct words in one query', () => {
    const results = searchIcons('yoga dog', ['yoga', 'dog', 'cat']);
    expect(results).toEqual(expect.arrayContaining(['yoga', 'dog']));
    expect(results).not.toContain('cat');
  });

  it('is case-insensitive', () => {
    expect(searchIcons('YOGA', ['yoga', 'walk'])).toEqual(['yoga']);
  });
});
