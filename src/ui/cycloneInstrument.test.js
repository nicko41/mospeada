import {test} from 'node:test'
import assert from 'node:assert/strict'
import {cycloneGaugeSegments} from './cycloneGauge.js'
import {instrumentLevel,speedometerValue,entryLoadingMessage} from './cycloneInstrumentModel.js'

test('the shared gauge has forty rounded segments and clamps at both ends',()=>{
  assert.equal(cycloneGaugeSegments.length,40)
  assert.ok(cycloneGaugeSegments.every(({d,color})=>d.includes('Q')&&color))
  for(const [value,expected] of [[0,0],[-10,0],[50,20],[95,38],[100,40],[160,40],[NaN,0]])assert.equal(instrumentLevel(value),expected)
})

test('the speed gauge uses km/h and saturates at cruising maximum during boost',()=>{
  assert.equal(instrumentLevel(108,216),20)
  assert.equal(instrumentLevel(216,216),40)
  assert.equal(instrumentLevel(288,216),40)
  for(const [value,expected] of [[0,'00'],[4.6,'05'],[-17.8,'18'],[216,'216'],[1200,'999'],[NaN,'00']])assert.equal(speedometerValue(value),expected)
})

test('loading caption only reports ready after assets, scene and rendering are ready',()=>{
  assert.equal(entryLoadingMessage({active:true,sceneReady:true,renderReady:true,item:'scott.glb'}),'LOADING VEHICLES')
  assert.equal(entryLoadingMessage({active:true,item:'terrain.png'}),'LOADING TERRAIN')
  assert.equal(entryLoadingMessage({active:false,sceneReady:true,renderReady:false}),'PREPARING SCENE')
  assert.equal(entryLoadingMessage({active:false,sceneReady:true,renderReady:true}),'SYSTEM READY')
})
