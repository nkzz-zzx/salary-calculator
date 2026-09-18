'use strict';

// Each frame owns a snapshot so stepping backward restores the exact prior state.
function windowSteps(input) {
  const chars = [...input], frames = [], counts = new Map();
  let left = 0, right = -1, best = 0;
  const save = (phase, message) => frames.push({ left, right, best, phase, message });
  save('start', '窗口为空。从右端加入字符；出现重复时，逐个移除左端字符。');
  for (right = 0; right < chars.length; right++) {
    const char = chars[right];
    counts.set(char, (counts.get(char) || 0) + 1);
    save('add', `右端加入 ${char}。${counts.get(char) > 1 ? '窗口出现重复，先收缩，暂不更新答案。' : '窗口没有重复，接下来比较长度。'}`);
    while (counts.get(char) > 1) {
      const removed = chars[left++];
      counts.set(removed, counts.get(removed) - 1);
      save('shrink', `移除左端 ${removed}，L 前进到 ${left}。${counts.get(char) > 1 ? `${char} 仍重复，必须继续收缩。` : '重复已消除；L 始终向前，不能退回旧位置。'}`);
    }
    best = Math.max(best, right - left + 1);
    save('record', `合法窗口为“${chars.slice(left, right + 1).join('')}”，长度 ${right - left + 1}；更新已确认最长长度为 ${best}。`);
  }
  right = chars.length - 1;
  save('done', `所有字符处理完毕，最长无重复子串长度为 ${best}。每个字符至多进出窗口一次。`);
  return frames;
}

function reverseSteps(values) {
  const frames = [], links = values.map((_, i) => i + 1 < values.length ? i + 1 : null);
  let prev = null, cur = values.length ? 0 : null, next;
  const name = i => i === null ? '空' : `节点 ${i}（值 ${values[i]}）`;
  const save = (phase, message) => frames.push({ prev, cur, next, links: [...links], phase, message });
  save('start', 'prev 指向空，cur 指向原头节点。箭头表示真实的 next 连接，节点位置保持固定。');
  while (cur !== null) {
    next = links[cur];
    save('save', `① 保存后继：next = ${name(next)}。即使随后改掉 cur.next，仍能找回未处理部分。`);
    links[cur] = prev;
    save('rewire', `② 改箭头：让${name(cur)}的 next 指向${name(prev)}。此时 cur、prev 变量还没移动。`);
    prev = cur;
    cur = next;
    save('advance', `③ 移动指针：prev = ${name(prev)}，cur = ${name(cur)}。从新的 cur 继续处理。`);
  }
  save('done', `cur 已为空，反转完成。返回 prev：${name(prev)}。沿新头的箭头可读出完整反向链表。`);
  return frames;
}

