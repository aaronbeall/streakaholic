import { getTrailingBlankCount } from '../../app/utils/calendarGrid';

describe('getTrailingBlankCount', () => {
  it('returns 0 when the leading blanks plus days already fill whole rows', () => {
    expect(getTrailingBlankCount(0, 28)).toBe(0); // exactly 4 full weeks
    expect(getTrailingBlankCount(7, 21)).toBe(0);
  });

  it('pads out an incomplete final row to a full row', () => {
    // 3 leading blanks + 30 days = 33 cells used -> next multiple of 7 is 35 -> 2 trailing blanks.
    expect(getTrailingBlankCount(3, 30)).toBe(2);
    // 6 leading blanks + 31 days = 37 -> next multiple of 7 is 42 -> 5 trailing blanks.
    expect(getTrailingBlankCount(6, 31)).toBe(5);
  });

  it('supports a custom row length', () => {
    expect(getTrailingBlankCount(2, 8, 5)).toBe(0); // 10 cells, already a multiple of 5
    expect(getTrailingBlankCount(2, 6, 5)).toBe(2); // 8 cells -> pad to 10
  });
});
