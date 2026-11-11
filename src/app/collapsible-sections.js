/**
 * Сворачивание секций панели — базовая возможность библиотеки.
 *
 * Секция — это заголовок (`.section-heading[data-collapsible]`) и всё, что идёт
 * за ним до следующего заголовка. Содержимое переносится в обёртку
 * `.section-body`, поэтому у него появляется своя панель: рамка и фон карточки.
 * Заголовок остаётся соседом обёртки, а не её частью.
 *
 * Сворачивание управляет ТОЛЬКО обёрткой (`body.hidden`). Флаг `hidden` у
 * самого содержимого принадлежит панели: «Движение глаз» появляется, когда
 * движок сообщит о возможностях модели, детали гардероба — после выбора
 * категории. Если бы модуль запоминал их состояние при сборке и возвращал
 * его при раскрытии, динамические узлы гасли бы навсегда.
 *
 * Почему не `<details>`: содержимое секций — живые формы, которые панели
 * пересобирают по своим событиям. Состояние хранится в хранилище приложения
 * (по умолчанию — `state.viewport.sections`, значение false = свёрнута), а не в
 * разметке, чтобы перерисовка содержимого не сбрасывала выбор. Своё место
 * хранения задаётся опцией `storage`: функция, возвращающая объект-словарь.
 *
 * Заголовок получает `role="button"`, `tabindex="0"` и `aria-expanded`, так что
 * секция работает и мышью, и с клавиатуры (Enter/Space).
 */

/** Заголовок, который можно свернуть. */
const HEADING_SELECTOR = '.section-heading[data-collapsible], .hair-plugin-heading[data-collapsible]';

/**
 * Контролы внутри заголовка: клик по ним выполняет своё действие и не
 * переключает секцию. Селектор ищется ОТ узла клика, поэтому сам заголовок
 * сюда попадать не должен — иначе `closest` вернёт его и заголовок перестанет
 * реагировать на собственный текст.
 */
const CONTROLS = 'button, input, select, textarea, a[href], .b-switch, .switch, [data-no-collapse]';

/**
 * Ключ секции: явный `data-section` в разметке, иначе — текст заголовка.
 * Текст читается один раз, при сборке, и больше не меняется.
 */
function sectionKey(heading) {
  const explicit = heading.dataset.section;
  if (explicit) return explicit;
  const title = heading.querySelector('h2, h3, b')?.textContent ?? '';
  return `auto:${title.trim().toLowerCase().replace(/\s+/g, '-')}`;
}

export function initCollapsibleSections({ root = document, state = null, persist = () => {}, storage = null } = {}) {
  const sections = new Map();
  // Документ берём у самого корня, а не у глобальной переменной: панель может
  // жить в другом документе (окно, iframe) и глобальный `document` будет чужим.
  const doc = root.nodeType === 9 ? root : root.ownerDocument ?? globalThis.document;

  function store() {
    // Своё хранилище важнее встроенного: приложению не нужно подстраивать
    // структуру своего состояния под библиотеку.
    if (typeof storage === 'function') return storage() ?? null;
    if (!state) return null;
    if (!state.viewport || typeof state.viewport !== 'object') state.viewport = {};
    const saved = state.viewport.sections;
    if (!saved || typeof saved !== 'object') state.viewport.sections = {};
    return state.viewport.sections;
  }

  /** Переносит содержимое секции в `.section-body`, сохраняя порядок и hidden. */
  function wrap(heading) {
    for (let node = heading.nextElementSibling; node; node = node.nextElementSibling) {
      if (node.matches('.section-heading, .hair-plugin-heading')) break;
      // Уже обёрнута (повторная инициализация) — берём готовую.
      if (node.classList.contains('section-body')) return { body: node };
    }
    const nodes = [];
    for (let node = heading.nextElementSibling; node; node = node.nextElementSibling) {
      if (node.matches('.section-heading, .hair-plugin-heading')) break;
      nodes.push(node);
    }
    const body = doc.createElement('div');
    body.className = 'section-body';
    body.append(...nodes);
    heading.after(body);
    return { body };
  }

  function apply(entry, collapsed, { silent = false } = {}) {
    entry.heading.setAttribute('aria-expanded', String(!collapsed));
    entry.body.classList.toggle('is-collapsed', collapsed);
    entry.body.hidden = collapsed;
    if (!silent) {
      const saved = store();
      if (saved) { saved[entry.key] = !collapsed; persist(); }
    }
  }

  /** Собирает и подключает секции, которых ещё нет в карте. Идемпотентна. */
  function scan() {
    for (const heading of root.querySelectorAll(HEADING_SELECTOR)) {
      if (sections.has(heading)) continue;
      const key = sectionKey(heading);
      const { body } = wrap(heading);
      const entry = { key, heading, body };
      sections.set(heading, entry);

      heading.setAttribute('role', 'button');
      heading.setAttribute('tabindex', '0');
      if (!heading.querySelector('.section-arrow')) {
        // Треугольник вставляется первым: он же индикатор состояния в CSS.
        const arrow = doc.createElement('span');
        arrow.className = 'section-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        heading.prepend(arrow);
      }

      const toggle = () => apply(entry, heading.getAttribute('aria-expanded') !== 'false');
      heading.addEventListener('click', (event) => {
        // Контрол внутри заголовка (переключатель, ссылка) забирает клик себе.
        // Всё остальное — текст, треугольник, пустое место — сворачивает.
        const control = event.target.closest(CONTROLS);
        if (control && heading.contains(control)) return;
        toggle();
      });
      heading.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (event.target !== heading) return;
        event.preventDefault();
        toggle();
      });

      const saved = store();
      const remembered = saved ? saved[key] : undefined;
      // Секция без сохранённого состояния стартует раскрытой.
      apply(entry, remembered === false, { silent: true });
    }
  }

  /**
   * Панели пересобирают содержимое по своим событиям. Обёртка при этом та же,
   * но `hidden` мог сбросить `innerHTML` родителя — повторяем раскладку.
   */
  function refresh() {
    scan();
    for (const entry of sections.values()) {
      if (!entry.heading.isConnected) continue;
      const collapsed = entry.heading.getAttribute('aria-expanded') === 'false';
      if (entry.body.hidden !== collapsed) entry.body.hidden = collapsed;
    }
  }

  scan();
  return { scan, refresh };
}
