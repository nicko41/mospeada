import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { readGlbDocument, retargetRidingPose } from './retarget-riding-pose.mjs'

const source = path.resolve(process.argv[2] || 'assets/scott-bernard-gear.glb')
const output = path.resolve('public/models/mospeada'), posePath = path.join(output, 'scott-riding-pose.json')
const saved = JSON.parse(fs.readFileSync(posePath, 'utf8'))
const previous = fs.readFileSync(path.join('public', saved.source))
const bytes = fs.readFileSync(source), doc = readGlbDocument(bytes)
if (!doc.skins?.length || !doc.meshes.some(mesh => mesh.primitives.some(p => p.attributes.JOINTS_0 !== undefined))) throw Error('Scott necesita un GLB con skin y esqueleto.')
const pose = retargetRidingPose(readGlbDocument(previous), doc, saved)
const metadata = { path: source, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
const manifestPath = path.join(output, 'asset-manifest.json'), manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
manifest.sources = manifest.sources.filter(item => !/scott.*\.glb$/i.test(item.path))
manifest.sources.push(metadata)
manifest.scott = { ...metadata, skins: doc.skins.length, bones: doc.skins[0].joints.length, embeddedImages: doc.images?.length || 0, animations: doc.animations?.map(clip => clip.name) || [] }
fs.writeFileSync(path.join(output, 'scott-bernard-gear.glb'), bytes)
fs.writeFileSync(posePath, JSON.stringify(pose, null, 2) + '\n')
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify(manifest.scott, null, 2))
