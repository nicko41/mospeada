import fs from 'node:fs'
import assert from 'node:assert/strict'
import {startupMetrics,startupTransfers} from './startup-metrics.mjs'
const dir='artifacts/startup-optimization'
function reason(path){
 if(path.includes('scott-controller-v2'))return ['Scott funcional','Rig, animaciones y sondas del controlador original. Contenedor sin imágenes; no se presenta la visual V2.','obligatorio']
 if(path.includes('scott-reference-v1'))return ['Scott funcional','Jerarquía y referencias originales usadas por anclajes/poses. Sin imágenes; no se presenta la visual V1.','obligatorio']
 if(path.includes('scott-v3'))return ['Scott V3','Única representación visual inicial; mismos vértices, materiales, imágenes y skinning.','obligatorio']
 if(path.includes('cyclone-vr052f'))return ['Cyclone','Modelo original de la moto para intro y conducción; URL compartida con la futura instancia de Rand.','obligatorio']
 if(path.includes('alpha-fighter-down'))return ['Introducción','Alpha accidentado visible en la introducción y el claro inicial.','obligatorio']
 if(path.includes('/transformations/'))return ['Armor','Geometrías y configuraciones originales para que la primera transformación esté preparada.','obligatorio']
 if(path.includes('/animations/'))return ['Scott funcional','Clips originales de conducción y transformación.','obligatorio']
 if(path.includes('/models/glTF/'))return ['Bosque inicial',/\.(bin|gltf)$/.test(path)?'Geometría de vegetación/rocas del bosque inicial; también reutilizada en los planos posteriores.':'Mapa de color/alpha utilizado por los materiales Lambert finales del bosque.','obligatorio']
 if(/barranco-|orilla-rio-/.test(path))return ['Plano 2','Textura original del barranco/ribera; anticipada para el primer salto, fuera de la barrera del preloader.','anticipado']
 if(/mars-gallant|explosion-(piso|aire)/.test(path))return ['Plano 3','Arma/VFX del próximo combate; descarga anticipada tras terminar las dependencias críticas, fuera de la barrera inicial.','anticipado']
 if(/desierto-floor/.test(path))return ['Plano 4','Mapas originales del desierto; anticipados para la continuidad sin depender de cuánto dura el combate.','anticipado']
 if(/invid-scout|invid-blood|invid-orbes/.test(path))return ['Scouts','Recursos del combate del desierto, anticipados después de los planos contiguos.','anticipado']
 if(/rand-rider|horizon-t/.test(path))return ['Desierto posterior','Modelo posterior, descargado fuera de la barrera inicial.','anticipado']
 if(/01-intro/.test(path))return ['Introducción','Música de la introducción original.','obligatorio']
 if(/02-Robotech/.test(path))return ['Música posterior','Anticipación de Lifeline para su cue original; no bloquea el preloader.','anticipado']
 if(/03-Robotech|04-Robotech/.test(path))return ['Música posterior','Tema posterior solicitado según la preparación/estado del escenario; no bloquea el preloader.','anticipado']
 if(/terrainWorker-/.test(path))return ['Preparación CPU','Worker que genera exactamente las geometrías originales de terreno fuera del hilo principal.','obligatorio']
 if(/forestFoliageWorker-/.test(path))return ['Bosque inicial','Worker de distribución forestal; URL compartida por los sectores iniciales y el barranco.','obligatorio']
 if(/wheel-fragments|impascto-invid-suelo|hojas.*flotantes/.test(path))return ['VFX iniciales','Polvo/fragmentos/hojas y contactos necesarios desde el primer tramo.','obligatorio']
 if(/follaje[12]-|grass-01-|dirt01-|\/foliage\/forest\/atlas/.test(path))return ['Bosque inicial','Atlas/copa/suelo originales visibles desde la introducción y la conducción inicial.','obligatorio']
 if(/cyclone-cover-/.test(path))return ['Cyclone','Calcomanías originales utilizadas por los materiales finales de la moto.','obligatorio']
 if(/\.ttf$/.test(path))return ['Interfaz','Fuente del display Cyclone; HTML y CSS usan exactamente la misma URL.','obligatorio']
 if(/favicon\.svg$/.test(path))return ['Interfaz','Icono del documento.','obligatorio']
 if(/\.(js|css)$/.test(path)||path==='/')return ['Aplicación','HTML/JavaScript/CSS de arranque y runtime. Los GLB e imágenes grandes son archivos externos.','obligatorio']
 return ['REVISAR','Requiere identificar el consumidor antes de dar por cerrado el inventario.','revisar']
}
const csv=rows=>rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n')+'\n'
const summaries=[]
for(const name of fs.readdirSync(dir).filter(n=>/^(before|after|intermediate-77mb)-.*mbps-(cold|warm)\.json$/.test(n))){
 const result=JSON.parse(fs.readFileSync(dir+'/'+name));if(!result.events)continue
 result.metrics=startupMetrics(result,result.events)
 const grouped=new Map()
 for(const transfer of startupTransfers(result,result.events)){
  const url=new URL(transfer.url),path=decodeURIComponent(url.pathname),id=path+url.search
  let row=grouped.get(id);if(!row){const [group,why,inclusion]=reason(path);row={file:id,transportBytes:0,decodedBytes:Math.max(0,...[...result.resources,...result.navigation].filter(e=>e.name===transfer.url).map(e=>e.decodedBodySize)),partial:false,group,why,inclusion};grouped.set(id,row)}
  row.transportBytes+=transfer.bytes;row.partial ||=transfer.partial
 }
 const rows=[...grouped.values()].sort((a,b)=>b.transportBytes-a.transportBytes)
 assert.equal(rows.reduce((n,r)=>n+r.transportBytes,0),result.metrics.transportBytesAtReady)
 const inventory={source:name,mb:result.metrics.transportBytesAtReady/1e6,mandatoryBytes:rows.filter(r=>r.inclusion==='obligatorio').reduce((n,r)=>n+r.transportBytes,0),anticipatedBytes:rows.filter(r=>r.inclusion==='anticipado').reduce((n,r)=>n+r.transportBytes,0),rows}
 const stem=name.replace('.json','');fs.writeFileSync(dir+'/'+stem+'-files.json',JSON.stringify(inventory,null,2))
 fs.writeFileSync(dir+'/'+stem+'-files.csv',csv([['Archivo','Bytes transferidos hasta game-ready (incl. HTTP)','MB decimales','Bytes decodificados completos','Parcial al corte','Grupo','Inclusión','Motivo'],...rows.map(r=>[r.file,r.transportBytes,(r.transportBytes/1e6).toFixed(6),r.decodedBytes,r.partial,r.group,r.inclusion,r.why])]))
 if(result.label==='after'&&!result.warm){
  assert.ok(!rows.some(r=>/scott-shoulders|scott-bernard-gear-v2-rear-refined|scott-bernard-animated-original|HighwayEnvironment-|\/models\/(phone|grass01|grass02|tree02|deadtrees01|rangerover)\.glb|guardaraid|\/textures\/ground\/field\//.test(r.file)), 'No eager V1/V2 visual assets or highway assets')
  assert.ok(rows.every(r=>r.inclusion!=='revisar'),JSON.stringify(rows.filter(r=>r.inclusion==='revisar')))
 }
 summaries.push({file:name,readyMs:result.readyMs,controlMs:result.control?.readyMs,metrics:result.metrics,preparation:result.preparation,mandatoryBytes:inventory.mandatoryBytes,anticipatedBytes:inventory.anticipatedBytes,top15:rows.slice(0,15)})
}
fs.writeFileSync(dir+'/comparison.json',JSON.stringify(summaries,null,2));console.log(summaries.map(r=>({file:r.file,readySeconds:r.readyMs/1000,controlSeconds:r.controlMs/1000,mb:r.metrics.transportBytesAtReady/1e6,mandatoryMB:r.mandatoryBytes/1e6,anticipatedMB:r.anticipatedBytes/1e6})))
