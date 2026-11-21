import fs from 'node:fs'
import{connect}from'./browser-cdp.mjs'
const c=await connect();fs.mkdirSync('artifacts/forest-foliage',{recursive:true})
try{await c.send('Emulation.setDeviceMetricsOverride',{width:1800,height:900,deviceScaleFactor:1,mobile:false});await c.send('Page.navigate',{url:'http://127.0.0.1:5173/.local/foliage-review.html'});for(let i=0;i<200;i++){if(await c.evaluate('!!window.reviewReady'))break;await new Promise(r=>setTimeout(r,200))}fs.writeFileSync('artifacts/forest-foliage/species-review.png',Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).data,'base64'));console.log(await c.evaluate('({ready:window.reviewReady})'))}finally{await c.send('Page.navigate',{url:'http://127.0.0.1:5173/?environment=forest'});c.close()}
