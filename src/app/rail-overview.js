/**
 * Обзорный режим рейла — встроенная возможность библиотеки, а не частная
 * реализация потребителя.
 *
 * Рейл — вертикальный список вкладок инструмента. Когда раздел уже выбран,
 * повторный клик (или Enter) его «отжимает»: ни одна вкладка не активна, а
 * содержимое показывает все разделы сразу. Любой следующий выбор возвращает
 * обычный одиночный режим.
 *
 * Модуль владеет только *решением* — что стало с состоянием. Что именно
 * показывать в обзоре и как перерисовывать кнопки, решает потребитель:
 * он подписывается на `onChange` и дёргает `render` со свежим состоянием.
 */

import { navByRail } from './rail-nav-registry.js';

/**
 * Создать машину состояний обзора для одного рейла.
 *
 * @param {object}   [options]
 * @param {(state: {currentId: string|null, overview: boolean}) => void} [options.onChange]
 *   Вызывается после каждого реального изменения состояния.
 * @param {string|null} [options.initialId=null] какую секцию считать выбранной
 *   до первого взаимодействия (обычно та, что активна в разметке по умолчанию).
 * @returns {{
 *   state: {currentId: string|null, overview: boolean},
 *   isUserAction: (event?: Event) => boolean,
 *   beginKeyboardSelection: () => void,
 *   select: (id: string, opts?: {active?: boolean, userAction?: boolean}) => {currentId: string|null, overview: boolean},
 *   close: () => {currentId: string|null, overview: boolean},
 *   setCurrent: (id: string|null) => {currentId: string|null, overview: boolean}
 * }}
 *
 * `state` — актуальное состояние (читается как геттер, поэтому после каждого
 * `select` перечитывайте его заново).
 */
export function createRailOverview({ onChange, initialId = null } = {}) {
  let state = { currentId: initialId, overview: false };
  let keyboardSelection = false;

  const emit = (next) => {
    if (next.currentId === state.currentId && next.overview === state.overview) return state;
    state = next;
    onChange?.(state);
    return state;
  };

  return {
    get state() { return state; },

    /**
     * Навигация по рейлу с клавиатуры жмёт кнопку синтетическим `.click()`.
     * Помечаем такой переход как действие пользователя: иначе обзор нельзя
     * отжать ни одной стрелкой — только мышью.
     */
    beginKeyboardSelection() {
      keyboardSelection = true;
      setTimeout(() => { keyboardSelection = false; }, 0);
    },

    /**
     * Настоящее действие пользователя (мышь или клавиатура), а не синтетика.
     *
     * Внутренний fallback меню инструментов тоже вызывает `.click()`, когда
     * прячет, возвращает или переупорядочивает вкладки. Он не должен ни
     * включать, ни выключать обзор — иначе режим слетал бы при любом
     * перетаскивании инструмента.
     */
    isUserAction(event) {
      return Boolean(event?.isTrusted || keyboardSelection);
    },

    /**
     * Новое состояние после выбора секции `id`.
     *
     * @param {string} id идентификатор секции
     * @param {object} [options]
     * @param {boolean} [options.active=false] была ли секция активна в момент выбора
     * @param {boolean} [options.userAction=true] см. {@link isUserAction}
     * @returns то же состояние, если ничего не изменилось (тот же объект),
     *   и новый объект — если изменилось. Позволяет вызывающему коду
     *   отличить «обзор сохранён» от «режим переключён».
     */
    select(id, { active = false, userAction = true } = {}) {
      // Fallback меню инструментов во включённом обзоре его сохраняет.
      if (!userAction && state.overview) return state;
      const deselect = userAction && !state.overview && active;
      // В обзоре выбор не выбрасывается, а запоминается: выход из обзора
      // должен вернуть ту же секцию, если потребитель не выберет новую.
      return emit(deselect
        ? { currentId: state.currentId, overview: true }
        : { currentId: id, overview: false });
    },

    /** Выйти из обзора, не меняя выбранную секцию. */
    close() {
      return emit({ currentId: state.currentId, overview: false });
    },

    /**
     * Зафиксировать секцию, не трогая режим. Нужно, когда выбор меняется не
     * кликом, а изменившимся составом разделов (например, после скрытия
     * текущей группы осталась только одна — она и становится выбранной).
     */
    setCurrent(id) {
      return emit({ currentId: id, overview: state.overview });
    },
  };
}

