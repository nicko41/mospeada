import React,{Suspense,useMemo,useLayoutEffect} from 'react'
import * as THREE from 'three'
import {registerColliders,cylinderCollider} from '../player/collisionWorld.js'
import {getWalkableHeightAt} from '../player/getWalkableHeight.js'
import TimeOfDay from './TimeOfDay.jsx'
import DirtRoad from './DirtRoad'
import Rain from './Rain'
import Lightning from './Lightning'
import AmbienceAudio from './AmbienceAudio'
import Ground from './Ground'
import GroundMist from './GroundMist'
import GuardHut from './GuardHut'
import ParkedRangeRover from './ParkedRangeRover'
import NaturePackSample from './NaturePackSample'
import OvercastSky from './OvercastSky'
import Puddles from './Puddles'
import RoadsideVegetation from './RoadsideVegetation'
import Highway from './sectors/Highway'
import TreeClusters from './TreeClusters'
import RuralPowerLines, { RURAL_POLES } from './RuralPowerLines'
import { createAgedPoleWood } from './agedPoleWood'
import JumpTestMound from '../vehicle/JumpTestMound'
function Pole({ x, z, leanX, leanZ, wood }) {
  return (
    <group position={[x, 0, z]} rotation={[leanX, 0, leanZ]}>
      <mesh position={[0, 3.25, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.13, 6.5, 8]} />
        <primitive object={wood.trunk} attach="material" />
      </mesh>
      <mesh position={[0, 5.7, 0]} castShadow>
        <boxGeometry args={[1.7, 0.1, 0.1]} />
        <primitive object={wood.arm} attach="material" />
      </mesh>
    </group>
  )
}

function Poles() {
  useLayoutEffect(() => registerColliders(RURAL_POLES.map(({ x, z }) =>
    cylinderCollider(x, z, 0.25, 0, 6.5))), [])
  const materials = useMemo(() => {
    const trunk = createAgedPoleWood()
    const arm = createAgedPoleWood(true)
    const tints = ['#dedbd2', '#ccc9bf', '#e8e3d9']
    return tints.map((color) => ({
      trunk: new THREE.MeshStandardMaterial({
        map: trunk.map, bumpMap: trunk.bumpMap, bumpScale: 0.035,
        color, roughness: 1, metalness: 0,
      }),
      arm: new THREE.MeshStandardMaterial({
        map: arm.map, bumpMap: arm.bumpMap, bumpScale: 0.026,
        color, roughness: 1, metalness: 0,
      }),
    }))
  }, [])
  return RURAL_POLES.map((pole, index) => (
    <Pole key={index} {...pole} wood={materials[index % materials.length]} />
  ))
}

function Landscape() {
  return (
    <>
      <Ground />
      <Puddles />
      <DirtRoad />
      <Highway />
      <RoadsideVegetation />
      <TreeClusters />
      <Suspense fallback={null}><NaturePackSample /></Suspense>
      <Poles />
      <RuralPowerLines />

      <GuardHut position={[28, getWalkableHeightAt(28, -105), -105]} />
      <ParkedRangeRover drivable={false} />

    </>
  )
}


export default function HighwayEnvironment(){return <><color attach="background" args={['#839196']}/><fogExp2 attach="fog" args={['#839196',.068]}/><TimeOfDay/><OvercastSky/><Landscape/><JumpTestMound/><GroundMist/><Rain/><Lightning/><AmbienceAudio/></>}
