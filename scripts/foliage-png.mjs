import fs from 'node:fs'
import zlib from 'node:zlib'

// Lossless asset extraction, not image synthesis. Source is RGBA8 PNG.
export function readRgbaPng(file) {
  const input=fs.readFileSync(file),chunks=[];let width,height,depth,type
  for(let offset=8;offset<input.length;){const size=input.readUInt32BE(offset),name=input.toString('ascii',offset+4,offset+8),data=input.subarray(offset+8,offset+8+size);if(name==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);depth=data[8];type=data[9];if(data[12])throw Error('Interlaced PNG not supported')}if(name==='IDAT')chunks.push(data);offset+=size+12}
  if(depth!==8||type!==6)throw Error(`Expected RGBA8 PNG; got ${depth}/${type}`)
  const raw=zlib.inflateSync(Buffer.concat(chunks)),stride=width*4,pixels=new Uint8Array(width*height*4)
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c}
  for(let y=0;y<height;y++){const filter=raw[y*(stride+1)];for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=4?pixels[i-4]:0,b=y?pixels[i-stride]:0,c=x>=4&&y?pixels[i-stride-4]:0,value=raw[y*(stride+1)+1+x];pixels[i]=(value+(filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?paeth(a,b,c):0))&255}}
  return {width,height,pixels}
}
const table=Uint32Array.from({length:256},(_,n)=>{for(let j=0;j<8;j++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0})
function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=table[(crc^b)&255]^(crc>>>8);return(crc^0xffffffff)>>>0}
function chunk(name,bytes){const type=Buffer.from(name),out=Buffer.alloc(bytes.length+12);out.writeUInt32BE(bytes.length);type.copy(out,4);Buffer.from(bytes).copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([type,Buffer.from(bytes)])),bytes.length+8);return out}
export function writeRgbaPng(file,{width,height,pixels}) {
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6
  const raw=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)raw.set(pixels.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1)
  fs.writeFileSync(file,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]))
}

export function components(width,height,pixels,alpha=48) {
  const labels=new Int32Array(width*height).fill(-1),queue=new Int32Array(width*height),found=[]
  for(let seed=0;seed<labels.length;seed++){
    if(labels[seed]>=0||pixels[seed*4+3]<alpha)continue
    const id=found.length,box={id,count:0,minX:width,minY:height,maxX:0,maxY:0};let head=0,tail=0;queue[tail++]=seed;labels[seed]=id
    while(head<tail){const i=queue[head++],x=i%width,y=Math.floor(i/width);box.count++;box.minX=Math.min(box.minX,x);box.minY=Math.min(box.minY,y);box.maxX=Math.max(box.maxX,x);box.maxY=Math.max(box.maxY,y)
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=width||yy>=height)continue;const j=yy*width+xx;if(labels[j]<0&&pixels[j*4+3]>=alpha){labels[j]=id;queue[tail++]=j}}
    }
    found.push(box)
  }
  return {labels,found}
}
