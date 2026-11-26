import {workQueue} from './workQueue.js'

const contexts=new WeakMap()
function trackedContext(renderer){
 const gl=renderer.getContext();if(contexts.has(gl))return contexts.get(gl)
 const keys=[gl.UNPACK_ALIGNMENT,gl.UNPACK_ROW_LENGTH,gl.UNPACK_SKIP_PIXELS,gl.UNPACK_SKIP_ROWS,gl.UNPACK_IMAGE_HEIGHT,gl.UNPACK_SKIP_IMAGES,gl.UNPACK_FLIP_Y_WEBGL,gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,gl.UNPACK_COLORSPACE_CONVERSION_WEBGL]
 const stores=new Map(keys.map(key=>[key,gl.getParameter(key)])),textures=new Map()
 let unit=gl.getParameter(gl.ACTIVE_TEXTURE)
 const pixelStore=gl.pixelStorei,bind=gl.bindTexture,active=gl.activeTexture
 gl.pixelStorei=function(key,value){stores.set(key,value);return pixelStore.call(gl,key,value)}
 gl.activeTexture=function(value){unit=value;return active.call(gl,value)}
 gl.bindTexture=function(target,texture){textures.set(unit+':'+target,texture);return bind.call(gl,target,texture)}
 const tracked={stores,capture:()=>[...stores],handle:target=>textures.get(unit+':'+target)}
 contexts.set(gl,tracked);return tracked
}
export const initializeGpuPreparation=renderer=>trackedContext(renderer)

// Readiness includes completed GPU submissions, not just queued uploads.
// Poll without blocking the driving thread; context failures must not mark a
// future scene ready. The same-context fence also covers its VFX atlas commits.
export async function waitForGpuPreparation(renderer,label,queue=workQueue){
 const gl=renderer.getContext();if(!gl.fenceSync)return 0
 const start=performance.now(),fence=await queue.submit(()=>{
  if(gl.isContextLost())throw Error('Context lost while preparing '+label)
  const sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0)
  if(!sync)throw Error('Could not fence '+label)
  gl.flush();return sync
 },label+' fence')
 try{
  for(;;){
   const status=await queue.submit(()=>{
    if(gl.isContextLost())throw Error('Context lost while preparing '+label)
    return gl.clientWaitSync(fence,0,0)
   },label+' fence wait')
   if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED)return performance.now()-start
   if(status===gl.WAIT_FAILED)throw Error('GPU fence failed for '+label)
  }
 }finally{await queue.submit(()=>gl.deleteSync(fence),label+' fence cleanup')}
}

