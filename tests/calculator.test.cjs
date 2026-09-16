const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'salary-calculator.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const initialization = script.indexOf('  // ---------- 初始化 ----------');
assert.ok(initialization >= 0, 'The calculator initialization boundary must exist.');

// Execute the actual calculator functions without starting a browser or running
// page initialization. DOM stubs only capture rendered text and table markup.
function runtime({ render = false } = {}) {
  const elements = new Map();
  const storage = new Map();
  const choices = { calculationMode: 'annual', bonusType: 'amount', bonusMode: 'separate', bonusProrationBasis: 'previous_year' };
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '', value: '', checked: false, hidden: false });
    return elements.get(id);
  };
  const document = {
    getElementById: element,
    querySelector(selector) {
      const selected = /^input\[name="([^"]+)"\]:checked$/.exec(selector);
      if (selected) return { value: choices[selected[1]] };
      const option = /^input\[name="([^"]+)"\]\[value="([^"]+)"\]$/.exec(selector);
      if (option) return { set checked(value) { if (value) choices[option[1]] = option[2]; } };
      return element(selector);
    },
    querySelectorAll() { return []; },
  };
  const context = vm.createContext({ document, localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  } });
  const renderSetup = render ? `
    syncBonusAndPensionUI = () => {};
    validateInputs = () => [];
    readInputs = () => globalThis.testInputs;
    syncSettingsMenuSummaries = () => {};
    saveState = () => {};
  ` : '';
  vm.runInContext(script.slice(0, initialization) + renderSetup + `
    globalThis.api = { compute, buildRange, stockVestingEvents, latestPayoutEvent,
      readInputs, saveState, restoreState, renderMonthly, render, calculationYear: CALCULATION_YEAR };
  })();`, context);
  return { ...context.api, context, element, choices, storage };
}

function near(actual, expected, label) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-6,
    `${label}: got ${actual}, expected ${expected}`);
}

function fixture(api, overrides = {}) {
  const inputs = {
    calculationMode: 'annual', calculationYear: 2026,
    joinDate: '2026-01-01', endDate: '2026-12-31',
    base: 20000, contributionBase: 10000, housingPct: 0.12, specialDeduction: 0,
    subsidy: 1000, stock: 400000, stockType: 'listed_stock', stockRealization: 'noncash',
    stockVestingYears: 4, stockVestingRatios: [25, 25, 25, 25],
    bonusMonth: 12, personalPension: 12000, housingWithdraw: 1000,
    fixedConsumption: 3000, extras: [{ month: 12, amount: 6000 }],
    ...overrides,
  };
  inputs.range = api.buildRange(inputs.joinDate, inputs.endDate);
  inputs.bonusEvent = api.latestPayoutEvent(inputs.range, inputs.bonusMonth);
  inputs.bonus = inputs.bonusEvent ? 60000 : 0;
  return inputs;
}

test('embedded JavaScript parses, and static DOM ids are unique and resolvable', () => {
  new vm.Script(script);
  const staticHtml = html.slice(0, html.indexOf('<script>'));
  const ids = [...staticHtml.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, id] of script.matchAll(/\$\("([^"]+)"\)/g)) assert.ok(ids.includes(id), `Missing DOM id: ${id}`);
});

test('salary, annual bonus and monthly consumption default to zero', () => {
  for (const id of ['base', 'bonus', 'fixedConsumption']) {
    const input = html.match(new RegExp('<input\\b[^>]*\\bid="' + id + '"[^>]*>'));
    assert.ok(input, `Missing default field: ${id}`);
    assert.match(input[0], /\bvalue="0"/);
  }
});

