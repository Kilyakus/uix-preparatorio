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
