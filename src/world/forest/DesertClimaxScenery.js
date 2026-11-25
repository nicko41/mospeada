import {CylinderGeometry,IcosahedronGeometry,InstancedMesh,MeshLambertMaterial,Object3D,DynamicDrawUsage} from 'three'
import {DESERT_CLIMAX as C,climaxPathX} from './forestClimaxConfig.js'
import {stage4DesertHeight} from './forestStage4Config.js'

const rocksPerRow=16,brushPerRow=24,treeBands=6,treesPerBand=8,bandLength=800
function seeded(seed){let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296}}

// Four small instanced batches, no colliders, shadows or per-frame vegetation
// animation. Rocks/brush recycle with the existing terrain rows; distant tree
// groups keep deterministic world positions as their far-away bands recycle.
export class DesertClimaxScenery{
  constructor(world){
    this.object=new Object3D();this.treeSectors=Array(treeBands).fill(null)
    const batch=(name,geometry,color,count)=>{
      const mesh=new InstancedMesh(geometry,new MeshLambertMaterial({color}),count)
      mesh.name=name;mesh.instanceMatrix.setUsage(DynamicDrawUsage);mesh.frustumCulled=false
      this.object.scale.setScalar(0);this.object.updateMatrix()
      for(let i=0;i<count;i++)mesh.setMatrixAt(i,this.object.matrix)
      world.add(mesh);return mesh
    }
    this.rocks=batch('Plano_5_small_stones',new IcosahedronGeometry(1,0),'#8b8069',C.terrainRows*rocksPerRow)
    this.brush=batch('Plano_5_dry_brush',new CylinderGeometry(0,1,1,3),'#82734b',C.terrainRows*brushPerRow)
    this.trunks=batch('Plano_5_horizon_trunks',new CylinderGeometry(.45,.7,1,5),'#615440',treeBands*treesPerBand)
    this.crowns=batch('Plano_5_horizon_tree_groups',new IcosahedronGeometry(1,1),'#62694c',treeBands*treesPerBand)
    this.meshes=[this.rocks,this.brush,this.trunks,this.crowns]
  }
  place(mesh,index,x,z,sx,sy,sz,angle=0,lift=sy*.5){
    const o=this.object;o.position.set(x,stage4DesertHeight(x,z)+lift,z);o.rotation.set(0,angle,0);o.scale.set(sx,sy,sz);o.updateMatrix();mesh.setMatrixAt(index,o.matrix)
  }
  assignRow(index,sector){
    const random=seeded(sector+19831001),start=C.start+sector*C.tileLength
    for(const [mesh,count] of [[this.rocks,rocksPerRow],[this.brush,brushPerRow]]){
      for(let i=0;i<count;i++){
        const depth=start+random()*C.tileLength,side=random()<.5?-1:1
        // Keep the central combat strip and Rand's entire zigzag route empty.
        const x=climaxPathX(depth)+side*(260+random()*1050),size=.25+random()*.55
        this.place(mesh,index*count+i,x,-depth,mesh===this.rocks?size:1+random()*1.6,mesh===this.rocks?size*.55:.4+random()*.5,mesh===this.rocks?size*.8:1+random(),random()*Math.PI,mesh===this.rocks?size*.18:undefined)
      }
      mesh.instanceMatrix.needsUpdate=true
    }
  }
  update(scottDistance,randDistance){
    const base=Math.max(0,Math.floor((Math.min(scottDistance,randDistance)-C.start)/bandLength)-1)
    for(let sector=base;sector<base+treeBands;sector++){
      const slot=sector%treeBands;if(this.treeSectors[slot]===sector)continue
      this.treeSectors[slot]=sector;const random=seeded(sector+87113)
      for(let cluster=0;cluster<2;cluster++){
        const depth=C.start+sector*bandLength+100+random()*600,side=cluster?1:-1,cx=side*(1750+random()*700)
        for(let i=0;i<4;i++){
          const d=depth+(random()-.5)*100,x=cx+(random()-.5)*150,z=-d,height=9+random()*8,index=slot*treesPerBand+cluster*4+i,width=4+random()*3
          this.place(this.trunks,index,x,z,1,height,1)
          this.place(this.crowns,index,x,z,width,height*.3,width*.8,random()*Math.PI,height*.85)
        }
      }
      this.trunks.instanceMatrix.needsUpdate=this.crowns.instanceMatrix.needsUpdate=true
    }
  }
  dispose(){for(const mesh of this.meshes){mesh.removeFromParent();mesh.dispose();mesh.geometry.dispose();mesh.material.dispose()}}
}
