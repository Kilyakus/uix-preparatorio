import test from 'node:test';
import assert from 'node:assert/strict';
import { installVirtualDockSizing } from '../src/app/virtual-layout.js';

test('collapsed tab yields space and each expanded tab recovers its own height', () => {
  const previous = { window:globalThis.window, localStorage:globalThis.localStorage, requestAnimationFrame:globalThis.requestAnimationFrame };
  const events = new EventTarget(), storage = new Map();
  globalThis.window = events;
  globalThis.localStorage = { getItem:k=>storage.get(k), setItem:(k,v)=>storage.set(k,v) };
  globalThis.requestAnimationFrame = fn=>fn();
  let collapsed = false;
  const fit = { id:'fit', node:{style:{}, classList:{contains:()=>collapsed}, querySelector:()=>({getBoundingClientRect:()=>({height:26})})} };
  const other = {id:'other'};
  const area = {tabBar:{titles:[{owner:fit},{owner:other}], currentTitle:{owner:fit}, node:{getBoundingClientRect:()=>({height:22})}}};
  const neighbour = {tabBar:{titles:[]}};
  const a = {minSize:22,maxSize:Infinity}, b = {minSize:22,maxSize:Infinity};
  a.size = a.sizeHint = 400; b.size = b.sizeHint = 200;
  const split = { orientation:'vertical', normalized:false, children:[neighbour,area], sizers:[a,b], holdSizes(){for (const s of this.sizers) s.sizeHint=s.size;} };
  area.parent=split; neighbour.parent=split;
  let callback;
  const adjust = (sizers, index, delta) => { sizers[index].sizeHint += delta; sizers[index+1].sizeHint -= delta; };
  const dock = { layout:{_root:split}, layoutModified:{connect(fn){callback=fn},disconnect(){}}, fit(){
    b.minSize = collapsed && area.tabBar.currentTitle.owner === fit ? 48 : 22;
    b.size = Math.max(b.minSize, Math.min(b.sizeHint, b.maxSize)); a.size = 600-b.size;
  } };
  try {
    const virtual = installVirtualDockSizing(dock,fit,{adjust});
    collapsed=true; events.dispatchEvent(new Event('preparatorio:collapse-changed'));
    assert.equal(b.size,48); assert.equal(b.maxSize,48);
    area.tabBar.currentTitle={owner:other}; callback();
    assert.equal(b.maxSize,Infinity); assert.equal(b.size,200);
    split.holdSizes(); adjust(split.sizers,0,-100); dock.fit(); callback();
    assert.equal(b.size,300);
    area.tabBar.currentTitle={owner:fit}; callback(); assert.equal(b.size,48);
    area.tabBar.currentTitle={owner:other}; callback(); assert.equal(b.size,300);
    area.tabBar.currentTitle={owner:fit}; callback(); assert.equal(b.size,48);
    collapsed=false; events.dispatchEvent(new Event('preparatorio:collapse-changed'));
    assert.equal(b.size,200);
    virtual.dispose();
  } finally {
    for (const [key,value] of Object.entries(previous)) value === undefined ? delete globalThis[key] : globalThis[key]=value;
  }
});

