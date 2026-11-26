import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(directory,entry.name)):[path.join(directory,entry.name)])
const files=walk('src').filter(file=>/\.test\.(js|mjs|cjs)$/.test(file)).sort()
const result=spawnSync(process.execPath,['--test','--test-concurrency=2',...process.argv.slice(2),...files],{stdio:'inherit'})
process.exitCode=result.status??1
