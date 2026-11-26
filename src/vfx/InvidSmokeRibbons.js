import {BufferGeometry,ClampToEdgeWrapping,DataTexture,DoubleSide,DynamicDrawUsage,Float32BufferAttribute,LinearFilter,Mesh,MeshBasicMaterial,Quaternion,RGBAFormat,Uint16BufferAttribute,UnsignedByteType,Vector3} from 'three'

const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)}
const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n)}
function noise(x,y){
  const ix=Math.floor(x),iy=Math.floor(y),u=smooth(x-ix),v=smooth(y-iy)
  return (hash(ix,iy)*(1-u)+hash(ix+1,iy)*u)*(1-v)+(hash(ix,iy+1)*(1-u)+hash(ix+1,iy+1)*u)*v
}

// One non-repeating opacity painting for all strips: soft lateral edges and
// irregular longitudinal wisps, with no circular sprite repeated along it.
export function createInvidRibbonTexture(){
  const width=256,height=64,data=new Uint8Array(width*height*4)
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=x/(width-1),v=y/(height-1),coarse=noise(u*9.1,v*3.7),fine=noise(u*31.4+7,v*11.3+3)
    const centre=.5+(noise(u*5.3,19.1)-.5)*.14,widthVariation=.32+.14*noise(u*11.1,5.7)
    const edge=1-smooth((Math.abs(v-centre)/widthVariation-.22)/.78)
    const ends=smooth(u/.035)*smooth((1-u)/.035),density=.38+.42*coarse+.2*fine,i=(y*width+x)*4
    data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(255*edge*ends*density)
  }
  const texture=new DataTexture(data,width,height,RGBAFormat,UnsignedByteType)
  texture.name='Invid shared irregular ribbon smoke';texture.wrapS=texture.wrapT=ClampToEdgeWrapping
  texture.minFilter=texture.magFilter=LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;return texture
}

