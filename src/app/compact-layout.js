/**
 * Компактные панели занимают высоту своего содержимого, только когда стоят
 * отдельной строкой в вертикальном сплите. В группе вкладок или в отдельной
 * колонке размер не ограничивается, чтобы соседние панели не пострадали.
 *
 * DockLayout Lumino учитывает min-height виджета, но намеренно не переносит
 * max-height на сплит. Поэтому maxSize задаём у BoxSizer этой строки. Работа с
 * внутренним деревом изолирована здесь: при изменении раскладки ограничения
 * сначала снимаются со всех затронутых sizer, затем назначаются заново.
 */
export function installCompactDockSizing(dock, areas) {
  const marked = new Set();
  let queued = false;
  const profiles = new Map(areas.map(area => [area.widget, area]));

  function sync() {
    queued = false;
    const root = dock.layout?._root;
    if (!root) return;
    let changed = false;
    for (const sizer of marked) {
      if (sizer.maxSize !== Infinity) { sizer.maxSize = Infinity; changed = true; }
    }
    marked.clear();
    const stacked = new Set();
    function visit(node) {
      if (!Array.isArray(node.children) || !Array.isArray(node.sizers)) return;
      node.children.forEach((child, index) => {
        if (node.orientation === 'vertical' && child.tabBar?.titles?.length === 1) {
          const widget = child.tabBar.titles[0].owner;
          const area = profiles.get(widget);
          if (area) {
            const content = widget.node.querySelector(area.content);
            const body = content?.parentElement;
            const header = widget.node.querySelector(':scope > .b-header');
            const tabBar = child.tabBar.node;
            // Не измеряем скрытую/отсоединённую панель: после её возврата
            // layoutModified вызовет новый пересчёт.
            if (content && body && content.getClientRects().length) {
              const style = getComputedStyle(body);
              const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
              // Учитываем видимую высоту, скролл-контент, внутренние отступы
              // и дробные пиксели, иначе появляется ложная полоса прокрутки.
              const contentHeight = Math.max(content.scrollHeight, content.getBoundingClientRect?.().height || 0);
              const border = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
              const panelHeight = Math.ceil((header?.getBoundingClientRect().height || 0) + padding + border + contentHeight) + 2;
              const tabHeight = Math.ceil(tabBar.getBoundingClientRect().height || 22);
              const min = `${panelHeight}px`;
              if (widget.node.style.minHeight !== min) { widget.node.style.minHeight = min; changed = true; }
              const sizer = node.sizers[index];
              sizer.maxSize = panelHeight + tabHeight;
              marked.add(sizer); stacked.add(widget);
            }
          }
        }
        visit(child);
      });
    }
    visit(root);
    for (const { widget } of areas) {
      if (!stacked.has(widget) && widget.node.style.minHeight) {
        widget.node.style.minHeight = '';
        changed = true;
      }
    }
    // Повторная подгонка устанавливает minSize из CSS и применяет maxSize.
    // Ограниченный sizer обновляем и тогда, когда конфиг изменился, но его
    // вычисленная высота осталась прежней.
    if (changed || marked.size) dock.fit();
  }
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(sync);
  }
  dock.layoutModified.connect(schedule);
  const observer = new ResizeObserver(schedule);
  for (const { widget, content } of areas) {
    const node = widget.node.querySelector(content);
    if (node) observer.observe(node);
  }
  schedule();
  return { sync: schedule, dispose() { observer.disconnect(); dock.layoutModified.disconnect(schedule); } };
}
