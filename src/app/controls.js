import { createCustomSelect, disposeCustomSelects } from './custom-select.js';

const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
};

/** Render declarative controls without evaluating HTML from data. */
export function renderControls(parent, controls = [], context = {}) {
  for (const control of controls) {
    if (control.type === 'heading') { parent.append(make('h3', 'prep-heading', control.label)); continue; }
    if (control.type === 'text') { parent.append(make('p', 'prep-note', control.text)); continue; }
    if (control.type === 'node') { if (control.node instanceof Node) parent.append(control.node); continue; }
    if (control.type === 'button') {
      const button = make('button','prep-button',control.label); button.type='button';
      button.addEventListener('click',event=>control.onClick?.(event,context));parent.append(button);continue;
    }
    if (control.type === 'range') {
      const row=make('label','range-row'); const caption=make('span','',control.label),output=make('output','',control.value??control.min??0);
      const input=make('input');input.type='range';for(const key of ['min','max','step','value'])if(control[key]!=null)input[key]=control[key];
      input.setAttribute('aria-label',control.label);input.addEventListener('input',()=>{output.textContent=input.value;control.onChange?.(Number(input.value),context)});
      row.append(caption,output,input);parent.append(row);continue;
    }
    if (control.type === 'custom-select') {
      const row = make('div','prep-field');
      row.append(make('span','prep-control-label',control.label));
      const select = createCustomSelect({ label:control.label, options:control.options, groups:control.groups, value:control.value,
        disabled:control.disabled, onChange:value=>control.onChange?.(value,context) });
      if (control.id) select.element.dataset.controlId = control.id;
      row.append(select.element);parent.append(row);continue;
    }
    if (!['input','checkbox','select'].includes(control.type)) throw new Error(`Unsupported control type: ${control.type}`);
    const row=make('label',control.type==='checkbox'?'b-check-item':'prep-field');
    const caption=make('span','',control.label);let input;
    if(control.type==='select') {
      input=make('select');for(const option of control.options||[]){const entry=make('option','',typeof option==='string'?option:option.label);entry.value=typeof option==='string'?option:option.value;input.append(entry)}
    }else{input=make('input');input.type=control.type==='checkbox'?'checkbox':(control.inputType||'text')}
    if(control.type==='checkbox')input.checked=!!control.value;else if(control.value!=null)input.value=String(control.value);
    if(control.placeholder)input.placeholder=control.placeholder;
    input.addEventListener('change',()=>control.onChange?.(control.type==='checkbox'?input.checked:input.value,context));
    if(control.type==='checkbox')row.append(input,caption);else row.append(caption,input);parent.append(row);
  }
  return parent;
}

export { disposeCustomSelects };
