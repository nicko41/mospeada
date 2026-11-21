import {DataTexture,FloatType,LinearFilter,RGBAFormat,RepeatWrapping,Vector4} from 'three'

export const FOREST_INTERACTION={enabled:true,walkRadius:.9,runRadius:1.15,bikeRadius:1.6,maxBend:1.35,largeBushHeight:1.45,walkStrength:1.05,runStrength:1.4,bikeStrength:1.65,releaseStiffness:42,releaseDamping:8}
// One world-anchored toroidal field, not a per-plant simulation. Only touched
// cells integrate springs; the existing instanced vertices sample its texture.
export class FoliageInteractionField{
  constructor({size=256,cell=.5,config=FOREST_INTERACTION}={}){
    this.size=size;this.cell=cell;this.extent=size*cell;this.config=config;this.count=0;this.time=0;this.validCentre=false
    const n=size*size
    for(const key of ['x','z','vx','vz','targetX','targetZ','targetStrength','ground','k','damping','touched'])this[key]=new Float32Array(n)
    this.touched.fill(-1000);this.slots=new Int32Array(n).fill(-1);this.active=new Int32Array(n);this.worldX=new Int32Array(n);this.worldZ=new Int32Array(n)
    this.data=new Float32Array(n*4);this.texture=new DataTexture(this.data,size,size,RGBAFormat,FloatType);this.texture.minFilter=this.texture.magFilter=LinearFilter;this.texture.wrapS=this.texture.wrapT=RepeatWrapping;this.texture.generateMipmaps=false;this.texture.needsUpdate=true
    this.area=new Vector4(0,0,this.extent,1);this.uniforms={uPlantBendMap:{value:this.texture},uPlantBendArea:{value:this.area},uPlantMaxBend:{value:config.maxBend},uPlantLargeBush:{value:config.largeBushHeight}}
    this.stats={activeCells:0,updatedCells:0,cpuMs:0,uploads:0,maxBend:0}
  }
  index(cx,cz){const n=this.size;return ((cz%n+n)%n)*n+(cx%n+n)%n}
  remove(i){const slot=this.slots[i],last=this.active[--this.count];if(slot<this.count){this.active[slot]=last;this.slots[last]=slot}this.slots[i]=-1;this.x[i]=this.z[i]=this.vx[i]=this.vz[i]=0;this.touched[i]=-1000;this.data.fill(0,i*4,i*4+4)}
  clear(){while(this.count)this.remove(this.active[this.count-1]);this.texture.needsUpdate=true;this.stats.uploads++;this.stats.activeCells=0;this.stats.maxBend=0}
  stamp(s){
    if(!s.active||s.strength<=0)return
    const r=s.radius,c=this.cell,half=this.extent*.5-2,dx=s.x-s.px,dz=s.z-s.pz,length2=dx*dx+dz*dz
    const minX=Math.max(Math.floor((Math.min(s.x,s.px)-r)/c),Math.floor((this.area.x-half)/c)),maxX=Math.min(Math.floor((Math.max(s.x,s.px)+r)/c),Math.floor((this.area.x+half)/c))
    const minZ=Math.max(Math.floor((Math.min(s.z,s.pz)-r)/c),Math.floor((this.area.y-half)/c)),maxZ=Math.min(Math.floor((Math.max(s.z,s.pz)+r)/c),Math.floor((this.area.y+half)/c))
    for(let cz=minZ;cz<=maxZ;cz++)for(let cx=minX;cx<=maxX;cx++){
      const px=(cx+.5)*c,pz=(cz+.5)*c,t=length2>1e-8?Math.max(0,Math.min(1,((px-s.px)*dx+(pz-s.pz)*dz)/length2)):1,rx=px-s.px-dx*t,rz=pz-s.pz-dz*t,d=Math.hypot(rx,rz)
      if(d>=r)continue
      // A contact core, followed by a soft edge. The former full-radius fade
      // reduced most visible contacts to only a few degrees of bending.
      let weight=Math.max(0,Math.min(1,(1-d/r)/.75));weight=weight*weight*(3-2*weight);const magnitude=weight*s.strength,i=this.index(cx,cz)
      if(this.slots[i]>=0&&(this.worldX[i]!==cx||this.worldZ[i]!==cz))this.remove(i)
      if(this.slots[i]<0){this.slots[i]=this.count;this.active[this.count++]=i;this.worldX[i]=cx;this.worldZ[i]=cz;this.targetStrength[i]=0}
      if(magnitude<=this.targetStrength[i])continue
      let bx=rx/Math.max(d,.1)*.68+s.dirX*.55,bz=rz/Math.max(d,.1)*.68+s.dirZ*.55;const norm=Math.hypot(bx,bz)||1;bx/=norm;bz/=norm
      this.targetStrength[i]=magnitude;this.targetX[i]=bx*magnitude;this.targetZ[i]=bz*magnitude;this.ground[i]=s.py+(s.y-s.py)*t
      this.k[i]=s.fast?300:190;this.damping[i]=s.fast?28:20
      if(s.speed>.3&&this.time-this.touched[i]>.18){const impulse=Math.min(10,3+s.speed*.2);this.vx[i]+=bx*magnitude*impulse;this.vz[i]+=bz*magnitude*impulse}
      this.touched[i]=this.time
    }
  }
  update(delta,sources,cx,cz){
    const begin=performance.now(),dt=Math.min(.1,Math.max(0,delta));this.uniforms.uPlantMaxBend.value=this.config.maxBend;this.uniforms.uPlantLargeBush.value=this.config.largeBushHeight
    if(!this.config.enabled){this.area.w=0;if(this.count)this.clear();Object.assign(this.stats,{activeCells:0,updatedCells:0,cpuMs:performance.now()-begin,maxBend:0});return}
    this.area.w=1
    if(this.validCentre&&Math.hypot(cx-this.area.x,cz-this.area.y)>16)this.clear()
    this.validCentre=true;this.area.x=cx;this.area.y=cz;this.time+=dt
    for(let a=0;a<this.count;a++){const i=this.active[a];this.targetStrength[i]=this.targetX[i]=this.targetZ[i]=0}
    for(const s of sources)this.stamp(s)
    const updated=this.count,steps=Math.max(1,Math.ceil(dt/(1/120))),h=dt/steps;let max=0,dirty=false
    for(let a=0;a<this.count;){const i=this.active[a];let x=this.x[i],z=this.z[i],vx=this.vx[i],vz=this.vz[i]
      const contact=this.targetStrength[i]>0,k=contact?this.k[i]:this.config.releaseStiffness,damping=contact?this.damping[i]:this.config.releaseDamping
      for(let step=0;step<steps;step++){vx+=((this.targetX[i]-x)*k-vx*damping)*h;vz+=((this.targetZ[i]-z)*k-vz*damping)*h;x+=vx*h;z+=vz*h}
      const length=Math.hypot(x,z);if(length>this.config.maxBend){x*=this.config.maxBend/length;z*=this.config.maxBend/length;vx*=.5;vz*=.5}
      if(!this.targetStrength[i]&&Math.abs(x)+Math.abs(z)+(Math.abs(vx)+Math.abs(vz))*.05<.0007){this.remove(i);dirty=true;continue}
      if(Math.abs(this.data[i*4]-x)>1e-6||Math.abs(this.data[i*4+1]-z)>1e-6||Math.abs(this.data[i*4+2]-this.ground[i])>.001||this.data[i*4+3]!==1)dirty=true
      this.x[i]=x;this.z[i]=z;this.vx[i]=vx;this.vz[i]=vz;this.data[i*4]=x;this.data[i*4+1]=z;this.data[i*4+2]=this.ground[i];this.data[i*4+3]=1;max=Math.max(max,Math.hypot(x,z));a++
    }
    if(dirty){this.texture.needsUpdate=true;this.stats.uploads++}
    Object.assign(this.stats,{activeCells:this.count,updatedCells:updated,cpuMs:performance.now()-begin,maxBend:max})
  }
  sample(x,z){
    const gx=x/this.cell-.5,gz=z/this.cell-.5,cx=Math.floor(gx),cz=Math.floor(gz),tx=gx-cx,tz=gz-cz;let dx=0,dz=0
    for(let a=0;a<2;a++)for(let b=0;b<2;b++){const w=(a?tx:1-tx)*(b?tz:1-tz),i=this.index(cx+a,cz+b)*4;dx+=this.data[i]*w;dz+=this.data[i+1]*w}return {x:dx,z:dz}
  }
  dispose(){this.texture.dispose()}
}
// Fast Refresh can retain existing instanced materials. Keep their texture
// and uniforms connected to the live controller across module replacements.
let shared=import.meta.hot?.data.forestInteractionField
if(import.meta.hot)import.meta.hot.dispose(data=>{data.forestInteractionField=shared})
export const forestInteractionField=()=>shared||(shared=new FoliageInteractionField())
export const plantBendGLSL=`
uniform sampler2D uPlantBendMap;uniform vec4 uPlantBendArea;uniform float uPlantMaxBend,uPlantLargeBush;
void bendForestPlant(inout vec3 p,mat4 plant,float anchor,float response){
  if(uPlantBendArea.w<.5||response<=0.0)return;
  vec3 root=plant[3].xyz;vec2 distanceToField=abs(root.xz-uPlantBendArea.xy);float edge=max(distanceToField.x,distanceToField.y),halfSize=uPlantBendArea.z*.5;
  if(edge>=halfSize)return;float height=length(plant[1].xyz);if(response<.5&&height>uPlantLargeBush)return;
  vec4 field=texture2D(uPlantBendMap,fract(root.xz/uPlantBendArea.z));if(field.a<.01||abs(root.y-field.b/max(.01,field.a))>1.4)return;
  vec2 force=field.rg*response*(1.0-smoothstep(halfSize-4.0,halfSize,edge));float angle=min(length(force),uPlantMaxBend);if(angle<.0001)return;
  float t=clamp(p.y/max(anchor,.001),0.0,1.0),along=angle*t;
  vec3 worldDirection=vec3(force.x,0.0,force.y)/max(length(force),.0001);
  vec3 localDirection=vec3(dot(worldDirection,plant[0].xyz),dot(worldDirection,plant[1].xyz),dot(worldDirection,plant[2].xyz))/max(height,.001);
  // Rotate each height along the blade progressively: the base is fixed,
  // while the visible leaf mass opens sideways instead of barely shearing.
  p+=localDirection*sin(along)*t*anchor;p.y+=(cos(along)-1.0)*t*anchor;
}
`
