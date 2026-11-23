let nextId = 0;
let activeSelect = null;
const controllers = new WeakMap();
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
};

/** Normalize application-owned data without treating labels as HTML. */
export function normalizeSelectGroups({ options = [], groups } = {}) {
  if (groups != null && !Array.isArray(groups)) throw new TypeError('groups must be an array');
  const input = groups ?? [{ label: '', options }];
  const seen = new Set();
  return input.map(group => {
    if (!group || !Array.isArray(group.options)) throw new TypeError('each group must contain an options array');
    return {
      label: group.label == null ? '' : String(group.label),
      options: group.options.map(option => {
        const item = typeof option === 'string' ? { value: option, label: option } : option;
        if (!item || item.value == null) throw new TypeError('each option requires a value');
        const value = String(item.value);
        if (seen.has(value)) throw new TypeError(`duplicate option value: ${value}`);
        seen.add(value);
        return { value, label: String(item.label ?? value), description: String(item.description ?? ''), disabled: !!item.disabled, ...(item.icon ? {icon: String(item.icon)} : {}) };
      }),
    };
  });
}

/**
 * A custom, keyboard-operable select with optional descriptions and groups.
 * The popup is mounted in document.body so dock clipping cannot hide it.
 * Caller owns the returned controller and must call destroy when unmounting.
 */
