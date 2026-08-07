// How many trailing blank cells a month-grid needs to pad its last week out to a full row --
// otherwise an incomplete final week renders with fewer than `cellsPerRow` cells, and since each
// cell is flex:1, the row stretches those few cells across the whole width instead of leaving
// them in their correct weekday columns.
export const getTrailingBlankCount = (leadingBlanks: number, dayCount: number, cellsPerRow: number = 7): number => {
  const totalCells = Math.ceil((leadingBlanks + dayCount) / cellsPerRow) * cellsPerRow;
  return totalCells - leadingBlanks - dayCount;
};
