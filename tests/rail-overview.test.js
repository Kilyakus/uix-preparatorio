import test from 'node:test';
import assert from 'node:assert/strict';
import { attachRailKeyboardNav, createRailOverview, rerenderRail } from '../src/app/rail-overview.js';

const click = (overrides = {}) => ({ isTrusted: true, ...overrides });

test('rail starts unselected and a plain pick selects it without an overview', () => {
  const rail = createRailOverview();
  assert.deepEqual(rail.state, { currentId: null, overview: false });
  assert.deepEqual(rail.select('look', { active: false }), { currentId: 'look', overview: false });
});

test('picking the active section opens the overview and remembers the section', () => {
  const rail = createRailOverview();
  rail.select('look', { active: false });
  const next = rail.select('look', { active: true });
  assert.deepEqual(next, { currentId: 'look', overview: true });
  assert.equal(next.overview, true);
});

test('any pick inside the overview closes it and selects that section', () => {
  const rail = createRailOverview();
  rail.select('look', { active: false });
  rail.select('look', { active: true });
  assert.deepEqual(rail.select('face', { active: false }), { currentId: 'face', overview: false });
});

test('synthetic clicks never toggle the overview in either direction', () => {
  const rail = createRailOverview();
  rail.select('look', { active: false });
  // Fallback of the tool menu re-activates a tab: must not leave the mode.
  rail.select('look', { active: true, userAction: false });
  assert.deepEqual(rail.state, { currentId: 'look', overview: false });
  // …and while the overview is on it must be preserved, returning the same object.
  rail.select('look', { active: true });
  const kept = rail.select('face', { active: false, userAction: false });
  assert.equal(kept, rail.state);
  assert.equal(kept.overview, true);
});

test('keyboard navigation counts as a real user action until the tick ends', async () => {
  const rail = createRailOverview();
  assert.equal(rail.isUserAction({ isTrusted: false }), false);
  rail.beginKeyboardSelection();
  assert.equal(rail.isUserAction({ isTrusted: false }), true);
  assert.equal(rail.isUserAction(click()), true);
  assert.equal(rail.isUserAction(), true);
  await new Promise((resolve) => { setTimeout(resolve, 5); });
  assert.equal(rail.isUserAction({ isTrusted: false }), false);
});

test('a keyboard-driven click on the active section opens the overview', () => {
  const rail = createRailOverview();
  rail.select('look', { active: false });
  rail.beginKeyboardSelection();
  const userAction = rail.isUserAction({ isTrusted: false });
  assert.deepEqual(rail.select('look', { active: true, userAction }), { currentId: 'look', overview: true });
});

test('onChange fires only for real transitions', () => {
  const seen = [];
  const rail = createRailOverview({ onChange: (state) => seen.push({ ...state }) });
  rail.select('look', { active: false });
  rail.select('look', { active: false }); // same section again while not active
  assert.equal(seen.length, 1);
  rail.select('look', { active: true });
  rail.close();
  assert.deepEqual(seen, [
    { currentId: 'look', overview: false },
    { currentId: 'look', overview: true },
    { currentId: 'look', overview: false },
  ]);
});

test('initialId and setCurrent follow a changing section list without touching the mode', () => {
  const rail = createRailOverview({ initialId: 'standing' });
  assert.deepEqual(rail.state, { currentId: 'standing', overview: false });
  // The current group disappeared from the catalogue → the fallback takes over.
  assert.deepEqual(rail.setCurrent('idle'), { currentId: 'idle', overview: false });
  // Switching the section on its own never opens or closes the overview.
  rail.select('idle', { active: true });
  assert.deepEqual(rail.setCurrent('walk'), { currentId: 'walk', overview: true });
  assert.equal(rail.state.overview, true);
});

test('close() leaves the selected section alone', () => {
  const rail = createRailOverview();
  rail.select('look', { active: false });
  assert.deepEqual(rail.close(), { currentId: 'look', overview: false });
  assert.equal(rail.close(), rail.state); // no transition, no notification
});