// Split large WebGL uploads without changing texture pixels, dimensions,
// formats, sampling or mip generation. Only hidden preparation uses this.
// Three still owns allocation, parameters, versioning and disposal.
export async function prepareGpu(renderer,run,label){
 const pending=[]
 await workQueue.submit(()=>{
  const gl=renderer.getContext(),tracked=trackedContext(renderer),sub2=gl.texSubImage2D,sub3=gl.texSubImage3D,mipmap=gl.generateMipmap
  const channels=format=>format===gl.RGBA||format===gl.RGBA_INTEGER?4:format===gl.RGB||format===gl.RGB_INTEGER?3:format===gl.RG||format===gl.RG_INTEGER?2:format===gl.RED||format===gl.RED_INTEGER?1:0
  const {handle,capture}=tracked,value=key=>tracked.stores.get(key)
  const upload=(target,texture,state,fn,args)=>{
   const previous=capture()
   renderer.state.bindTexture(target,texture,gl.TEXTURE0)
   for(const [key,value]of state)renderer.state.pixelStorei(key,value)
   try{fn.apply(gl,args)}finally{for(const [key,value]of previous)renderer.state.pixelStorei(key,value)}
  }
  const submit=(target,texture,state,fn,args)=>{const promise=workQueue.submit(()=>upload(target,texture,state,fn,args),label+' tile');pending.push(promise);return promise}
  gl.texSubImage2D=function(...args){
   if(args[0]!==gl.TEXTURE_2D)return sub2.apply(gl,args)
   const [target,level,x,y]=args
   if(args.length>=9&&ArrayBuffer.isView(args[8])){
    const [,,,,width,height,format,,data]=args,n=channels(format)
    if(n&&[gl.UNSIGNED_BYTE,gl.BYTE,gl.FLOAT,gl.HALF_FLOAT,gl.SHORT,gl.UNSIGNED_SHORT,gl.INT,gl.UNSIGNED_INT].includes(args[7])&&width*n*data.BYTES_PER_ELEMENT%value(gl.UNPACK_ALIGNMENT)===0&&data.byteLength>262144&&!value(gl.UNPACK_ROW_LENGTH)&&!value(gl.UNPACK_SKIP_ROWS)&&!value(gl.UNPACK_SKIP_PIXELS)){
     const texture=handle(target),state=capture(),row=width*n,rows=Math.max(1,Math.floor(1048576/(row*data.BYTES_PER_ELEMENT))),offset=args[9]||0
     for(let at=0;at<height;at+=rows){const count=Math.min(rows,height-at),tile=data.subarray(offset+at*row,offset+(at+count)*row);submit(target,texture,state,sub2,[target,level,x,y+at,width,count,format,args[7],tile])}
     return
    }
   }
   if(args.length===7){
    const image=args[6],width=image?.width,height=image?.height
    if(width*height>1048576&&!value(gl.UNPACK_ROW_LENGTH)&&!value(gl.UNPACK_SKIP_ROWS)&&!value(gl.UNPACK_SKIP_PIXELS)){
     const texture=handle(target),state=capture()
     const rows=Math.max(1,Math.floor(4194304/(width*4)))
     for(let at=0;at<height;at+=rows){const count=Math.min(rows,height-at),tileState=state.map(([key,v])=>[key,key===gl.UNPACK_SKIP_ROWS?at:v])
      submit(target,texture,tileState,sub2,[target,level,x,y+at,width,count,args[4],args[5],image])
     }
     return
    }
   }
   return sub2.apply(gl,args)
  }
  gl.texSubImage3D=function(...args){
   const [target,level,x,y,z,width,height,depth,format,type,data]=args,n=channels(format)
   if(n&&ArrayBuffer.isView(data)&&[gl.UNSIGNED_BYTE,gl.BYTE,gl.FLOAT,gl.HALF_FLOAT,gl.SHORT,gl.UNSIGNED_SHORT,gl.INT,gl.UNSIGNED_INT].includes(type)&&width*n*data.BYTES_PER_ELEMENT%value(gl.UNPACK_ALIGNMENT)===0&&data.byteLength>262144&&!value(gl.UNPACK_ROW_LENGTH)&&!value(gl.UNPACK_IMAGE_HEIGHT)&&!value(gl.UNPACK_SKIP_ROWS)&&!value(gl.UNPACK_SKIP_PIXELS)&&!value(gl.UNPACK_SKIP_IMAGES)){
    const texture=handle(target),state=capture(),row=width*n,rows=Math.max(1,Math.floor(1048576/(row*data.BYTES_PER_ELEMENT))),offset=args[11]||0
    for(let layer=0;layer<depth;layer++)for(let at=0;at<height;at+=rows){const count=Math.min(rows,height-at),begin=offset+(layer*height+at)*row,tile=data.subarray(begin,begin+count*row);submit(target,texture,state,sub3,[target,level,x,y+at,z+layer,width,count,1,format,type,tile])}
    return
   }
   return sub3.apply(gl,args)
  }
  gl.generateMipmap=function(target){
   if(!pending.length)return mipmap.call(gl,target)
   const texture=handle(target),previous=[...pending]
   const promise=Promise.all(previous).then(()=>workQueue.submit(()=>{renderer.state.bindTexture(target,texture,gl.TEXTURE0);mipmap.call(gl,target)},label+' mipmaps'))
   pending.push(promise)
  }
  try{return run()}finally{gl.texSubImage2D=sub2;gl.texSubImage3D=sub3;gl.generateMipmap=mipmap}
 },label)
 await Promise.all(pending)
}