test('240 mode, range, equity, realization, pension and bonus combinations reconcile', () => {
  const api = runtime();
  const ranges = [
    ['annual', '2026-01-01', '2026-12-31'],
    ['interval', '2026-01-01', '2026-12-31'],
    ['interval', '2025-10-16', '2027-03-15'],
    ['interval', '2024-01-01', '2027-03-15'],
    ['interval', '2026-12-31', '2026-01-01'],
  ];
  let count = 0;
  for (const [calculationMode, joinDate, endDate] of ranges)
  for (const stockType of ['ordinary', 'listed_stock', 'listed_option', 'deferred'])
  for (const stockRealization of ['cash', 'noncash'])
  for (const personalPension of [0, 12000])
  for (const mergedRatio of [0, 0.4, 1]) {
    const inputs = fixture(api, { calculationMode, joinDate, endDate, stockType, stockRealization, personalPension });
    const split = { merged: inputs.bonus * mergedRatio, separate: inputs.bonus * (1 - mergedRatio) };
    const result = api.compute(inputs, split);
    const label = [calculationMode, joinDate, endDate, stockType, stockRealization, personalPension, mergedRatio].join('/');
    const sum = (key) => result.months.reduce((total, month) => total + month[key], 0);
    for (const [monthly, total] of [
      ['income', 'annualIncome'], ['cashIncome', 'cashIncome'], ['stockCashIncome', 'stockCashIncome'],
      ['nonCashStockIncome', 'nonCashStockIncome'], ['monthlySIVal', 'annualSI'],
      ['monthTax', 'totalTax'], ['afterTax', 'afterTax'], ['net', 'net'],
      ['pensionMonthly', 'personalPension'], ['housingWithdraw', 'annualWithdrawal'], ['consumption', 'annualConsumption'],
    ]) near(sum(monthly), result[total], `${label}: monthly ${total}`);
    near(result.net, result.afterTax + result.annualWithdrawal - result.annualConsumption - result.personalPension, `${label}: cash balance`);
    near(result.totalTax, result.comprehensiveTax + result.equityTax + result.sepTax, `${label}: total tax`);
    const vested = api.stockVestingEvents(inputs).reduce((total, event) => total + event.amount, 0);
    const noncash = stockType === 'deferred' || stockRealization === 'noncash' ? vested : 0;
    near(result.afterTax, result.annualIncome - noncash - result.annualSI - result.totalTax, `${label}: cash after tax`);
    const twin = api.compute({ ...inputs, stockRealization: stockRealization === 'cash' ? 'noncash' : 'cash' }, split);
    near(twin.totalTax, result.totalTax, `${label}: realization preserves tax`);
    near(Math.abs(twin.net - result.net), stockType === 'deferred' ? 0 : vested, `${label}: realization cash difference`);
    api.renderMonthly(result, inputs, split);
    const rows = [...api.element('#monthlyTable tbody').innerHTML.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
    assert.equal(rows.length, result.months.length ? Math.min(result.months.length, 24) + 1 : 1, `${label}: visible rows`);
    if (result.months.length) for (const row of rows) assert.equal((row[1].match(/<td(?:\s|>)/g) || []).length, 13, `${label}: column count`);
    count++;
  }
  assert.equal(count, 240);
});

test('annual cash results match independently calculated expected values', () => {
  const api = runtime();
  for (const [stockType, totalTax, net] of [
    ['listed_stock', 26950, 216050], ['listed_option', 26950, 216050],
    ['ordinary', 39470, 203530], ['deferred', 19470, 223530],
  ]) {
    const result = api.compute(fixture(api, { stockType }), { separate: 60000, merged: 0 });
    near(result.annualIncome, 412000, `${stockType}: gross package`);
    near(result.cashIncome, 312000, `${stockType}: cash income`);
    near(result.annualSI, 27000, `${stockType}: social contributions`);
    near(result.totalTax, totalTax, `${stockType}: tax`);
    near(result.net, net, `${stockType}: cash balance`);
  }
});

test('personal pension reduces cash balance as well as taxable income', () => {
  const api = runtime();
  const split = { separate: 60000, merged: 0 };
  const withPension = api.compute(fixture(api), split);
  const withoutPension = api.compute(fixture(api, { personalPension: 0 }), split);
  near(withoutPension.totalTax - withPension.totalTax, 2400, 'Tax saving from pension');
  near(withoutPension.net - withPension.net, 9600, 'Net cash cost after tax saving');
});

test('readInputs respects full-year mode, interval bonus proration and realization', () => {
  const api = runtime();
  const values = { joinDate: '2035-07-01', endDate: '2036-03-31', base: '20000', subsidy: '1000',
    socialBaseMode: 'salary', housingPct: '12', stock: '400000', stockType: 'listed_stock',
    stockRealization: 'cash', stockVestingYears: '4', bonus: '60000', bonusMonth: '3',
    pensionAmount: '12000', housingWithdraw: '1000', fixedConsumption: '3000' };
  for (const [id, value] of Object.entries(values)) api.element(id).value = value;
  api.element('pensionEnabled').checked = true;
  let inputs = api.readInputs();
  assert.equal(inputs.range.start.year, api.calculationYear);
  assert.equal(inputs.range.months.length, 12);
  assert.equal(inputs.bonus, 60000);
  assert.equal(inputs.stockRealization, 'cash');
  api.choices.calculationMode = 'interval';
  api.element('joinDate').value = '2025-07-01';
  api.element('endDate').value = '2026-03-31';
  inputs = api.readInputs();
  assert.equal(inputs.range.months.length, 9);
  near(inputs.bonus, 60000 * 184 / 365, 'Previous-year bonus proration');
  api.choices.bonusProrationBasis = 'trailing_12';
  near(api.readInputs().bonus, 60000 * 243 / 365, 'Trailing-12-month bonus proration');
  api.element('endDate').value = '2026-03-30';
  assert.equal(api.readInputs().bonus, 0, 'Bonus is not received before the payout month ends');
});

test('stock realization is saved and restored, with noncash as the legacy default', () => {
  const api = runtime();
  api.element('stockRealization').value = 'cash';
  api.saveState();
  assert.equal(JSON.parse(api.storage.get('salaryCalc')).stockRealization, 'cash');
  api.element('stockRealization').value = 'noncash';
  api.restoreState();
  assert.equal(api.element('stockRealization').value, 'cash');
  const legacy = JSON.parse(api.storage.get('salaryCalc'));
  delete legacy.stockRealization;
  api.storage.set('salaryCalc', JSON.stringify(legacy));
  api.restoreState();
  assert.equal(api.element('stockRealization').value, 'noncash');
});

test('cash chart does not double-count consumption and handles cash shortfalls', () => {
  const api = runtime({ render: true });
  api.context.testInputs = fixture(api);
  api.render();
  const widths = [...api.element('annualBar').innerHTML.matchAll(/width:([\d.]+)%/g)].map((m) => Number(m[1]));
  assert.equal(widths.length, 3);
  near(widths.reduce((sum, width) => sum + width, 0), 100, 'Chart percentages');
  assert.equal(api.element('annualBar').hidden, false);
  assert.ok(!api.element('annualLegend').innerHTML.includes('消费'));
  assert.ok(api.element('kpis').innerHTML.includes('216,050'));
  assert.ok(api.element('equitySummary').textContent.includes('100,000'));
  api.context.testInputs = { ...fixture(api), base: 0, subsidy: 0, contributionBase: 0,
    bonus: 0, personalPension: 0, housingWithdraw: 0, fixedConsumption: 0, extras: [] };
  api.render();
  assert.equal(api.element('annualBar').hidden, true);
  assert.equal(api.element('annualLegend').hidden, true);
  assert.equal(api.element('cashChartNote').hidden, false);
  assert.ok(api.element('cashChartNote').textContent.includes('7,480'));
  api.context.testInputs.stock = 0;
  api.render();
  assert.equal(api.element('annualBar').hidden, true);
  assert.ok(api.element('cashChartNote').textContent.includes('设置现金收入'));
});