// Every pooled explosion shares this one dynamic mesh/material. Deposited
// points remain in world space; only the latest endpoint follows the fragment.
export class InvidSmokeRibbons{
  constructor({bursts,trails,samples}){
    this.maxPoints=samples+1;const vertices=bursts*trails*this.maxPoints*2,indices=bursts*trails*samples*6
    this.geometry=new BufferGeometry()
    for(const [name,size]of [['position',3],['normal',3],['uv',2],['color',3],['aTrailOpacity',1]])this.geometry.setAttribute(name,new Float32BufferAttribute(new Float32Array(vertices*size),size).setUsage(DynamicDrawUsage))
    this.geometry.setIndex(new Uint16BufferAttribute(new Uint16Array(indices),1).setUsage(DynamicDrawUsage));this.geometry.setDrawRange(0,0)
    this.texture=createInvidRibbonTexture()
    this.material=new MeshBasicMaterial({name:'Invid shared suspended smoke ribbons',map:this.texture,vertexColors:true,side:DoubleSide,forceSinglePass:true,transparent:true,depthWrite:false,depthTest:true,toneMapped:false,fog:true,alphaTest:.004})
    this.material.onBeforeCompile=shader=>{
      shader.vertexShader='attribute float aTrailOpacity;varying float vTrailOpacity;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTrailOpacity=aTrailOpacity;')
      shader.fragmentShader='varying float vTrailOpacity;\n'+shader.fragmentShader.replace('#include <alphatest_fragment>','diffuseColor.a*=vTrailOpacity;\n#include <alphatest_fragment>')
    }
    this.material.customProgramCacheKey=()=> 'invid-suspended-smoke-ribbon-v1'
    this.mesh=new Mesh(this.geometry,this.material);this.mesh.name='Invid_continuous_smoke_ribbons';this.mesh.frustumCulled=false;this.mesh.renderOrder=7
    this.camera=new Vector3();this.right=new Vector3();this.point=new Vector3();this.before=new Vector3();this.after=new Vector3();this.tangent=new Vector3();this.view=new Vector3();this.side=new Vector3();this.rotation=new Quaternion();this.endpoint=new Vector3()
    this.points=new Float32Array(this.maxPoints*3);this.times=new Float32Array(this.maxPoints);this.count=this.segments=this.vertices=this.indices=0
  }
  begin(camera){
    camera.getWorldPosition(this.camera);camera.getWorldQuaternion(this.rotation);this.right.set(1,0,0).applyQuaternion(this.rotation)
    this.count=this.segments=this.vertices=this.indices=0
  }
  append(r,p,age,position){
    const duration=p.trailDuration,elapsed=Math.min(age,duration)
    while(p.trailCount<r.samples){
      const i=p.trailCount,born=r.samples===1?0:duration*(i/(r.samples-1))**1.65
      if(born>elapsed)break
      position(r,p,born,this.point);this.point.toArray(p.trailPoints,i*3);p.trailTimes[i]=born;p.trailCount++
    }
    let count=p.trailCount
    for(let i=0;i<count*3;i++)this.points[i]=p.trailPoints[i]
    for(let i=0;i<count;i++)this.times[i]=p.trailTimes[i]
    if(count&&elapsed>this.times[count-1]+.0001){position(r,p,elapsed,this.endpoint);this.endpoint.toArray(this.points,count*3);this.times[count++]=elapsed}
    if(count<2)return
    const start=this.vertices
    for(let i=0;i<count;i++){
      const born=this.times[i],a=age-born,t=Math.max(0,Math.min(1,a/p.smokeLife)),progress=born/Math.max(.001,duration)
      this.point.fromArray(this.points,i*3);this.before.fromArray(this.points,Math.max(0,i-1)*3);this.after.fromArray(this.points,Math.min(count-1,i+1)*3)
      this.tangent.subVectors(this.after,this.before).normalize();this.view.subVectors(this.camera,this.point).normalize();this.side.crossVectors(this.tangent,this.view)
      if(this.side.lengthSq()<.0001)this.side.copy(this.right);else this.side.normalize()
      const turbulence=Math.sin(p.seed+i*.71+age*1.4)*Math.sin(Math.min(1,a)*Math.PI*.5)*r.smokeTurbulence
      this.point.addScaledVector(this.side,turbulence);this.point.y+=r.smokeRise*a
      const width=p.smokeSize*(.25+.9*(1-progress))*(1+r.smokeGrowth*t)
      const alpha=smooth(a/.045)*(1-t)**1.35*r.smokeOpacity
      for(let edge=0;edge<2;edge++){
        const index=this.vertices++,sign=edge?1:-1,attribute=this.geometry.attributes
        attribute.position.setXYZ(index,this.point.x+this.side.x*width*.5*sign,this.point.y+this.side.y*width*.5*sign,this.point.z+this.side.z*width*.5*sign)
        attribute.normal.setXYZ(index,this.view.x,this.view.y,this.view.z)
        attribute.uv.setXY(index,progress,edge);attribute.color.setXYZ(index,r.smokeColor.r,r.smokeColor.g,r.smokeColor.b);attribute.aTrailOpacity.setX(index,alpha)
      }
      if(i){
        const a=start+(i-1)*2,b=a+2,index=this.geometry.index.array,k=this.indices
        index[k]=a;index[k+1]=a+1;index[k+2]=b;index[k+3]=b;index[k+4]=a+1;index[k+5]=b+1
        this.indices+=6;this.segments++
      }
    }
    this.count++
  }
  end(){
    this.geometry.setDrawRange(0,this.indices)
    if(this.indices){for(const attribute of Object.values(this.geometry.attributes))attribute.needsUpdate=true;this.geometry.index.needsUpdate=true}
  }
  clear(){this.count=this.segments=this.vertices=this.indices=0;this.geometry.setDrawRange(0,0)}
  dispose(){this.mesh.removeFromParent();this.geometry.dispose();this.material.dispose();this.texture.dispose()}
}
