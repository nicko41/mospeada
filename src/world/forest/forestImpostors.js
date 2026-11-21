import {
  Box3, Color, DirectionalLight, DoubleSide, Group, HemisphereLight,
  LinearMipmapLinearFilter, LinearSRGBColorSpace, Matrix4, Mesh,
  MeshBasicMaterial, NoToneMapping, OrthographicCamera, PlaneGeometry,
  Scene, Sphere, Vector3, Vector4, WebGLRenderTarget,
} from 'three'
import { FOREST } from './forestConfig.js'
import { withForestLod } from './forestLod.js'
import { FOREST_PALETTE_VERSION } from './forestPalette.js'

const atlasesByRenderer=new WeakMap()
export const forestAtlasDay={value:1}

// An image of the selected authored tree, not a generic crown primitive.
// Eight orthographic views preserve the branch silhouette and transparent gaps.
// Bake every view before the first gameplay frame; rotations only change UVs.
export function getForestImpostor(renderer,asset) {
  let cache=atlasesByRenderer.get(renderer)
  if(!cache){cache=new Map();atlasesByRenderer.set(renderer,cache)}
  const key=asset.name+'/'+asset.parts.map(p=>p.geometry.userData.forestRecipeKey||p.geometry.uuid).join('/')
  if(cache.has(key))return cache.get(key)
  const config=FOREST.foliageAtlas,rows=Math.ceil(config.views/config.columns)
  const tileHeight=asset.kind==='tree'?config.treeTileHeight:config.shrubTileHeight
  const center=asset.bounds.getCenter(new Vector3()),height=asset.bounds.max.y-asset.bounds.min.y
  let radius=0
  for(const part of asset.parts){const p=part.geometry.attributes.position;for(let i=0;i<p.count;i++)radius=Math.max(radius,Math.hypot(p.getX(i)-center.x,p.getZ(i)-center.z))}
  const width=radius*2*1.08,cardHeight=height*1.06
  const target=new WebGLRenderTarget(config.tileWidth*config.columns,tileHeight*rows,{
    depthBuffer:true,stencilBuffer:false,samples:Math.min(4,renderer.capabilities.maxSamples),
    minFilter:LinearMipmapLinearFilter,generateMipmaps:false,
  })
  target.texture.colorSpace=LinearSRGBColorSpace
  target.texture.name=`Forest authored silhouette atlas / ${asset.name}`
  const scene=new Scene(),root=new Group()
  // Baking must be independent of gameplay distance fades (especially shrubs).
  const bakeMaterials=[]
  for(const part of asset.parts){const material=part.material.clone();material.onBeforeCompile=part.material.forestSourceCompile||part.material.onBeforeCompile;material.customProgramCacheKey=()=>part.material.forestSourceKey||part.material.customProgramCacheKey();bakeMaterials.push(material);const mesh=new Mesh(part.geometry,material);mesh.applyMatrix4(part.transform);root.add(mesh)}
  scene.add(root,new HemisphereLight('#b6dbe0','#325c69',1.18))
  const sun=new DirectionalLight('#dce9dc',.99);sun.position.set(-25,35,20);scene.add(sun)
  const camera=new OrthographicCamera(-width/2,width/2,cardHeight/2,-cardHeight/2,.01,200)
  const previous={target:renderer.getRenderTarget(),viewport:renderer.getViewport(new Vector4()),scissor:renderer.getScissor(new Vector4()),
    scissorTest:renderer.getScissorTest(),color:renderer.getClearColor(new Color()),alpha:renderer.getClearAlpha(),autoClear:renderer.autoClear,toneMapping:renderer.toneMapping,xr:renderer.xr.enabled}
  try {
    renderer.xr.enabled=false;renderer.toneMapping=NoToneMapping;renderer.autoClear=false
    target.scissorTest=false;renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.clear()
    for(let view=0;view<config.views;view++) {
      const angle=view/config.views*Math.PI*2
      camera.position.set(center.x+Math.sin(angle)*60,center.y,center.z+Math.cos(angle)*60);camera.lookAt(center);camera.updateMatrixWorld(true)
      const x=(view%config.columns)*config.tileWidth,y=Math.floor(view/config.columns)*tileHeight
      target.viewport.set(x,y,config.tileWidth,tileHeight);target.scissor.set(x,y,config.tileWidth,tileHeight);target.scissorTest=true
      renderer.setRenderTarget(target)
      target.texture.generateMipmaps=view===config.views-1
      renderer.render(scene,camera)
    }
  } finally {
    renderer.setRenderTarget(previous.target);renderer.setViewport(previous.viewport);renderer.setScissor(previous.scissor);renderer.setScissorTest(previous.scissorTest)
    renderer.setClearColor(previous.color,previous.alpha);renderer.autoClear=previous.autoClear;renderer.toneMapping=previous.toneMapping;renderer.xr.enabled=previous.xr
    bakeMaterials.forEach(material=>material.dispose())
  }
  const geometry=new PlaneGeometry(width,cardHeight)
  geometry.translate(center.x,center.y,center.z)
  // The card rotates on the GPU. Bound ALL orientations, not just its XY plane.
  geometry.boundingBox=new Box3(new Vector3(center.x-width/2,center.y-cardHeight/2,center.z-width/2),new Vector3(center.x+width/2,center.y+cardHeight/2,center.z+width/2))
  geometry.boundingSphere=new Sphere(center.clone(),Math.hypot(width/2,cardHeight/2))
  geometry.userData.forestAuthoredCard=true
  const material=new MeshBasicMaterial({map:target.texture,alphaTest:.3,side:DoubleSide,depthWrite:true,transparent:false,fog:true})
  material.name=`Forest painted silhouette / ${asset.name}`;material.userData.forest=true
  material.userData.forestAuthoredCard=true
  material.onBeforeCompile=shader=>{
    shader.uniforms.uForestCardCenter={value:center};shader.uniforms.uForestAtlasDay=forestAtlasDay
    shader.vertexShader='uniform vec3 uForestCardCenter;\nvarying vec3 vForestAtlasFrame;\n'+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      mat4 forestWorldMatrix = modelMatrix;
      #ifdef USE_BATCHING
        forestWorldMatrix = forestWorldMatrix * batchingMatrix;
      #endif
      vec3 forestCameraLocal = (inverse(forestWorldMatrix) * vec4(cameraPosition,1.0)).xyz;
      vec2 forestView = forestCameraLocal.xz-uForestCardCenter.xz;
      float forestAngle = atan(forestView.x,forestView.y);
      float forestFrame = mod(forestAngle/6.28318530718*${config.views.toFixed(1)}+${config.views.toFixed(1)},${config.views.toFixed(1)});
      vForestAtlasFrame = vec3(floor(forestFrame),mod(floor(forestFrame)+1.0,${config.views.toFixed(1)}),fract(forestFrame));
      vec3 forestRight = vec3(cos(forestAngle),0.0,-sin(forestAngle));
      transformed = uForestCardCenter + forestRight*(position.x-uForestCardCenter.x) + vec3(0.0,position.y-uForestCardCenter.y,0.0);
    `)
    shader.fragmentShader='uniform float uForestAtlasDay;\nvarying vec3 vForestAtlasFrame;\n'+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      vec2 forestUv = clamp(vMapUv,vec2(.002),vec2(.998));
      vec2 forestTileA = vec2(mod(vForestAtlasFrame.x,${config.columns.toFixed(1)}),floor(vForestAtlasFrame.x/${config.columns.toFixed(1)}));
      vec2 forestTileB = vec2(mod(vForestAtlasFrame.y,${config.columns.toFixed(1)}),floor(vForestAtlasFrame.y/${config.columns.toFixed(1)}));
      vec4 forestA = texture2D(map,(forestTileA+forestUv)/vec2(${config.columns.toFixed(1)},${rows.toFixed(1)}));
      vec4 forestB = texture2D(map,(forestTileB+forestUv)/vec2(${config.columns.toFixed(1)},${rows.toFixed(1)}));
      float forestBlend = smoothstep(.08,.92,vForestAtlasFrame.z);
      float forestAlpha = mix(forestA.a,forestB.a,forestBlend);
      vec3 forestPaint = mix(forestA.rgb*forestA.a,forestB.rgb*forestB.a,forestBlend)/max(forestAlpha,.001);
      // Same baked leaf palette at every LOD. Only the far layer loses a little
      // saturation/value, preserving depth without a separate petrol palette.
      float forestDepth=smoothstep(90.0,290.0,vForestLodDistance);
      float forestLuma=dot(forestPaint,vec3(.2126,.7152,.0722));
      forestPaint=mix(forestPaint,vec3(forestLuma)*vec3(.88,1.0,1.05),forestDepth*.24);
      forestPaint*=mix(1.0,.78,forestDepth);
      diffuseColor *= vec4(forestPaint*mix(.14,1.0,uForestAtlasDay),forestAlpha);
    `)
  }
  material.customProgramCacheKey=()=>`forest-authored-card-v1/${FOREST_PALETTE_VERSION}/${config.views}/${config.columns}`
  withForestLod(material,asset.kind,true)
  const result={target,width,height:cardHeight,views:config.views,parts:[{geometry,material,transform:new Matrix4()}]}
  cache.set(key,result)
  return result
}