function robberSteps(values) {
  const frames = [], dp = [0];
  frames.push({ index: -1, dp: [...dp], phase: 'start', message: 'dp[i] 表示前 i 间房的最佳收益。dp[0] = 0：没有房屋时，收益为 0。' });
  values.forEach((value, index) => {
    const skip = dp[index], base = Math.max(0, index - 1), take = dp[base] + value;
    const choice = { index, skip, take, base };
    frames.push({ ...choice, dp: [...dp], phase: 'compare', message: `处理第 ${index + 1} 间：不选它，保留 dp[${index}] = ${skip}；选它，就用 dp[${base}] + ${value} = ${take}，跳过相邻房屋。` });
    dp.push(Math.max(skip, take));
    frames.push({ ...choice, dp: [...dp], phase: 'record', message: `写入 dp[${index + 1}] = max(${skip}, ${take}) = ${dp[index + 1]}。${take > skip ? '选当前房屋的方案更优。' : take < skip ? '不选当前房屋的方案更优。' : '两种选择收益相同，任一种都达到最优。'}这个状态概括整个前缀的收益。` });
  });
  frames.push({ index: values.length - 1, dp: [...dp], phase: 'done', message: `处理完成，最大收益为 ${dp.at(-1)}。每次只依赖前两个状态，可以进一步压缩存储空间。` });
  return frames;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { windowSteps, reverseSteps, robberSteps };

if (typeof document !== 'undefined') {
  const demos = {
    window: { group: 'group-2', title: '滑动窗口', make: windowSteps, cases: [
      ['基础：abca', 'abca'], ['连续收缩：abba', 'abba'], ['全部重复：aaaa', 'aaaa'], ['空字符串', '']
    ] },
    reverse: { group: 'group-6', title: '反转链表', make: reverseSteps, cases: [
      ['基础：1 → 2 → 3', [1, 2, 3]], ['单节点：8', [8]], ['空链表', []]
    ] },
    robber: { group: 'group-14', title: '打家劫舍', make: robberSteps, cases: [
      ['基础：2, 7, 9, 3, 1', [2, 7, 9, 3, 1]], ['比较两端：2, 1, 1, 2', [2, 1, 1, 2]], ['边界：单间金额 0', [0]]
    ] }
  };
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function cell(value, index, active, note = '', repeat = false) {
    return `<div class="demo-cell${active ? ' current' : ''}${repeat ? ' repeated' : ''}"><small>${index}</small><strong>${escape(value)}</strong><span>${escape(note || '　')}</span></div>`;
  }
  function drawWindow(input, state) {
    const chars = [...input], inWindow = chars.slice(state.left, state.right + 1);
    const repeated = new Set(inWindow.filter((char, i) => inWindow.indexOf(char) !== i));
    return `<div class="demo-cells">${chars.length ? chars.map((char, i) => cell(char, i, i >= state.left && i <= state.right, [i === state.left ? 'L' : '', i === state.right ? 'R' : '', repeated.has(char) && i >= state.left && i <= state.right ? '重复' : ''].filter(Boolean).join(' · '), repeated.has(char) && i >= state.left && i <= state.right)).join('') : '<p>空字符串：没有字符需要加入窗口。</p>'}</div><p class="demo-metrics">窗口：${escape(inWindow.join('') || '空')} · L=${state.left} · R=${state.right < 0 ? '未开始' : state.right}<br>已确认最长长度：<strong>${state.best}</strong> · 当前窗口${repeated.size ? '有重复，等待收缩' : '无重复'}</p>`;
  }
  function drawReverse(values, state) {
    const x = index => index === null ? 52 : 200 + index * 150;
    const name = index => index === undefined ? '未保存' : index === null ? '空' : `节点${index}（${values[index]}）`;
    const width = Math.max(400, 300 + values.length * 150);
    const arrows = state.links.map((target, index) => {
      const from = x(index), to = x(target), direction = to > from ? 1 : -1;
      if (target === null && index > 0) return `<path d="M${from},104 C${from},185 ${to},185 ${to},109" fill="none" stroke="#2563eb" stroke-width="3" marker-end="url(#demo-reverse-arrow)"/>`;
      return `<path d="M${from + 37 * direction},72 L${to - 42 * direction},72" stroke="#2563eb" stroke-width="3" marker-end="url(#demo-reverse-arrow)"/>`;
    }).join('');
    const nodes = [null, ...values.map((_, index) => index)].map(index => `<rect x="${x(index) - 36}" y="42" width="72" height="60" rx="12" fill="${index === state.cur ? '#ffedd5' : '#eaf1fe'}" stroke="#bacce7"/><text x="${x(index)}" y="79" text-anchor="middle" font-size="21">${index === null ? '空' : values[index]}</text><text x="${x(index)}" y="27" text-anchor="middle" font-size="14">${index === null ? 'null' : `节点${index}`}</text>`).join('');
    return `<p class="demo-metrics">prev = ${name(state.prev)}<br>cur = ${name(state.cur)}<br>next（保存的后继）= ${name(state.next)}</p><div class="demo-chain" tabindex="0" role="region" aria-label="链表连接，可横向滚动"><svg viewBox="0 0 ${width} 200" role="img" aria-label="${escape(state.links.map((target, i) => `节点${i}指向${name(target)}`).join('；') || '空链表')}"><defs><marker id="demo-reverse-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10z" fill="#2563eb"/></marker></defs>${arrows}${nodes}</svg></div>`;
  }
  function drawRobber(values, state) {
    return `<div class="demo-cells">${values.map((value, index) => cell(value, `房${index + 1}`, index === state.index, state.dp[index + 1] === undefined ? '待计算' : `dp=${state.dp[index + 1]}`)).join('')}</div><p class="demo-metrics">${state.skip === undefined ? '依次比较每一间房的两种选择。' : `不选当前：dp[${state.index}] = <strong>${state.skip}</strong><br>选当前：dp[${state.base}] + ${values[state.index]} = <strong>${state.take}</strong>`}<br>已计算的前缀最佳收益：[${state.dp.join(', ')}]（包含 dp[0]=0）</p>`;
  }
  const draw = { window: drawWindow, reverse: drawReverse, robber: drawRobber };
  for (const [key, demo] of Object.entries(demos)) {
    const figure = document.querySelector(`#${demo.group} .figure`);
    if (!figure) continue;
    const panel = document.createElement('div');
    panel.className = 'demo';
    panel.id = `demo-${key}`;
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', `${demo.title}互动演示`);
    panel.innerHTML = `<label for="demo-case-${key}">选择演示案例</label><select id="demo-case-${key}">${demo.cases.map(([label], index) => `<option value="${index}">${escape(label)}</option>`).join('')}</select><div class="demo-stage"></div><div class="demo-explanation" aria-live="polite" aria-atomic="true"><strong class="demo-progress"></strong><p class="demo-message"></p></div><div class="demo-controls"><button type="button" data-action="prev">← 上一步</button><button type="button" data-action="next">下一步 →</button><button type="button" data-action="reset">重置</button></div><p class="demo-legend">逐步点击观察变化；可随时返回上一步。高亮表示正在处理的窗口或节点。</p>`;
    let input = demo.cases[0][1], frames = demo.make(input), cursor = 0;
    function render() {
      panel.querySelector('.demo-stage').innerHTML = draw[key](input, frames[cursor]);
      panel.querySelector('.demo-progress').textContent = `第 ${cursor + 1} / ${frames.length} 步${cursor === frames.length - 1 ? ' · 完成' : ''}`;
      panel.querySelector('.demo-message').textContent = frames[cursor].message;
      panel.querySelector('[data-action="prev"]').disabled = cursor === 0;
      panel.querySelector('[data-action="next"]').disabled = cursor === frames.length - 1;
    }
    panel.querySelector('select').addEventListener('change', event => {
      input = demo.cases[Number(event.target.value)][1];
      frames = demo.make(input); cursor = 0; render();
    });
    panel.querySelector('.demo-controls').addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      cursor = button.dataset.action === 'reset' ? 0 : Math.max(0, Math.min(frames.length - 1, cursor + (button.dataset.action === 'next' ? 1 : -1)));
      render();
    });
    render();
    figure.querySelector('.diagram-scroll').hidden = true;
    figure.insertBefore(panel, figure.querySelector('figcaption'));
  }
}
