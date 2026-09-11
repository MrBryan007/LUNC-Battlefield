/** Data truth labels — never invent LIVE for missing feeds. */
export const Truth = Object.freeze({
  LIVE: 'LIVE',
  CALCULATED: 'CALCULATED',
  ESTIMATED: 'ESTIMATED',
  SIMULATED: 'SIMULATED',
  UNAVAILABLE: 'UNAVAILABLE',
  PARTIAL: 'PARTIAL'
});

export function isLiveish(t) {
  return t === Truth.LIVE || t === Truth.CALCULATED || t === Truth.PARTIAL;
}
