import { Color, Float32BufferAttribute, Vector3 } from 'three'
import { FOREST_PALETTE_VERSION, forestLeafPalette } from './forestPalette.js'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// Edit private runtime copies only. Original branch/leaf topology and holes stay
// intact; a smooth basal taper removes the oversized fantasy-tree proportions.
export function prepareForestGeometry(source, transform, kind, materialName, sourceBounds, assetName='') {
  const geometry = source.clone().applyMatrix4(transform)
  if (kind === 'tree') {
    const p=geometry.attributes.position,n=geometry.attributes.normal
    const span=(sourceBounds.max.y-sourceBounds.min.y)*.54,normal=new Vector3()
    for(let i=0;i<p.count;i++) {
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i),t=clamp((y-sourceBounds.min.y)/span,0,1)
      const factor=.32+.68*t*t*(3-2*t),derivative=.68*6*t*(1-t)/span
      if(n){const nx=n.getX(i),ny=n.getY(i),nz=n.getZ(i);normal.set(nx/factor,ny-derivative*(x*nx+z*nz)/factor,nz/factor).normalize();n.setXYZ(i,normal.x,normal.y,normal.z)}
      p.setXYZ(i,x*factor,y,z*factor)
    }
  }
  if (/Leaves/.test(materialName) && (kind==='tree'||kind==='shrub')) paintLeafGroups(geometry,kind==='tree',kind,assetName)
  geometry.userData.forestRecipeKey='authored-taper32-painted-leaf-windows-v2/'+FOREST_PALETTE_VERSION
  geometry.computeBoundingBox();geometry.computeBoundingSphere()
  return geometry
}

// The pack uses disconnected, individually shaped leaf polygons, not painted
// leaf textures. Color whole connected leaves coherently instead of flattening
// the entire crown to one tint or adding noise across individual triangles.
export function paintLeafGroups(geometry,openCrown=false,kind='tree',assetName='') {
  const p=geometry.attributes.position,index=geometry.index,original=geometry.attributes.color
  const parents=Int32Array.from({length:p.count},(_,i)=>i)
  const root=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i]}return i}
  if(index)for(let i=0;i<index.count;i+=3){const a=root(index.getX(i));parents[root(index.getX(i+1))]=a;parents[root(index.getX(i+2))]=a}
  else for(let i=0;i<p.count;i+=3){parents[i+1]=i;parents[i+2]=i}
  const groups=new Map()
  for(let i=0;i<p.count;i++){const id=root(i);if(!groups.has(id))groups.set(id,{ids:[],center:new Vector3()});const g=groups.get(id);g.ids.push(i);g.center.add(new Vector3(p.getX(i),p.getY(i),p.getZ(i)))}
  geometry.computeBoundingBox()
  const bounds=geometry.boundingBox,center=bounds.getCenter(new Vector3()),height=bounds.max.y-bounds.min.y
  const width=Math.max(bounds.max.x-bounds.min.x,bounds.max.z-bounds.min.z,.1)
  const palette=forestLeafPalette(kind,assetName),color=new Color(),colors=new Float32Array(p.count*3)
  const kept=new Set()
  for(const [id,g] of groups) {
    const c=g.center.divideScalar(g.ids.length)
    const light=.5+.26*Math.sin(c.x*1.15+c.y*.78)+.18*Math.sin(c.z*1.52-c.y*.43)
    const upper=clamp((c.y-bounds.min.y)/Math.max(height,.1),0,1),edge=clamp(Math.hypot(c.x-center.x,c.z-center.z)/(width*.55),0,1)
    const tone=clamp(.12+light*.46+upper*.22+edge*.18,0,1)*3,slot=Math.min(2,Math.floor(tone))
    const base=color.copy(palette[slot]).lerp(palette[slot+1],tone-slot).clone()
    // Open coherent, irregular windows BETWEEN packets of authored leaves.
    // Sparse ramified species need less thinning than dense bottlebrush crowns.
    const gapField=Math.sin(c.x*2.13+c.y*.71)+Math.sin(c.z*2.57-c.y*1.13)+.6*Math.sin(c.x*3.89-c.z*1.31)
    if(!openCrown||gapField>(groups.size<500?-.9:0))kept.add(id)
    for(const i of g.ids){const ao=original?clamp((original.getX(i)+original.getY(i)+original.getZ(i))/3,.25,1):1;color.copy(base).multiplyScalar(.72+.28*ao);color.toArray(colors,i*3)}
  }
  geometry.setAttribute('color',new Float32BufferAttribute(colors,3))
  if(openCrown&&index){const triangles=[];for(let i=0;i<index.count;i+=3)if(kept.has(root(index.getX(i))))triangles.push(index.getX(i),index.getX(i+1),index.getX(i+2));geometry.setIndex(triangles)}
  geometry.userData.forestLeafGroups=kept.size
  geometry.userData.forestSourceLeafGroups=groups.size
}
