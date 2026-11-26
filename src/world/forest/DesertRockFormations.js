import {BufferGeometry,Color,Float32BufferAttribute,InstancedMesh,MeshLambertMaterial,Object3D,DynamicDrawUsage} from 'three'
import {DESERT_CLIMAX as C} from './forestClimaxConfig.js'
import {stage4DesertHeight} from './forestStage4Config.js'
import {desertRockProfile,rockHash as hash} from './desertRockProfile.js'


// A wide eroded landform, not a radial cone: several offset, broken crests,
// uneven terraces, incised gullies and large triangulated rock faces.
export function desertRidgeGeometry(seed){
  const cols=15,rows=11,points=[],positions=[],colors=[],uv=[],color=new Color()
  for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
    const x=-1+2*i/cols+(i&&i<cols?(hash(i,j,seed)-.5)*.065:0)
    const z=-1+2*j/rows+(j&&j<rows?(hash(i+31,j,seed)-.5)*.055:0)
    points.push([x,desertRockProfile(x,z,seed,i,j),z])
  }
  const triangle=(a,b,c)=>{
    const tone=.84+hash(a,b,seed)*.22;color.setRGB(tone,tone*.97,tone*.91)
    for(const id of [a,b,c]){const p=points[id];positions.push(...p);colors.push(color.r,color.g,color.b);uv.push((p[0]+1)*10,(p[2]+1)*7)}
  }
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
    const a=j*(cols+1)+i,b=a+cols+1
    if(hash(i,j,seed)>.5){triangle(a,b,a+1);triangle(a+1,b,b+1)}
    else{triangle(a,b,b+1);triangle(a,b+1,a+1)}
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setAttribute('color',new Float32BufferAttribute(colors,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.computeVertexNormals();g.computeBoundingSphere();return g
}

export class DesertRockFormations{
  constructor(world){
    this.world=world;this.sectors=Array(6).fill(null);this.object=new Object3D()
    this.ownsMaterial=!world.materials?.mountains;this.material=world.materials?.mountains||new MeshLambertMaterial({name:'Desert warm eroded rock faces',color:'#bc9b79',vertexColors:true,flatShading:true})
    this.meshes=Array.from({length:3},(_,i)=>{
      const mesh=new InstancedMesh(desertRidgeGeometry(13+i*17),this.material,4)
      mesh.name='Plano_5_broken_rock_ridges_'+i;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(DynamicDrawUsage)
      this.object.scale.setScalar(0);this.object.updateMatrix();for(let n=0;n<4;n++)mesh.setMatrixAt(n,this.object.matrix)
      // Pure horizon set dressing, with no new collision/ride surfaces.
      mesh.raycast=()=>{};world.add(mesh);return mesh
    })
  }
  update(scottDistance,randDistance){
    const base=Math.max(0,Math.floor((Math.min(scottDistance,randDistance)-C.start)/900)-1)
    for(let sector=base;sector<base+6;sector++){
      const slot=sector%6;if(this.sectors[slot]===sector)continue
      this.sectors[slot]=sector
      for(let side=0;side<2;side++){
        const seed=sector*7+side*97,h=n=>hash(n,sector,seed),x=(side?1:-1)*(3250+h(1)*400),z=-(C.start+sector*900+350+h(2)*250)
        const o=this.object;o.position.set(x,stage4DesertHeight(x,z)-16,z);o.rotation.set(0,(h(3)-.5)*.55,0);o.scale.set(650+h(4)*390,180+h(5)*170,400+h(6)*260);o.updateMatrix()
        const index=slot*2+side,mesh=this.meshes[index%3];mesh.setMatrixAt(Math.floor(index/3),o.matrix);mesh.instanceMatrix.needsUpdate=true
      }
    }
  }
  dispose(){for(const mesh of this.meshes){mesh.removeFromParent();mesh.dispose();mesh.geometry.dispose()}if(this.ownsMaterial)this.material.dispose()}
}
