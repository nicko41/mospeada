import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
const root=process.cwd(),base=path.join(root,'.local/checkpoints/scott-v2-before-riding-2026-11-23')
let directory=base,index=1;while(fs.existsSync(directory))directory=base+'-'+index++
fs.mkdirSync(directory,{recursive:true})
const files=[]
function collect(relative){const full=path.join(root,relative);if(!fs.existsSync(full))return;const stat=fs.lstatSync(full);if(stat.isSymbolicLink())return;if(stat.isDirectory()){for(const entry of fs.readdirSync(full))collect(path.join(relative,entry))}else files.push(relative)}
for(const relative of ['src','scripts','public/animations','public/transformations','package.json','package-lock.json','README.md','index.html','public/models/mospeada/scott-bernard-gear-v2-animated.glb','public/models/mospeada/scott-bernard-animated-original.glb','public/models/mospeada/cyclone-vr052f.glb','assets/01-SCOTT/scott-bernard-gear-v2.glb'])collect(relative)
const manifest={root,directory,scope:'All current source/scripts and relevant Scott/Cyclone assets, animations and transformations',restoreMode:'Overwrite snapshotted files only; leave other files untouched',files:[]}
for(const relative of files){const data=fs.readFileSync(path.join(root,relative)),target=path.join(directory,'files',relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);manifest.files.push({path:relative.replaceAll('\\','/'),bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')})}
fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n')
fs.writeFileSync(path.join(directory,'restore.ps1'),`$ErrorActionPreference = 'Stop'
$snapshotRoot = $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $snapshotRoot 'manifest.json') -Raw | ConvertFrom-Json
$workspaceRoot = [IO.Path]::GetFullPath($manifest.root).TrimEnd('\\') + '\\'
foreach ($item in $manifest.files) {
  $source = [IO.Path]::GetFullPath((Join-Path (Join-Path $snapshotRoot 'files') $item.path))
  $target = [IO.Path]::GetFullPath((Join-Path $workspaceRoot $item.path))
  if (!$source.StartsWith(([IO.Path]::GetFullPath((Join-Path $snapshotRoot 'files')) + '\\'), [StringComparison]::OrdinalIgnoreCase) -or !$target.StartsWith($workspaceRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe checkpoint path' }
  if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.sha256) { throw ('Checkpoint hash mismatch: ' + $item.path) }
}
foreach ($item in $manifest.files) {
  $source = Join-Path (Join-Path $snapshotRoot 'files') $item.path
  $target = Join-Path $workspaceRoot $item.path
  New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
  Copy-Item -LiteralPath $source -Destination $target -Force
}
Write-Output 'Scott V2 riding checkpoint restored. Other files were not removed.'
`)
fs.mkdirSync('artifacts/scott-v2-riding',{recursive:true});fs.writeFileSync('artifacts/scott-v2-riding/checkpoint.json',JSON.stringify({directory,files:files.length,bytes:manifest.files.reduce((s,f)=>s+f.bytes,0),restore:path.join(directory,'restore.ps1')},null,2)+'\n')
console.log(JSON.stringify({directory,files:files.length,bytes:manifest.files.reduce((s,f)=>s+f.bytes,0)}))
