const { test } = require('node:test');
const assert = require('node:assert/strict');
const { windowSteps, reverseSteps, robberSteps } = require('../hot100-demos.js');

function allInputs(length, alphabet) {
  if (!length) return [[]];
  return allInputs(length - 1, alphabet).flatMap(prefix => alphabet.map(value => [...prefix, value]));
}
function longestUnique(chars) {
  let best = 0;
  for (let start = 0; start < chars.length; start++) {
    for (let end = start + 1; end <= chars.length; end++) {
      const part = chars.slice(start, end);
      if (new Set(part).size === part.length) best = Math.max(best, part.length);
    }
  }
  return best;
}
function independentRobber(values) {
  let best = 0;
  for (let mask = 0; mask < 2 ** values.length; mask++) {
    if (mask & (mask << 1)) continue;
    const sum = values.reduce((total, value, index) => total + ((mask & (1 << index)) ? value : 0), 0);
    best = Math.max(best, sum);
  }
  return best;
}

test('window frames preserve forward-only bounds and match exhaustive substring enumeration', () => {
  for (let length = 0; length <= 5; length++) {
    for (const chars of allInputs(length, ['a', 'b', 'c'])) {
      const frames = windowSteps(chars.join(''));
      assert.equal(frames.at(-1).best, longestUnique(chars));
      frames.forEach((frame, index) => {
        if (index) assert.ok(frame.left >= frames[index - 1].left);
        if (frame.phase === 'record') {
          const active = chars.slice(frame.left, frame.right + 1);
          assert.equal(new Set(active).size, active.length);
          assert.equal(frame.best, longestUnique(chars.slice(0, frame.right + 1)));
        }
      });
    }
  }
  const difficult = windowSteps('abba');
  assert.deepEqual(difficult.filter(frame => frame.phase === 'shrink').map(frame => frame.left), [1, 2]);
  assert.equal(difficult.at(-1).left, 2);
});

test('reversal preserves every node and separates saving, rewiring and advancing', () => {
  for (const values of [[], [8], [1, 2, 3], [2, 2, 2, 2]]) {
    const frames = reverseSteps(values);
    assert.deepEqual(frames[0].links, values.map((_, i) => i + 1 < values.length ? i + 1 : null));
    const last = frames.at(-1), visited = [];
    for (let node = last.prev; node !== null; node = last.links[node]) {
      assert.ok(!visited.includes(node), 'no cycle in reversed list');
      visited.push(node);
    }
    assert.deepEqual(visited, values.map((_, i) => i).reverse());
    assert.equal(last.cur, null);
    frames.forEach((frame, i) => {
      if (frame.phase === 'save') {
        assert.equal(frame.next, frame.links[frame.cur]);
        const rewired = frames[i + 1], advanced = frames[i + 2];
        assert.equal(rewired.phase, 'rewire');
        assert.equal(rewired.links[frame.cur], frame.prev);
        assert.equal(rewired.cur, frame.cur);
        assert.equal(rewired.next, frame.next);
        assert.equal(advanced.cur, frame.next);
        assert.equal(advanced.prev, frame.cur);
        assert.notEqual(frame.links, rewired.links, 'earlier frames are separate snapshots');
      }
    });
  }
});

test('DP walkthrough agrees with enumeration of all non-adjacent house selections', () => {
  for (let length = 0; length <= 6; length++) {
    for (const values of allInputs(length, [0, 1, 2])) {
      const frames = robberSteps(values);
      assert.equal(frames.at(-1).dp.at(-1), independentRobber(values));
      for (const frame of frames.filter(frame => frame.phase === 'record')) {
        assert.equal(frame.dp.at(-1), independentRobber(values.slice(0, frame.index + 1)));
      }
    }
  }
  assert.equal(robberSteps([2, 7, 9, 3, 1]).at(-1).dp.at(-1), 12);
  assert.equal(robberSteps([2, 1, 1, 2]).at(-1).dp.at(-1), 4);
});
