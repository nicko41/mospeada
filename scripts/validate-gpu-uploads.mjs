import fs from 'node:fs'
import {connect} from './browser-cdp.mjs'
const c=await connect({urlPrefix:''})
try{
 if(!fs.existsSync('.cache/gpu-upload-test.html'))fs.writeFileSync('.cache/gpu-upload-test.html','<!doctype html><html><body>Local GPU upload equivalence</body></html>')
 await c.send('Page.navigate',{url:'http://127.0.0.1:5173/.cache/gpu-upload-test.html'})
 await new Promise(resolve=>setTimeout(resolve,300))
 const result=await c.evaluate(`(async()=>{
  window.__GPU_UPLOAD_QA__={step:'imports'}
  const T=await import('/node_modules/three/build/three.module.js'),{prepareGpu,initializeGpuPreparation}=await import('/src/loading/gpuUploads.js')
  const renderer=new T.WebGLRenderer({antialias:false}),gl=renderer.getContext(),w=2048,h=1024,d=3,results=[];initializeGpuPreparation(renderer)
  const pixels=new Uint8Array(w*h*4);for(let i=0;i<pixels.length;i++)pixels[i]=(i*17+(i>>9)*31)%256
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels),w,h),0,0)
  __GPU_UPLOAD_QA__.step='bitmap';const bitmap=await createImageBitmap(canvas),image=new Image();image.src=canvas.toDataURL();await image.decode()
  for(const kind of ['data','canvas','image','bitmap','array'])for(const flipY of [false,true])for(const premultiply of [false,true]){
   if(kind==='array'&&(flipY||premultiply))continue // WebGL forbids these flags for 3D typed-array uploads.
   const make=()=>{let texture;if(kind==='array'){const data=new Uint8Array(pixels.length*d);for(let z=0;z<d;z++)data.set(pixels,z*pixels.length);texture=new T.DataArrayTexture(data,w,h,d)}else if(kind==='data')texture=new T.DataTexture(pixels,w,h);else texture=new T.Texture(kind==='canvas'?canvas:kind==='image'?image:bitmap);texture.flipY=flipY;texture.premultiplyAlpha=premultiply;texture.generateMipmaps=kind!=='array';texture.minFilter=texture.generateMipmaps?T.LinearMipmapLinearFilter:T.LinearFilter;texture.needsUpdate=true;return texture}
   __GPU_UPLOAD_QA__.step={kind,flipY,premultiply};const native=make(),split=make();renderer.initTexture(native);await prepareGpu(renderer,()=>renderer.initTexture(split),'validation')
   const read=(texture,level,layer)=>{const out=new Uint8Array(Math.max(1,w>>level)*Math.max(1,h>>level)*4),fb=gl.createFramebuffer();renderer.state.bindFramebuffer(gl.FRAMEBUFFER,fb);const handle=renderer.properties.get(texture).__webglTexture;if(kind==='array')gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,handle,level,layer);else gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,handle,level);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Incomplete readback');gl.readPixels(0,0,Math.max(1,w>>level),Math.max(1,h>>level),gl.RGBA,gl.UNSIGNED_BYTE,out);renderer.state.bindFramebuffer(gl.FRAMEBUFFER,null);gl.deleteFramebuffer(fb);return out}
   let differences=0;for(let level=0;level<(kind==='array'?1:12);level++)for(let layer=0;layer<(kind==='array'?d:1);layer++){const a=read(native,level,layer),b=read(split,level,layer);for(let i=0;i<a.length;i++)if(a[i]!==b[i])differences++}
   results.push({kind,flipY,premultiply,differences,error:gl.getError()});__GPU_UPLOAD_QA__.results=results;native.dispose();split.dispose()
  }
  const {deferredTexture,loadTexture,prepareTexture}=await import('/src/loading/resources.js'),url=canvas.toDataURL(),handle=deferredTexture(url);renderer.initTexture(handle);await loadTexture(url,{hold:true});if(handle.image.width!==1)throw Error('An unprepared image became live');await prepareTexture(url,renderer,'validation handoff');const native=new T.Texture(handle.image);native.needsUpdate=true;renderer.initTexture(native)
  const readTexture=texture=>{const fb=gl.createFramebuffer(),out=new Uint8Array(w*h*4);renderer.state.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,renderer.properties.get(texture).__webglTexture,0);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,out);renderer.state.bindFramebuffer(gl.FRAMEBUFFER,null);gl.deleteFramebuffer(fb);return out},a=readTexture(native),b=readTexture(handle);let differences=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])differences++;results.push({kind:'prepared-placeholder-handoff',differences,error:gl.getError(),width:handle.image.width,height:handle.image.height});native.dispose();handle.dispose()
  bitmap.close();renderer.dispose();return results
 })()`)
 fs.mkdirSync('artifacts/startup-optimization',{recursive:true});fs.writeFileSync('artifacts/startup-optimization/gpu-pixel-equivalence.json',JSON.stringify(result,null,2));console.log(result);if(result.some(r=>r.differences||r.error))process.exitCode=1
}finally{await c.send('Page.navigate',{url:'about:blank'}).catch(()=>{});c.close()}
