import { Application } from '@lumino/application';
import { BoxEngine, BoxPanel, DockPanel } from '@lumino/widgets';
import { AreaWidget, createDetachedWidget, serializeConfig, resolveConfig } from './dock.js';
import { installVirtualDockSizing } from './virtual-layout.js';
import { initToolMenu } from './tool-menu.js';
import { renderControls, disposeCustomSelects } from './controls.js';

const el = (tag, cls, text) => {const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=String(text);return node};
const emit = name => window.dispatchEvent(new Event(name));

/**
 * Build a whole editor from application-owned data. `panels` and `tools` are
 * descriptors supplied by the application. Nodes and callbacks stay live.
 */
export async function createStudio(config) {
  const mount=typeof config.mount==='string'?document.querySelector(config.mount):config.mount;
  if(!mount)throw new Error('createStudio: mount element not found');
  if(!Array.isArray(config.panels)||!config.panels.length)throw new Error('createStudio: at least one panel is required');
  const namespace=config.id||'preparatorio';
  if(!/^[a-zA-Z][\w-]*$/.test(namespace))throw new Error('createStudio: id must contain letters, digits, underscore or hyphen');
  const tools=config.tools||[], panelsConfig=config.panels;
  const identifiers=[...panelsConfig.map(p=>p.id),...tools.map(t=>t.id)];
  if(identifiers.some(id=>!id||!/^[\w-]+$/.test(id))||new Set(identifiers).size!==identifiers.length)throw new Error('createStudio: panel and tool ids must be unique simple identifiers');
  if(tools.length&&!panelsConfig.some(p=>p.tools))throw new Error('createStudio: tools require a panel with tools: true');
  if(panelsConfig.filter(p=>p.tools).length>1)throw new Error('createStudio: only one tools host is supported');
  document.documentElement.dataset.shell='lumino';
  const events={collapse:`${namespace}:collapse-changed`,reset:`${namespace}:layout-reset`,tools:`${namespace}:tools-changed`,areas:`${namespace}:areas-changed`};
  const layoutKey=`${namespace}.layout.v1`,hiddenKey=`${namespace}.hidden-areas.v1`;
  let hidden=new Set();try {hidden=new Set(JSON.parse(localStorage.getItem(hiddenKey)||'[]'));}catch{}
  const persistHidden=()=>{try{localStorage.setItem(hiddenKey,JSON.stringify([...hidden]))}catch{}};
  const appRoot=el('div','b-app b-app-lumino');
  const top=el('header','b-topbar'),brand=el('div','b-brand'),brandName=el('span','b-brand-name',config.title||'Preparatorio');
  if(config.brand?.logo){const image=el('img','b-brand-logo');image.src=config.brand.logo;image.alt='';image.setAttribute('aria-hidden','true');brand.append(image)}
  brand.append(brandName);top.append(brand);
  const nav=el('nav','b-menubar');nav.setAttribute('aria-label','Главное меню');top.append(nav);
  const menu = (label) => {const wrap=el('div','b-menu'),button=el('button','b-menu-btn',label),pop=el('div','b-menu-pop');button.type='button';button.setAttribute('aria-expanded','false');button.setAttribute('aria-haspopup','true');button.addEventListener('click',event=>{event.stopPropagation();const open=!wrap.classList.contains('is-open');for(const m of nav.querySelectorAll('.b-menu')){m.classList.remove('is-open');m.firstElementChild.setAttribute('aria-expanded','false')}wrap.classList.toggle('is-open',open);button.setAttribute('aria-expanded',String(open))});wrap.append(button,pop);nav.append(wrap);return pop};
  let api;
  for(const def of config.menus||[]){const pop=menu(def.label);for(const action of def.items||[]){if(action.separator){pop.append(el('div','b-menu-sep'));continue}const button=el('button','b-menu-item',action.label);button.type='button';button.addEventListener('click',()=>{action.onClick?.(api);pop.parentElement.classList.remove('is-open');pop.previousElementSibling.setAttribute('aria-expanded','false')});pop.append(button)}}
  const toolPop=menu(config.toolsMenuLabel||'Инструменты');toolPop.classList.add('b-menu-pop-checks','tool-menu');
  const toolItems=el('div'),detailItems=el('div'),areaItems=el('div');
  const hint=el('div','tool-menu-hint','Перетащите инструмент в док или нажмите на значок, чтобы отделить его.');
  toolPop.append(el('div','tool-menu-title','Разделы'),toolItems,el('div','tool-menu-title','Инструменты'),detailItems,hint,el('div','b-menu-sep'),el('div','tool-menu-title','Области'),areaItems);
  const main=el('main','b-main b-main-lumino');main.id=`${namespace}-host`;appRoot.append(top,main);mount.replaceChildren(appRoot);
  const onDocumentClick=event=>{if(!event.target.closest('.b-menu'))for(const m of nav.querySelectorAll('.b-menu')){m.classList.remove('is-open');m.firstElementChild.setAttribute('aria-expanded','false')}};
  document.addEventListener('click',onDocumentClick);
  const dock=new DockPanel();dock.id=`${namespace}-dock`;dock.node.classList.add('b-lumino-dock');dock.tabsMovable=true;dock.allowDeselect=false;
  const box=new BoxPanel({direction:'top-to-bottom',spacing:1});box.node.classList.add('b-lumino-shell');box.addWidget(dock);BoxPanel.setStretch(dock,1);
  const app=new Application({shell:box});await app.start({hostID:main.id});
  const parking=el('div');parking.hidden=true;parking.setAttribute('aria-hidden','true');appRoot.append(parking);
  const panels={},definitions=new Map(),toolWidgets=new Map(),toolNodes=new Map(),anchors=new Map(),collapsible=[];
  let rail=null,empty=null,toolMenu=null,suppress=false;
  const context={get studio(){return api}};
  function buildPanel(def){
    if(panels[def.id])throw new Error(`Duplicate panel: ${def.id}`);
    const node=el('section','b-area');node.setAttribute('aria-label',def.title||def.id);if(def.className)node.classList.add(...def.className.split(/\s+/).filter(Boolean));
    const header=el('header','b-header');header.append(el('span','b-header-title',def.title||def.id));
    if(def.hint)header.append(el('span','b-header-hint',def.hint));
    header.append(el('span','b-header-spacer'));node.append(header);
    let body;
    if(def.tools){
      node.classList.add('b-properties');const wrap=el('div','panel'),workspace=el('div','property-workspace');rail=el('nav','tabs');rail.setAttribute('role','tablist');rail.setAttribute('aria-orientation','vertical');const scroll=el('div','property-scroll');empty=el('p','property-empty','Нет выбранного раздела');empty.hidden=true;scroll.append(empty);
      const railTools=tools.filter(t=>t.rail!==false);
      for(const [index,tool]of railTools.entries()){
        const btn=el('button',`tab${index===0?' active':''}`);btn.type='button';btn.dataset.tab=tool.id;btn.title=tool.label;btn.setAttribute('aria-label',tool.label);btn.setAttribute('aria-selected',String(index===0));btn.setAttribute('role','tab');if(tool.iconPath||!tool.glyph){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 16 16');svg.setAttribute('aria-hidden','true');const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',tool.iconPath||'M3 3h10v10H3z');svg.append(path);btn.append(svg)}else btn.append(el('span','tab-glyph',tool.glyph));
        const pane=el('section',`tab-content${index===0?' active':''}`);pane.id=`${namespace}-tool-${tool.id}`;pane.setAttribute('role','tabpanel');toolNodes.set(tool.id,pane);
        renderControls(pane,tool.controls,context);tool.render?.(pane,context);
        btn.addEventListener('click',()=>{if(toolWidgets.has(tool.id)){dock.activateWidget(toolWidgets.get(tool.id));return}for(const b of rail.querySelectorAll('.tab')){b.classList.remove('active');b.setAttribute('aria-selected','false')}for(const item of scroll.querySelectorAll('.tab-content'))item.classList.remove('active');btn.classList.add('active');btn.setAttribute('aria-selected','true');pane.classList.add('active');empty.hidden=true});
        rail.append(btn);scroll.append(pane);
      }
      // Non-rail tools are nested in the first tab and can also be detached.
      const host=scroll.querySelector('.tab-content')||scroll;
      for(const tool of tools.filter(t=>t.rail===false)){const pane=el('section');pane.id=`${namespace}-tool-${tool.id}`;toolNodes.set(tool.id,pane);renderControls(pane,tool.controls,context);tool.render?.(pane,context);host.append(pane)}
      workspace.append(rail,scroll);wrap.append(workspace);node.append(wrap);body=scroll;
    } else {body=el('div',def.collapsible?'prep-panel-body prep-collapse-body':'prep-panel-body');node.append(body);renderControls(body,def.controls,context);def.render?.(body,context)}
    if(def.collapsible){
      node.classList.add('prep-collapsible');const key=`${namespace}.collapsed.${def.id}`;let collapsed=!!def.collapsed;try{const saved=localStorage.getItem(key);if(saved!==null)collapsed=saved==='true'}catch{}
      const btn=el('button','b-icon-btn fit-collapse');btn.type='button';btn.innerHTML='<svg aria-hidden="true" viewBox="0 0 16 16"><path d="M3.3 5.7 8 10.3l4.7-4.6"></path></svg>';header.append(btn);
      const apply=()=>{node.classList.toggle('is-collapsed',collapsed);body.hidden=collapsed;btn.setAttribute('aria-expanded',String(!collapsed));btn.setAttribute('aria-label',collapsed?`Развернуть ${def.title}`:`Свернуть ${def.title}`);btn.title=btn.getAttribute('aria-label');emit(events.collapse)};btn.addEventListener('click',()=>{collapsed=!collapsed;try{localStorage.setItem(key,String(collapsed))}catch{}apply()});apply();
    }
    const widget=new AreaWidget(node,{id:def.id,title:def.title||def.id,iconPath:def.iconPath});panels[def.id]=widget;definitions.set(def.id,def);if(def.collapsible)collapsible.push(widget);
    return widget;
  }
  for(const def of panelsConfig)buildPanel(def);
  const baseIds=panelsConfig.map(p=>p.id),anchorId=config.anchor||baseIds[0];if(!panels[anchorId])throw new Error('createStudio: anchor must name a panel');
  function addToDock(def){const widget=panels[def.id];const ref=panels[def.ref||anchorId];if(!dock.isEmpty&&ref&&dock.contains(ref)&&ref!==widget)dock.addWidget(widget,{mode:def.mode||'split-right',ref});else if(!dock.isEmpty&&def.mode)dock.addWidget(widget,{mode:def.mode});else dock.addWidget(widget)}
  function createToolWidget(id){if(toolWidgets.has(id))return toolWidgets.get(id);const tool=tools.find(t=>t.id===id),pane=toolNodes.get(id);if(!tool||!pane)return null;const detached=createDetachedWidget({id,label:tool.label,node:pane,iconPath:tool.iconPath,onReturn:()=>returnTool(id)});if(!detached)return null;toolWidgets.set(id,detached.widget);anchors.set(id,detached.anchor);panels[detached.widget.id]=detached.widget;emit(events.tools);return detached.widget}
  function returnTool(id){const widget=toolWidgets.get(id),pane=toolNodes.get(id),anchor=anchors.get(id);if(!widget)return false;if(dock.contains(widget))widget.parent=null;if(anchor?.parentNode){pane.classList.remove('docked-tool-content');if(tools.find(t=>t.id===id)?.rail!==false)pane.classList.remove('active');anchor.replaceWith(pane)}anchors.delete(id);toolWidgets.delete(id);delete panels[widget.id];widget.dispose();rail?.querySelector(`[data-tab="${id}"]`)?.click();emit(events.tools);saveLayout();return true}
  function saveLayout(){if(suppress)return;try{localStorage.setItem(layoutKey,JSON.stringify({main:serializeConfig(dock.saveLayout().main)}))}catch{}}
  function restoreLayout(){try{const data=JSON.parse(localStorage.getItem(layoutKey)||'null');if(!data?.main)return false;const ids=[];const collect=n=>{if(n.type==='tab-area')ids.push(...n.widgets);else(n.children||[]).forEach(collect)};collect(data.main);if(new Set(ids).size!==ids.length||!ids.includes(anchorId))return false;for(const id of ids.filter(x=>x.startsWith('dock-tool-')))createToolWidget(id.slice(10));const resolved=resolveConfig(data.main,panels);if(!resolved)return false;suppress=true;dock.restoreLayout({main:resolved});for(const def of panelsConfig)if(!hidden.has(def.id)&&!dock.contains(panels[def.id]))addToDock(def);suppress=false;return true}catch{suppress=false;return false}}
  function setAreaVisible(id,visible){const widget=panels[id],def=definitions.get(id);if(!widget||!def||def.hideable===false||id===anchorId)return false;if(visible){hidden.delete(id);if(!dock.contains(widget)){addToDock(def);widget.show()}}else{hidden.add(id);if(dock.contains(widget))widget.parent=null;parking.append(widget.node)}persistHidden();saveLayout();emit(events.areas);return true}
  function applyInitialLayout(){if(config.layout){const resolved=resolveConfig(config.layout,panels);if(resolved)dock.restoreLayout({main:resolved})}}
  function resetLayout(){suppress=true;for(const id of [...toolWidgets.keys()])returnTool(id);for(const widget of Array.from(dock.widgets()))widget.parent=null;hidden.clear();persistHidden();for(const def of definitions.values()){panels[def.id].show();addToDock(def)}applyInitialLayout();suppress=false;saveLayout();emit(events.areas);emit(events.reset)}
  for(const def of panelsConfig)addToDock(def);applyInitialLayout();
  if(!restoreLayout())for(const id of hidden){const w=panels[id];if(w&&id!==anchorId){w.parent=null;parking.append(w.node)}}
  dock.layoutModified.connect(saveLayout);
  const sizing=installVirtualDockSizing(dock,collapsible,{adjust:BoxEngine.adjust,saveLayout,storageKey:`${namespace}.expanded-tab-heights.v1`,collapseEvent:events.collapse,resetEvent:events.reset});
  api={app,dock,panels,root:appRoot,saveLayout,restoreLayout,resetLayout,setAreaVisible,isAreaVisible:id=>!hidden.has(id),createToolWidget,returnTool,getToolNode:id=>toolNodes.get(id),isToolDocked:id=>toolWidgets.has(id),activateTool:id=>{const w=toolWidgets.get(id);if(w&&dock.contains(w))dock.activateWidget(w)},addPanel(def){if(!def.id||definitions.has(def.id)||toolNodes.has(def.id)||def.tools||def.collapsible)throw new Error('Invalid dynamic panel; declare tools and collapsible panels in initial config');const widget=buildPanel(def);addToDock(def);saveLayout();return widget},removePanel(id){if(id===anchorId||!definitions.has(id))return false;const widget=panels[id];if(dock.contains(widget))widget.parent=null;disposeCustomSelects(widget.node);widget.dispose();delete panels[id];definitions.delete(id);hidden.delete(id);persistHidden();saveLayout();return true},destroy(){for(const widget of Object.values(panels))disposeCustomSelects(widget.node);toolMenu?.dispose();sizing.dispose();dock.layoutModified.disconnect(saveLayout);document.removeEventListener('click',onDocumentClick);document.removeEventListener('contextmenu',app);document.removeEventListener('keydown',app,true);document.removeEventListener('keyup',app,true);window.removeEventListener('resize',app);box.dispose();parking.remove();mount.replaceChildren()}};
  if(!rail){rail=el('nav','tabs');empty=el('p','property-empty');}
  {const defs=tools.map(t=>({...t,rail:t.rail!==false}));toolMenu=initToolMenu(api,{tools:defs,areas:panelsConfig.filter(p=>p.id!==anchorId&&p.hideable!==false).map(p=>({id:p.id,label:p.title||p.id})),rail,menuItems:toolItems,detailItems,areaItems,empty,storageKey:`${namespace}.tools.v1`,viewportId:anchorId,toolsChangedEvent:events.tools,areasChangedEvent:events.areas});}
  saveLayout();return api;
}
