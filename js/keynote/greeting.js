// The cold open greets the visitor by their own clock. The words live in the page (data-say-*), so
// every visible word stays in keynote.html where the content tests can see it.
export function greetingFor(hour) {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

export function applyGreeting(el, hour) {
  const g = greetingFor(hour);
  if (!el || g === 'morning') return;
  const text = el.dataset[`say${g[0].toUpperCase()}${g.slice(1)}`];
  if (text) el.textContent = text;
}
