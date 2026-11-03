// Expanded tab sizes are independent of temporarily collapsed dock layouts.

/**
 * Manage all collapsible areas in one pass. This is important when two such
 * areas share a tab group: only the selected tab may constrain the split, and
 * each tab's expanded height must survive moving, tabbing and collapsing.
 */
export function installVirtualDockSizing(dock, widgetOrWidgets, { saveLayout = () => {}, adjust, storageKey = 'preparatorio.expanded-tab-heights.v1', collapseEvent = 'preparatorio:collapse-changed', resetEvent = 'preparatorio:layout-reset', legacyHeight = null } = {}) {
  const widgets = (Array.isArray(widgetOrWidgets) ? widgetOrWidgets : [widgetOrWidgets]).filter(Boolean);
  const managed = new Set(widgets);
  const sizes = new Map();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    for (const [key, value] of Object.entries(saved)) if (Number.isFinite(value) && value >= 90) sizes.set(key, value);
  } catch {}
  // Preserve the separate height setting used by the previous bottom console.
  const initialPreferred = new Set();
  try {
    const oldHeight = legacyHeight ? Number(localStorage.getItem(legacyHeight.key)) : 0;
    if (legacyHeight && !sizes.has(legacyHeight.widgetId) && oldHeight >= 90) {
      sizes.set(legacyHeight.widgetId, oldHeight);
      initialPreferred.add(legacyHeight.widgetId);
    }
  } catch {}
  let groups = new WeakMap();
  const constrained = new Set();
  let queued = false;
  let disposed = false;
  let saveTimer;

  const persist = () => { try { localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(sizes))); } catch {} };
  const remember = (active, height) => {
    if (!active?.id || !Number.isFinite(height) || height < 90) return;
    sizes.set(active.id, height); persist();
  };
  function restoreSize(split, index, wanted) {
    if (!Number.isFinite(wanted) || wanted < 90 || split.normalized) return;
    const sizer = split.sizers[index];
    split.holdSizes();
    const delta = wanted - sizer.size;
    if (index > 0) adjust(split.sizers, index - 1, -delta);
    else if (split.sizers.length > 1) adjust(split.sizers, index, delta);
  }
  function findArea(root, widget) {
    if (!root) return null;
    if (root.tabBar?.titles?.some(t => t.owner === widget)) return root;
    for (const child of root.children || []) {
      const found = findArea(child, widget);
      if (found) return found;
    }
    return null;
  }
  function sync() {
    queued = false;
    if (disposed) return;
    const areas = new Set(widgets.map(widget => findArea(dock.layout?._root, widget)).filter(Boolean));
    const activeSizers = new Set();
    for (const area of areas) {
      const split = area.parent;
      const index = split?.orientation === 'vertical' ? split.children.indexOf(area) : -1;
      const sizer = index >= 0 ? split.sizers[index] : null;
      const current = area.tabBar?.currentTitle?.owner;
      const members = widgets.filter(widget => area.tabBar?.titles?.some(t => t.owner === widget));
      const collapsed = managed.has(current) && current.node.classList.contains('is-collapsed');
      let group = groups.get(area);
      if (!group) { group = { active: current, limited: false, lastOpen: undefined }; groups.set(area, group); }
      for (const widget of members) if (widget !== current || !collapsed) widget.node.style.minHeight = '';
      if (!sizer || !current) continue;
      activeSizers.add(sizer);
      const wasLimited = group.limited;
      const previous = group.active;
      if (!wasLimited && previous && (previous !== current || collapsed)) {
        if (!initialPreferred.has(previous.id)) remember(previous, sizer.size);
        if (sizer.size >= 90) group.lastOpen = sizer.size;
      }
      if (collapsed) {
        const header = current.node.querySelector(':scope > .b-header');
        const panelHeight = Math.ceil(header?.getBoundingClientRect().height || 26);
        const tabHeight = Math.ceil(area.tabBar.node.getBoundingClientRect().height || 22);
        current.node.style.minHeight = `${panelHeight}px`;
        sizer.maxSize = panelHeight + tabHeight;
        constrained.add(sizer);
        group.limited = true;
      } else {
        if (constrained.has(sizer)) { sizer.maxSize = Infinity; constrained.delete(sizer); }
        if (wasLimited && split.normalized) { dock.fit(); schedule(); continue; }
        if (wasLimited) {
          const wanted = sizes.get(current.id) ?? group.lastOpen ?? 260;
          restoreSize(split, index, wanted);
          initialPreferred.delete(current.id);
        } else if (initialPreferred.has(current.id)) {
          if (split.normalized) { dock.fit(); schedule(); continue; }
          restoreSize(split, index, sizes.get(current.id));
          initialPreferred.delete(current.id);
        } else if (previous !== current && sizes.has(current.id)) {
          restoreSize(split, index, sizes.get(current.id));
        } else if (previous === current && sizer.size >= 90) {
          remember(current, sizer.size);
          group.lastOpen = sizer.size;
        }
        group.limited = false;
      }
      group.active = current;
    }
    for (const sizer of constrained) if (!activeSizers.has(sizer)) { sizer.maxSize = Infinity; constrained.delete(sizer); }
    for (const widget of widgets) if (!findArea(dock.layout?._root, widget)) widget.node.style.minHeight = '';
    dock.fit();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveLayout, 60);
  }
  function schedule() {
    if (queued || disposed) return;
    queued = true;
    requestAnimationFrame(sync);
  }
  const reset = () => { sizes.clear(); initialPreferred.clear(); persist(); groups = new WeakMap(); schedule(); };
  dock.layoutModified.connect(schedule);
  window.addEventListener(collapseEvent, schedule);
  window.addEventListener(resetEvent, reset);
  schedule();
  return { sync: schedule, dispose() {
    disposed = true; clearTimeout(saveTimer); dock.layoutModified.disconnect(schedule);
    window.removeEventListener(collapseEvent, schedule);
    window.removeEventListener(resetEvent, reset);
    for (const sizer of constrained) sizer.maxSize = Infinity;
    for (const widget of widgets) widget.node.style.minHeight = '';
  } };
}
