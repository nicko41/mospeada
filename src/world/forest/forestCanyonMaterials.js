import {Color,DoubleSide,MeshLambertMaterial,RepeatWrapping,Vector3} from 'three'
import {riverObstacles} from './forestCanyon.js'
import {stage2PathX} from './forestStage2Config.js'

// Own the sampler settings: the cached grass is also used by other stages.
// Repeat the original image in one direction, with no mirrored/rotated cells.
function canyonTexture(source){
  const texture=source.clone();texture.wrapS=texture.wrapT=RepeatWrapping;texture.repeat.set(1,1);texture.needsUpdate=true;return texture
}
function plainCanyonMaterial(source,wall=false){
  const map=canyonTexture(source),material=new MeshLambertMaterial({map,side:DoubleSide,fog:true,name:wall?'Forest canyon / barranco.jpg':'Forest river bank / original shore',userData:{forest:true}})
  material.onBeforeCompile=shader=>{
    shader.uniforms.canyonDirt={value:map}
    shader.vertexShader='varying vec2 vCanyonUv;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\nvCanyonUv=${wall?'vec2((modelMatrix*vec4(transformed,1.0)).x/12.0,uv.y/3.0)':'uv'};`)
    shader.fragmentShader='uniform sampler2D canyonDirt;varying vec2 vCanyonUv;\n'+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','diffuseColor*=texture2D(canyonDirt,vCanyonUv);')
  }
  material.addEventListener('dispose',()=>map.dispose())
  material.customProgramCacheKey=()=> 'forest-canyon-original-image-v3/'+wall
  return material
}

// Drivable upper terrain keeps its original scale. Only canyonShoreMaterial
// below enlarges the distant, non-drivable valley floor.
export function stage2GroundMaterial(grass,dirt){
  const map=canyonTexture(grass),soil=canyonTexture(dirt),material=new MeshLambertMaterial({map,name:'Forest Plano 2 / original grass and dirt',userData:{forest:true,forestGround:{tileMetres:6,source:'original grass-01.jpg + dirt01.jpg'}}})
  material.onBeforeCompile=shader=>{
    shader.uniforms.stage2Dirt={value:soil}
    shader.vertexShader='varying vec2 vStage2Ground;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvStage2Ground=(modelMatrix*vec4(transformed,1.0)).xz;')
    shader.fragmentShader=`uniform sampler2D stage2Dirt;varying vec2 vStage2Ground;
      float stage2Earth(vec2 p){float t=smoothstep(0.0,80.0,-p.y-400.0);float oldX=sin(p.y*.013)*20.0+sin(p.y*.033)*3.0;float pathX=mix(oldX,${stage2PathX(-480).toFixed(9)},t);return 1.0-smoothstep(1.2,4.5,abs(p.x-pathX));}
    `+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','vec2 groundUv=vStage2Ground/6.0;diffuseColor*=mix(texture2D(map,groundUv),texture2D(stage2Dirt,groundUv),stage2Earth(vStage2Ground));')
  }
  material.addEventListener('dispose',()=>{map.dispose();soil.dispose()})
  material.customProgramCacheKey=()=> 'forest-stage2-original-ground-v4'
  return material
}

