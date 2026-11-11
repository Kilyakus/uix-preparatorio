/**
 * Закрашенная часть дорожки ползунка — базовая возможность библиотеки.
 *
 * Нативный `<input type="range">` в Chromium не рисует прогресс у
 * `::-webkit-slider-runnable-track` — в отличие от Firefox, у которого есть
 * `::-moz-range-progress`. Поэтому долю считаем сами и отдаём её в CSS
 * переменной `--range-fill`: ползунок читает её из своего `style`, а дорожка
 * красится градиентом (см. `components.css`, правила `.range-row`).
 *
 * Считать нужно и при программном изменении значения (сброс настроек, загрузка
 * сохранения, применение пресета), иначе закраска отстаёт от реального
 * положения. Один слушатель на документ закрывает все случаи: событие `input`
 * всплывает от самого ползунка, а `syncRangeFill` вызывается вручную и из
 * мутаций — значения меняются кодом без событий.
 */

const FILL_PROPERTY = "--range-fill";

/** Доля заполнения 0…1 с учётом min/max/step. */
export function rangeFillRatio(input) {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value);
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(value)) return 0;
  const span = max - min;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (value - min) / span));
}

/** Обновить переменную у одного ползунка. */
export function syncRangeFill(input) {
  if (!input || input.type !== "range") return;
  input.style.setProperty(FILL_PROPERTY, `${(rangeFillRatio(input) * 100).toFixed(2)}%`);
}

/** Обновить все ползунки в поддереве (по умолчанию — документ). */
export function syncRangeFills(root = document) {
  for (const input of root.querySelectorAll?.('input[type="range"]') ?? []) syncRangeFill(input);
}

let installed = false;

/**
 * Один раз на документ: событие ввода плюс наблюдение за изменениями.
 *
 * Наблюдатель смотрит только атрибут `value`: сама закраска пишет в `style`,
 * поэтому цикла «мутация → пересчёт → мутация» не возникает.
 */
export function installRangeFillSupport(doc = document) {
  if (installed) return;
  installed = true;
  doc.addEventListener(
    "input",
    (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === "range") syncRangeFill(target);
    },
    true,
  );
  const Observer = doc.defaultView?.MutationObserver;
  if (!Observer) return;
  new Observer((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        syncRangeFill(mutation.target);
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.('input[type="range"]')) syncRangeFill(node);
        syncRangeFills(node);
      }
    }
  }).observe(doc.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["value", "min", "max"],
  });
  syncRangeFills(doc);
}
