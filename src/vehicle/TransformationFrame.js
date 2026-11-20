import {Vector3} from 'three'

// Scott's boost displacement is a presentation offset, not driving physics.
// Apply the SAME world offset to Motorcycle's source frame after Scott poses,
// before any piece interpolates. Otherwise reversal mixes a moving Armor
// endpoint with a distant Motorcycle endpoint and stretches the actuators.
export class TransformationFrame{
  constructor(rig){
    this.root=rig.root;this.applied=false
    this.position=new Vector3();this.origin=new Vector3();this.offset=new Vector3();this.destination=new Vector3()
  }
  restore(){
    if(!this.applied)return
    this.root.position.copy(this.position)
    this.root.updateWorldMatrix(true,true)
    this.offset.set(0,0,0);this.applied=false
  }
  apply(offset){
    this.restore()
    this.root.updateWorldMatrix(true,false)
    this.root.getWorldPosition(this.origin)
    this.offset.copy(offset||this.offset.set(0,0,0))
    if(this.offset.lengthSq()<1e-20)return
    this.position.copy(this.root.position)
    this.destination.copy(this.origin).add(this.offset)
    if(this.root.parent)this.root.parent.worldToLocal(this.destination)
    this.root.position.copy(this.destination)
    this.root.updateWorldMatrix(true,true);this.applied=true
  }
  dispose(){this.restore()}
}
