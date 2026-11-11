/** Preparatorio: configurable, framework-independent docked studio shell. */
export { createStudio } from './studio.js';
export { renderControls } from './controls.js';
export { AreaWidget, createDetachedWidget, tabIcon, serializeConfig, resolveConfig } from './dock.js';
export { installVirtualDockSizing } from './virtual-layout.js';
export { installCompactDockSizing } from './compact-layout.js';
export { initToolMenu } from './tool-menu.js';
export { createCustomSelect, getCustomSelect, disposeCustomSelects } from './custom-select.js';
export { attachRailKeyboardNav, createRailOverview, rerenderRail } from './rail-overview.js';
export { attachRailPanel, renderRail } from './rail.js';
export * from './range-fill.js';
export { initCollapsibleSections } from './collapsible-sections.js';
