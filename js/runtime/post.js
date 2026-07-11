/* =========================================================
   LOT KING — post-processing runtime module
   DOF and gameplay camera visual grading.
   ========================================================= */
(function(){
'use strict';

function createPost(deps){
  const THREE = deps.THREERef || window.THREE;
  const scene = deps.scene;
  const camera = deps.camera;
  let activeCamera = camera;
  const renderer = deps.renderer;
  const config = deps.config;
  const video = deps.video || null;
  const volumetricTarget = deps.volumetricTarget || null;
  const size = deps.size || (() => ({width:innerWidth, height:innerHeight}));
  const focusTarget = deps.focusTarget || null;
  const tmpTargetPos = new THREE.Vector3();

  const ok = typeof THREE.EffectComposer !== 'undefined' && typeof THREE.RenderPass !== 'undefined' && typeof THREE.ShaderPass !== 'undefined';
  if(!ok) return {ok:false};

  const composer = new THREE.EffectComposer(renderer);
  let composerPixelRatio = renderer.getPixelRatio ? renderer.getPixelRatio() : 1;
  const renderPass = new THREE.RenderPass(scene, camera);
  composer.addPass(renderPass);
  let currentSize = size();
  const ssrPass = typeof THREE.SSRPass !== 'undefined' ? new THREE.SSRPass({
    renderer,
    scene,
    camera,
    width:currentSize.width,
    height:currentSize.height,
    groundReflector:null,
    selects:null,
  }) : null;
  if(ssrPass){
    ssrPass.enabled = false;
    ssrPass.opacity = .7;
    ssrPass.maxDistance = 18;
    ssrPass.thickness = .035;
    composer.addPass(ssrPass);
  }
  let ssrSelectionAt = 0;
  function refreshSsrSelection(){
    if(!ssrPass || performance.now() < ssrSelectionAt) return;
    ssrSelectionAt = performance.now() + 500;
    const reflective = [];
    scene.traverse(node => {
      if(!node || !node.isMesh || node.visible === false || !node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      if(materials.some(mat => mat && mat.visible !== false && mat.metalness != null && mat.metalness >= .2 && (mat.roughness == null || mat.roughness <= .72))) reflective.push(node);
    });
    ssrPass.selects = reflective;
    ssrPass.isSelective = true;
  }
  const rawComposerSetSize = composer.setSize.bind(composer);
  composer.setSize = function(w, h){
    currentSize = {width:Math.max(1, Math.round(w || 1)), height:Math.max(1, Math.round(h || 1))};
    rawComposerSetSize(currentSize.width, currentSize.height);
    if(ssrPass && ssrPass.setSize) ssrPass.setSize(currentSize.width, currentSize.height);
    if(dofPass) dofPass.uniforms.resolution.value.set(currentSize.width, currentSize.height);
    if(videoProfilePass) videoProfilePass.uniforms.resolution.value.set(currentSize.width, currentSize.height);
    syncFxaaResolution();
  };

  const bokeh = typeof THREE.BokehPass !== 'undefined' ? new THREE.BokehPass(scene, camera, {
    focus: config.dof.focus,
    aperture: config.dof.aperture,
    maxblur: config.dof.maxblur,
    width: size().width,
    height: size().height,
  }) : null;
  if(bokeh) composer.addPass(bokeh);

  const dofPass = new THREE.ShaderPass({
    uniforms: {
      tDiffuse: {value:null},
      resolution: {value:new THREE.Vector2(size().width, size().height)},
      amount: {value:0},
      blurPx: {value:0},
      focusUv: {value:new THREE.Vector2(.5, .5)},
      focusRadius: {value:.18},
      feather: {value:.42},
      debugFocus: {value:0},
      bokehGain: {value:3},
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main(){',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D tDiffuse;',
      'uniform vec2 resolution;',
      'uniform float amount;',
      'uniform float blurPx;',
      'uniform vec2 focusUv;',
      'uniform float focusRadius;',
      'uniform float feather;',
      'uniform float debugFocus;',
      'uniform float bokehGain;',
      'varying vec2 vUv;',
      // disco a spirale golden-angle (40 tap): copertura uniforme del cerchio.
      // I campioni luminosi pesano di piu' (bokehGain): i punti luce "sbocciano"
      // in dischi netti invece di spalmarsi, come in un obiettivo vero.
      'vec4 blurDisc(vec2 uv, float radius){',
      '  vec2 px = radius / max(resolution, vec2(1.0));',
      '  vec3 acc = vec3(0.0);',
      '  float wsum = 0.0;',
      '  for(int i = 0; i < 40; i++){',
      '    float fi = float(i);',
      '    float a = fi * 2.39996323;',
      '    float r = sqrt((fi + 0.5) / 40.0);',
      '    vec3 c = texture2D(tDiffuse, uv + vec2(cos(a), sin(a)) * r * px).rgb;',
      '    float lum = dot(c, vec3(0.299, 0.587, 0.114));',
      '    float lum2 = lum * lum;',
      '    float w = 1.0 + lum2 * lum2 * bokehGain;',
      '    acc += c * w;',
      '    wsum += w;',
      '  }',
      '  return vec4(acc / max(wsum, 0.001), 1.0);',
      '}',
      'void main(){',
      '  vec4 sharp = texture2D(tDiffuse, vUv);',
      '  float d = distance(vUv, focusUv);',
      '  float mask = smoothstep(focusRadius, focusRadius + feather, d);',
      '  float k = clamp(mask * amount, 0.0, 1.0);',
      '  vec4 outColor = sharp;',
      '  if(k > 0.003 && blurPx > 0.25){',
      // il raggio del disco cresce con la distanza dal fuoco: sfocatura progressiva
      '    vec4 blurred = blurDisc(vUv, blurPx * (0.35 + 0.65 * mask));',
      '    outColor = mix(sharp, blurred, k);',
      '  }',
      '  float ring = 1.0 - smoothstep(0.003, 0.009, abs(d - focusRadius));',
      '  float dotp = 1.0 - smoothstep(0.0, 0.012, d);',
      '  outColor.rgb = mix(outColor.rgb, vec3(1.0, 0.82, 0.28), clamp(debugFocus * max(ring * 0.65, dotp), 0.0, 1.0));',
      '  gl_FragColor = outColor;',
      '}'
    ].join('\n'),
  });
  composer.addPass(dofPass);

  const gradePass = typeof THREE.ShaderPass !== 'undefined' ? new THREE.ShaderPass({
    uniforms: {
      tDiffuse: {value:null},
      exposure: {value:1},
      brightness: {value:0},
      contrast: {value:1},
      saturation: {value:1},
      gamma: {value:1},
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main(){',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D tDiffuse;',
      'uniform float exposure;',
      'uniform float brightness;',
      'uniform float contrast;',
      'uniform float saturation;',
      'uniform float gamma;',
      'varying vec2 vUv;',
      'void main(){',
      '  vec4 c = texture2D(tDiffuse, vUv);',
      '  c.rgb *= exposure;',
      '  c.rgb += brightness;',
      '  c.rgb = (c.rgb - 0.5) * contrast + 0.5;',
      '  float luma = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));',
      '  c.rgb = mix(vec3(luma), c.rgb, saturation);',
      '  c.rgb = pow(max(c.rgb, vec3(0.0)), vec3(1.0 / max(gamma, 0.001)));',
      '  gl_FragColor = c;',
      '}'
    ].join('\n'),
  }) : null;
  if(gradePass) composer.addPass(gradePass);

  const videoProfilePass = typeof THREE.ShaderPass !== 'undefined' ? new THREE.ShaderPass({
    uniforms: {
      tDiffuse:{value:null},
      resolution:{value:new THREE.Vector2(size().width, size().height)},
      contrast:{value:1},
      saturation:{value:1},
      brightness:{value:0},
      sharpen:{value:0},
      vignette:{value:0},
    },
    vertexShader:[
      'varying vec2 vUv;',
      'void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }'
    ].join('\n'),
    fragmentShader:[
      'uniform sampler2D tDiffuse;',
      'uniform vec2 resolution;',
      'uniform float contrast;',
      'uniform float saturation;',
      'uniform float brightness;',
      'uniform float sharpen;',
      'uniform float vignette;',
      'varying vec2 vUv;',
      'void main(){',
      '  vec2 px=1.0/max(resolution,vec2(1.0));',
      '  vec3 c=texture2D(tDiffuse,vUv).rgb;',
      '  if(sharpen>0.001){',
      '    vec3 n=texture2D(tDiffuse,vUv+vec2(0.0,px.y)).rgb;',
      '    vec3 s=texture2D(tDiffuse,vUv-vec2(0.0,px.y)).rgb;',
      '    vec3 e=texture2D(tDiffuse,vUv+vec2(px.x,0.0)).rgb;',
      '    vec3 w=texture2D(tDiffuse,vUv-vec2(px.x,0.0)).rgb;',
      '    c=mix(c,c*5.0-(n+s+e+w),sharpen);',
      '  }',
      '  float luma=dot(c,vec3(.2126,.7152,.0722));',
      '  c=mix(vec3(luma),c,saturation);',
      '  c=(c-.5)*contrast+.5+brightness;',
      '  float v=smoothstep(.82,.18,distance(vUv,vec2(.5)));',
      '  c*=mix(1.0,v,vignette);',
      '  gl_FragColor=vec4(max(c,vec3(0.0)),1.0);',
      '}'
    ].join('\n'),
  }) : null;
  if(videoProfilePass) composer.addPass(videoProfilePass);

  // Browser-safe ray-lighting approximation. This is deliberately a post pass
  // rather than a native WebGPU path tracer, so the same project works in the
  // editor, Play Preview, exported gameplay and mobile WebGL implementations.
  const rayLightingPass = typeof THREE.ShaderPass !== 'undefined' ? new THREE.ShaderPass({
    uniforms: {
      tDiffuse:{value:null}, resolution:{value:new THREE.Vector2(size().width, size().height)},
      strength:{value:.16}, samples:{value:4}, reflections:{value:1},
    },
    vertexShader:[
      'varying vec2 vUv;',
      'void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }'
    ].join('\n'),
    fragmentShader:[
      'uniform sampler2D tDiffuse;',
      'uniform vec2 resolution;',
      'uniform float strength;',
      'uniform float samples;',
      'uniform float reflections;',
      'varying vec2 vUv;',
      'void main(){',
      '  vec3 base=texture2D(tDiffuse,vUv).rgb;',
      '  vec3 bounce=vec3(0.0); float used=0.0;',
      '  for(int i=0;i<8;i++){',
      '    if(float(i)>=samples) continue;',
      '    float a=float(i)*2.39996323;',
      '    vec2 d=vec2(cos(a),sin(a))*(2.0+float(i)*0.7)/max(resolution,vec2(1.0));',
      '    vec3 c=texture2D(tDiffuse,clamp(vUv+d,0.001,0.999)).rgb;',
      '    bounce+=c; used+=1.0;',
      '  }',
      '  bounce/=max(used,1.0);',
      '  float lum=dot(base,vec3(.2126,.7152,.0722));',
      '  vec3 indirect=max(bounce-base*.58,vec3(0.0));',
      '  vec3 reflected=max(base-bounce*.42,vec3(0.0))*reflections;',
      '  vec3 color=base+indirect*strength*(1.15-lum)+reflected*strength*.22;',
      '  gl_FragColor=vec4(color,1.0);',
      '}'
    ].join('\n'),
  }) : null;
  if(rayLightingPass) composer.addPass(rayLightingPass);

  const volumetricPass = typeof THREE.ShaderPass !== 'undefined' ? new THREE.ShaderPass({
    uniforms: {
      tDiffuse: {value:null},
      lightUv: {value:new THREE.Vector2(.5, .12)},
      intensity: {value:0},
      decay: {value:.92},
      density: {value:.68},
      weight: {value:.42},
      smokeGain: {value:.55},
      absorption: {value:.075},
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main(){',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D tDiffuse;',
      'uniform vec2 lightUv;',
      'uniform float intensity;',
      'uniform float decay;',
      'uniform float density;',
      'uniform float weight;',
      'uniform float smokeGain;',
      'uniform float absorption;',
      'varying vec2 vUv;',
      'void main(){',
      '  vec2 delta = (vUv - lightUv) * density / 36.0;',
      '  vec2 coord = vUv;',
      '  float illum = 1.0;',
      '  float transmittance = 1.0;',
      '  vec3 rays = vec3(0.0);',
      '  for(int i = 0; i < 36; i++){',
      '    coord -= delta;',
      '    vec3 sampleColor = texture2D(tDiffuse, coord).rgb;',
      '    float bright = max(max(sampleColor.r, sampleColor.g), sampleColor.b);',
      '    float luma = dot(sampleColor, vec3(0.2126, 0.7152, 0.0722));',
      '    float chroma = max(max(abs(sampleColor.r - luma), abs(sampleColor.g - luma)), abs(sampleColor.b - luma));',
      '    float smokeDensity = smoothstep(0.12, 0.68, luma) * (1.0 - smoothstep(0.08, 0.34, chroma));',
      '    float scatter = max(bright * bright, smokeDensity * smokeGain);',
      '    rays += sampleColor * scatter * illum * transmittance * weight;',
      '    transmittance *= exp(-absorption * (0.35 + smokeDensity * 1.65));',
      '    illum *= decay;',
      '  }',
      '  vec4 base = texture2D(tDiffuse, vUv);',
      '  float dist = distance(vUv, lightUv);',
      '  float visible = smoothstep(1.05, 0.05, dist);',
      '  float haze = 1.0 - transmittance;',
      '  vec3 lit = base.rgb + rays * intensity * visible * (0.75 + haze * 0.65);',
      '  gl_FragColor = vec4(lit, base.a);',
      '}'
    ].join('\n'),
  }) : null;
  if(volumetricPass) composer.addPass(volumetricPass);
  const fxaaPass = typeof THREE.FXAAShader !== 'undefined' ? new THREE.ShaderPass(THREE.FXAAShader) : null;
  if(fxaaPass) composer.addPass(fxaaPass);

  function syncFxaaResolution(){
    if(!fxaaPass || !fxaaPass.uniforms || !fxaaPass.uniforms.resolution) return;
    const ratio = renderer.getPixelRatio ? renderer.getPixelRatio() : 1;
    fxaaPass.uniforms.resolution.value.set(1 / Math.max(1, currentSize.width * ratio), 1 / Math.max(1, currentSize.height * ratio));
  }
  syncFxaaResolution();

  addEventListener('resize', () => {
    const s = size();
    composer.setSize(s.width, s.height);
  });

  // guardia: se il composer fallisce (shader, driver, resize) si torna al
  // render diretto — il viewport non deve MAI sparire per colpa del post
  let renderFailed = false;
  function syncPassCamera(nextCamera){
    activeCamera = nextCamera || camera;
    renderPass.camera = activeCamera;
    if(ssrPass) ssrPass.camera = activeCamera;
    if(bokeh) bokeh.camera = activeCamera;
  }
  function render(cameraOverride, options){
    syncPassCamera(cameraOverride);
    try {
      renderComposed(options || {});
    } catch(err){
      if(!renderFailed){
        renderFailed = true;
        console.error('LotKing post: render composito fallito, fallback al render diretto', err);
      }
      try { renderer.setRenderTarget(null); } catch(e){}
      renderer.render(scene, activeCamera);
    }
  }
  function renderComposed(options){
    const rendererPixelRatio = renderer.getPixelRatio ? renderer.getPixelRatio() : 1;
    if(composer.setPixelRatio && Math.abs(rendererPixelRatio - composerPixelRatio) > .001){
      composerPixelRatio = rendererPixelRatio;
      composer.setPixelRatio(composerPixelRatio);
    }
    const videoOnly = !!(options && options.videoOnly);
    config.grade = Object.assign({enabled:false, exposure:1, brightness:0, contrast:1, saturation:1, gamma:1}, config.grade || {});
    config.dof = Object.assign({enabled:false, focus:9, aperture:.025, maxblur:.04, autoFocus:true, focusRadius:.16, feather:.38, showFocus:false, bokeh:3}, config.dof || {});
    delete config.dof.exposure;
    if(config.dof.aperture > 0 && config.dof.aperture < .006) config.dof.aperture = .025;
    if(config.dof.maxblur > 0 && config.dof.maxblur < .02) config.dof.maxblur = .04;

    let focus = config.dof.focus;
    if(config.dof.autoFocus && focusTarget){
      const target = typeof focusTarget === 'function' ? focusTarget() : focusTarget;
      if(target && target.getWorldPosition){
        target.getWorldPosition(tmpTargetPos);
        focus = activeCamera.position.distanceTo(tmpTargetPos);
      }
    }
    if(bokeh){
      bokeh.enabled = false;
      bokeh.uniforms.focus.value = focus;
      bokeh.uniforms.aperture.value = config.dof.aperture;
      bokeh.uniforms.maxblur.value = config.dof.maxblur;
    }
    dofPass.enabled = !videoOnly && !!config.dof.enabled;
    dofPass.uniforms.resolution.value.set(currentSize.width, currentSize.height);
    // mappature aggressive: con i default (.025/.04) il blur deve gia' vedersi
    dofPass.uniforms.amount.value = Math.max(0, Math.min(1, (config.dof.aperture || 0) * 14));
    dofPass.uniforms.blurPx.value = Math.max(0, Math.min(44, (config.dof.maxblur || 0) * 260));
    dofPass.uniforms.focusRadius.value = Math.max(.04, Math.min(.5, config.dof.focusRadius == null ? .16 : config.dof.focusRadius));
    dofPass.uniforms.feather.value = Math.max(.08, Math.min(.75, config.dof.feather == null ? .38 : config.dof.feather));
    dofPass.uniforms.debugFocus.value = config.dof.showFocus ? 1 : 0;
    dofPass.uniforms.bokehGain.value = Math.max(0, Math.min(8, config.dof.bokeh == null ? 3 : config.dof.bokeh));
    if(config.dof.autoFocus && focusTarget){
      tmpTargetPos.project(activeCamera);
      if(isFinite(tmpTargetPos.x) && isFinite(tmpTargetPos.y)){
        dofPass.uniforms.focusUv.value.set(tmpTargetPos.x * .5 + .5, tmpTargetPos.y * .5 + .5);
      }
    } else {
      dofPass.uniforms.focusUv.value.set(.5, .5);
    }

    if(gradePass){
      const g = config.grade;
      gradePass.enabled = !videoOnly && !!g.enabled;
      gradePass.uniforms.exposure.value = g.exposure == null ? 1 : g.exposure;
      gradePass.uniforms.brightness.value = g.brightness || 0;
      gradePass.uniforms.contrast.value = g.contrast == null ? 1 : g.contrast;
      gradePass.uniforms.saturation.value = g.saturation == null ? 1 : g.saturation;
      gradePass.uniforms.gamma.value = g.gamma == null ? 1 : g.gamma;
    }

    if(videoProfilePass){
      const profile = video && video.quality || 'high';
      const rayMode = !!(video && video.rendererMode === 'raytracing');
      const map = {
        low:{contrast:1, saturation:1, brightness:0, sharpen:0, vignette:0},
        medium:{contrast:1, saturation:1, brightness:0, sharpen:.02, vignette:0},
        high:{contrast:1, saturation:1, brightness:0, sharpen:.04, vignette:0},
        superhigh:{contrast:1, saturation:1, brightness:0, sharpen:.11, vignette:0},
        extreme:{contrast:1, saturation:1, brightness:0, sharpen:.18, vignette:0},
      };
      const p = map[profile] || map.high;
      videoProfilePass.enabled = profile !== 'high';
      videoProfilePass.uniforms.resolution.value.set(currentSize.width, currentSize.height);
      videoProfilePass.uniforms.contrast.value = p.contrast;
      videoProfilePass.uniforms.saturation.value = p.saturation;
      videoProfilePass.uniforms.brightness.value = p.brightness;
      videoProfilePass.uniforms.sharpen.value = p.sharpen;
      videoProfilePass.uniforms.vignette.value = p.vignette;
    }

    if(rayLightingPass){
      const rayMode = !!(video && video.rendererMode === 'raytracing');
      const preset = renderer.userData && renderer.userData.videoSettings && renderer.userData.videoSettings.preset;
      rayLightingPass.enabled = rayMode;
      rayLightingPass.uniforms.resolution.value.set(currentSize.width, currentSize.height);
      rayLightingPass.uniforms.samples.value = preset && preset.raySamples || 4;
      rayLightingPass.uniforms.strength.value = .24;
      rayLightingPass.uniforms.reflections.value = video && video.reflections === false ? 0 : 1;
    }

    if(ssrPass){
      ssrPass.enabled = !!(video && video.rendererMode === 'raytracing' && video.reflections !== false);
      if(ssrPass.enabled) refreshSsrSelection();
      const preset = renderer.userData && renderer.userData.videoSettings && renderer.userData.videoSettings.preset;
      ssrPass.opacity = .68;
      ssrPass.maxDistance = 18;
      ssrPass.thickness = .035;
      ssrPass.blur = !!(preset && preset.raySamples >= 4);
    }

    if(volumetricPass){
      const enabled = !!(video && video.volumetricLighting);
      volumetricPass.enabled = enabled;
      if(enabled){
        tmpTargetPos.set(0, 20, -40);
        const target = typeof volumetricTarget === 'function' ? volumetricTarget() : volumetricTarget;
        if(target && target.getWorldPosition) target.getWorldPosition(tmpTargetPos);
        tmpTargetPos.project(activeCamera);
        if(isFinite(tmpTargetPos.x) && isFinite(tmpTargetPos.y)){
          volumetricPass.uniforms.lightUv.value.set(tmpTargetPos.x * .5 + .5, tmpTargetPos.y * .5 + .5);
        }
        volumetricPass.uniforms.intensity.value = .052;
        volumetricPass.uniforms.smokeGain.value = .62;
        volumetricPass.uniforms.absorption.value = .075;
      }
    }

    if(fxaaPass){
      fxaaPass.enabled = !!(video && video.antialiasing === 'fxaa');
      syncFxaaResolution();
    }

    composer.render();
  }

  return {ok:true, composer, renderPass, bokeh, dofPass, gradePass, videoProfilePass, rayLightingPass, ssrPass, volumetricPass, fxaaPass, render, hasFailed: () => renderFailed};
}

window.LK_RUNTIME_POST = Object.freeze({createPost});
})();
