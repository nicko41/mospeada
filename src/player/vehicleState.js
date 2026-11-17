import { Vector3 } from 'three'

// Shared only to arbitrate camera ownership and the contextual F interaction.
export const vehicleState = {
  active: false, nearDoor: false, exitRequested: false,
  exitPosition: new Vector3(), exitYaw: 0,
}
