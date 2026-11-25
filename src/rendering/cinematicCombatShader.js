import {Vector4} from 'three'
export const CINEMATIC_CAPACITY=8
export function cinematicUniforms(){return {
 uCfxCount:{value:0},uCfxEvents:{value:Array.from({length:8},()=>new Vector4())},uCfxParams:{value:Array.from({length:8},()=>new Vector4())},uCfxDirections:{value:Array.from({length:8},()=>new Vector4())},
 uCfxCap:{value:.5},uCfxExposure:{value:0},uCfxChromatic:{value:0},
}}
export const cinematicDeclarations=/* glsl */`
uniform int uCfxCount;
uniform vec4 uCfxEvents[8];
uniform vec4 uCfxParams[8];
uniform vec4 uCfxDirections[8];
uniform float uCfxCap;
uniform float uCfxExposure;
uniform float uCfxChromatic;
`
export const cinematicComposite=/* glsl */`
 if(uCfxCount>0){
  vec2 aspect=vec2(uBoostAspect,1.0);
  float aimGuard=1.0-smoothstep(.065,.13,length((vUv-uImpactBlurFocus)*aspect));
  float cfxGuard=max(boostProtected(vUv),aimGuard);
  if(cfxGuard<.999){
   vec3 glow=vec3(0.0);float total=0.0,exposure=0.0;
   vec2 refraction=vec2(0.0),directionalBlur=vec2(0.0);float blurWeight=0.0;
   float edge=smoothstep(.52,.98,2.0*max(abs(vUv.x-.5),abs(vUv.y-.5)));
   for(int i=0;i<8;i++){
    if(i>=uCfxCount)break;
    vec4 event=uCfxEvents[i],p=uCfxParams[i],d=uCfxDirections[i];
    float type=event.w,strength=event.z;
    if(type<.5||(type>1.5&&type<2.5)||(type>3.5&&type<4.5)){
     float distance=length((vUv-event.xy)*aspect);
     float sector=mix(1.0,exp(-distance*distance/max(.02,p.y*p.y)),d.z);
     float organic=.86+.14*sin(vUv.x*19.0+vUv.y*13.0+p.x*5.0);
     float weight=strength*edge*sector*organic;
     vec3 color=type<.5?vec3(.61,.055,1.0):type<2.5?vec3(1.0,.48,.095):vec3(.33,.23,.14);
     glow+=color*weight;total+=weight;
     if(type>1.5&&type<2.5)exposure+=weight*uCfxExposure;
    }else if(type<1.5){
     vec2 along=normalize(d.xy*aspect+vec2(.00001));vec2 q=(vUv-event.xy)*aspect;
     float x=dot(q,along),y=dot(q,vec2(-along.y,along.x));
     float width=.004+p.y*.025;
     float streak=exp(-y*y/(width*width))*smoothstep(-p.y,-p.y*.7,x)*(1.0-smoothstep(p.y*.25,p.y,x));
     float weight=streak*strength;
     glow+=vec3(.75,.36,1.0)*weight;total+=weight;
     directionalBlur+=d.xy*p.z*weight;blurWeight+=weight;
    }else if(type>4.5){
     vec2 q=(vUv-event.xy)*aspect;float distance=length(q);
     float ring=exp(-pow((distance-(.025+p.x*.62)*p.y)/.035,2.0));
     refraction+=q/max(distance,.0001)*ring*p.w*strength;
    }
   }
   float visibility=1.0-cfxGuard;
   refraction*=visibility;refraction=clamp(refraction,vec2(-1.5),vec2(1.5));
   if(dot(refraction,refraction)>.00001){
    vec2 tap=clamp(vUv+refraction*uPixel,vec2(0.0),vec2(1.0));
    if(boostProtected(tap)<.5){
     vec3 refracted=texture2D(uBeauty,tap).rgb;
     if(uCfxChromatic>0.0){
      vec2 chroma=normalize(refraction+vec2(.00001))*uPixel*uCfxChromatic;
      refracted.r=texture2D(uBeauty,clamp(tap+chroma,vec2(0.0),vec2(1.0))).r;
      refracted.b=texture2D(uBeauty,clamp(tap-chroma,vec2(0.0),vec2(1.0))).b;
     }
     beauty=mix(beauty,refracted,min(.3,length(refraction)));
    }
   }
   if(blurWeight>.0001){
    vec2 delta=clamp(directionalBlur,vec2(-3.0),vec2(3.0))*uPixel;
    vec2 tap=clamp(vUv-delta,vec2(0.0),vec2(1.0));
    if(boostProtected(tap)<.5)beauty=mix(beauty,beauty*.6+texture2D(uBeauty,tap).rgb*.4,min(.35,blurWeight)*visibility);
   }
   float budget=min(1.0,uCfxCap/max(total,.0001))*visibility;
   beauty=beauty*(1.0-min(.08,exposure)*visibility)+glow*budget;
  }
 }
`
