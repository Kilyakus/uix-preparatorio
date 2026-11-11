/**
 * Рейл разделов — базовый элемент интерфейса библиотеки.
 *
 * Рейл (боковая вертикальная полоса вкладок) в Preparatorio встречается трижды:
 * полоса инструментов панели, разделы «Параметров» и разделы «Анимаций».
 * Ведёт себя она всюду одинаково — выбрать один раздел, «отжать» его повторным
 * кликом и показать всё сразу, перевести выбор стрелками, показать название
 * выбранного раздела в шапке области. Поэтому логика живёт здесь, а приложение
 * только заполняет её конфигом: разметкой (`attachRailPanel`) или списком
 * пунктов (`renderRail`).
 *
 * Состояние обзора принадлежит `createRailOverview`, восстановление фокуса —
 * `rerenderRail`, клавиатура — `attachRailKeyboardNav`. Этот модуль связывает
 * их с разметкой и не принимает решений о содержимом: что показать в обзоре,
 * решает потребитель.
 */

import { attachRailKeyboardNav, createRailOverview, rerenderRail } from './rail-overview.js';

/** Пункт рейла рисуется кнопкой `.tab` — так же, как полоса инструментов. */
const TAB_CLASS = 'tab';

/**
 * Кнопка раздела «доступна», если её не скрыли и не вынесли в отдельный док.
 * Скрытая или отделённая вкладка не участвует ни в обзоре, ни в подсчёте.
 */
function defaultIsAvailable(button) {
  return !button.hidden && !button.classList.contains('is-docked');
}

/** id панели содержимого, которую переключает кнопка. */
function contentIdFor(button, dataKey, fallbackPrefix) {
  return button.getAttribute('aria-controls') || `${fallbackPrefix}${button.dataset[dataKey]}`;
}

/**
 * Живой рейл, объявленный в разметке.
 *
 * Библиотека берёт на себя всё типовое: клик и обзор, клавиатуру, наблюдение за
 * тем, что делает меню инструментов (скрытие, перетаскивание, отделение),
 * заголовок выбранного раздела, состояние «нет разделов» и переключение
 * `.tab-content`. Приложение оставляет себе только содержимое разделов.
 *
 * @param {object} options
 * @param {HTMLElement} options.rail полоса кнопок (`.tabs`)
 * @param {HTMLElement} [options.scroll] контейнер содержимого (`.property-scroll`)
 * @param {HTMLElement} [options.title] элемент в шапке для названия раздела
 * @param {HTMLElement} [options.empty] сообщение «нет разделов»
 * @param {{overview?: string}} [options.labels] подписи: обзор, «нет разделов»
 * @param {string} [options.dataKey='tab'] ключ `dataset` с id раздела
 * @param {string} [options.contentSelector=':scope > .tab-content'] панели содержимого
 * @param {string} [options.contentIdPrefix='tab-'] префикс id, если нет `aria-controls`
 * @param {(button: HTMLElement) => boolean} [options.isAvailable] какие кнопки считать разделами
 * @param {(id: string) => boolean} [options.activateDocked] клик по отделённому инструменту
 * @param {ReturnType<typeof createRailOverview>} [options.overview] своя машина обзора
 * @param {string|null} [options.initialId=null] выбранный раздел до первого клика
 * @param {(state: {currentId: string|null, overview: boolean}) => void} [options.onChange]
 * @param {boolean} [options.observe=true] следить за изменениями разметки рейла
 * @returns {{state: object, overview: object, sync: () => void, detach: () => void}}
 */
