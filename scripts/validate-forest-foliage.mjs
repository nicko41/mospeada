import fs from 'node:fs'
import assert from 'node:assert/strict'
import {connect} from './browser-cdp.mjs'
const c=await connect(),dir=process.argv.find(a=>a.startsWith('--output='))?.slice(9)||'artifacts/forest-foliage'
fs.mkdirSync(dir,{recursive:true})
const wait=ms=>new Promise(r=>setTimeout(r,ms))
async function until(code){for(let i=0;i<800;i++){if(await c.evaluate(code))return;await wait(200)}throw Error('Timeout: '+code)}
try{
  if(!process.argv.includes('--reuse'))await c.send('Page.navigate',{url:'http://127.0.0.1:5173/?environment=forest'})
  await until(`!!window.__FOREST_FOLIAGE__&&!!window.__ANIME__?.state.snapshot().nightReady&&!document.querySelector('#entry-preloader')`)
  const catalogue=await c.evaluate(`(()=>{const f=__FOREST_FOLIAGE__,meshes=[];__MOSPEADA__.scene.traverse(o=>{if(o.userData.forest&&o.isBatchedMesh)meshes.push({name:o.name,vertices:o.geometry.attributes.position.count,indices:o.geometry.index?.count,variants:o.geometryVariants||1,card:!!o.material.userData.forestAuthoredCard})});return{species:f.assets.filter(a=>a.kind==='tree').map(a=>a.name),meshes,loadedTreeUrls:performance.getEntriesByType('resource').map(e=>e.name).filter(n=>/models\\/glTF\\/.*Tree.*gltf|models\\/glTF\\/Pine.*gltf/.test(n))}})()`)
  assert.ok(catalogue.species.length>=3&&catalogue.species.every(n=>/^CommonTree_[1-4]$/.test(n)))
  assert.ok(catalogue.loadedTreeUrls.every(n=>!/Pine|TwistedTree.*gltf/.test(n)))
  const far=catalogue.meshes.filter(m=>m.name.startsWith('Forest_horizon_'))
  assert.ok(far.length>=4&&far.length<=5);assert.ok(far.every(m=>m.card&&m.vertices===4*m.variants&&m.indices===6*m.variants),'Every far tree/bush uses authored alpha cards with shared recipe geometry')
  const atlases=[]
  for(const name of await c.evaluate('Array.from(__FOREST_FOLIAGE__.atlases.keys())')) {
    const result=await c.evaluate(`(()=>{
      const atlas=__FOREST_FOLIAGE__.atlases.get(${JSON.stringify(name)}),target=atlas.target,w=target.width,h=target.height,pixels=new Uint8Array(w*h*4);
      __ANIME__.renderer.readRenderTargetPixels(target,0,0,w,h,pixels);
      const variants=atlas.variants||1,columns=variants>1?8:4,tileW=w/columns,tileH=h/(variants>1?variants:2),views=[],srgb=Uint8Array.from({length:256},(_,i)=>{const v=i/255;return Math.round(255*(v<=.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-.055))});
      for(let view=0;view<8*variants;view++){
        const x0=(view%columns)*tileW,y0=Math.floor(view/columns)*tileH;let opaque=0,holes=0,span=0;const colors=new Set();
        for(let y=y0;y<y0+tileH;y++){
          let first=-1,last=-1;
          for(let x=x0;x<x0+tileW;x++){const i=(y*w+x)*4;if(pixels[i+3]>160){opaque++;if(first<0)first=x;last=x;colors.add((srgb[pixels[i]]>>2)+','+(srgb[pixels[i+1]]>>2)+','+(srgb[pixels[i+2]]>>2))}}
          if(first>=0){span+=last-first+1;for(let x=first;x<=last;x++)if(pixels[(y*w+x)*4+3]<64)holes++}
        }
        views.push({view,opaqueFraction:opaque/(tileW*tileH),interiorGapFraction:holes/Math.max(1,span),paintedColorBins:colors.size})
      }
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d'),image=ctx.createImageData(w,h);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){const src=(y*w+x)*4,dst=((h-1-y)*w+x)*4;image.data[dst]=srgb[pixels[src]];image.data[dst+1]=srgb[pixels[src+1]];image.data[dst+2]=srgb[pixels[src+2]];image.data[dst+3]=pixels[src+3]}ctx.putImageData(image,0,0);
      return{width:w,height:h,views,png:canvas.toDataURL('image/png').split(',')[1]}
    })()`)
    fs.writeFileSync(`${dir}/atlas-${name}.png`,Buffer.from(result.png,'base64'));delete result.png
    atlases.push({name,...result})
    console.log(name,JSON.stringify(result.views.map(v=>({view:v.view,gaps:v.interiorGapFraction,colors:v.paintedColorBins}))))
    for(const view of result.views){assert.ok(view.opaqueFraction>.035&&view.opaqueFraction<.7,`${name}/${view.view}: retain silhouette and transparency`);assert.ok(view.paintedColorBins>30,`${name}/${view.view}: preserve painted color variation`)}
  }
  for(const atlas of atlases.filter(a=>a.name.startsWith('CommonTree'))){
    const mean=atlas.views.reduce((n,v)=>n+v.interiorGapFraction,0)/atlas.views.length
    assert.ok(mean>.08&&atlas.views.every(v=>v.interiorGapFraction>.025),`${atlas.name}: preserve organic openings across all views (mean ${mean})`)
  }
  await c.evaluate('window.__foliageDay=__FOREST_FOLIAGE__.day;true')
  for(const [code,key]of[['KeyM','m'],['KeyN','n']]){
    await c.send('Input.dispatchKeyEvent',{type:'keyDown',code,key});await c.send('Input.dispatchKeyEvent',{type:'keyUp',code,key})
    await until(code==='KeyM'?'window.__foliageDay.value<.03':'window.__foliageDay.value>.97')
    assert.equal(await c.evaluate('__ANIME__.renderer.getContext().getError()'),0)
    if(code==='KeyM')fs.writeFileSync(dir+'/night.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
  }
  const report={pass:true,catalogue,atlases}
  fs.writeFileSync(dir+'/foliage-validation.json',JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify({pass:true,species:catalogue.species,farCards:far.length,atlases:atlases.map(a=>({name:a.name,minGaps:Math.min(...a.views.map(v=>v.interiorGapFraction)),minColors:Math.min(...a.views.map(v=>v.paintedColorBins))}))},null,2))
}finally{await c.evaluate('delete window.__foliageDay;true').catch(()=>{});c.close()}