test('rerenderRail restores focus only when it was on the rail', () => {
  const button = (id) => ({ dataset: { tab: id }, focus() { this.focused = true; } });
  const realDocument = globalThis.document;
  const withActiveElement = (node, run) => {
    globalThis.document = { activeElement: node };
    try { run(); } finally { globalThis.document = realDocument; }
  };

  // Focus was inside the rail → it comes back after the rebuild.
  const kept = button('face');
  const freshLook = button('look');
  const rail = {
    contains: (node) => node === kept,
    querySelectorAll: () => [freshLook, kept],
  };
  let rebuilt = false;
  withActiveElement(kept, () => {
    rerenderRail(rail, 'tab', () => { rebuilt = true; });
  });
  assert.equal(rebuilt, true);
  assert.equal(kept.focused, true);

  // Focus was elsewhere → nothing is stolen from it.
  const other = button('other');
  const fresh = button('look');
  const rail2 = {
    contains: (node) => node === other,
    querySelectorAll: () => [fresh],
  };
  withActiveElement(other, () => {
    rerenderRail(rail2, 'tab', () => {});
  });
  assert.equal(fresh.focused, undefined);
});

test('rerenderRail still rebuilds when there is no rail at all', () => {
  let rebuilt = false;
  rerenderRail(null, 'tab', () => { rebuilt = true; });
  assert.equal(rebuilt, true);
});

test('keyboard nav marks its synthetic click as a user action and moves the selection', async () => {
  const buttons = ['look', 'face'].map((id) => ({
    dataset: { tab: id }, focused: 0, clicked: 0,
    focus() { this.focused += 1; document.activeElement = this; },
    click() { this.clicked += 1; this.onClick(); },
  }));
  let handler = null;
  const rail = {
    querySelectorAll: () => buttons,
    addEventListener: (type, fn) => { if (type === 'keydown') handler = fn; },
    removeEventListener: () => { handler = null; },
  };
  const overview = createRailOverview({ initialId: 'look' });
  let picked = null;
  for (const button of buttons) button.onClick = () => picked = button.dataset.tab;

  const realDocument = globalThis.document;
  globalThis.document = { activeElement: buttons[0] };
  try {
    const detach = attachRailKeyboardNav(rail, { overview });
    // ArrowDown: фокус на следующей кнопке, её выбор и пометка «это пользователь».
    let prevented = 0;
    handler({ key: 'ArrowDown', preventDefault: () => { prevented += 1; } });
    assert.equal(prevented, 1);
    assert.equal(buttons[1].focused, 1);
    assert.equal(picked, 'face');
    assert.equal(overview.isUserAction({ isTrusted: false }), true);
    // Enter без движения по рейлу тоже помечает следующий синтетический клик.
    handler({ key: 'Enter', preventDefault() {} });
    assert.equal(overview.isUserAction({ isTrusted: false }), true);
    // Пометка живёт до конца текущего тика: настоящий клик придёт следом.
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(overview.isUserAction({ isTrusted: false }), false);

    detach();
    assert.equal(handler, null);
  } finally { globalThis.document = realDocument; }
});

test('keyboard nav needs a focused tab to act', () => {
  let handler = null;
  const rail = {
    querySelectorAll: () => [],
    addEventListener: (type, fn) => { if (type === 'keydown') handler = fn; },
    removeEventListener: () => {},
  };
  const overview = createRailOverview();
  attachRailKeyboardNav(rail, { overview });
  // Фокус вне рейла → стрелка не перехватывается и не двигает выбор.
  assert.doesNotThrow(() => handler({ key: 'ArrowUp', preventDefault() { throw new Error('noop') } }));
  // Пустой рейл (все разделы скрыты) — тоже тишина, без исключений.
  assert.doesNotThrow(() => handler({ key: 'Home', preventDefault() { throw new Error('noop') } }));
});

test('attaching twice keeps a single handler so one arrow press steps once', () => {
  const buttons = ['look', 'appearance', 'wardrobe'].map((id) => ({
    dataset: { tab: id }, clicks: 0,
    focus() { globalThis.document.activeElement = this; },
    click() { this.clicks += 1; },
  }));
  let handlers = 0;
  const rail = {
    querySelectorAll: () => buttons,
    addEventListener: () => { handlers += 1; },
    removeEventListener: () => {},
  };
  const realDocument = globalThis.document;
  globalThis.document = { activeElement: buttons[0] };
  try {
    attachRailKeyboardNav(rail);
    // Панель приложения объявляет то же самое ещё раз — и передаёт обзор.
    const overview = createRailOverview({ initialId: 'look' });
    attachRailKeyboardNav(rail, { overview });
    assert.equal(handlers, 1);
  } finally { globalThis.document = realDocument; }
});
