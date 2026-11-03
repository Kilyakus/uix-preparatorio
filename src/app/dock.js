import { h } from '@lumino/virtualdom';
import { Widget } from '@lumino/widgets';

/** Create a Lumino icon from a header SVG or a declarative SVG path. */
export function tabIcon(node, path = '') {
  return h.span({ className: 'b-tab-icon' }, {
    render(host) {
      const existing = node.querySelector('.b-header .b-editor-icon svg');
      if (existing) { host.replaceChildren(existing.cloneNode(true)); return; }
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('aria-hidden', 'true');
      for (const part of (path || 'M3 3h10v10H3z').split(' M')) {
        const element = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        element.setAttribute('d', part.startsWith('M') ? part : `M${part}`); svg.appendChild(element);
      }
      host.replaceChildren(svg);
    },
    unrender: host => host.replaceChildren(),
  });
}

/** A real movable DockPanel tab that preserves the supplied, live DOM node. */
export class AreaWidget extends Widget {
  constructor(node, { id, title, iconPath = '', closable = false }) {
    super({ node });
    this.id = id; this.title.label = title; this.title.caption = title;
    this.title.closable = closable; this.title.icon = tabIcon(node, iconPath);
    this.addClass('b-lumino-area'); node.dataset.luminoArea = id;
    const header = node.querySelector('.b-header');
    if (header) {
      header.classList.add('b-header-lumino');
      for (const button of header.querySelectorAll('.b-menu-btn')) {
        if (button.textContent.trim() !== title) continue;
        button.classList.add('b-menu-btn-iconized'); button.title = `Меню: ${title}`;
        button.setAttribute('aria-label', `Меню: ${title}`);button.replaceChildren();
        const caret = document.createElement('i'); caret.className = 'b-caret'; button.appendChild(caret);
      }
    }
  }
}
export function serializeConfig(node) {
  if (!node) return null;
  if (node.type === 'tab-area') return { type:'tab-area', widgets:node.widgets.map(widget=>typeof widget==='string'?widget:widget.id), currentIndex:node.currentIndex };
  return {type:'split-area',orientation:node.orientation,sizes:Array.from(node.sizes),children:node.children.map(serializeConfig).filter(Boolean)};
}
export function resolveConfig(node, panels) {
  if (!node) return null;
  const byId = new Map(Object.values(panels).map(widget=>[widget.id,widget]));
  if (node.type === 'tab-area') {
    const widgets=(node.widgets||[]).map(entry=>typeof entry==='string'?byId.get(entry):entry).filter(Boolean);
    return widgets.length?{type:'tab-area',widgets,currentIndex:Math.min(node.currentIndex||0,widgets.length-1)}:null;
  }
  // Keep child weights aligned with surviving children, even after a plugin was removed.
  const entries=(node.children||[]).map((child,i)=>({child:resolveConfig(child,panels),size:node.sizes?.[i]??1})).filter(x=>x.child);
  if (!entries.length) return null;if(entries.length===1)return entries[0].child;
  return {type:'split-area',orientation:node.orientation,sizes:entries.map(x=>x.size),children:entries.map(x=>x.child)};
}

/** Detach/return a live node without losing state, listeners, or form values. */
export function createDetachedWidget({ id, label, node: pane, iconPath = '', onReturn = () => {} }) {
  if (!pane?.parentNode) return null;
  const anchor=document.createComment(`tool:${id}`);pane.before(anchor);
  const node=document.createElement('section');node.className='b-area b-detached-tool';node.setAttribute('aria-label',label);
  const header=document.createElement('header');header.className='b-header';
  const title=document.createElement('span');title.className='b-header-title';title.textContent=label;
  const spacer=document.createElement('span');spacer.className='b-header-spacer';
  const back=document.createElement('button');back.className='b-icon-btn';back.type='button';
  const backIcon=document.createElementNS('http://www.w3.org/2000/svg','svg');backIcon.setAttribute('viewBox','0 0 16 16');backIcon.setAttribute('aria-hidden','true');
  const backPath=document.createElementNS('http://www.w3.org/2000/svg','path');backPath.setAttribute('d','M6 3 2.5 6.5 6 10 M3 6.5h5.5a4 4 0 0 1 0 8H7');backIcon.append(backPath);back.append(backIcon);
  back.title='Вернуть инструмент';back.setAttribute('aria-label',`Вернуть «${label}»`);back.addEventListener('click',onReturn);
  header.append(title,spacer,back);pane.classList.add('active','docked-tool-content');node.append(header,pane);
  const widget=new AreaWidget(node,{id:`dock-tool-${id}`,title:label,iconPath});
  return {widget,anchor,pane};
}
