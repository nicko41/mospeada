import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {DoubleSide,Group,MeshLambertMaterial,Raycaster,Texture,Vector3} from 'three'
import {desertRidgeGeometry,DesertRockFormations} from './DesertRockFormations.js'
import {desertMountainMaterial} from './desertMountainMaterial.js'
import {DesertClimaxPlain,DESERT_VISUAL_HALF_WIDTH} from './DesertClimaxPlain.js'
import {stage4DesertHeight} from './forestStage4Config.js'

test('the approved new ridge silhouettes stay byte-identical while sharing a textured material',()=>{
  const expected=['399f776a7b259f265a8008d0709dff4385c93f38d485761b92c8a9a0207ccff0','e2faa6c8adb2c4b3d2018eb50af36eb845f065f4754f0c40629d7e3c624f1a54','d84722d1a8367e7f6c4638738769d9aba525905d717b197cf7de25361dfb059e']
  for(const [i,seed]of [13,30,47].entries()){
    const geometry=desertRidgeGeometry(seed)
    assert.equal(createHash('sha256').update(Buffer.from(geometry.attributes.position.array.buffer)).digest('hex'),expected[i]);geometry.dispose()
  }
  const map=new Texture(),world=new Group(),material=desertMountainMaterial(map);world.materials={mountains:material}
  const formations=new DesertRockFormations(world);let disposed=false;material.addEventListener('dispose',()=>disposed=true)
  assert.ok(formations.meshes.every(m=>m.material===material));assert.equal(material.map,map);assert.ok(material.flatShading)
  assert.equal(material.vertexColors,false,'Height-field slopes cannot be multiplied by a missing black vertex color')
  formations.dispose();assert.equal(disposed,false,'The world owns the shared material');material.dispose();map.dispose()
})

test('changing the mountain silhouettes preserves the existing route and final battle heights',()=>{
  for(const [x,z,height]of [[0,-900,-28.06602256843351],[0,-2600,-42.59355618620558],[40,-4700,-51.59641781116687]])assert.equal(stage4DesertHeight(x,z),height)
})

test('visual aprons cover old mountain edges AND the sides of the current arena without expanding the ride surfaces',()=>{
  const world=new Group(),material=new MeshLambertMaterial({side:DoubleSide});world.materials={desert:material}
  const plain=new DesertClimaxPlain(world),ray=new Raycaster(),down=new Vector3(0,-1,0)
  try{
    for(let i=0;i<100;i++)plain.update(4400,4455)
    world.updateMatrixWorld(true)
    assert.equal(plain.horizon.geometry.boundingBox.max.x,DESERT_VISUAL_HALF_WIDTH)
    assert.ok(!plain.horizon.userData.rideSurface&&!plain.backdrop.userData.rideSurface&&!plain.footing.userData.rideSurface)
    for(const x of [-6000,-4500,-3256,3256,4500,6000])for(const depth of [900,1800,2399,2401,3500,4300,4700,5100]){
      ray.set(new Vector3(x,600,-depth),down)
      assert.ok(ray.intersectObjects([plain.footing,plain.backdrop,plain.horizon],false).length,`No sky exposed below mountain at ${x}, ${depth}`)
    }
    assert.ok(plain.rows.flatMap(r=>r.meshes).every(m=>m.geometry.boundingBox.max.x<=3000&&m.geometry.boundingBox.min.x>=-3000))
  }finally{plain.dispose();material.dispose()}
})
