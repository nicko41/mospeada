import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { boxCollider } from '../../player/collisionWorld.js'
import { forestCrashReferenceBaseHeight as forestBaseSurfaceHeight,forestSurfaceHeight } from './forestLayout.js'
import { FOREST_CRASH } from './forestCrashConfig.js'

export function alphaCrashPlacement(model) {
  const site=FOREST_CRASH,scale=site.length/site.sourceLength
  const ratio=site.length/site.previousLength
  const rotation=new Quaternion().setFromEuler(new Euler(site.pitch,site.yaw,site.roll,'YXZ'))
  const matrix=new Matrix4().compose(new Vector3(site.x,0,site.z),rotation,new Vector3(1,1,1))
  const sourceMatrix=new Matrix4().makeRotationY(-Math.PI/2).scale(new Vector3(scale,scale,scale))
  const relative=new Matrix4().multiplyMatrices(matrix,sourceMatrix),point=new Vector3()
  let support=-Infinity,samples=0
  model.updateMatrixWorld(true)
  model.traverse(mesh=>{
    if(!mesh.isMesh)return
    const p=mesh.geometry.attributes.position,m=new Matrix4().multiplyMatrices(relative,mesh.matrixWorld)
    for(let i=0;i<p.count;i++){
      point.fromBufferAttribute(p,i)
      // Belly/engine support, rather than one low wingtip lifting the fuselage.
      if(Math.abs(point.z*scale)>.92*ratio||Math.abs(point.x*scale)>4.1*ratio)continue
      // Lock the approved aircraft pose to the original terrain support. Local
      // crash relief must never silently change its world height.
      point.applyMatrix4(m);support=Math.max(support,forestBaseSurfaceHeight(point.x,point.z)-point.y);samples++
    }
  })
  if(!samples)throw Error('Alpha has no fuselage support samples')
  const y=support-site.burial
  matrix.elements[13]=y
  const referenceMatrix=matrix.clone(),sourceOrientationMatrix=sourceMatrix.clone()
  let best=Infinity,nosePivotLocal=null
  model.traverse(mesh=>{
    if(!mesh.isMesh)return
    const positions=mesh.geometry.attributes.position,local=new Matrix4().multiplyMatrices(sourceOrientationMatrix,mesh.matrixWorld)
    for(let i=0;i<positions.count;i++){
      const p=new Vector3().fromBufferAttribute(positions,i).applyMatrix4(local)
      if(p.z> -site.length*.4||Math.abs(p.x)>1)continue
      const world=p.clone().applyMatrix4(referenceMatrix),gap=world.y-forestSurfaceHeight(world.x,world.z)
      if(gap<best){best=gap;nosePivotLocal=p}
    }
  })
  if(!nosePivotLocal)throw Error('Alpha has no nose pivot samples')
  const nosePivotWorld=nosePivotLocal.clone().applyMatrix4(referenceMatrix)
  nosePivotWorld.y=forestSurfaceHeight(nosePivotWorld.x,nosePivotWorld.z)+site.noseClearance
  const settledRotation=new Quaternion().setFromEuler(new Euler(site.settledPitch,site.yaw,site.roll,'YXZ'))
  matrix.compose(new Vector3(site.x,y,site.z),settledRotation,new Vector3(1,1,1))
  // Keep the horizontal scene anchor/yaw/scale. Translation inside the model
  // compensates ONLY the rigid nose-pivot rotation, not a uniform sinking.
  const offset=nosePivotWorld.clone().applyMatrix4(matrix.clone().invert()).sub(nosePivotLocal),poseOffset=new Matrix4().makeTranslation(offset.x,offset.y,offset.z)
  sourceMatrix.premultiply(poseOffset)
  const poseMatrix=matrix.clone().multiply(poseOffset)
  return {matrix,sourceMatrix,sourceOrientationMatrix,referenceMatrix,poseMatrix,nosePivotLocal,nosePivotWorld,pitch:site.settledPitch,yaw:site.yaw,scale,y,samples}
}

// Small primitive boxes follow the body, engines and wing roots. They
// share the static spatial hash used by Scott, Cyclone and Armor, never triangles.
export function alphaCrashColliders(placement) {
  const ratio=FOREST_CRASH.length/FOREST_CRASH.previousLength
  const collisionMatrix=(placement.poseMatrix||placement.matrix).clone().multiply(new Matrix4().makeScale(ratio,ratio,ratio))
  const sections=[
    [[0,-.05,-3.9],[.7,1.0,1.55]],[[0,.05,-2.5],[1.25,1.45,1.8]],
    [[0,.05,-.7],[1.65,1.9,2.0]],[[0,-.1,1.4],[2.5,1.9,2.2]],
    [[0,-.15,3.2],[2.9,1.8,1.9]],
    [[-1.85,-.15,1.8],[1.3,.65,2.5]],[[1.85,-.15,1.8],[1.3,.65,2.5]],
    [[0,.7,3.7],[1.15,1.3,1.2]],
  ]
  const body=sections.map(([center,size],id)=>boxCollider(new Box3().setFromCenterAndSize(new Vector3(...center),new Vector3(...size)).applyMatrix4(collisionMatrix),{walkable:false,vaultable:false,environment:true,source:'forest-alpha',part:id}))
  // A low contact skirt gives shoulders/Armor clearance without putting the
  // unchanged camera's look-ahead target inside a tall collision box. Its top
  // follows the churned ground; it does not obstruct a shoulder-height camera.
  const contact=body.slice(0,5).map((c,id)=>{
    const box=new Box3(new Vector3(c.minX-.35,0,c.minZ-.35),new Vector3(c.maxX+.35,0,c.maxZ+.35))
    const heights=[forestSurfaceHeight(box.min.x,box.min.z),forestSurfaceHeight(box.max.x,box.min.z),forestSurfaceHeight(box.min.x,box.max.z),forestSurfaceHeight(box.max.x,box.max.z)]
    box.min.y=Math.min(...heights)-.1;box.max.y=Math.max(...heights)+.32
    return boxCollider(box,{walkable:false,vaultable:false,environment:true,source:'forest-alpha',part:'contact-'+id})
  })
  return [...body,...contact]
}

