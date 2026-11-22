import {Mesh} from 'three'
import {stage4Grid} from './forestStage4Terrain.js'
import {stage4DesertHeight} from './forestStage4Config.js'
import {DESERT_CLIMAX as C} from './forestClimaxConfig.js'
import {registerRideSurfaces,refreshRideSurfaceGeometry} from '../../vehicle/rideSurface.js'

// A bounded extension of the existing terrain grids. Tiles recycle around both
// riders; even a long fight creates no unbounded geometry/contact-grid history.
export class DesertClimaxPlain{
  constructor(world){this.world=world;this.rows=[];this.assignments=new Map();this.wanted=new Set();this.ready=false;this.pending=this.prepare()}
  *prepare(){
    for(let i=0;i<C.terrainRows;i++){
      const row={sector:null,meshes:[],remove:[]};this.rows.push(row)
      for(const [a,b,step] of [[-C.halfWidth,-640,64],[-640,640,16],[640,C.halfWidth,64]]){
        const geometry=stage4Grid(a,b,0,C.tileLength,step,16,()=>0)
        geometry.userData.rideMutableHeight=true
        const mesh=new Mesh(geometry,this.world.materials.desert);mesh.name='Plano_5_recycled_desert_plain';mesh.visible=false;mesh.receiveShadow=true
        mesh.userData={forest:true,rideSurface:true,rideSurfaceActive:false,rideSurfaceType:'dirt',rideSurfaceBiome:'desert',rideSurfaceEarthWeight:()=>1}
        this.world.add(mesh);row.meshes.push(mesh);row.remove.push(registerRideSurfaces(mesh));yield
      }
    }
    const geometry=stage4Grid(-C.halfWidth,C.halfWidth,0,4096,128,128,()=>0)
    this.horizon=new Mesh(geometry,this.world.materials.desert);this.horizon.name='Plano_5_distant_plain';this.horizon.receiveShadow=true;this.horizon.visible=false;this.world.add(this.horizon)
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
  }
  update(scottDistance,randDistance=scottDistance){
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
      const sector=Math.max(0,Math.floor((Math.max(scottDistance,randDistance)-C.start)/C.tileLength))+5
      if(sector!==this.horizonSector){
        this.horizonSector=sector;const start=C.start+sector*C.tileLength,p=this.horizon.geometry.attributes.position
        for(let i=0;i<p.count;i++)p.setY(i,stage4DesertHeight(p.getX(i),p.getZ(i)-start))
        p.needsUpdate=true;this.horizon.position.z=-start;this.horizon.geometry.computeVertexNormals();this.horizon.geometry.computeBoundingBox();this.horizon.geometry.computeBoundingSphere();this.horizon.visible=true
      }
    }
  }
  dispose(){for(const row of this.rows){row.remove.forEach(fn=>fn());for(const mesh of row.meshes){mesh.removeFromParent();mesh.geometry.dispose()}}this.horizon?.removeFromParent();this.horizon?.geometry.dispose();this.rows.length=0;this.assignments.clear()}
}
