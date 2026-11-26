import {BufferGeometry,Float32BufferAttribute,MathUtils,Mesh} from 'three'
import {stage4Grid} from './forestStage4Terrain.js'
import {FOREST_STAGE4 as S,stage4DesertHeight} from './forestStage4Config.js'
import {DESERT_CLIMAX as C} from './forestClimaxConfig.js'
import {registerRideSurfaces,refreshRideSurfaceGeometry} from '../../vehicle/rideSurface.js'
import {DesertClimaxScenery} from './DesertClimaxScenery.js'

const entryBands=[[-2400,-512,32],[-512,512,16],[512,2400,32]]
const plainBands=[[-C.halfWidth,-640,64],[-640,640,16],[640,C.halfWidth,64]]
const apronMargin=[2560,2816,3000,3256,3512,4024,5048,S.desertHalfWidth+4096]
export const DESERT_VISUAL_HALF_WIDTH=apronMargin.at(-1)
const terrainColumns=[...entryBands,...plainBands].flatMap(([a,b,step])=>Array.from({length:Math.ceil((b-a)/step)+1},(_,i)=>Math.min(b,a+i*step)))
const backdropColumns=[...new Set([...apronMargin.map(x=>-x),...apronMargin,...terrainColumns])].sort((a,b)=>a-b)
const horizonColumns=[...new Set([...apronMargin.map(x=>-x),...apronMargin,...Array.from({length:49},(_,i)=>-C.halfWidth+i*C.halfWidth/24)])].sort((a,b)=>a-b)
// Continue the same ground under both the old and new mountain silhouettes.
// This is visual-only coverage outside the original playable plain width.
export function desertApronHeight(x,depth){
  const edge=stage4DesertHeight(MathUtils.clamp(x,-C.halfWidth,C.halfWidth),-depth)
  return MathUtils.lerp(edge,-S.drop-C.drop-24,MathUtils.smoothstep(Math.abs(x),C.halfWidth,C.halfWidth+1536))
}
function edgeHeight(x,depth,bands){
  const band=bands.find(([a,b])=>x>=a&&x<=b)
  if(!band)return stage4DesertHeight(x,-depth)
  const [a,b,step]=band,left=Math.min(b,a+Math.floor((x-a)/step)*step),right=Math.min(b,left+step)
  const t=(x-left)/Math.max(.001,right-left)
  return stage4DesertHeight(left,-depth)*(1-t)+stage4DesertHeight(right,-depth)*t
}

// The original mountain grid ends at depth 520 and x +/-2400. From the
// lower final plain those open edges expose sky under its double-sided mesh.
// Continue their actual profile outward, tapering to a low visual floor.
// These aprons belong only to the final scene and are never ride surfaces.
function mountainFooting(){
  const positions=[],uv=[],indices=[],outer=DESERT_VISUAL_HALF_WIDTH,base=-S.drop-C.drop-24
  const sideHeight=desertApronHeight
  const patch=(xs,depths,height)=>{
    const offset=positions.length/3,columns=xs.length
    for(const depth of depths)for(const x of xs){positions.push(x,height(x,depth),-depth);uv.push(x/12,depth/6)}
    for(let row=0;row<depths.length-1;row++)for(let col=0;col<columns-1;col++){
      const a=offset+row*columns+col,b=a+columns;indices.push(a,a+1,b,a+1,b+1,b)
    }
  }
  const entryColumns=[...new Set(entryBands.flatMap(([a,b,step])=>Array.from({length:Math.ceil((b-a)/step)+1},(_,i)=>Math.min(b,a+i*step))))].sort((a,b)=>a-b)
  const margin=apronMargin
  patch([...margin.map(x=>-x).reverse(),...entryColumns,...margin],[-4096,-2048,-1024,0,256,520],(x,depth)=>{
    const edge=Math.abs(x)<=S.desertHalfWidth?edgeHeight(x,depth,entryBands):sideHeight(x,depth)
    return MathUtils.lerp(edge,base,MathUtils.smoothstep(520-depth,0,1536))
  })
  const depths=Array.from({length:Math.ceil((C.start-520)/16)+1},(_,i)=>Math.min(C.start,520+i*16))
  patch([-outer,...margin.slice(0,-1).map(x=>-x).reverse(),-S.desertHalfWidth],depths,sideHeight)
  patch([S.desertHalfWidth,...margin],depths,sideHeight)
  const geometry=new BufferGeometry()
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));geometry.setIndex(indices)
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry
}