test('fit and console share one controller without overwriting each other or foreign tabs', () => {
  const previous={window:globalThis.window,localStorage:globalThis.localStorage,requestAnimationFrame:globalThis.requestAnimationFrame};
  const events=new EventTarget(),storage=new Map();globalThis.window=events;
  globalThis.localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};globalThis.requestAnimationFrame=fn=>fn();
  function panel(id){const obj={id,collapsed:false};obj.node={style:{},classList:{contains:()=>obj.collapsed},querySelector:()=>({getBoundingClientRect:()=>({height:26})})};return obj}
  const fit=panel('fit'),consolePanel=panel('applicationConsole'),other=panel('other');
  const area={tabBar:{titles:[{owner:fit},{owner:consolePanel},{owner:other}],currentTitle:{owner:fit},node:{getBoundingClientRect:()=>({height:22})}}};
  const neighbour={tabBar:{titles:[]}},a={minSize:22,maxSize:Infinity,size:390,sizeHint:390},b={minSize:22,maxSize:Infinity,size:210,sizeHint:210};
  const split={orientation:'vertical',normalized:false,children:[neighbour,area],sizers:[a,b],holdSizes(){for(const x of this.sizers)x.sizeHint=x.size}};area.parent=split;neighbour.parent=split;
  let callback;const adjust=(s,i,d)=>{s[i].sizeHint+=d;s[i+1].sizeHint-=d};
  const dock={layout:{_root:split},layoutModified:{connect(fn){callback=fn},disconnect(){}},fit(){b.size=Math.max(22,Math.min(b.sizeHint,b.maxSize));a.size=600-b.size}};
  try{
    const controller=installVirtualDockSizing(dock,[fit,consolePanel],{adjust});
    fit.collapsed=true;events.dispatchEvent(new Event('preparatorio:collapse-changed'));assert.equal(b.size,48);
    area.tabBar.currentTitle={owner:consolePanel};callback();assert.equal(b.size,210);assert.equal(b.maxSize,Infinity);
    split.holdSizes();adjust(split.sizers,0,-90);dock.fit();callback();assert.equal(b.size,300);
    consolePanel.collapsed=true;events.dispatchEvent(new Event('preparatorio:collapse-changed'));assert.equal(b.size,48);
    area.tabBar.currentTitle={owner:fit};callback();assert.equal(b.size,48);
    fit.collapsed=false;events.dispatchEvent(new Event('preparatorio:collapse-changed'));assert.equal(b.size,210);
    area.tabBar.currentTitle={owner:consolePanel};callback();assert.equal(b.size,48);
    consolePanel.collapsed=false;events.dispatchEvent(new Event('preparatorio:collapse-changed'));assert.equal(b.size,300);
    area.tabBar.currentTitle={owner:other};callback();assert.equal(b.maxSize,Infinity);
    split.holdSizes();adjust(split.sizers,0,-50);dock.fit();callback();assert.equal(b.size,350);
    consolePanel.collapsed=true;area.tabBar.currentTitle={owner:consolePanel};callback();assert.equal(b.size,48);
    area.tabBar.currentTitle={owner:other};callback();assert.equal(b.size,350);
    area.tabBar.currentTitle={owner:fit};callback();assert.equal(b.maxSize,Infinity);
    fit.collapsed=true;events.dispatchEvent(new Event('preparatorio:collapse-changed'));assert.equal(b.size,48);
    fit.collapsed=false;events.dispatchEvent(new Event('preparatorio:collapse-changed'));assert.equal(b.size,210);
    controller.dispose();
  }finally{for(const [k,v]of Object.entries(previous))v===undefined?delete globalThis[k]:globalThis[k]=v}
});

test('separate fit and console dock areas collapse and reopen independently', () => {
  const previous={window:globalThis.window,localStorage:globalThis.localStorage,requestAnimationFrame:globalThis.requestAnimationFrame};
  const events=new EventTarget(),storage=new Map();globalThis.window=events;globalThis.localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};globalThis.requestAnimationFrame=fn=>fn();
  const panel=id=>{const x={id,collapsed:false};x.node={style:{},classList:{contains:()=>x.collapsed},querySelector:()=>({getBoundingClientRect:()=>({height:26})})};return x};
  const fit=panel('fit'),con=panel('applicationConsole');
  const makeSplit=(widget,height)=>{const area={tabBar:{titles:[{owner:widget}],currentTitle:{owner:widget},node:{getBoundingClientRect:()=>({height:22})}}},n={tabBar:{titles:[]}},a={size:600-height,sizeHint:600-height,minSize:22,maxSize:Infinity},b={size:height,sizeHint:height,minSize:22,maxSize:Infinity};const split={orientation:'vertical',children:[n,area],sizers:[a,b],normalized:false,holdSizes(){for(const x of this.sizers)x.sizeHint=x.size}};area.parent=split;n.parent=split;return {split,area,b}};
  const f=makeSplit(fit,210),c=makeSplit(con,290);const root={children:[f.split,c.split]};let callback;
  const dock={layout:{_root:root},layoutModified:{connect(fn){callback=fn},disconnect(){}},fit(){for(const v of [f,c])v.b.size=Math.min(v.b.sizeHint,v.b.maxSize)}};
  const adjust=(s,i,d)=>{s[i].sizeHint+=d;s[i+1].sizeHint-=d};
  try{const ctl=installVirtualDockSizing(dock,[fit,con],{adjust});fit.collapsed=true;con.collapsed=true;events.dispatchEvent(new Event('preparatorio:collapse-changed'));assert.equal(f.b.size,48);assert.equal(c.b.size,48);
    fit.collapsed=false;events.dispatchEvent(new Event('preparatorio:collapse-changed'));assert.equal(f.b.size,210);assert.equal(c.b.size,48);
    con.collapsed=false;events.dispatchEvent(new Event('preparatorio:collapse-changed'));assert.equal(c.b.size,290);assert.equal(f.b.size,210);
    // Moving the console releases its former sizer and does not unlimit fit.
    con.collapsed=true;events.dispatchEvent(new Event('preparatorio:collapse-changed'));c.area.tabBar.titles=[];f.area.tabBar.titles.push({owner:con});f.area.tabBar.currentTitle={owner:con};callback();assert.equal(c.b.maxSize,Infinity);assert.equal(f.b.maxSize,48);
    f.area.tabBar.currentTitle={owner:fit};callback();assert.equal(f.b.maxSize,Infinity);ctl.dispose();
  }finally{for(const[k,v]of Object.entries(previous))v===undefined?delete globalThis[k]:globalThis[k]=v}
});