export function attachRailPanel({
  rail,
  scroll = null,
  title = null,
  empty = null,
  labels = {},
  dataKey = 'tab',
  contentSelector = ':scope > .tab-content',
  contentIdPrefix = 'tab-',
  isAvailable = defaultIsAvailable,
  activateDocked = null,
  overview = null,
  initialId = null,
  onChange = null,
  observe = true,
} = {}) {
  if (!rail) return { state: { currentId: null, overview: false }, overview: null, sync: () => {}, detach: () => {} };

  const machine = overview ?? createRailOverview({ initialId });
  const overviewLabel = labels.overview ?? 'Все разделы';

  const buttons = () => [...rail.querySelectorAll(`.${TAB_CLASS}`)];
  const available = () => buttons().filter((button) => isAvailable(button));
  const active = () => available().find((button) =>
    button.classList.contains('active') && button.getAttribute('aria-selected') === 'true');

  /**
   * Привести разметку к текущему состоянию: какие панели показаны, что в шапке,
   * нужен ли заголовок и сообщение о пустом списке. Идемпотентна — вызывается
   * после каждого клика, после мутаций меню инструментов и на старте.
   */
  function sync() {
    const { overview: isOverview } = machine.state;
    const items = available();
    const current = active();
    const shown = new Set();
    if (isOverview) for (const button of items) shown.add(contentIdFor(button, dataKey, contentIdPrefix));
    else if (current) shown.add(contentIdFor(current, dataKey, contentIdPrefix));

    scroll?.classList.toggle('is-overview', isOverview);
    for (const content of scroll?.querySelectorAll(contentSelector) ?? []) {
      if (shown.has(content.id)) content.classList.add('active');
      else content.classList.remove('active');
    }
    if (empty) empty.hidden = isOverview ? items.length > 0 : !!current;
    if (title) {
      const label = isOverview && items.length ? overviewLabel : current?.getAttribute('aria-label') ?? '';
      title.textContent = label;
      title.hidden = !label;
    }
    onChange?.(machine.state);
  }

  rail.addEventListener('click', (event) => {
    const button = event.target?.closest?.(`.${TAB_CLASS}`);
    if (!button || !rail.contains(button)) return;
    const id = button.dataset[dataKey];
    if (activateDocked?.(id)) return;
    const userAction = machine.isUserAction(event);
    // Синтетический клик меню инструментов (раздел спрятали, перенесли,
    // отделили или вернули) не должен выключать обзор, выбранный человеком.
    if (machine.state.overview && !userAction) { sync(); return; }
    const next = machine.select(id, { active: button.classList.contains('active'), userAction });
    // В обзоре не активна ни одна вкладка, иначе активна ровно выбранная.
    const single = !next.overview;
    for (const item of rail.querySelectorAll(`.${TAB_CLASS}`)) {
      const on = single && item === button;
      item.classList.toggle('active', on);
      item.setAttribute('aria-selected', String(on));
    }
    sync();
  });

  attachRailKeyboardNav(rail, { overview: machine });

  // Меню инструментов меняет видимость, порядок и отделённость разделов без
  // кликов по рейлу — состояние надо пересчитать.
  let observer = null;
  if (observe && globalThis.MutationObserver) {
    observer = new MutationObserver(sync);
    observer.observe(rail, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ['class', 'hidden', 'aria-selected', 'aria-label'],
    });
  }

  sync();
  return {
    // Геттер, а не снимок: состояние меняет машина, и читать его нужно свежим.
    get state() { return machine.state; },
    overview: machine,
    sync,
    detach() {
      observer?.disconnect();
    },
  };
}

/**
 * Перерисовать рейл из списка пунктов.
 *
 * Вариант для рейлов, содержимое которых — данные приложения (группы движений,
 * категории инструментов): библиотека создаёт кнопки, ставит значки, следит за
 * активным пунктом и заголовком, а решение о выборе отдаёт обратно через
 * `onSelect`. Повторный клик по активной кнопке приходит как `active: true`,
 * и машина обзора решает, включать ли режим.
 *
 * @param {HTMLElement} rail полоса кнопок
 * @param {Array<{id: string, label: string, icon?: string, iconPath?: string, glyph?: string}>} items
 * @param {object} [options]
 * @param {string} [options.dataKey='tab'] ключ `dataset` с id пункта
 * @param {string|null} [options.currentId=null] выбранный пункт
 * @param {boolean} [options.overview=false] включён ли обзор
 * @param {HTMLElement} [options.title] элемент в шапке для названия пункта
 * @param {string} [options.overviewLabel='Все разделы'] подпись в обзоре
 * @param {string} [options.controls=null] id панели, которой принадлежат пункты
 * @param {(id: string, info: {active: boolean, userAction: boolean}) => void} [options.onSelect]
 * @param {(event: Event) => boolean} [options.isUserAction] настоящий ли это ввод
 *   (по умолчанию — всё, что не синтетический `.click()`)
 * @param {HTMLElement} [options.scroll] контейнер содержимого: при выборе пункта
 *   прокручивается к началу, чтобы раздел открывался с заголовка
 */
export function renderRail(rail, items = [], {
  dataKey = 'tab',
  currentId = null,
  overview = false,
  title = null,
  overviewLabel = 'Все разделы',
  controls = null,
  onSelect = null,
  isUserAction = (event) => !!event?.isTrusted,
  scroll = null,
} = {}) {
  if (!rail) return;
  // Кнопки пересоздаются, поэтому фокус клавиатуры надо вернуть на прежний
  // пункт — иначе стрелки и Enter работают до первой перерисовки.
  rerenderRail(rail, dataKey, () => {
    rail.replaceChildren();
    for (const item of items) {
      const selected = !overview && item.id === currentId;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `${TAB_CLASS}${selected ? ' active' : ''}`;
      button.dataset[dataKey] = item.id;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(selected));
      button.setAttribute('aria-label', item.label);
      if (controls) button.setAttribute('aria-controls', controls);
      button.title = item.label;
      if (item.icon) button.insertAdjacentHTML('afterbegin', item.icon);
      else if (item.iconPath) {
        button.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${item.iconPath}"></path></svg>`;
      } else if (item.glyph) button.insertAdjacentHTML('afterbegin', `<span class="tab-glyph">${item.glyph}</span>`);
      if (onSelect) {
        button.addEventListener('click', (event) => {
          onSelect(item.id, {
            active: button.classList.contains('active'),
            // Настоящий ввод от синтетического `.click()` отличает либо
            // библиотека (`isUserAction` машины обзора), либо проверка
            // `isTrusted`: меню инструментов дёргает `.click()` само.
            userAction: isUserAction(event),
          });
        });
      }
      rail.append(button);
    }
  });
  if (title) {
    const label = overview ? overviewLabel : items.find((item) => item.id === currentId)?.label ?? '';
    title.textContent = label;
    title.hidden = !label;
  }
  if (scroll) scroll.scrollTo?.({ top: 0 });
}