// A bounded extension of the existing terrain grids. Tiles recycle around both
// riders; even a long fight creates no unbounded geometry/contact-grid history.
export class DesertClimaxPlain{
  constructor(world){this.world=world;this.rows=[];this.assignments=new Map();this.wanted=new Set();this.ready=false;this.scenery=new DesertClimaxScenery(world);this.pending=this.prepare()}
  *prepare(){
    for(let i=0;i<C.terrainRows;i++){
      const row={index:i,sector:null,meshes:[],remove:[]};this.rows.push(row)
      for(const [a,b,step] of [[-C.halfWidth,-640,64],[-640,640,16],[640,C.halfWidth,64]]){
        const geometry=stage4Grid(a,b,0,C.tileLength,step,16,()=>0)
        geometry.userData.rideMutableHeight=true
        const mesh=new Mesh(geometry,this.world.materials.terrainSlopes||this.world.materials.desert);mesh.name='Plano_5_recycled_desert_plain';mesh.visible=false;mesh.receiveShadow=true
        mesh.userData={forest:true,rideSurface:true,rideSurfaceActive:false,rideSurfaceType:'dirt',rideSurfaceBiome:'desert',rideSurfaceEarthWeight:()=>1}
        this.world.add(mesh);row.meshes.push(mesh);row.remove.push(registerRideSurfaces(mesh));yield
      }
    }
    const geometry=stage4Grid(0,horizonColumns.length-1,0,4096,1,128,()=>0)
    for(let i=0;i<geometry.attributes.position.count;i++)geometry.attributes.position.setX(i,horizonColumns[i%horizonColumns.length])
    this.horizon=new Mesh(geometry,this.world.materials.terrainSlopes||this.world.materials.desert);this.horizon.name='Plano_5_distant_plain';this.horizon.receiveShadow=true;this.horizon.visible=false;this.world.add(this.horizon)
    const backGeometry=stage4Grid(0,backdropColumns.length-1,0,4096,1,128,()=>0),backPositions=backGeometry.attributes.position
    for(let i=0;i<backPositions.count;i++)backPositions.setX(i,backdropColumns[i%backdropColumns.length])
    this.backdrop=new Mesh(backGeometry,this.world.materials.terrainSlopes||this.world.materials.desert);this.backdrop.name='Plano_5_distant_plain_behind';this.backdrop.visible=false;this.backdrop.receiveShadow=true;this.world.add(this.backdrop)
    yield
    this.footing=new Mesh(mountainFooting(),this.world.materials.mountains||this.world.materials.terrainSlopes||this.world.materials.desert);this.footing.name='Plano_5_original_mountain_footing';this.footing.userData.forest=true;this.footing.visible=false;this.footing.receiveShadow=true;this.world.add(this.footing)
    this.ready=true
  }
  assign(row,sector){
    if(row.sector!==null)this.assignments.delete(row.sector)
    row.sector=sector;const start=C.start+sector*C.tileLength
    for(const mesh of row.meshes){
      const p=mesh.geometry.attributes.position
      for(let i=0;i<p.count;i++)p.setY(i,stage4DesertHeight(p.getX(i),p.getZ(i)-start))
      p.needsUpdate=true;mesh.position.z=-start;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();refreshRideSurfaceGeometry(mesh.geometry)
      mesh.visible=true;mesh.userData.rideSurfaceActive=true;mesh.updateWorldMatrix(true,false)
    }
    this.assignments.set(sector,row)
    this.scenery.assignRow(row.index,sector)
  }
  update(scottDistance,randDistance=scottDistance){
    this.scenery.update(scottDistance,randDistance)
    const started=performance.now()
    if(this.pending)do{if(this.pending.next().done){this.pending=null;break}}while(performance.now()-started<3)
    this.wanted.clear()
    for(const distance of [scottDistance,randDistance]){
      const center=Math.max(0,Math.floor((distance-C.start)/C.tileLength))
      for(let n=Math.max(0,center-1);n<=center+4;n++)this.wanted.add(n)
    }
    for(const sector of this.wanted){
      if(this.assignments.has(sector))continue
      const free=this.rows.find(r=>r.meshes.length===3&&(r.sector===null||!this.wanted.has(r.sector)))
      if(!free)break
      this.assign(free,sector)
      // Rebuilding one row's heights/contact cells is an occasional operation,
      // never a whole plain rebuild or geometry creation on every frame.
      if(performance.now()-started>=3)break
    }
    if(this.horizon){
      // Start at the back of the active terrain window, not three rows ahead:
      // the full-width skirt must also cover the sides of the current arena.
      const sector=Math.max(0,Math.floor((Math.min(scottDistance,randDistance)-C.start)/C.tileLength)-1)
      if(sector!==this.horizonSector){
        this.horizonSector=sector;const start=C.start+sector*C.tileLength,p=this.horizon.geometry.attributes.position
        for(let i=0;i<p.count;i++){
          const x=p.getX(i),underTerrain=1-MathUtils.smoothstep(Math.abs(x),C.halfWidth-256,C.halfWidth)
          p.setY(i,desertApronHeight(x,start-p.getZ(i))-2.5*underTerrain)
        }
        p.needsUpdate=true;this.horizon.position.z=-start;this.horizon.geometry.computeVertexNormals();this.horizon.geometry.computeBoundingBox();this.horizon.geometry.computeBoundingSphere();this.horizon.visible=true
      }
    }
    if(this.footing)this.footing.visible=scottDistance>=C.start
    if(this.backdrop&&this.assignments.size){
      const nearest=Math.min(...this.assignments.keys())
      if(nearest!==this.backdropSector){
        this.backdropSector=nearest
        const end=C.start+nearest*C.tileLength,p=this.backdrop.geometry.attributes.position,columns=backdropColumns.length
        // Visual support behind the recycled collision rows. Without this,
        // looking back reveals sky under the old desert mountains. Clamp to
        // the final scene boundary; no geometry or collision changes earlier.
        for(let i=0;i<p.count;i++){
          const depth=Math.max(C.start,end-4096+Math.floor(i/columns)*128),x=p.getX(i)
          const height=Math.abs(x)>C.halfWidth?desertApronHeight(x,depth):depth===C.start?edgeHeight(x,depth,entryBands):depth===end?edgeHeight(x,depth,plainBands):stage4DesertHeight(x,-depth)
          p.setXYZ(i,x,height,-depth)
        }
        p.needsUpdate=true;this.backdrop.geometry.computeVertexNormals();this.backdrop.geometry.computeBoundingBox();this.backdrop.geometry.computeBoundingSphere();this.backdrop.visible=true
      }
    }
  }
  dispose(){this.scenery.dispose();for(const row of this.rows){row.remove.forEach(fn=>fn());for(const mesh of row.meshes){mesh.removeFromParent();mesh.geometry.dispose()}}for(const mesh of [this.horizon,this.backdrop,this.footing]){mesh?.removeFromParent();mesh?.geometry.dispose()}this.rows.length=0;this.assignments.clear()}
}
