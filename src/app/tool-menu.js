import { MimeData } from '@lumino/coreutils';
import { attachRailKeyboardNav } from './rail-overview.js';
import { Drag } from '@lumino/dragdrop';

const TOOL_MIME = 'application/x-preparatorio-tool';
const WIDGET_MIME = 'application/vnd.lumino.widget-factory';

export function initToolMenu(shell, { tools, areas, rail, menuItems, detailItems, areaItems, empty, storageKey = 'preparatorio.tools.v1', viewportId, toolsChangedEvent = 'preparatorio:tools-changed', areasChangedEvent = 'preparatorio:areas-changed' }) {
  const TOOLS = tools;
  const TOOL_BY_ID = Object.fromEntries(TOOLS.map(tool=>[tool.id,tool]));
  const RAIL_TOOLS = TOOLS.filter(tool => tool.rail);
  const AREAS = areas;
  const KEY = storageKey;

  const buttons = new Map(RAIL_TOOLS.map(({ id }) => [id, rail.querySelector(`[data-tab="${id}"]`)]));
  const choices = new Map();
  const areaChoices = new Map();
  let hidden = new Set();
  let order = RAIL_TOOLS.map(tool => tool.id);
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (Array.isArray(stored?.hidden)) hidden = new Set(stored.hidden.filter(id => TOOL_BY_ID[id]));
    if (Array.isArray(stored?.order)) order = [...new Set(stored.order.filter(id => buttons.has(id))), ...order.filter(id => !stored.order.includes(id))];
  } catch { /* настройки не обязательны */ }
  // Восстановленный в доке инструмент всегда остаётся доступным в каталоге.
  for (const { id } of TOOLS) if (shell.isToolDocked(id)) hidden.delete(id);
  const persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify({ hidden: [...hidden], order })); } catch {}
  };
  function syncSelection() {
    for (const { id, rail: onRail } of TOOLS) {
      const button = buttons.get(id);
      const docked = shell.isToolDocked(id);
      if (!onRail) {
        shell.getToolNode(id)?.classList.toggle('tool-user-hidden', hidden.has(id));
        if (choices.has(id)) choices.get(id).checked = !hidden.has(id);
        continue;
      }
      button.hidden = hidden.has(id);
      button.classList.toggle('is-docked', docked);
      button.setAttribute('aria-description', docked ? 'Инструмент отделён в док' : 'Перетащите, чтобы отделить инструмент');
      if (choices.has(id)) choices.get(id).checked = !hidden.has(id);
    }
    const active = [...buttons.values()].find(button => !button.hidden && !shell.isToolDocked(button.dataset.tab) && button.classList.contains('active'));
    if (!active) {
      const next = order.map(id => buttons.get(id)).find(button => !button.hidden && !shell.isToolDocked(button.dataset.tab));
      if (next) next.click();
      else {
        for (const button of buttons.values()) { button.classList.remove('active'); button.setAttribute('aria-selected', 'false'); }
        empty.hidden = false;
      }
    } else empty.hidden = true;
    for (const { id } of AREAS) if (areaChoices.has(id)) areaChoices.get(id).checked = shell.isAreaVisible(id);
    persist();
  }
  function setVisible(id, visible) {
    if (!TOOL_BY_ID[id]) return;
    if (!visible && shell.isToolDocked(id)) shell.returnTool(id);
    if (visible) hidden.delete(id); else hidden.add(id);
    syncSelection();
  }
  for (const id of order) rail.append(buttons.get(id));
  for (const tool of TOOLS) {
    const row = document.createElement('div'); row.className = 'tool-menu-row';
    const label = document.createElement('label'); label.className = 'b-check-item';
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = !hidden.has(tool.id);
    input.setAttribute('aria-label', `Показывать инструмент «${tool.label}»`);
    const text = document.createElement('span'); text.textContent = tool.label;
    label.append(input, text); choices.set(tool.id, input);
    input.addEventListener('change', () => setVisible(tool.id, input.checked));
    const grip = document.createElement('button'); grip.type = 'button'; grip.className = 'tool-grip'; const gripIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    gripIcon.setAttribute('viewBox', '0 0 16 16'); gripIcon.setAttribute('aria-hidden', 'true');
    const gripDots = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    gripDots.setAttribute('d', 'M5.5 3h.01 M10.5 3h.01 M5.5 8h.01 M10.5 8h.01 M5.5 13h.01 M10.5 13h.01');
    gripDots.setAttribute('stroke-width', '2.5'); gripDots.setAttribute('stroke-linecap', 'round');
    gripIcon.append(gripDots); grip.append(gripIcon);
    grip.title = `Перетащить «${tool.label}» в док или нажать, чтобы отделить`;
    grip.setAttribute('aria-label', `Отделить или перетащить «${tool.label}»`);
    grip.addEventListener('click', () => {
      setVisible(tool.id, true);
      let widget = shell.createToolWidget(tool.id);
      if (widget && !shell.dock.contains(widget)) shell.dock.addWidget(widget, { mode: 'split-right', ref: shell.panels[viewportId] });
      if (widget) shell.dock.activateWidget(widget);
      syncSelection();
    });
    row.append(label, grip); (tool.rail ? menuItems : detailItems).append(row);
    bindDrag(grip, tool);
    if (tool.rail) bindDrag(buttons.get(tool.id), tool);
  }
  for (const area of AREAS) {
    const label = document.createElement('label'); label.className = 'b-check-item';
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = shell.isAreaVisible(area.id);
    input.setAttribute('aria-label', `Показывать область «${area.label}»`);
    const text = document.createElement('span'); text.textContent = area.label;
    label.append(input, text); areaItems.append(label); areaChoices.set(area.id, input);
    input.addEventListener('change', () => { if (!shell.setAreaVisible(area.id, input.checked)) input.checked = shell.isAreaVisible(area.id); });
  }

  // Один протокол Lumino для перетаскивания из меню и с боковой панели:
  // DockPanel сам выбирает зону (вкладка, слева, справа, сверху, снизу).
  function bindDrag(source, tool) {
    source.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      const startX = event.clientX, startY = event.clientY;
      let started = false;
      const cleanup = () => { document.removeEventListener('pointermove', move, true); document.removeEventListener('pointerup', cleanup, true); document.removeEventListener('pointercancel', cleanup, true); };
      const move = moveEvent => {
        if (started || Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 6) return;
        started = true; cleanup();
        const mimeData = new MimeData();
        mimeData.setData(TOOL_MIME, tool.id);
        mimeData.setData(WIDGET_MIME, () => { setVisible(tool.id, true); return shell.createToolWidget(tool.id); });
        const image = document.createElement('div'); image.className = 'tool-drag-image'; image.textContent = tool.label;
        const drag = new Drag({ mimeData, dragImage: image, proposedAction: 'move', supportedActions: 'move', source });
        document.querySelectorAll('.b-menu.is-open').forEach(menu => { menu.classList.remove('is-open'); menu.querySelector('.b-menu-btn')?.setAttribute('aria-expanded', 'false'); });
        void drag.start(moveEvent.clientX, moveEvent.clientY).then(() => syncSelection());
        moveEvent.preventDefault(); moveEvent.stopPropagation();
      };
      document.addEventListener('pointermove', move, true); document.addEventListener('pointerup', cleanup, true); document.addEventListener('pointercancel', cleanup, true);
    });
  }
  // Боковая полоса также является зоной возврата и сортировки инструментов.
  rail.addEventListener('lm-dragenter', event => {
    if (!buttons.has(event.mimeData.getData(TOOL_MIME))) return;
    event.preventDefault(); event.stopPropagation(); rail.classList.add('is-drop-target');
  });
  rail.addEventListener('lm-dragover', event => {
    if (!buttons.has(event.mimeData.getData(TOOL_MIME))) return;
    event.preventDefault(); event.stopPropagation(); event.dropAction = 'move';
  });
  rail.addEventListener('lm-dragleave', event => {
    if (!event.mimeData.hasData(TOOL_MIME)) return;
    event.preventDefault(); event.stopPropagation(); rail.classList.remove('is-drop-target');
  });
  rail.addEventListener('lm-drop', event => {
    const id = event.mimeData.getData(TOOL_MIME);
    if (!buttons.has(id)) return;
    event.preventDefault(); event.stopPropagation(); event.dropAction = 'move';
    rail.classList.remove('is-drop-target');
    if (shell.isToolDocked(id)) shell.returnTool(id);
    hidden.delete(id);
    const button = buttons.get(id);
    const before = [...rail.querySelectorAll('.tab:not([hidden])')].find(el => el !== button && event.clientY < el.getBoundingClientRect().top + el.offsetHeight / 2);
    rail.insertBefore(button, before || null);
    order = [...rail.querySelectorAll('.tab')].map(el => el.dataset.tab);
    syncSelection(); button.click();
  });
  // Полоса инструментов — сортируемая: библиотека даёт ей курсор перетаскивания
  // и метку для CSS. Рейлы разделов внутри инструмента так не помечаются.
  rail.classList.add('is-sortable');
  // Навигация стрелками — общий контракт рейла; повторный вызов из панели
  // приложения только допишет машину обзора, а не заведёт второй обработчик.
  const detachKeyboardNav = attachRailKeyboardNav(rail, { selector: '.tab:not([hidden])' });
  window.addEventListener(toolsChangedEvent, syncSelection);
  window.addEventListener(areasChangedEvent, syncSelection);
  syncSelection();
  return { dispose() {
    detachKeyboardNav();
    window.removeEventListener(toolsChangedEvent, syncSelection);
    window.removeEventListener(areasChangedEvent, syncSelection);
  } };
}
