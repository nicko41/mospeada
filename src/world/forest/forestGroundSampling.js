// Shared verbatim with the approved opening terrain. Blend image crops rather
// than tinting pixels or repeating one fixed crop down the road.
export const FOREST_GROUND_SAMPLING_GLSL=`      vec3 groundUvHash(vec2 p){vec3 h=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));h+=dot(h,h.yxz+33.33);return fract((h.xxy+h.yzz)*h.zyx);}
      vec4 groundImage(sampler2D image,vec2 uv,vec2 tile,vec2 dx,vec2 dy){
        vec3 h=groundUvHash(tile);float turn=floor(h.z*4.0);
        mat2 rotate=turn<1.0?mat2(1,0,0,1):turn<2.0?mat2(0,1,-1,0):turn<3.0?mat2(-1,0,0,-1):mat2(0,-1,1,0);
        float size=.9+h.x*.2;
        return textureGrad(image,rotate*uv*size+h.xy*7.0,rotate*dx*size,rotate*dy*size);
      }
      vec4 groundIllustration(sampler2D image,vec2 uv,vec2 dx,vec2 dy){
        vec2 cell=floor(uv),f=fract(uv),a,b,c;vec3 weights;
        if(f.x+f.y<1.0){a=cell;b=cell+vec2(1,0);c=cell+vec2(0,1);weights=vec3(1.0-f.x-f.y,f.x,f.y);}
        else{a=cell+vec2(1);b=cell+vec2(0,1);c=cell+vec2(1,0);weights=vec3(f.x+f.y-1.0,1.0-f.x,1.0-f.y);}
        weights=pow(max(weights,vec3(0)),vec3(4));weights/=dot(weights,vec3(1));
        return groundImage(image,uv,a,dx,dy)*weights.x+groundImage(image,uv,b,dx,dy)*weights.y+groundImage(image,uv,c,dx,dy)*weights.z;
      }
`
