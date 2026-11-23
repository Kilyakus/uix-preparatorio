import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeSelectGroups} from '../src/app/custom-select.js';

test('flat and grouped choices are normalized without parsing markup',()=>{
 const list=normalizeSelectGroups({options:['first',{value:42,label:'<b>Title</b>',description:'<img onerror=alert(1)>',disabled:true}]});
 assert.deepEqual(list,[{label:'',options:[{value:'first',label:'first',description:'',disabled:false},{value:'42',label:'<b>Title</b>',description:'<img onerror=alert(1)>',disabled:true}]}]);
 const grouped=normalizeSelectGroups({groups:[{label:'A',options:[{value:'one',label:'One',description:'Description'}]},{label:'B',options:['two']}]});
 assert.equal(grouped[0].options[0].description,'Description');assert.equal(grouped[1].options[0].value,'two');
});
test('invalid or duplicate options fail clearly across groups',()=>{
 assert.throws(()=>normalizeSelectGroups({options:[{label:'missing'}]}),/requires a value/);
 assert.throws(()=>normalizeSelectGroups({groups:[{label:'A',options:['same']},{label:'B',options:['same']}]}),/duplicate/);
 assert.throws(()=>normalizeSelectGroups({groups:[{label:'A'}]}),/options array/);
});

test('image icons, actions, updates and cleanup belong to the reusable select',async()=>{
 const {JSDOM}=await import('jsdom');const dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost/'});
 const {document,Node,Event}=dom.window;const saved={document:globalThis.document,window:globalThis.window,Node:globalThis.Node};Object.assign(globalThis,{document,window:dom.window,Node});
 dom.window.HTMLElement.prototype.scrollIntoView=function(){};
 try{
  const {createCustomSelect}=await import('../src/app/custom-select.js');let action=null,chosen=null,footer=0;
  const select=createCustomSelect({label:'Модели',value:'a',options:[{value:'a',label:'A',icon:'data:image/png;base64,AAAA'},{value:'b',label:'B',icon:'https://example.org/icon.png'}],onChange:v=>chosen=v,optionActions:o=>o.value==='b'?[{label:'Rename',text:'✎',onSelect:v=>action=v.value}]:[],renderFooter:node=>{footer++;node.textContent='Import'}});
  document.body.append(select.element);assert.equal(select.trigger.querySelector('.prep-select-icon img').getAttribute('src'),'data:image/png;base64,AAAA');select.open();
  assert.equal(select.menu.querySelectorAll('.prep-select-option-with-icon').length,2);assert.equal(select.menu.querySelector('.prep-select-footer').textContent,'Import');
  select.menu.querySelector('[data-value=b]').focus();document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.equal(document.activeElement.getAttribute('aria-label'),'Rename');
  select.menu.querySelector('.prep-select-option-action').click();assert.equal(action,'b');assert.equal(select.trigger.getAttribute('aria-expanded'),'false');
  select.setValue('b');assert.equal(select.trigger.querySelector('.prep-select-icon img').src,'https://example.org/icon.png');select.setOptions([{value:'b',label:'Updated'}]);assert.equal(select.trigger.querySelector('.prep-select-icon'),null);
  select.open();select.menu.querySelector('[data-value=b]').click();assert.equal(chosen,null);assert(footer>=2);select.destroy();assert.equal(select.menu.isConnected,false);assert.equal(select.element.isConnected,false);
 }finally{dom.window.close();Object.assign(globalThis,saved)}
});