export function createCustomSelect({ label, options, groups, value, onChange = () => {}, disabled = false, optionActions = null, renderFooter = null } = {}) {
  if (!label) throw new TypeError('createCustomSelect requires an accessible label');
  let normalized = normalizeSelectGroups({ options, groups });
  const all = () => normalized.flatMap(group => group.options);
  const find = candidate => candidate == null ? undefined : all().find(item => item.value === String(candidate));
  const firstEnabled = () => all().find(item => !item.disabled);
  let selected = (find(value) && !find(value).disabled ? find(value).value : firstEnabled()?.value) ?? null;
  let isDisabled = !!disabled, destroyed = false;
  const element = make('div', 'prep-select'); element.dataset.prepSelect = '';
  const trigger = make('button', 'prep-select-trigger'); trigger.type = 'button';
  trigger.setAttribute('role', 'combobox'); trigger.setAttribute('aria-label', label);
  trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
  const valueNode = make('span', 'prep-select-value');
  const caret = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  caret.setAttribute('viewBox','0 0 16 16');caret.setAttribute('aria-hidden','true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');path.setAttribute('d','M3.5 6 8 10.5 12.5 6');caret.append(path);trigger.append(valueNode, caret);
  const description = make('p', 'prep-select-description');
  const menu = make('div', 'prep-select-menu'); menu.id = `preparatorio-select-${++nextId}`;
  menu.setAttribute('role', 'listbox');menu.setAttribute('aria-label', label);
  trigger.setAttribute('aria-controls',menu.id);
  element.append(trigger, description);
  function iconFor(option) {
    if (!option?.icon) return null;
    const frame=make('span','prep-select-icon');frame.setAttribute('aria-hidden','true');
    const image=make('img');image.alt='';image.src=option.icon;frame.append(image);return frame;
  }
  function renderValue() {
    const option = selected == null ? null : find(selected);
    trigger.querySelector(':scope > .prep-select-icon')?.remove();const icon=iconFor(option);trigger.classList.toggle('prep-select-trigger-with-icon',!!icon);if(icon)trigger.prepend(icon);
    valueNode.textContent = option?.label ?? 'Нет вариантов';
    description.textContent = option?.description ?? '';
    description.hidden = !option?.description;
    trigger.disabled = isDisabled || !firstEnabled();
  }
  function renderMenu() {
    const previousFocus = document.activeElement?.dataset?.value;
    menu.replaceChildren();
    for (const group of normalized) {
      if (group.label) menu.append(make('div', 'prep-select-group', group.label));
      for (const option of group.options) {
        const button = make('button', 'prep-select-option'); button.type = 'button';button.tabIndex = -1;
        button.dataset.value = option.value;button.setAttribute('role','option');
        button.setAttribute('aria-selected',String(option.value === selected));button.disabled = option.disabled;
        const title = make('span', 'prep-select-option-title', option.label);
        const detail = make('span', 'prep-select-option-description', option.description);
        const check = document.createElementNS('http://www.w3.org/2000/svg','svg');
        check.classList.add('prep-select-check');check.setAttribute('viewBox','0 0 16 16');check.setAttribute('aria-hidden','true');
        const tick=document.createElementNS('http://www.w3.org/2000/svg','path');tick.setAttribute('d','M3 8.2 6.6 11.4 13 4.6');check.append(tick);
        const icon=iconFor(option);if(icon){button.classList.add('prep-select-option-with-icon');button.append(icon)}
        button.append(title,detail,check);
        button.addEventListener('click', () => { const changed = selected !== option.value;setValue(option.value);close({restoreFocus:true});if (changed) onChange(option.value, { ...option }); });
        const actions=optionActions?.({...option})??[];
        if(!Array.isArray(actions))throw new TypeError('optionActions must return an array');
        if(actions.length){
          const row=make('div','prep-select-option-row');row.append(button);
          for(const action of actions){
            if(!action?.label||typeof action.onSelect!=='function')throw new TypeError('option action requires label and onSelect');
            const actionButton=make('button','prep-select-option-action');actionButton.type='button';actionButton.setAttribute('aria-label',action.label);actionButton.title=action.label;
            if(action.icon){const actionIcon=make('img');actionIcon.alt='';actionIcon.src=String(action.icon);actionButton.append(actionIcon);}else actionButton.textContent=action.text??'⋯';
            for(const [key,val] of Object.entries(action.dataset??{}))if(/^[A-Za-z][A-Za-z0-9]*$/.test(key))actionButton.dataset[key]=String(val);
            actionButton.addEventListener('click',()=>{close({restoreFocus:true});action.onSelect({...option});});row.append(actionButton);
          }
          menu.append(row);
        }else menu.append(button);
      }
    }
    if(renderFooter){const footer=make('div','prep-select-footer');renderFooter(footer,{close:()=>close({restoreFocus:true})});menu.append(footer);}
    if (previousFocus != null) {
      const existing = [...menu.querySelectorAll('[role="option"]')].find(node => node.dataset.value === previousFocus && !node.disabled);
      existing?.focus({ preventScroll:true });
    }
  }
  function place() {
    const rect=trigger.getBoundingClientRect(), margin=10;
    const width=Math.min(Math.max(rect.width,236),Math.max(0,window.innerWidth-margin*2));
    menu.style.width=`${width}px`;menu.style.maxHeight=`${Math.max(0,Math.min(368,window.innerHeight-margin*2))}px`;
    menu.style.left=`${Math.max(margin,Math.min(rect.left,window.innerWidth-width-margin))}px`;menu.style.top='0px';
    const natural=menu.getBoundingClientRect().height, below=Math.max(0,window.innerHeight-rect.bottom-margin-6), above=Math.max(0,rect.top-margin-6);
    const upwards=below<natural && above>below, available=upwards?above:below;
    menu.style.maxHeight=`${Math.min(368,available)}px`;
    const height=menu.getBoundingClientRect().height;
    menu.style.top=`${upwards ? Math.max(margin,rect.top-6-height) : Math.min(window.innerHeight-margin-height,rect.bottom+6)}px`;
  }
  function onOutside(event) { if (!menu.contains(event.target) && !trigger.contains(event.target)) close(); }
  function onResize() { close(); }
  function onScroll(event) {
    if (event.target === menu || (event.target instanceof Node && menu.contains(event.target))) return;
    if (!trigger.isConnected || !trigger.getClientRects().length) close(); else place();
  }
  function open() {
    if (destroyed || trigger.disabled || activeSelect === api) return false;
    activeSelect?.close();activeSelect=api;renderMenu();document.body.append(menu);
    trigger.setAttribute('aria-expanded','true');place();
    document.addEventListener('pointerdown',onOutside,true);window.addEventListener('resize',onResize);window.addEventListener('scroll',onScroll,true);
    const current=menu.querySelector('[aria-selected="true"]:not(:disabled)') ?? menu.querySelector('[role="option"]:not(:disabled)');
    current?.focus({preventScroll:true});current?.scrollIntoView({block:'nearest'});return true;
  }
  function close({ restoreFocus = false } = {}) {
    if (activeSelect !== api) return;
    document.removeEventListener('pointerdown',onOutside,true);window.removeEventListener('resize',onResize);window.removeEventListener('scroll',onScroll,true);
    menu.remove();trigger.setAttribute('aria-expanded','false');activeSelect=null;
    if (restoreFocus && trigger.isConnected && !trigger.disabled) trigger.focus({preventScroll:true});
  }
  function setValue(next, { notify = false } = {}) {
    const option=find(next);if (!option || option.disabled) return false;
    const changed=selected!==option.value;selected=option.value;renderValue();
    if(activeSelect===api)renderMenu();
    if(notify && changed)onChange(option.value,{...option});return true;
  }
  function setOptions(next) {
    const updated=normalizeSelectGroups(Array.isArray(next)?{options:next}:next);
    normalized=updated;
    if (!find(selected) || find(selected).disabled) selected=firstEnabled()?.value ?? null;
    renderValue();if(activeSelect===api){if(trigger.disabled)close();else{renderMenu();place();}}
  }
  trigger.addEventListener('click',()=>activeSelect===api?close():open());
  trigger.addEventListener('keydown',event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();open()}else if(event.key==='Escape')close();});
  menu.addEventListener('keydown',event=>{
    const choices=[...menu.querySelectorAll('[role="option"]:not(:disabled)')],index=choices.indexOf(document.activeElement);
    if(event.key==='Escape'){event.preventDefault();close({restoreFocus:true});return;}
    if(event.key==='Tab'){const row=document.activeElement?.closest?.('.prep-select-option-row');const actions=row?[...row.querySelectorAll('.prep-select-option-action:not(:disabled)')]:[];const idx=actions.indexOf(document.activeElement);if(!event.shiftKey&&document.activeElement?.matches?.('[role=option]')&&actions.length){event.preventDefault();actions[0].focus();return;}if(!event.shiftKey&&idx>=0&&idx<actions.length-1){event.preventDefault();actions[idx+1].focus();return;}close();return;}
    let next;if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const step=event.key==='ArrowDown'?1:-1;next=choices[index<0?(step>0?0:choices.length-1):(index+step+choices.length)%choices.length];}
    else if(event.key==='Home'||event.key==='End'){event.preventDefault();next=event.key==='Home'?choices[0]:choices.at(-1);}
    next?.focus({preventScroll:true});next?.scrollIntoView({block:'nearest'});
  });
  const api={element,trigger,description,menu,open,close,setValue,setOptions,
    get value(){return selected},get selectedOption(){return selected==null?null:{...find(selected)}},
    setDisabled(next){isDisabled=!!next;renderValue();if(isDisabled)close()},
    destroy(){if(destroyed)return;close();destroyed=true;controllers.delete(element);element.remove();}};
  controllers.set(element,api);renderValue();return api;
}

export function getCustomSelect(element) { return controllers.get(element) ?? null; }
/** Dispose every select under a container, including the container itself. */
export function disposeCustomSelects(container) {
  if (!container) return;
  const nodes=[...(container.matches?.('[data-prep-select]')?[container]:[]),...container.querySelectorAll('[data-prep-select]')];
  for (const node of nodes) controllers.get(node)?.destroy();
}