export function alphaDamageMaterial(source,scale) {
  const material=source.clone()
  material.name='Alpha crashed / heavy lower-hull earth and directional abrasion'
  material.roughness=Math.max(.85,source.roughness);material.metalness=.22
  material.normalScale?.multiplyScalar(.45)
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vAlphaPoint,vAlphaWorld;\nvarying float vAlphaUp;\n'+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      vAlphaPoint=vec3(-position.z,position.y,position.x)*${scale.toFixed(8)};
      vAlphaWorld=(modelMatrix*vec4(transformed,1.0)).xyz;
      vAlphaUp=clamp(normalize(mat3(modelMatrix)*objectNormal).y,0.0,1.0);
    `)
    shader.fragmentShader=`
      varying vec3 vAlphaPoint,vAlphaWorld;
      varying float vAlphaUp;
      float alphaHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float alphaNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(alphaHash(i),alphaHash(i+vec2(1,0)),f.x),mix(alphaHash(i+vec2(0,1)),alphaHash(i+vec2(1)),f.x),f.y);}
    `+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      vec3 damagePoint=vAlphaPoint;
      float damageNoise=alphaNoise(damagePoint.xz*2.4);
      float broadMud=alphaNoise(damagePoint.xz*vec2(1.5,.34)+vec2(3.4,1.7));
      float contactHeight=vAlphaWorld.y-(${forestBaseSurfaceHeight(FOREST_CRASH.x,FOREST_CRASH.z).toFixed(6)});
      // The nose/low side panels sit around 2 m in this approved placement;
      // restricting dirt to 1.8 m hid almost all of it underneath the engines.
      float lower=1.0-smoothstep(1.15,2.8,contactHeight+(broadMud-.5)*.7);
      float scar=1.0-smoothstep(.3,1.5,length((damagePoint.xz-vec2(1.0,1.2))*vec2(1.2,.65)));
      scar=max(scar,(1.0-smoothstep(.25,1.3,length((damagePoint.xz-vec2(-.9,.4))*vec2(1.3,.8))))*.85);
      float draggedMud=alphaNoise(vec2(damagePoint.x*3.8,damagePoint.z*.48));
      float paintWear=smoothstep(.54,.77,damageNoise)*max(lower,scar*.4);
      float brokenMud=smoothstep(.25,.74,alphaNoise(damagePoint.xz*vec2(2.6,.9)+vec2(8.1,-3.0)));
      float cakedUnderside=1.0-smoothstep(.8,1.4,contactHeight);
      float mudMask=lower*mix(.30+.62*brokenMud,.96,cakedUnderside);
      float upperCleaner=smoothstep(.2,.85,vAlphaUp)*smoothstep(-.5,.45,damagePoint.y);
      mudMask*=1.0-upperCleaner*.35;
      // Reveal more native blue/white only on visible rear panels. The nose
      // and caked underside keep their approved coverage.
      float rearRecovery=smoothstep(.4,2.8,damagePoint.z)*smoothstep(-.6,.45,damagePoint.y)*(1.0-cakedUnderside*.75);
      mudMask*=1.0-rearRecovery*.30;
      vec3 adheredEarth=mix(vec3(.07,.046,.024),vec3(.24,.16,.075),smoothstep(.18,.82,draggedMud));
      diffuseColor.rgb=mix(diffuseColor.rgb,adheredEarth,mudMask);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.12,.13,.115),paintWear*.27*(1.0-rearRecovery*.25));
      // Sparse higher splashes, never a uniform wash over canopy and markings.
      float splashes=smoothstep(.59,.78,damageNoise)*smoothstep(.9,1.5,contactHeight)*(1.0-smoothstep(2.35,2.9,contactHeight));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.12,.085,.045),splashes*.35*(1.0-upperCleaner*.4)*(1.0-rearRecovery*.3));
      diffuseColor.rgb*=1.0-scar*lower*.28;
    `)
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,1.0,mudMask);')
    shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor*=1.0-mudMask*.9;')
  }
  material.customProgramCacheKey=()=>`alpha-earth-no-streaks-rear-blue-v4/${scale}`
  return material
}
