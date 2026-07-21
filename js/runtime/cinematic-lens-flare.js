/* =========================================================
   LOT KING - cinematic sun lens flare
   Full CC0 shader by Anderson Mancini / R3F Ultimate Lens Flare,
   adapted only for Lot King's HDR post-processing pipeline.
   Source and attribution: media/lensflare/LICENSE-CC0.txt
   ========================================================= */
(function(){
'use strict';

function createPass(THREE, options){
  options = options || {};
  if(!THREE || !THREE.ShaderPass) return null;

  const ownsDirtTexture = !options.dirtTexture;
  const dirt = options.dirtTexture || new THREE.TextureLoader().load(options.dirtTextureUrl || 'media/lensflare/lensDirtTexture.jpg');
  if(ownsDirtTexture){
    dirt.colorSpace = THREE.SRGBColorSpace;
    dirt.wrapS = dirt.wrapT = THREE.ClampToEdgeWrapping;
  }

  const pass = new THREE.ShaderPass({
    uniforms:{
      tDiffuse:{value:null},
      lensDirtTexture:{value:dirt},
      iTime:{value:0},
      iResolution:{value:new THREE.Vector2(1,1)},
      lensPosition:{value:new THREE.Vector2(0,0)},
      colorGain:{value:new THREE.Color().setRGB(95,12,10)},
      starPoints:{value:5},
      glareSize:{value:.55},
      flareSize:{value:.004},
      flareSpeed:{value:.4},
      flareShape:{value:1.2},
      haloScale:{value:.5},
      opacity:{value:1},
      animated:{value:true},
      anamorphic:{value:false},
      enabled:{value:true},
      secondaryGhosts:{value:true},
      starBurst:{value:true},
      ghostScale:{value:.3},
      aditionalStreaks:{value:true},
      visibility:{value:0},
      intensity:{value:0},
      bloomEnabled:{value:1},
      bloomIntensity:{value:1.3},
      bloomRadius:{value:.14},
      bloomThreshold:{value:.52},
      bloomSize:{value:1},
    },
    vertexShader:[
      'varying vec2 vUv;',
      'void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    ].join('\n'),
    fragmentShader:"// Based on https://www.shadertoy.com/view/4sX3Rs\n    uniform sampler2D tDiffuse;\n    uniform float visibility;\n    uniform float intensity;\n    uniform float bloomEnabled;\n    uniform float bloomIntensity;\n    uniform float bloomRadius;\n    uniform float bloomThreshold;\n    uniform float bloomSize;\n    uniform float iTime;\n    uniform vec2 lensPosition;\n    uniform vec2 iResolution;\n    uniform vec3 colorGain;\n    uniform float starPoints;\n    uniform float glareSize;\n    uniform float flareSize;\n    uniform float flareSpeed;\n    uniform float flareShape;\n    uniform float haloScale;\n    uniform float opacity;\n    uniform bool animated;\n    uniform bool anamorphic;\n    uniform bool enabled;\n    uniform bool secondaryGhosts;\n    uniform bool starBurst;\n    uniform float ghostScale;\n    uniform bool aditionalStreaks;\n    uniform sampler2D lensDirtTexture;\n    varying vec2 vUv;\n\n    float uDispersal = 0.3;\n    float uHaloWidth = 0.6;\n    float uDistortion = 1.5;\n    float uBrightDark = 0.5;\n    vec2 vTexCoord;\n    \n\n    float rand(float n){return fract(sin(n) * 43758.5453123);}\n\n    float noise(float p){\n        float fl = floor(p);\n        float fc = fract(p);\n        return mix(rand(fl),rand(fl + 1.0), fc);\n    }\n\n    vec3 hsv2rgb(vec3 c)\n    {\n        vec4 k = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);\n        vec3 p = abs(fract(c.xxx + k.xyz) * 6.0 - k.www);\n        return c.z * mix(k.xxx, clamp(p - k.xxx, 0.0, 1.0), c.y);\n    }\n\n    float saturate2(float x)\n    {\n        return clamp(x, 0.,1.);\n    }\n\n\n    vec2 rotateUV(vec2 uv, float rotation)\n    {\n        return vec2(\n            cos(rotation) * uv.x + sin(rotation) * uv.y,\n            cos(rotation) * uv.y - sin(rotation) * uv.x\n        );\n    }\n\n    // Based on https://www.shadertoy.com/view/XtKfRV\n    vec3 drawflare(vec2 p, float intensity, float rnd, float speed, int id)\n    {\n        float flarehueoffset = (1. / 32.) * float(id) * 0.1;\n        float lingrad = distance(vec2(0.), p);\n        float expgrad = 1. / exp(lingrad * (fract(rnd) * 0.66 + 0.33));\n        vec3 colgrad = hsv2rgb(vec3( fract( (expgrad * 8.) + speed * flareSpeed + flarehueoffset), pow(1.-abs(expgrad*2.-1.), 0.45), 20.0 * expgrad * intensity)); //rainbow spectrum effect\n\n        float internalStarPoints;\n\n        if(anamorphic){\n            internalStarPoints = 1.0;\n        } else{\n            internalStarPoints = starPoints;\n        }\n        \n        float blades = length(p * flareShape * sin(internalStarPoints * atan(p.x, p.y))); //draw 6 blades\n        \n        float comp = pow(1.-saturate2(blades), ( anamorphic ? 100. : 12.));\n        comp += saturate2(expgrad-0.9) * 3.;\n        comp = pow(comp * expgrad, 8. + (1.-intensity) * 5.);\n        \n        if(flareSpeed > 0.0){\n            return vec3(comp) * colgrad;\n        } else{\n            return vec3(comp) * flareSize * 15.;\n        }\n    }\n\n    float dist(vec3 a, vec3 b) { return abs(a.x - b.x) + abs(a.y - b.y) + abs(a.z - b.z); }\n\n    float glare(vec2 uv, vec2 pos, float size)\n    {\n        vec2 main;\n\n        if(animated){\n        main = rotateUV(uv-pos, iTime * 0.1);      \n        } else{\n        main = uv-pos;     \n        }\n        \n        float ang = atan(main.y, main.x) * (anamorphic ? 1.0 : starPoints);\n        float dist = length(main); \n        dist = pow(dist, .9);\n        \n        float f0 = 1.0/(length(uv-pos)*(1.0/size*16.0)+.2);\n\n        return f0+f0*(sin((ang))*.2 +.3);\n    }\n\n    //https://www.shadertoy.com/view/Xd2GR3\n    float sdHex(vec2 p){\n        p = abs(p);\n        vec2 q = vec2(p.x*2.0*0.5773503, p.y + p.x*0.5773503);\n        return dot(step(q.xy,q.yx), 1.0-q.yx);\n    }\n\n    //fakes x^n for specular effects (k is 0-1)\n    float fpow(float x, float k){\n        return x > k ? pow((x-k)/(1.0-k),2.0) : 0.0;\n    }\n\n    vec3 renderhex(vec2 uv, vec2 p, float s, vec3 col){\n        uv -= p;\n        if (abs(uv.x) < 0.2*s && abs(uv.y) < 0.2*s){\n            return mix(vec3(0),mix(vec3(0),col,0.1 + fpow(length(uv/s),0.1)*10.0),smoothstep(0.0,0.1,sdHex(uv*20.0/s)));\n        }\n        return vec3(0);\n    }\n\n    vec3 LensFlare(vec2 uv, vec2 pos)\n    {\n        vec2 main = uv-pos;\n        vec2 uvd = uv*(length(uv));\n        \n        float ang = atan(main.x,main.y);\n        \n        float f0 = .3/(length(uv-pos)*16.0+1.0);\n        \n        f0 = f0*(sin(noise(sin(ang*3.9-(animated ? iTime : 0.0) * 0.3) * starPoints))*.2 );\n        \n        float f1 = max(0.01-pow(length(uv+1.2*pos),1.9),.0)*7.0;\n\n        float f2 = max(.9/(10.0+32.0*pow(length(uvd+0.99*pos),2.0)),.0)*0.35;\n        float f22 = max(.9/(11.0+32.0*pow(length(uvd+0.85*pos),2.0)),.0)*0.23;\n        float f23 = max(.9/(12.0+32.0*pow(length(uvd+0.95*pos),2.0)),.0)*0.6;\n        \n        vec2 uvx = mix(uv,uvd, 0.1);\n        \n        float f4 = max(0.01-pow(length(uvx+0.4*pos),2.9),.0)*4.02;\n        float f42 = max(0.0-pow(length(uvx+0.45*pos),2.9),.0)*4.1;\n        float f43 = max(0.01-pow(length(uvx+0.5*pos),2.9),.0)*4.6;\n        \n        uvx = mix(uv,uvd,-.4);\n        \n        float f5 = max(0.01-pow(length(uvx+0.1*pos),5.5),.0)*2.0;\n        float f52 = max(0.01-pow(length(uvx+0.2*pos),5.5),.0)*2.0;\n        float f53 = max(0.01-pow(length(uvx+0.1*pos),5.5),.0)*2.0;\n        \n        uvx = mix(uv,uvd, 2.1);\n        \n        float f6 = max(0.01-pow(length(uvx-0.3*pos),1.61),.0)*3.159;\n        float f62 = max(0.01-pow(length(uvx-0.325*pos),1.614),.0)*3.14;\n        float f63 = max(0.01-pow(length(uvx-0.389*pos),1.623),.0)*3.12;\n        \n        vec3 c = vec3(glare(uv,pos, glareSize));\n\n        vec2 prot;\n\n        if(animated){\n            prot = rotateUV(uv - pos, (iTime * 0.1));  \n        } else if(anamorphic){\n            prot = rotateUV(uv - pos, 1.570796);     \n        } else {\n            prot = uv - pos;\n        }\n\n        c += drawflare(prot, (anamorphic ? flareSize * 10. : flareSize), 0.1, iTime, 1);\n        \n        c.r+=f1+f2+f4+f5+f6; c.g+=f1+f22+f42+f52+f62; c.b+=f1+f23+f43+f53+f63;\n        c = c*1.3 * vec3(length(uvd)+.09); // Vignette\n        c+=vec3(f0);\n        \n        return c;\n    }\n\n    vec3 cc(vec3 color, float factor,float factor2)\n    {\n        float w = color.x+color.y+color.z;\n        return mix(color,vec3(w)*factor,w*factor2);\n    }    \n\n    float rnd(vec2 p)\n    {\n        float f = fract(sin(dot(p, vec2(12.1234, 72.8392) )*45123.2));\n        return f;   \n    }\n\n    float rnd(float w)\n    {\n        float f = fract(sin(w)*1000.);\n        return f;   \n    }\n\n    float regShape(vec2 p, int N)\n    {\n        float f;\n        \n        float a=atan(p.x,p.y)+.2;\n        float b=6.28319/float(N);\n        f=smoothstep(.5,.51, cos(floor(.5+a/b)*b-a)*length(p.xy)* 2.0  -ghostScale);\n            \n        return f;\n    }\n\n    // Based on https://www.shadertoy.com/view/Xlc3D2\n    vec3 circle(vec2 p, float size, float decay, vec3 color, vec3 color2, float dist, vec2 mouse)\n    {\n        float l = length(p + mouse*(dist*2.))+size/2.;\n        float l2 = length(p + mouse*(dist*4.))+size/3.;\n        \n        float c = max(0.04-pow(length(p + mouse*dist), size*ghostScale), 0.0)*10.;\n        float c1 = max(0.001-pow(l-0.3, 1./40.)+sin(l*20.), 0.0)*3.;\n        float c2 =  max(0.09/pow(length(p-mouse*dist/.5)*1., .95), 0.0)/20.;\n        float s = max(0.02-pow(regShape(p*5. + mouse*dist*5. + decay, 6) , 1.), 0.0)*1.5;\n        \n        color = cos(vec3(colorGain)*16. + dist/8.)*0.5+.5;\n        vec3 f = c*color;\n        f += c1*color;\n        f += c2*color;  \n        f +=  s*color;\n        return f;\n    }\n\n    vec4 getLensColor(float x){\n        return vec4(vec3(mix(mix(mix(mix(mix(mix(mix(mix(mix(mix(mix(mix(mix(mix(mix(vec3(0., 0., 0.),\n        vec3(0., 0., 0.), smoothstep(0.0, 0.063, x)),\n        vec3(0., 0., 0.), smoothstep(0.063, 0.125, x)),\n        vec3(0.0, 0., 0.), smoothstep(0.125, 0.188, x)),\n        vec3(0.188, 0.131, 0.116), smoothstep(0.188, 0.227, x)),\n        vec3(0.31, 0.204, 0.537), smoothstep(0.227, 0.251, x)),\n        vec3(0.192, 0.106, 0.286), smoothstep(0.251, 0.314, x)),\n        vec3(0.102, 0.008, 0.341), smoothstep(0.314, 0.392, x)),\n        vec3(0.086, 0.0, 0.141), smoothstep(0.392, 0.502, x)),\n        vec3(1.0, 0.31, 0.0), smoothstep(0.502, 0.604, x)),\n        vec3(.1, 0.1, 0.1), smoothstep(0.604, 0.643, x)),\n        vec3(1.0, 0.929, 0.0), smoothstep(0.643, 0.761, x)),\n        vec3(1.0, 0.086, 0.424), smoothstep(0.761, 0.847, x)),\n        vec3(1.0, 0.49, 0.0), smoothstep(0.847, 0.89, x)),\n        vec3(0.945, 0.275, 0.475), smoothstep(0.89, 0.941, x)),\n        vec3(0.251, 0.275, 0.796), smoothstep(0.941, 1.0, x))),\n        1.0);\n    }\n\n    float dirtNoise(vec2 p){\n        vec2 f = fract(p);\n        f = (f * f) * (3.0 - (2.0 * f));    \n        float n = dot(floor(p), vec2(1.0, 157.0));\n        vec4 a = fract(sin(vec4(n + 0.0, n + 1.0, n + 157.0, n + 158.0)) * 43758.5453123);\n        return mix(mix(a.x, a.y, f.x), mix(a.z, a.w, f.x), f.y);\n    } \n\n    float fbm(vec2 p){\n        const mat2 m = mat2(0.80, -0.60, 0.60, 0.80);\n        float f = 0.0;\n        f += 0.5000*dirtNoise(p); p = m*p*2.02;\n        f += 0.2500*dirtNoise(p); p = m*p*2.03;\n        f += 0.1250*dirtNoise(p); p = m*p*2.01;\n        f += 0.0625*dirtNoise(p);\n        return f/0.9375;\n    } \n    vec4 getLensStar(vec2 p){\n        vec2 pp = (p - vec2(0.5)) * 2.0;\n        float a = atan(pp.y, pp.x);\n        vec4 cp = vec4(sin(a * 1.0), length(pp), sin(a * 13.0), sin(a * 53.0));\n        float d = sin(clamp(pow(length(vec2(0.5) - p) * 0.5 + haloScale /2., 5.0), 0.0, 1.0) * 3.14159);\n        vec3 c = vec3(d) * vec3(fbm(cp.xy * 16.0) * fbm(cp.zw * 9.0) * max(max(max(max(0.5, sin(a * 1.0)), sin(a * 3.0) * 0.8), sin(a * 7.0) * 0.8), sin(a * 9.0) * 10.6));\n        c *= vec3(mix(2.0, (sin(length(pp.xy) * 256.0) * 0.5) + 0.5, sin((clamp((length(pp.xy) - 0.875) / 0.1, 0.0, 1.0) + 0.0) * 2.0 * 3.14159) * 1.5) + 0.5) * 0.3275;\n        return vec4(vec3(c * 1.0), d);\t\n    }\n\n    vec4 getLensDirt(vec2 p){\n        p.xy += vec2(fbm(p.yx * 3.0), fbm(p.yx * 2.0)) * 0.0825;\n        vec3 o = vec3(mix(0.125, 0.25, max(max(smoothstep(0.1, 0.0, length(p - vec2(0.25))),\n                                            smoothstep(0.4, 0.0, length(p - vec2(0.75)))),\n                                            smoothstep(0.8, 0.0, length(p - vec2(0.875, 0.125))))));\n        o += vec3(max(fbm(p * 1.0) - 0.5, 0.0)) * 0.5;\n        o += vec3(max(fbm(p * 2.0) - 0.5, 0.0)) * 0.5;\n        o += vec3(max(fbm(p * 4.0) - 0.5, 0.0)) * 0.25;\n        o += vec3(max(fbm(p * 8.0) - 0.75, 0.0)) * 1.0;\n        o += vec3(max(fbm(p * 16.0) - 0.75, 0.0)) * 0.75;\n        o += vec3(max(fbm(p * 64.0) - 0.75, 0.0)) * 0.5;\n        return vec4(clamp(o, vec3(0.15), vec3(1.0)), 1.0);\t\n    }\n\n    vec4 textureLimited(sampler2D tex, vec2 texCoord){\n        if(((texCoord.x < 0.) || (texCoord.y < 0.)) || ((texCoord.x > 1.) || (texCoord.y > 1.))){\n        return vec4(0.0);\n        }else{\n        return texture2D(tex, texCoord); \n        }\n    }\n\n    vec4 textureDistorted(sampler2D tex, vec2 texCoord, vec2 direction, vec3 distortion) {\n        return vec4(textureLimited(tex, (texCoord + (direction * distortion.r))).r,\n                    textureLimited(tex, (texCoord + (direction * distortion.g))).g,\n                    textureLimited(tex, (texCoord + (direction * distortion.b))).b,\n                    1.0);\n    }\n\n    vec4 getStartBurst(){\n        vec2 aspectTexCoord = vec2(1.0) - (((vTexCoord - vec2(0.5)) * vec2(1.0)) + vec2(0.5)); \n        vec2 texCoord = vec2(1.0) - vTexCoord; \n        vec2 ghostVec = (vec2(0.5) - texCoord) * uDispersal - lensPosition;\n        vec2 ghostVecAspectNormalized = normalize(ghostVec * vec2(1.0)) * vec2(1.0);\n        vec2 haloVec = normalize(ghostVec) * uHaloWidth;\n        vec2 haloVecAspectNormalized = ghostVecAspectNormalized * uHaloWidth;\n        vec2 texelSize = vec2(1.0) / vec2(iResolution.xy);\n        vec3 distortion = vec3(-(texelSize.x * uDistortion), 0.2, texelSize.x * uDistortion);\n        vec4 c = vec4(0.0);\n        for (int i = 0; i < 8; i++) {\n        vec2 offset = texCoord + (ghostVec * float(i));\n        c += textureDistorted(lensDirtTexture, offset, ghostVecAspectNormalized, distortion) * pow(max(0.0, 1.0 - (length(vec2(0.5) - offset) / length(vec2(0.5)))), 10.0);\n        }                       \n        vec2 haloOffset = texCoord + haloVecAspectNormalized; \n        return (c * getLensColor((length(vec2(0.5) - aspectTexCoord) / length(vec2(haloScale))))) + \n            (textureDistorted(lensDirtTexture, haloOffset, ghostVecAspectNormalized, distortion) * pow(max(0.0, 1.0 - (length(vec2(0.5) - haloOffset) / length(vec2(0.5)))), 10.0));\n    } \n\n    void main()\n    {\n        vec2 uv = vUv;\n        vec2 myUV = uv -0.5;\n        myUV.y *= iResolution.y/iResolution.x;\n        vec2 mouse = lensPosition * 0.5;\n        mouse.y *= iResolution.y/iResolution.x;\n        \n        //First LensFlarePass\n        vec3 finalColor = LensFlare(myUV, mouse) * 20.0 * colorGain / 256.;\n\n        //Aditional Streaks\n        if(aditionalStreaks){\n            vec3 circColor = vec3(0.9, 0.2, 0.1);\n            vec3 circColor2 = vec3(0.3, 0.1, 0.9);\n\n            for(float i=0.;i<10.;i++){\n            finalColor += circle(myUV, pow(rnd(i*2000.)*2.8, .1)+1.41, 0.0, circColor+i , circColor2+i, rnd(i*20.)*3.+0.2-.5, lensPosition);\n            }\n        }\n\n        //Alternative Ghosts\n        if(secondaryGhosts){\n            vec3 altGhosts = vec3(0.1);\n            altGhosts += renderhex(myUV, -lensPosition*0.25, ghostScale * 1.4, vec3(0.03)* colorGain);\n            altGhosts += renderhex(myUV, lensPosition*0.25, ghostScale * 0.5, vec3(0.03)* colorGain);\n            altGhosts += renderhex(myUV, lensPosition*0.1, ghostScale * 1.6,vec3(0.03)* colorGain);\n            altGhosts += renderhex(myUV, lensPosition*1.8, ghostScale * 2.0, vec3(0.03)* colorGain);\n            altGhosts += renderhex(myUV, lensPosition*1.25, ghostScale * 0.8, vec3(0.03)* colorGain);\n            altGhosts += renderhex(myUV, -lensPosition*1.25, ghostScale * 5.0, vec3(0.03)* colorGain);\n            \n            //Circular ghost\n            altGhosts += fpow(1.0 - abs(distance(lensPosition*0.8,myUV) - 0.5),0.985)*vec3(.1);\n            altGhosts += fpow(1.0 - abs(distance(lensPosition*0.4,myUV) - 0.2),0.994)*vec3(.05);\n            finalColor += altGhosts;\n        }\n        \n\n        //Starburst                     \n        if(starBurst){\n            vTexCoord = myUV + 0.5;\n            vec4 lensMod = getLensDirt(myUV);\n            float tooBright = 1.0 - (clamp(uBrightDark, 0.0, 0.5) * 2.0); \n            float tooDark = clamp(uBrightDark - 0.5, 0.0, 0.5) * 2.0;\n            lensMod += mix(lensMod, pow(lensMod * 2.0, vec4(2.0)) * 0.5, tooBright);\n            float lensStarRotationAngle = ((myUV.x + myUV.y)) * (1.0 / 6.0);\n            vec2 lensStarTexCoord = (mat2(cos(lensStarRotationAngle), -sin(lensStarRotationAngle), sin(lensStarRotationAngle), cos(lensStarRotationAngle)) * vTexCoord);\n            lensMod += getLensStar(lensStarTexCoord) * 2.;\n            \n            finalColor += clamp((lensMod.rgb * getStartBurst().rgb ), 0.01, 1.0);\n        }\n\n        // HDR additive composition. Keep the original flare energy intact and\n        // let Lot King's OutputPass tone-map it together with the scene.\n        vec4 base = texture2D(tDiffuse, vUv);\n        float edgeFade = clamp(1.2 - max(abs(lensPosition.x), abs(lensPosition.y)), 0.0, 1.0);\n        float visible = visibility * edgeFade;\n        vec2 bloomDelta = myUV - mouse;\n        float bloomScale = max(0.02, (0.055 + bloomRadius * 0.30) * bloomSize);\n        float bloomCore = exp(-dot(bloomDelta, bloomDelta) / max(0.00001, bloomScale * bloomScale * 0.035));\n        float bloomMid = exp(-length(bloomDelta) / max(0.001, bloomScale * 0.30));\n        float bloomWide = exp(-length(bloomDelta) / max(0.001, bloomScale));\n        float thresholdGain = mix(1.30, 0.72, clamp(bloomThreshold, 0.0, 1.0));\n        vec3 hotSun = mix(vec3(1.0, 0.58, 0.28), vec3(1.0, 0.93, 0.78), clamp(bloomCore * 2.0, 0.0, 1.0));\n        vec3 bloom = hotSun * (bloomCore * 7.0 + bloomMid * 2.4 + bloomWide * 0.72)\n          * bloomEnabled * bloomIntensity * thresholdGain * visible;\n        vec3 flareHdr = max(finalColor - vec3(0.012), vec3(0.0)) * intensity * visible * opacity;\n        vec3 composed = base.rgb + (enabled ? flareHdr : vec3(0.0)) + bloom;\n        gl_FragColor = vec4(max(composed, vec3(0.0)), base.a);\n    }",
  });

  // Stabilize the tiny point ghosts from the reference shader. Its reciprocal
  // core is singular at the centre and sparkles as it crosses fractional
  // pixels; a bounded Gaussian keeps the same optical dots temporally stable.
  if(pass.material && pass.material.fragmentShader){
    pass.material.fragmentShader = pass.material.fragmentShader.replace(
      'float c2 =  max(0.09/pow(length(p-mouse*dist/.5)*1., .95), 0.0)/20.;',
      'float dotDistance = length(p-mouse*dist/.5); float dotRadius = 0.032 + 0.012 / max(size, 0.5); float c2 = exp(-(dotDistance*dotDistance) / max(0.00001, dotRadius*dotRadius)) * 0.085;'
    );
  }

  pass.enabled=false;
  pass.userData={dirtTexture:dirt};
  pass.setSize=function(width,height){
    pass.uniforms.iResolution.value.set(Math.max(1,width||1),Math.max(1,height||1));
  };
  pass.updateFromState=function(state,width,height){
    const u=pass.uniforms;
    const flare=state&&state.flare||{};
    const bloom=state&&state.bloom||{};
    pass.enabled=!!(state&&state.mode==='cinematic'&&state.visible&&((flare.enabled&&flare.intensity>0)||(bloom.enabled&&bloom.intensity>0)));
    if(!pass.enabled) return;

    pass.setSize(width,height);
    u.lensPosition.value.set(Number(state.ndcX)||0,Number(state.ndcY)||0);
    u.visibility.value=Math.max(0,Math.min(1,Number(state.visibility)||0));
    u.iTime.value=performance.now()*.001;

    // These deliberately non-normalized HDR values are the optical color gain
    // used by the reference effect. Normalizing them removes its bright core.
    u.colorGain.value.setRGB(95,12,10);
    u.intensity.value=flare.enabled===false?0:Math.max(0,Number(flare.intensity)||0);
    const size=Math.max(.1,Number(flare.size)||1);
    u.glareSize.value=.55*size;
    u.flareSize.value=.004*size*(.7+1.3*Math.max(0,Number(flare.streak)||0));
    u.flareShape.value=1.2;
    u.haloScale.value=Math.max(.08,.5*(Number(flare.haloSize)||1));
    u.opacity.value=Math.max(0,Number(flare.ghostOpacity)||0);
    u.anamorphic.value=!!flare.anamorphic;
    u.starPoints.value=flare.anamorphic?1:5;
    u.secondaryGhosts.value=(Number(flare.ghosts)||0)>0;
    u.aditionalStreaks.value=(Number(flare.ghosts)||0)>3;
    u.starBurst.value=(Number(flare.starburst)||0)>0.001;
    u.ghostScale.value=Math.max(.05,.3*size*(Number(flare.spacing)||.92));
    u.bloomEnabled.value=bloom.enabled===false?0:1;
    u.bloomIntensity.value=Math.max(0,Number(bloom.intensity)||0);
    u.bloomRadius.value=Math.max(.01,Number(bloom.radius)||.14);
    u.bloomThreshold.value=Math.max(0,Math.min(1,Number(bloom.threshold)||.52));
    u.bloomSize.value=Math.max(.1,Number(bloom.size)||1);
  };
  pass.disposeCinematic=function(){
    if(ownsDirtTexture) dirt.dispose();
    if(pass.material) pass.material.dispose();
  };
  return pass;
}

window.LK_RUNTIME_CINEMATIC_LENS_FLARE=Object.freeze({createPass});
})();
