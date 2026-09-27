// Adaptive quality. It judges frame intervals against this display's own pace (the fast end of
// recent intervals), so a 30 Hz power-saving mode is not mistaken for a struggling GPU, and quality
// climbs back once frames keep up again. Pure: feed it intervals and it says when quality changes.
export function createGovernor({ min = 0.5, max = 1, start = 1, onChange } = {}) {
  const intervals = [];
  let quality = start, checks = 0, slowRuns = 0, fastRuns = 0;
  function sample(ms) {
    intervals.push(ms);
    if (intervals.length > 240) intervals.shift();
    if (++checks % 60 || intervals.length < 120) return quality;
    const sorted = [...intervals].sort((a, b) => a - b);
    const pace = sorted[Math.floor(sorted.length * 0.1)];
    const median = sorted[Math.floor(sorted.length / 2)];
    slowRuns = median > pace * 1.4 ? slowRuns + 1 : 0;
    fastRuns = median <= pace * 1.1 ? fastRuns + 1 : 0;
    let next = quality;
    if (slowRuns >= 2 && quality > min) next = Math.max(min, quality - 0.15);
    else if (fastRuns >= 4 && quality < max) next = Math.min(max, quality + 0.1);
    if (next !== quality) {
      quality = next;
      slowRuns = fastRuns = 0;
      intervals.length = 0;
      onChange?.(quality);
    }
    return quality;
  }
  return { sample, get quality() { return quality; } };
}
