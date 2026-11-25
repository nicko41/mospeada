// Physical RMB ownership outlives temporary weapon availability during T.
// Releasing outside the canvas, blur, pause and actor resets cancel the hold.
export class GallantAimInput{
  constructor(){this.held=false;this.owner=null}
  press(state){this.held=true;this.owner=state}
  clear(){this.held=false;this.owner=null}
  sync(state,available,blocked=false){if(blocked||this.owner!==state)this.clear();return !!available&&this.held}
}
