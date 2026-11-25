import test from 'node:test'
import assert from 'node:assert/strict'
import {GallantAimInput} from './GallantAimInput.js'

test('RMB held before or during transformation aims on the first available Armor frame without another press',()=>{
 const state={},input=new GallantAimInput()
 input.press(state);assert.equal(input.sync(state,true),true)
 for(let i=0;i<240;i++)assert.equal(input.sync(state,false),false)
 assert.equal(input.held,true);assert.equal(input.sync(state,true),true)
 input.clear();assert.equal(input.sync(state,true),false)
 input.press(state);assert.equal(input.sync(state,false),false);assert.equal(input.sync(state,true),true)
})

test('release during T, blur/pause/cinematic and checkpoint changes discard a buffered hold',()=>{
 for(const cancel of [input=>input.clear(),input=>input.sync({},true),(input,state)=>input.sync(state,true,true)]){
  const input=new GallantAimInput(),state={};input.press(state);input.sync(state,false);cancel(input,state)
  assert.equal(input.sync(state,true),false)
 }
})
