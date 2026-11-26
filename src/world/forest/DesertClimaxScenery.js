import {CylinderGeometry,IcosahedronGeometry,InstancedMesh,MeshLambertMaterial,Object3D,DynamicDrawUsage} from 'three'
import {DESERT_CLIMAX as C,climaxPathX} from './forestClimaxConfig.js'
import {stage4DesertHeight} from './forestStage4Config.js'
import {DesertRockFormations} from './DesertRockFormations.js'

export const DESERT_STONES=Object.freeze({clustersPerRow:12,stonesPerCluster:6,clearHalfWidth:46,minSize:.22,maxSize:1.5})
const rocksPerRow=DESERT_STONES.clustersPerRow*DESERT_STONES.stonesPerCluster,brushPerRow=24,treeBands=6,treesPerBand=8,bandLength=800
function seeded(seed){let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296}}

// Four small instanced batches, no colliders, shadows or per-frame vegetation
// animation. Rocks/brush recycle with the existing terrain rows; distant tree
// groups keep deterministic world positions as their far-away bands recycle.
export class DesertClimaxScenery{
  constructor(world){
    this.formations=new DesertRockFormations(world)
    this.object=new Object3D();this.treeSectors=Array(treeBands).fill(null)
    const batch=(name,geometry,color,count)=>{
      const mesh=new InstancedMesh(geometry,new MeshLambertMaterial({color}),count)
      mesh.name=name;mesh.instanceMatrix.setUsage(DynamicDrawUsage);mesh.frustumCulled=false
      this.object.scale.setScalar(0);this.object.updateMatrix()
      for(let i=0;i<count;i++)mesh.setMatrixAt(i,this.object.matrix)
      world.add(mesh);return mesh
    }
    this.rocks=batch('Plano_5_clustered_low_stones',new IcosahedronGeometry(1,0),'#9b846c',C.terrainRows*rocksPerRow)
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
        if(mesh===this.rocks){
          // Six low stones share each sparse patch; deterministic sector seeds
          // keep the arrangement stable when recycled terrain rows return.
          if(i%DESERT_STONES.stonesPerCluster===0){this.clusterDepth=start+random()*C.tileLength;this.clusterX=side*(60+random()*900)}
          const d=this.clusterDepth+(random()-.5)*15,path=climaxPathX(d)
          const cross=Math.sign(this.clusterX)*Math.max(DESERT_STONES.clearHalfWidth+3,Math.abs(this.clusterX)+(random()-.5)*19)
          const size=DESERT_STONES.minSize+(DESERT_STONES.maxSize-DESERT_STONES.minSize)*random()**2
          this.place(mesh,index*count+i,path+cross,-d,size*(.8+random()*.7),size*(.16+random()*.18),size*(.6+random()*.6),random()*Math.PI,size*.045)
          continue
        }
        const x=climaxPathX(depth)+side*(260+random()*1050),size=.25+random()*.55
        this.place(mesh,index*count+i,x,-depth,mesh===this.rocks?size:1+random()*1.6,mesh===this.rocks?size*.55:.4+random()*.5,mesh===this.rocks?size*.8:1+random(),random()*Math.PI,mesh===this.rocks?size*.18:undefined)
      }
      mesh.instanceMatrix.needsUpdate=true
    }
  }
  update(scottDistance,randDistance){
    this.formations.update(scottDistance,randDistance)
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
  dispose(){this.formations.dispose();for(const mesh of this.meshes){mesh.removeFromParent();mesh.dispose();mesh.geometry.dispose();mesh.material.dispose()}}
}