// Raw atlas coordinates bypass the shared terrain texture's UV transform.
// Three taps blend the original illustration, never synthetic RGB patches.
export function canyonEarthMaterial(dirt,{stratified=false}={}){
  if(stratified)return plainCanyonMaterial(dirt,true)
  const m=new MeshLambertMaterial({map:dirt,side:DoubleSide,vertexColors:false,fog:true,name:stratified?'Forest canyon / barranco.jpg':'Forest canyon / original dirt01 illustration',userData:{forest:true}})
  m.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec2 vCanyonUv;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\nvCanyonUv=${stratified?'vec2((modelMatrix*vec4(transformed,1.0)).x/8.0,uv.y)':'uv'};`)
    shader.fragmentShader=`varying vec2 vCanyonUv;
      vec3 canyonHash(vec2 p){vec3 h=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));h+=dot(h,h.yxz+33.33);return fract((h.xxy+h.yzz)*h.zyx);}
      vec4 canyonTap(sampler2D image,vec2 p,vec2 cell,vec2 dx,vec2 dy){vec3 h=canyonHash(cell);float a=floor(h.z*4.0)*1.5707963;mat2 r=mat2(cos(a),sin(a),-sin(a),cos(a));return textureGrad(image,r*p+h.xy*7.0,r*dx,r*dy);}
      vec4 canyonPaint(sampler2D image,vec2 p){vec2 cell=floor(p),f=fract(p),a,b,c;vec3 w;if(f.x+f.y<1.0){a=cell;b=cell+vec2(1,0);c=cell+vec2(0,1);w=vec3(1.0-f.x-f.y,f.x,f.y);}else{a=cell+vec2(1);b=cell+vec2(0,1);c=cell+vec2(1,0);w=vec3(f.x+f.y-1.0,1.0-f.x,1.0-f.y);}w=pow(max(w,vec3(0)),vec3(4));w/=dot(w,vec3(1));vec2 dx=dFdx(p),dy=dFdy(p);return canyonTap(image,p,a,dx,dy)*w.x+canyonTap(image,p,b,dx,dy)*w.y+canyonTap(image,p,c,dx,dy)*w.z;}
    `+shader.fragmentShader
    // map is declared by Three's map_pars chunk, before use in our functions.
    shader.fragmentShader=shader.fragmentShader.replace('varying vec2 vCanyonUv;','uniform sampler2D canyonDirt;varying vec2 vCanyonUv;')
    if(stratified)shader.fragmentShader=shader.fragmentShader.replace('float a=floor(h.z*4.0)*1.5707963;mat2 r=mat2(cos(a),sin(a),-sin(a),cos(a));','mat2 r=mat2(h.z<.5?-1.0:1.0,0.0,0.0,1.0);')
    shader.uniforms.canyonDirt={value:dirt}
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','diffuseColor*=canyonPaint(canyonDirt,vCanyonUv);')
  }
  m.customProgramCacheKey=()=> 'forest-canyon-earth-arc-uv-v3/'+stratified;return m
}
// Only the existing river-floor banks: outer half illustrated grass, inner
// half original shore earth. Cliff-wall materials are completely separate.
export function canyonShoreMaterial(texture,grass){
  const material=plainCanyonMaterial(texture),compile=material.onBeforeCompile,grassMap=canyonTexture(grass)
  material.addEventListener('dispose',()=>grassMap.dispose())
  material.name='Forest river banks / green outer half and earth at water'
  material.onBeforeCompile=(shader,renderer)=>{
    compile(shader,renderer);shader.uniforms.canyonGrass={value:grassMap}
    shader.vertexShader='attribute vec4 aRiverBankFrame;varying vec4 vRiverBankFrame;varying vec3 vBankPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRiverBankFrame=aRiverBankFrame;vBankPoint=(modelMatrix*vec4(transformed,1.0)).xyz;')
    shader.fragmentShader=`uniform sampler2D canyonGrass;varying vec4 vRiverBankFrame;varying vec3 vBankPoint;
      float bankHash(vec2 p){vec3 h=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));h+=dot(h,h.yzx+33.33);return fract((h.x+h.y)*h.z);}
      float bankNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(bankHash(i),bankHash(i+vec2(1,0)),f.x),mix(bankHash(i+vec2(0,1)),bankHash(i+vec2(1)),f.x),f.y);}
    `+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('diffuseColor*=texture2D(canyonDirt,vCanyonUv);',`
      vec2 bankWorld=vBankPoint.xz;
      float bankOuter=vBankPoint.z>=vRiverBankFrame.x?vRiverBankFrame.z:vRiverBankFrame.w;
      float bankWidth=max(1.0,abs(bankOuter-vRiverBankFrame.x)-vRiverBankFrame.y-1.3);
      float acrossBank=(abs(vBankPoint.z-vRiverBankFrame.x)-vRiverBankFrame.y-1.3)/bankWidth;
      float broad=bankNoise(bankWorld*.045+vec2(7.2,3.7)),medium=bankNoise(bankWorld*.12+vec2(-3.1,8.4)),small=bankNoise(bankWorld*.31);
      float irregularEdge=(broad*.57+medium*.28+small*.15-.5)*.38;
      float grassCoverage=smoothstep(.30,.67,acrossBank+irregularEdge);
      // Feather grass back into earth at the foot of the wall, so the separate
      // cliff mesh cannot read as a clean green/brown ruler line.
      grassCoverage*=1.0-smoothstep(.84,.995,acrossBank+(medium-.5)*.12);
      vec2 soilUv=bankWorld/32.0,grassUv=bankWorld/24.0;
      vec4 shorePaint;
      if(grassCoverage<.001)shorePaint=texture2D(canyonDirt,soilUv);
      else if(grassCoverage>.999)shorePaint=texture2D(canyonGrass,grassUv);
      else shorePaint=mix(texture2D(canyonDirt,soilUv),texture2D(canyonGrass,grassUv),grassCoverage);
      diffuseColor*=shorePaint;
    `)
  }
  material.customProgramCacheKey=()=> 'forest-river-banks-original-images-v4'
  return material
}
export function canyonRiverMaterial(){
  const time={value:0},m=new MeshLambertMaterial({color:'#ffffff',side:DoubleSide,fog:true,depthWrite:true,transparent:false,name:'Forest canyon / flowing anime river',userData:{forest:true}})
  const deep=new Color('#1d5564'),shallow=new Color('#438c8a'),foam=new Color('#b5d5c5'),obstacles=riverObstacles.map(p=>new Vector3(p.x,p.z,p.radius))
  m.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{uRiverTime:time,uRiverDeep:{value:deep},uRiverShallow:{value:shallow},uRiverFoam:{value:foam},uRiverRocks:{value:obstacles}})
    shader.vertexShader=`uniform float uRiverTime;attribute float aRiverDepth;varying vec3 vRiverWorld,vRiverNormal;varying float vRiverDepth;
      vec3 riverWave(vec2 p){float a=p.x*.24+p.y*.10+uRiverTime*1.5,b=p.x*.63-p.y*.38+uRiverTime*2.8;return vec3(.12*sin(a)+.045*sin(b),.0288*cos(a)+.02835*cos(b),.012*cos(a)-.0171*cos(b));}
    `+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nvec3 riverSlope=riverWave(position.xz);objectNormal=normalize(vec3(-riverSlope.y,1.0,-riverSlope.z));')
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.y+=riverSlope.x;vRiverWorld=(modelMatrix*vec4(transformed,1.0)).xyz;vRiverNormal=objectNormal;vRiverDepth=aRiverDepth;')
    shader.fragmentShader=`uniform float uRiverTime;uniform vec3 uRiverDeep,uRiverShallow,uRiverFoam,uRiverRocks[6];varying vec3 vRiverWorld,vRiverNormal;varying float vRiverDepth;\n`+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      if(vRiverDepth<.02)discard;
      vec2 p=vRiverWorld.xz;float flow=sin(p.x*.24+p.y*.1+uRiverTime*1.5),ripples=sin(p.x*.63-p.y*.38+uRiverTime*2.8);
      vec3 water=mix(uRiverShallow,uRiverDeep,smoothstep(.1,3.8,vRiverDepth));water*=.96+.04*flow;
      float shore=(1.0-smoothstep(.05,.48,vRiverDepth))*(.3+.35*pow(max(0.0,ripples),4.0)),wake=0.0;
      for(int i=0;i<6;i++){vec2 q=p-uRiverRocks[i].xy;float radius=uRiverRocks[i].z;float ring=1.0-smoothstep(.1,.4,abs(length(q)-radius));float tail=(1.0-smoothstep(0.0,6.0,-q.x))*step(q.x,0.0)*(1.0-smoothstep(radius*.4,radius*1.6,abs(q.y)));wake=max(wake,(ring*.5+tail*.28)*(.55+.45*pow(max(0.0,ripples),3.0)));}
      float fresnel=pow(1.0-max(0.0,dot(normalize(cameraPosition-vRiverWorld),normalize(vRiverNormal))),3.0);
      water=mix(water,vec3(.55,.74,.78),fresnel*.12+pow(max(0.0,flow*.7+ripples*.3),12.0)*.07);
      diffuseColor.rgb= mix(water,uRiverFoam,min(.65,shore+wake));
    `)
  }
  m.customProgramCacheKey=()=> 'forest-canyon-flowing-river-v1';return {material:m,time}
}