/**
 * Перерисовать кнопки рейла, не теряя фокус с клавиатуры.
 *
 * Кнопки создаются заново при каждом `replaceChildren`, и без восстановления
 * фокуса навигация «отжимает» раздел лишь однажды: после первого Enter или
 * стрелки фокус уходит в `body`, и следующее нажатие уже ни на что не
 * попадает. Фокус возвращается, только если он и до перерисовки был на рейле.
 *
 * @param {HTMLElement} rail контейнер кнопок
 * @param {string} dataKey имя `dataset`-ключа, в котором кнопка хранит свой id
 * @param {() => void} rebuild собственно перерисовка (обычно `rail.replaceChildren()`)
 */
export function rerenderRail(rail, dataKey, rebuild) {
  if (!rail) { rebuild?.(); return; }
  const focusedId = rail.contains(document.activeElement)
    ? document.activeElement?.dataset?.[dataKey]
    : null;
  rebuild?.();
  if (!focusedId) return;
  const restored = [...rail.querySelectorAll('.tab')]
    .find((button) => button.dataset[dataKey] === focusedId);
  restored?.focus();
}

/**
 * Клавиатура вертикального рейла — вторая половина того же контракта.
 *
 * WAI-ARIA для вертикального `tablist` требует, чтобы стрелки переводили выбор,
 * а `Home`/`End` прыгали к краям; `Enter` и пробел активируют кнопку. Без этого
 * по полосе ходят только `Tab`-ом, а «отжать» раздел с клавиатуры можно лишь
 * один раз — после перерисовки кнопок фокус теряется (см. `rerenderRail`).
 *
 * Обработчика на рейл ровно один: полосу объявляет и меню инструментов, и сама
 * панель, а два обработчика дали бы двойной шаг стрелки (с `look` сразу на
 * третий раздел). Поэтому вызов идемпотентен: повторный только дописывает
 * `overview` и/или `selector`, слушатель остаётся прежним.
 *
 * Обработчик ставится в фазе перехвата: рейл вложен в док Lumino, и его
 * собственные горячие клавиши иначе съедают стрелки. Синтетический `click()`
 * после `focus()` помечается через `beginKeyboardSelection()`, чтобы обзор
 * срабатывал так же, как при клике мышью.
 *
 * @param {HTMLElement} rail контейнер с кнопками
 * @param {object} [options]
 * @param {ReturnType<typeof createRailOverview>} [options.overview] машина обзора
 * @param {string} [options.selector='.tab'] какие кнопки считать разделами
 * @returns {() => void} отписка (снимает слушатель, если он ещё наш)
 */
export function attachRailKeyboardNav(rail, { overview, selector = '.tab' } = {}) {
  if (!rail) return () => {};
  const attached = navByRail.get(rail);
  if (attached) {
    // Второй вызов — это не вторая навигация, а уточнение контракта.
    if (overview) attached.overview = overview;
    if (selector) attached.selector = selector;
    return () => {};
  }
  const state = { overview: overview ?? null, selector };
  const arrows = ['ArrowUp', 'ArrowDown', 'Home', 'End'];

  const onKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      state.overview?.beginKeyboardSelection();
      return;
    }
    if (!arrows.includes(event.key)) return;
    const buttons = [...rail.querySelectorAll(state.selector)];
    const index = buttons.indexOf(globalThis.document?.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? buttons.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
    state.overview?.beginKeyboardSelection();
    buttons[next].click();
  };

  navByRail.set(rail, state);
  rail.addEventListener('keydown', onKeyDown, true);
  return () => {
    if (navByRail.get(rail) !== state) return;
    rail.removeEventListener('keydown', onKeyDown, true);
    navByRail.delete(rail);
  };
}
