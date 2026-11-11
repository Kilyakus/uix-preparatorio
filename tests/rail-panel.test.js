import test from 'node:test';
import assert from 'node:assert/strict';
import { attachRailPanel, renderRail } from '../src/app/rail.js';

/**
 * Минимальный фейк DOM: ровно то, чем пользуется рейл — классы, dataset,
 * атрибуты, дети и поиск по классу. Так проверка остаётся без jsdom и без
 * браузера, как и остальные тесты библиотеки.
 */
class FakeClassList {
  constructor(node) { this.node = node; this.set = new Set(); }
  add(...names) { for (const name of names) this.set.add(name); }
  remove(...names) { for (const name of names) this.set.delete(name); }
  contains(name) { return this.set.has(name); }
  toggle(name, force) {
    const on = force === undefined ? !this.set.has(name) : force;
    if (on) this.set.add(name); else this.set.delete(name);
    return on;
  }
}

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.dataset = {};
    this.attributes = {};
    this.children = [];
    this.listeners = {};
    this.classList = new FakeClassList(this);
    this._className = '';
    this.hidden = false;
    this.id = '';
    this.textContent = '';
    this.innerHTML = '';
  }
  get className() { return [...this.classList.set].join(' '); }
  set className(value) {
    this.classList.set = new Set(String(value).split(/\s+/).filter(Boolean));
    this._className = value;
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn); }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  insertAdjacentHTML(_position, html) { this.innerHTML += html; }
  closest(selector) {
    const wanted = selector.replace(/^\./, '').split('.')[0];
    let node = this;
    while (node) {
      if (node.classList?.contains(wanted)) return node;
      node = node.parentElement;
    }
    return null;
  }
  contains(node) {
    if (node === this) return true;
    return this.children.some((child) => child.contains?.(node));
  }
  querySelectorAll(selector) {
    // «:scope > .tab-content» и «.tab» — фейку достаточно последнего класса.
    const wanted = selector.split('>').pop().trim().replace(/^\./, '').split('.')[0];
    const out = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (child.classList.contains(wanted)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
  dispatch(type, event) { for (const fn of this.listeners[type] ?? []) fn(event); }
}

function fakeDocument() {
  return { createElement: (tag) => new FakeElement(tag), activeElement: null };
}

test('renderRail строит кнопки из пунктов и отдаёт выбор наружу', () => {
  const realDocument = globalThis.document;
  globalThis.document = fakeDocument();
  try {
    const rail = new FakeElement('nav');
    const title = new FakeElement('span');
    const picks = [];
    renderRail(rail, [
      { id: 'standing', label: 'Покой', icon: '<svg></svg>' },
      { id: 'dance', label: 'Реакции', glyph: '✳' },
    ], {
      dataKey: 'animationGroupTab',
      currentId: 'dance',
      title,
      onSelect: (id, info) => picks.push([id, info]),
    });

    assert.equal(rail.children.length, 2);
    assert.deepEqual(rail.children.map((b) => b.dataset.animationGroupTab), ['standing', 'dance']);
    assert.deepEqual(rail.children.map((b) => b.classList.contains('active')), [false, true]);
    assert.deepEqual(rail.children.map((b) => b.getAttribute('aria-selected')), ['false', 'true']);
    assert.equal(title.textContent, 'Реакции');
    assert.match(rail.children[0].innerHTML, /<svg>/);
    assert.match(rail.children[1].innerHTML, /tab-glyph/);

    rail.children[1].dispatch('click', { isTrusted: true });
    assert.deepEqual(picks.at(-1), ['dance', { active: true, userAction: true }]);
    rail.children[0].dispatch('click', { isTrusted: false });
    assert.deepEqual(picks.at(-1), ['standing', { active: false, userAction: false }]);
  } finally { globalThis.document = realDocument; }
});

test('renderRail в обзоре не оставляет активных кнопок и меняет заголовок', () => {
  const realDocument = globalThis.document;
  globalThis.document = fakeDocument();
  try {
    const rail = new FakeElement('nav');
    const title = new FakeElement('span');
    renderRail(rail, [{ id: 'a', label: 'Первый' }, { id: 'b', label: 'Второй' }], {
      currentId: 'a',
      overview: true,
      title,
      overviewLabel: 'Все настройки',
    });
    assert.deepEqual(rail.children.map((b) => b.classList.contains('active')), [false, false]);
    assert.equal(title.textContent, 'Все настройки');
    assert.equal(title.hidden, false);
  } finally { globalThis.document = realDocument; }
});

test('attachRailPanel синхронизирует содержимое, заголовок и обзор', () => {
  const rail = new FakeElement('nav');
  const scroll = new FakeElement('div');
  const title = new FakeElement('span');
  const empty = new FakeElement('p');
  empty.hidden = true;

  const makeTab = (id, label, active) => {
    const button = new FakeElement('button');
    button.className = `tab${active ? ' active' : ''}`;
    button.dataset.tab = id;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-selected', String(active));
    button.setAttribute('aria-controls', `tab-${id}`);
    rail.append(button);
    return button;
  };
  const makeContent = (id) => {
    const content = new FakeElement('section');
    content.className = 'tab-content';
    content.id = id;
    scroll.append(content);
    return content;
  };

  const look = makeTab('look', 'Внешность', true);
  makeTab('face', 'Лицо', false);
  makeContent('tab-look');
  makeContent('tab-face');

  const panel = attachRailPanel({ rail, scroll, title, empty });

  // Обычный режим: показан только выбранный раздел.
  assert.deepEqual(scroll.children.map((c) => c.classList.contains('active')), [true, false]);
  assert.equal(title.textContent, 'Внешность');
  assert.equal(empty.hidden, true);
  assert.equal(scroll.classList.contains('is-overview'), false);

  // Повторный клик по активному разделу включает обзор: видны все, шапка —
  // подпись обзора, ни одна кнопка не активна.
  rail.dispatch('click', { target: look, isTrusted: true });
  assert.equal(panel.state.overview, true);
  assert.deepEqual(scroll.children.map((c) => c.classList.contains('active')), [true, true]);
  assert.equal(scroll.classList.contains('is-overview'), true);
  assert.equal(title.textContent, 'Все разделы');
  assert.deepEqual(rail.children.map((b) => b.classList.contains('active')), [false, false]);

  // Синтетический клик меню инструментов обзор не выключает…
  rail.dispatch('click', { target: rail.children[1], isTrusted: false });
  assert.equal(panel.state.overview, true);

  // …а настоящий выбор другого раздела — выключает.
  rail.dispatch('click', { target: rail.children[1], isTrusted: true });
  assert.equal(panel.state.overview, false);
  assert.deepEqual(scroll.children.map((c) => c.classList.contains('active')), [false, true]);
  assert.equal(title.textContent, 'Лицо');
  assert.equal(rail.children[1].classList.contains('active'), true);
  assert.equal(rail.children[1].getAttribute('aria-selected'), 'true');
  panel.detach();
});
