import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greetingFor } from '../js/keynote/greeting.js';

test('the greeting follows the visitor’s clock', () => {
  const cases = [[0, 'evening'], [4, 'evening'], [5, 'morning'], [11, 'morning'], [12, 'afternoon'],
    [16, 'afternoon'], [17, 'evening'], [23, 'evening']];
  for (const [hour, want] of cases) assert.equal(greetingFor(hour), want, `hour ${hour}`);
});
