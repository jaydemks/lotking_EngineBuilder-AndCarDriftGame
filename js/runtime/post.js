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
  const lensFlareState = deps.lensFlareState || null;
  const size = deps.size || (() => ({width:innerWidth, height:innerHeight}));
  const focusTarget = deps.focusTarget || null;
  const tmpTargetPos = new THREE.Vector3();
  const tmpCameraForward = new THREE.Vector3();
  const tmpLightVector = new THREE.Vector3();
  const sceneFlareRaycaster = new THREE.Raycaster();
  const sceneFlareCameraPosition = new THREE.Vector3();
  const sceneFlareWorldPosition = new THREE.Vector3();
  const sceneFlareViewPosition = new THREE.Vector3();
  const sceneFlareDirection = new THREE.Vector3();
  const sceneFlareNdc = new THREE.Vector3();
  const sceneFlareOcclusion = new WeakMap();
  const MAX_SCENE_CINEMATIC_FLARES = 4;
  const MAX_SCENE_FLARE_OCCLUSION_TESTS = 8;
  const renderingBackend=window.LK_RUNTIME_RENDERING_BACKEND;
  const compatibility=renderingBackend&&renderingBackend.compatibilityProfile?renderingBackend.compatibilityProfile(renderer):{gtao:true,ssr:true,conservativePost:false,reason:'unavailable'};
  let sceneFlareCandidates = [];
  let sceneFlareScanTime = -Infinity;
  const reflectionProfiles = Object.freeze({
    low:{resolutionScale:.5, opacity:.5, thickness:.12, blur:true},
    medium:{resolutionScale:.75, opacity:.56, thickness:.09, blur:true},
    high:{resolutionScale:1, opacity:.62, thickness:.065, blur:true},
    ultra:{resolutionScale:1.25, opacity:.66, thickness:.045, blur:true},
  });
  const aoProfiles=Object.freeze({
    low:{samples:8,radius:.18,scale:.72,denoiseSamples:8,blend:.62},
    medium:{samples:12,radius:.15,scale:.62,denoiseSamples:12,blend:.68},
    high:{samples:16,radius:.13,scale:.54,denoiseSamples:16,blend:.72},
    ultra:{samples:24,radius:.11,scale:.48,denoiseSamples:24,blend:.76},
  });
  const styleValue=(value,fallback,min=0,max=1)=>{
    const number=Number(value);
    return Math.max(min,Math.min(max,Number.isFinite(number)?number:fallback));
  };

  // WebGPURenderer cannot execute the legacy EffectComposer/ShaderPass graph.
  // Keep the same scene/camera and route it through Three's common TSL render
  // pipeline. This path also works if WebGPURenderer internally selected its
  // WebGL 2 fallback, so the engine never needs a second material graph.
  if(renderer&&renderer.isWebGPURenderer){
    const TSL=THREE.TSL;
    if(!TSL||typeof TSL.pass!=='function'||typeof THREE.RenderPipeline!=='function'){
      return {ok:false,webgpu:true,supportsScoped:false,compatibility,reason:'TSL RenderPipeline unavailable'};
    }
    const scenePass=TSL.pass(scene,camera);
    const sceneColor=scenePass.getTextureNode('output');
    const gradeExposure=TSL.uniform(1);
    const gradeBrightness=TSL.uniform(0);
    const gradeContrast=TSL.uniform(1);
    const gradeSaturation=TSL.uniform(1);
    const sketchStrength=TSL.uniform(0);
    const sketchDetail=TSL.uniform(.72);
    const sketchHatching=TSL.uniform(1);
    const sketchLineNoise=TSL.uniform(.35);
    const sketchPigment=TSL.uniform(.82);
    const sketchColorNoise=TSL.uniform(1);
    const sketchSaturation=TSL.uniform(1);
    const sketchLightGain=TSL.uniform(1);
    const sketchAtmosphere=TSL.uniform(.68);
    const sketchPaper=TSL.uniform(.38);
    const sketchPaperMode=TSL.uniform(1);
    const sketchStorybookMode=TSL.uniform(0);
    const sketchMonochrome=TSL.uniform(0);
    // The editor renders into a viewport surrounded by toolbars and panels.
    // screenUV addresses that whole canvas, while scenePass is deliberately
    // sized to the local 3D rectangle. Sampling the pass with screenUV therefore
    // stretches/crops it and lets the canvas background appear at its sides.
    // viewportUV keeps editor, Play and standalone game on the same camera
    // aspect contract (and is identical to screenUV for a full-screen game).
    const postUv=TSL.viewportUV;
    const postSize=TSL.viewportSize;
    const sceneSample=sceneColor.sample(postUv);
    const exposed=sceneSample.rgb.mul(gradeExposure);
    const luminance=TSL.luminance(exposed);
    const saturated=TSL.mix(TSL.vec3(luminance),exposed,gradeSaturation);
    const graded=saturated.sub(.5).mul(gradeContrast).add(.5).add(gradeBrightness);
    const screenPixel=postUv.mul(postSize);
    const paperNoise=TSL.fract(TSL.sin(TSL.dot(screenPixel,TSL.vec2(12.9898,78.233))).mul(43758.5453)).sub(.5);
    const pixelSize=TSL.vec2(1).div(postSize.max(TSL.vec2(1)));
    const left=sceneColor.sample(postUv.sub(TSL.vec2(pixelSize.x,0))).rgb;
    const right=sceneColor.sample(postUv.add(TSL.vec2(pixelSize.x,0))).rgb;
    const up=sceneColor.sample(postUv.add(TSL.vec2(0,pixelSize.y))).rgb;
    const down=sceneColor.sample(postUv.sub(TSL.vec2(0,pixelSize.y))).rgb;
    const edge=TSL.abs(TSL.luminance(left).sub(TSL.luminance(right)))
      .add(TSL.abs(TSL.luminance(up).sub(TSL.luminance(down))))
      .mul(TSL.mix(5,14,sketchDetail));
    // Edge ink and cross-hatching are separate controls. Line noise changes
    // contour weight only, so a clean drawing never grows a screen-space grid.
    const ink=TSL.smoothstep(.055,.34,edge).mul(sketchStrength)
      .mul(TSL.float(1).add(paperNoise.mul(sketchLineNoise).mul(.45)));
    const toneSteps=TSL.mix(5,9,sketchDetail);
    const posterized=TSL.floor(TSL.luminance(graded).mul(toneSteps)).div(toneSteps.sub(1)).clamp(0,1);
    const baseColor=graded.clamp(0,1);
    const materialNoise=TSL.fract(TSL.sin(TSL.dot(screenPixel.add(baseColor.rg.mul(71)),TSL.vec2(4.898,7.23))).mul(23421.631)).sub(.5);
    const baseLuma=TSL.luminance(baseColor);
    const chroma=baseColor.sub(TSL.vec3(baseLuma));
    const pigmentTone=TSL.mix(baseLuma,posterized,sketchPigment.mul(.84));
    const rawPigment=TSL.vec3(pigmentTone).add(chroma.mul(TSL.mix(1,1.18,sketchPigment))).clamp(0,1);
    const paletteSteps=TSL.mix(8,15,sketchDetail);
    const paletteColor=TSL.floor(rawPigment.mul(paletteSteps).add(.5)).div(paletteSteps).clamp(0,1);
    const coloredInk=TSL.mix(rawPigment,paletteColor,sketchPigment.mul(.62));
    const hatchWave=TSL.sin(screenPixel.x.add(screenPixel.y.mul(.72)).mul(TSL.mix(.42,.82,sketchDetail)));
    const hatchA=TSL.step(TSL.mix(.52,.78,sketchDetail),hatchWave.mul(.5).add(.5));
    const hatchB=TSL.step(.86,TSL.sin(screenPixel.x.sub(screenPixel.y.mul(.58)).mul(.47)).mul(.5).add(.5));
    const shadow=TSL.smoothstep(.76,.16,posterized);
    const hatch=hatchA.add(hatchB.mul(TSL.smoothstep(.48,.08,posterized)))
      .mul(shadow).mul(sketchStrength).mul(sketchHatching).mul(.105);
    const fibre=TSL.sin(screenPixel.y.mul(.115).add(paperNoise.mul(3.1))).mul(.5).add(.5);
    const pencilJitter=TSL.float(1).add(paperNoise.mul(sketchLineNoise).mul(.45));
    const paperColor=TSL.vec3(1,.975,.91);
    const inkIllustrated=TSL.mix(coloredInk,paperColor,sketchPaper.mul(.08))
      .sub(ink.mul(.88)).sub(hatch).add(paperNoise.mul(sketchPaper).mul(.065)).clamp(0,1);
    const pencilTone=TSL.smoothstep(-.06,1.08,posterized);
    const pencilPigment=TSL.mix(TSL.vec3(pencilTone),graded.clamp(0,1),.56);
    const paperSketch=TSL.mix(paperColor,pencilPigment,.82)
      .sub(ink.mul(pencilJitter).mul(1.02))
      .sub(hatch.mul(1.22))
      .add(paperNoise.mul(sketchPaper).mul(.045))
      .add(fibre.sub(.5).mul(sketchPaper).mul(.025)).clamp(0,1);
    const chromaEnergy=TSL.length(chroma);
    const softAtmosphere=TSL.smoothstep(.24,.018,chromaEnergy)
      .mul(TSL.smoothstep(.08,.88,baseLuma)).mul(TSL.float(1).sub(ink.clamp(0,1)));
    const brightFx=TSL.smoothstep(.68,1.25,TSL.max(exposed.r,TSL.max(exposed.g,exposed.b)));
    const shadowWash=TSL.mix(TSL.vec3(.82,.87,1.02),TSL.vec3(1),TSL.smoothstep(.12,.72,baseLuma));
    const paintedPigment=coloredInk.mul(shadowWash)
      .add(materialNoise.mul(sketchPigment).mul(sketchColorNoise).mul(.052))
      .add(paperNoise.mul(sketchPaper).mul(.025));
    const atmosphereWash=paintedPigment
      .add(materialNoise.mul(softAtmosphere).mul(sketchAtmosphere).mul(sketchColorNoise).mul(.11))
      .add(TSL.vec3(1,.82,.55).mul(brightFx).mul(sketchAtmosphere).mul(.09));
    const coloredLine=TSL.mix(TSL.vec3(.035,.028,.025),paintedPigment.mul(.16),.42);
    const storybookInk=TSL.mix(atmosphereWash,coloredLine,ink.clamp(0,1))
      .sub(hatch.mul(TSL.mix(.72,1.18,sketchPigment)))
      .clamp(0,1);
    const storybook=TSL.mix(storybookInk,paperColor,sketchPaper.mul(.045).mul(softAtmosphere)).clamp(0,1);
    const illustrated=TSL.mix(TSL.mix(inkIllustrated,paperSketch,sketchPaperMode),storybook,sketchStorybookMode);
    const styled=TSL.mix(graded,illustrated,sketchStrength);
    const styledLuma=TSL.luminance(styled);
    const coloredStyled=TSL.mix(TSL.vec3(styledLuma),styled,sketchSaturation).max(TSL.vec3(0));
    const finalColor=TSL.mix(coloredStyled,TSL.vec3(styledLuma),sketchMonochrome)
      .mul(TSL.mix(1,sketchLightGain,sketchStrength));
    const pipeline=new THREE.RenderPipeline(renderer,TSL.vec4(finalColor,sceneSample.a));
    const initialSize=size();
    const rawScenePassSetSize=scenePass.setSize.bind(scenePass);
    let scopedWidth=0;
    let scopedHeight=0;
    let scopedPixelRatio=0;
    function setScopedSize(width,height){
      const nextWidth=Math.max(1,Math.round(Number(width)||1));
      const nextHeight=Math.max(1,Math.round(Number(height)||1));
      const nextPixelRatio=Math.max(.01,Number(renderer.getPixelRatio&&renderer.getPixelRatio())||1);
      if(nextWidth===scopedWidth&&nextHeight===scopedHeight&&nextPixelRatio===scopedPixelRatio)return;
      scopedWidth=nextWidth;
      scopedHeight=nextHeight;
      scopedPixelRatio=nextPixelRatio;
      rawScenePassSetSize(
        Math.max(1,Math.round(scopedWidth*scopedPixelRatio)),
        Math.max(1,Math.round(scopedHeight*scopedPixelRatio))
      );
    }
    // PassNode normally re-sizes itself to the whole renderer drawing buffer in
    // updateBefore(). Pin it to the requested local viewport instead; otherwise
    // a camera authored for the Editor rectangle is rasterised into the wider
    // canvas aspect before the final quad even samples it.
    scenePass.setSize=function(){
      rawScenePassSetSize(
        Math.max(1,Math.round(scopedWidth*scopedPixelRatio)),
        Math.max(1,Math.round(scopedHeight*scopedPixelRatio))
      );
      return this;
    };
    setScopedSize(initialSize.width,initialSize.height);
    const composer={
      setSize:setScopedSize,
      setPixelRatio(){},
      render(){pipeline.render();},
      dispose(){scenePass.dispose();pipeline.dispose();},
    };
    let renderFailed=false;
    function failToDirect(error){
      if(renderFailed)return;
      renderFailed=true;
      console.error('LotKing WebGPU post: TSL pipeline failed, using direct scene render',error);
    }
    function needsPost(){
      const grade=config&&config.grade;
      // This TSL graph currently implements grade and illustrated output. Do
      // not route Natural WebGPU through it merely because legacy-only FXAA,
      // volumetrics, quality sharpening, DoF or ray effects are selected: that
      // replaced a valid direct frame with an empty intermediate target.
      return !!(
        grade&&grade.enabled===true ||
        video&&video.visualStyle==='illustrated-sketch' ||
        video&&video.monochrome===true
      );
    }
    function render(cameraOverride,options){
      activeCamera=cameraOverride||camera;
      scenePass.camera=activeCamera;
      if(renderFailed){renderer.render(scene,activeCamera);return;}
      const requested=options&&options.width!=null&&options.height!=null?options:size();
      setScopedSize(requested.width,requested.height);
      const grade=config&&config.grade||{};
      const enabled=grade.enabled===true;
      gradeExposure.value=enabled?Math.max(0,Number(grade.exposure)||1):1;
      gradeBrightness.value=enabled?Number(grade.brightness)||0:0;
      gradeContrast.value=enabled?Math.max(0,Number(grade.contrast)||1):1;
      gradeSaturation.value=enabled?Math.max(0,Number(grade.saturation)||1):1;
      const illustrated=video&&video.visualStyle==='illustrated-sketch';
      sketchStrength.value=illustrated?styleValue(video.sketchStrength,.78):0;
      sketchDetail.value=styleValue(video&&video.sketchDetail,.72);
      sketchHatching.value=styleValue(video&&video.sketchHatching,1);
      sketchLineNoise.value=styleValue(video&&video.sketchLineNoise,.35);
      sketchPigment.value=styleValue(video&&video.sketchPigment,.82);
      sketchColorNoise.value=styleValue(video&&video.sketchColorNoise,1);
      sketchSaturation.value=styleValue(video&&video.sketchSaturation,1,0,2);
      sketchLightGain.value=styleValue(video&&video.sketchLightGain,1,.25,3);
      sketchAtmosphere.value=styleValue(video&&video.sketchAtmosphere,.68);
      sketchPaper.value=styleValue(video&&video.sketchPaper,.38);
      sketchPaperMode.value=video&&video.sketchMedium==='paper-pencil'?1:0;
      sketchStorybookMode.value=!video||video.sketchMedium==='painted-storybook'?1:0;
      sketchMonochrome.value=video&&video.monochrome===true?1:0;
      try{
        const submission=pipeline.render();
        // Some WebGPU backends surface pipeline creation/device validation as
        // a rejected Promise rather than a synchronous throw. Retire the post
        // graph so the next frame presents the direct scene instead of staying
        // blank indefinitely.
        if(submission&&typeof submission.then==='function') submission.catch(failToDirect);
      }
      catch(error){
        failToDirect(error);
        renderer.render(scene,activeCamera);
      }
    }
    return {
      ok:true,webgpu:true,supportsScoped:true,compatibility,composer,renderPass:scenePass,
      pipeline,render,needsPost,needsOpticalPost:()=>false,hasFailed:()=>renderFailed,
      dispose(){composer.dispose();},
      limitations:Object.freeze(['legacy-ray-effects','legacy-dof','legacy-optical-flares']),
    };
  }

  const ok = typeof THREE.EffectComposer !== 'undefined' && typeof THREE.RenderPass !== 'undefined' && typeof THREE.ShaderPass !== 'undefined';
  if(!ok) return {ok:false};

  const composer = new THREE.EffectComposer(renderer);
  let composerPixelRatio = renderer.getPixelRatio ? renderer.getPixelRatio() : 1;
  const renderPass = new THREE.RenderPass(scene, camera);
  composer.addPass(renderPass);
  let currentSize = size();
  const gtaoPass=compatibility.gtao&&typeof THREE.GTAOPass!=='undefined'?new THREE.GTAOPass(scene,camera,currentSize.width,currentSize.height):null;
  let gtaoProfileKey='';
  if(gtaoPass){
    gtaoPass.enabled=false;
    gtaoPass.output=THREE.GTAOPass.OUTPUT.Default;

    // GTAOPass r185 only excludes points and lines from its normal/depth
    // override. Camera-facing sprites and materials deliberately authored
    // without depth writes (sun/lens-flare ghosts, clouds, smoke, light
    // widgets) would therefore become opaque rectangular occluders in the AO
    // G-buffer. Their rectangle follows the camera and darkens a moving square
    // of the final frame. Keep optical/transparent effects in the beauty pass,
    // but never let them contribute fake geometry to ambient occlusion.
    if(typeof gtaoPass._overrideVisibility === 'function'){
      const overrideGtaoVisibility=gtaoPass._overrideVisibility.bind(gtaoPass);
      gtaoPass._overrideVisibility=function(){
        overrideGtaoVisibility();
        scene.traverse(node=>{
          if(!node||node.visible===false) return;
          const data=node.userData||{};
          const materials=node.material?(Array.isArray(node.material)?node.material:[node.material]):[];
          const noDepthMaterial=materials.length>0&&materials.every(material=>material&&material.depthWrite===false);
          if(node.isSprite||data.lkSkipAoGBuffer===true||data.lkFlareIgnore===true||noDepthMaterial){
            node.visible=false;
            this._visibilityCache.push(node);
          }
        });
      };
    }
    composer.addPass(gtaoPass);
  }
  const ssrPass = compatibility.ssr&&typeof THREE.SSRPass !== 'undefined' ? new THREE.SSRPass({
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
    ssrPass.opacity = reflectionProfiles.high.opacity;
    ssrPass.maxDistance = 35;
    ssrPass.thickness = reflectionProfiles.high.thickness;
    ssrPass.distanceAttenuation = true;
    ssrPass.fresnel = true;
    ssrPass.infiniteThick = false;
    ssrPass.bouncing = false;

    // Three r185's SSR pass caches the camera projection at construction/resize.
    // Lot King switches between gameplay, editor and preview cameras (and can
    // animate FOV), so stale depth reconstruction appears as a camera-facing
    // black clipping plane on nearby reflective surfaces.
    ssrPass.userData = ssrPass.userData || {};
    ssrPass.userData.lkPerspectiveCamera = camera.isPerspectiveCamera !== false;

    // The stock SSR blur divides RGB by an accumulated alpha that is exactly
    // zero where a ray misses (most notably the sky). Keep those pixels finite
    // and transparent so the material's environment reflection remains visible.
    [ssrPass.blurMaterial, ssrPass.blurMaterial2].forEach(material => {
      if(!material || !material.fragmentShader) return;
      material.fragmentShader = material.fragmentShader.replace(
        'vec3 rgb=(c.rgb*c.a*coeCenter+cl.rgb*cl.a*coeSide+cr.rgb*cr.a*coeSide+cb.rgb*cb.a*coeSide+ct.rgb*ct.a*coeSide)/a;',
        'vec3 rgb=(c.rgb*c.a*coeCenter+cl.rgb*cl.a*coeSide+cr.rgb*cr.a*coeSide+cb.rgb*cb.a*coeSide+ct.rgb*ct.a*coeSide)/max(a,0.00001);'
      );
      material.needsUpdate = true;
    });

    // Discarded/no-hit SSR fragments must not leave data from the previous
    // frame behind. Clear only the reflection intermediates, never the beauty
    // buffer containing the normal PBR/environment result.
    if(typeof ssrPass._renderPass === 'function'){
      const renderSsrTarget = ssrPass._renderPass.bind(ssrPass);
      ssrPass._renderPass = function(nextRenderer, material, target, clearColor, clearAlpha){
        const reflectionTarget = target === this.ssrRenderTarget || target === this.blurRenderTarget || target === this.blurRenderTarget2;
        const state = this.userData && this.userData.lkComposerBuffers;
        const diffuse = material && material.uniforms && material.uniforms.tDiffuse;
        const replaceBeautyBase = state && target === state.writeBuffer && material === this.copyMaterial &&
          diffuse && diffuse.value === this.beautyRenderTarget.texture && state.readBuffer && state.readBuffer.texture;
        const originalDiffuse = replaceBeautyBase ? diffuse.value : null;
        if(replaceBeautyBase) diffuse.value = state.readBuffer.texture;
        try {
          return renderSsrTarget(nextRenderer, material, target, reflectionTarget ? 0x000000 : clearColor, reflectionTarget ? 0 : clearAlpha);
        } finally {
          if(replaceBeautyBase) diffuse.value = originalDiffuse;
        }
      };
    }
    // Additive glow sprites are an optical camera effect, not luminous
    // geometry. Stock SSR samples them from its internal beauty buffer and can
    // therefore mirror a headlight halo even when the real lamp is hidden by
    // bodywork. Build the SSR ray source without those tagged billboards, then
    // use the composer's already-rendered beauty image as the final base so the
    // direct (depth-tested) glow remains visible normally.
    if(typeof ssrPass.render === 'function'){
      const renderSsr = ssrPass.render.bind(ssrPass);
      ssrPass.render = function(nextRenderer, writeBuffer, readBuffer){
        this.userData.lkComposerBuffers = {writeBuffer, readBuffer};
        const renderScene = nextRenderer.render;
        let beautyCaptured = false;
        nextRenderer.render = function(nextScene, nextCamera){
          if(nextScene !== scene || beautyCaptured) return renderScene.apply(this, arguments);
          beautyCaptured = true;
          const hidden = [];
          scene.traverseVisible(node => {
            if(node.userData && node.userData.lkSkipSsrBeauty === true){
              hidden.push(node);
              node.visible = false;
            }
          });
          try { return renderScene.apply(this, arguments); }
          finally { hidden.forEach(node => { node.visible = true; }); }
        };
        try { return renderSsr(nextRenderer, writeBuffer, readBuffer); }
        finally {
          nextRenderer.render = renderScene;
          this.userData.lkComposerBuffers = null;
        }
      };
    }
    // GPU-deformed transparent effects (rain, particles) do not share their
    // custom vertex shader with SSR's normal/metalness override materials.
    // Rendering their undeformed placeholder geometry corrupts the SSR depth
    // buffers, so hide only explicitly tagged effects during those two passes.
    const withSsrOverrideExclusions = renderOverride => function(){
      const hidden = [];
      scene.traverseVisible(node => {
        if(node.userData && node.userData.lkSkipSsrOverride === true){
          hidden.push(node);
          node.visible = false;
        }
      });
      try { return renderOverride.apply(ssrPass, arguments); }
      finally { hidden.forEach(node => { node.visible = true; }); }
    };
    if(typeof ssrPass._renderOverride === 'function') ssrPass._renderOverride = withSsrOverrideExclusions(ssrPass._renderOverride);
    if(typeof ssrPass._renderMetalness === 'function') ssrPass._renderMetalness = withSsrOverrideExclusions(ssrPass._renderMetalness);
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
      if(materials.some(mat => mat && mat.visible !== false && (
        mat.userData && mat.userData.ssr === true ||
        mat.metalness != null && mat.metalness >= .35 && (mat.roughness == null || mat.roughness <= .65)
      ))) reflective.push(node);
    });
    ssrPass.selects = reflective;
    ssrPass.isSelective = true;
  }
  const rawComposerSetSize = composer.setSize.bind(composer);
  composer.setSize = function(w, h){
    currentSize = {width:Math.max(1, Math.round(w || 1)), height:Math.max(1, Math.round(h || 1))};
    rawComposerSetSize(currentSize.width, currentSize.height);
    if(dofPass) dofPass.uniforms.resolution.value.set(currentSize.width, currentSize.height);
    if(videoProfilePass) videoProfilePass.uniforms.resolution.value.set(currentSize.width, currentSize.height);
    if(sketchPass) sketchPass.uniforms.resolution.value.set(currentSize.width, currentSize.height);
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
      strength:{value:.14}, samples:{value:4},
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
      '  vec3 indirect=min(max(bounce-base*.72,vec3(0.0)),vec3(0.35));',
      '  vec3 color=base+indirect*strength*clamp(1.05-lum,0.2,1.0);',
      '  gl_FragColor=vec4(color,1.0);',
      '}'
    ].join('\n'),
  }) : null;
  if(rayLightingPass) composer.addPass(rayLightingPass);

  const volumetricPass = typeof THREE.ShaderPass !== 'undefined' ? new THREE.ShaderPass({
    uniforms: {
      tDiffuse: {value:null},
      lightUv: {value:new THREE.Vector2(.5, .12)},
      resolution: {value:new THREE.Vector2(size().width, size().height)},
      intensity: {value:0},
      decay: {value:.92},
      density: {value:.68},
      weight: {value:.42},
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
      'uniform vec2 resolution;',
      'uniform float intensity;',
      'uniform float decay;',
      'uniform float density;',
      'uniform float weight;',
      'varying vec2 vUv;',
      'void main(){',
      '  vec2 delta = (vUv - lightUv) * density / 36.0;',
      '  vec2 coord = vUv;',
      '  float illum = 1.0;',
      '  vec3 rays = vec3(0.0);',
      '  for(int i = 0; i < 36; i++){',
      '    coord = clamp(coord - delta, vec2(0.001), vec2(0.999));',
      '    vec3 sampleColor = texture2D(tDiffuse, coord).rgb;',
      '    float bright = max(max(sampleColor.r, sampleColor.g), sampleColor.b);',
      // Only HDR emitters feed the shafts. The previous luminance/chroma
      // heuristic classified bright neutral meshes as smoke and smeared them.
      '    float emitter = smoothstep(1.10, 2.40, bright);',
      // The radial integration belongs only to the projected sun source.
      // Without this spatial mask, an aligned headlight or bright SSR pixel is
      // sampled repeatedly and appears as a chain of directional ghosts.
      '    vec2 sourceDelta = (coord - lightUv) * vec2(resolution.x / max(resolution.y, 1.0), 1.0);',
      '    float sourceMask = 1.0 - smoothstep(0.035, 0.24, length(sourceDelta));',
      '    emitter *= sourceMask;',
      '    rays += sampleColor * emitter * emitter * illum * weight;',
      '    illum *= decay;',
      '  }',
      '  vec4 base = texture2D(tDiffuse, vUv);',
      '  float dist = distance(vUv, lightUv);',
      '  float visible = smoothstep(1.05, 0.05, dist);',
      '  vec3 lit = base.rgb + rays * intensity * visible;',
      '  gl_FragColor = vec4(lit, base.a);',
      '}'
    ].join('\n'),
  }) : null;
  if(volumetricPass) composer.addPass(volumetricPass);
  const cinematicFlarePass = window.LK_RUNTIME_CINEMATIC_LENS_FLARE
    ? window.LK_RUNTIME_CINEMATIC_LENS_FLARE.createPass(THREE, {dirtTextureUrl:'media/lensflare/lensDirtTexture.jpg',resolutionScale:.5})
    : null;
  if(cinematicFlarePass) composer.addPass(cinematicFlarePass);
  // Reuse one optical shader pool and the same dirt texture. EffectComposer
  // skips disabled passes, so only visible authored light flares cost GPU time.
  const sceneCinematicFlarePasses = cinematicFlarePass
    ? Array.from({length:MAX_SCENE_CINEMATIC_FLARES}, () => window.LK_RUNTIME_CINEMATIC_LENS_FLARE.createPass(THREE, {
      dirtTexture:cinematicFlarePass.userData.dirtTexture,
      resolutionScale:.42,
    }))
    : [];
  sceneCinematicFlarePasses.forEach(pass => { if(pass) composer.addPass(pass); });
  // Backend-neutral illustrated look: the WebGPU path above expresses the
  // same operations with TSL, while WebGL uses this bounded full-screen pass.
  // It never mutates authored materials, so viewport, Play and export remain
  // visually connected and disabling it is an exact restoration.
  const sketchPass = typeof THREE.ShaderPass !== 'undefined' ? new THREE.ShaderPass({
    uniforms:{
      tDiffuse:{value:null}, resolution:{value:new THREE.Vector2(size().width,size().height)},
      strength:{value:.78}, detail:{value:.72}, hatching:{value:1}, lineNoise:{value:.35},
      pigment:{value:.82}, colorNoise:{value:1}, saturation:{value:1}, lightGain:{value:1},
      atmosphere:{value:.68}, paper:{value:.38}, paperMode:{value:0}, storybookMode:{value:1}, monochrome:{value:0},
    },
    vertexShader:[
      'varying vec2 vUv;',
      'void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }'
    ].join('\n'),
    fragmentShader:[
      'uniform sampler2D tDiffuse;',
      'uniform vec2 resolution;',
      'uniform float strength;',
      'uniform float detail;',
      'uniform float hatching;',
      'uniform float lineNoise;',
      'uniform float pigment;',
      'uniform float colorNoise;',
      'uniform float saturation;',
      'uniform float lightGain;',
      'uniform float atmosphere;',
      'uniform float paper;',
      'uniform float paperMode;',
      'uniform float storybookMode;',
      'uniform float monochrome;',
      'varying vec2 vUv;',
      'float lum(vec3 c){ return dot(c,vec3(.2126,.7152,.0722)); }',
      'float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }',
      'void main(){',
      '  vec2 px=1.0/max(resolution,vec2(1.0));',
      '  vec4 source=texture2D(tDiffuse,vUv);',
      '  vec3 c=max(source.rgb,vec3(0.0));',
      '  float gx=lum(texture2D(tDiffuse,vUv+vec2(px.x,0.0)).rgb)-lum(texture2D(tDiffuse,vUv-vec2(px.x,0.0)).rgb);',
      '  float gy=lum(texture2D(tDiffuse,vUv+vec2(0.0,px.y)).rgb)-lum(texture2D(tDiffuse,vUv-vec2(0.0,px.y)).rgb);',
      '  float edge=smoothstep(.045,.30,length(vec2(gx,gy))*mix(5.0,14.0,detail));',
      '  float steps=mix(5.0,9.0,detail);',
      '  float l=clamp(lum(c),0.0,1.0);',
      '  float tone=floor(l*steps)/max(1.0,steps-1.0);',
      '  vec3 baseColor=clamp(c,0.0,1.0);',
      '  float baseLuma=lum(baseColor);',
      '  vec3 chroma=baseColor-vec3(baseLuma);',
      '  float pigmentTone=mix(baseLuma,tone,pigment*.84);',
      '  vec3 rawPigment=clamp(vec3(pigmentTone)+chroma*mix(1.0,1.18,pigment),0.0,1.0);',
      '  float paletteSteps=mix(8.0,15.0,detail);',
      '  vec3 paletteColor=clamp(floor(rawPigment*paletteSteps+.5)/paletteSteps,0.0,1.0);',
      '  vec3 illustrated=mix(rawPigment,paletteColor,pigment*.62);',
      '  vec2 sp=vUv*resolution;',
      '  float hatchA=step(mix(.52,.78,detail),sin((sp.x+sp.y*.72)*mix(.42,.82,detail))*.5+.5);',
      '  float hatchB=step(.86,sin((sp.x-sp.y*.58)*.47)*.5+.5);',
      '  float shadow=smoothstep(.76,.16,tone);',
      '  float hatch=(hatchA+hatchB*smoothstep(.48,.08,tone))*shadow*strength*hatching*.105;',
      '  float noise=hash(sp)-.5;',
      '  float materialNoise=hash(sp+baseColor.rg*71.0)-.5;',
      '  float lineInk=edge*strength*(1.0+noise*lineNoise*.45);',
      '  vec3 paperColor=vec3(1.0,.975,.91);',
      '  illustrated=mix(illustrated,paperColor,paper*.08);',
      '  illustrated-=lineInk*.88+hatch;',
      '  illustrated+=noise*paper*.065;',
      '  float pencilTone=smoothstep(-.06,1.08,tone);',
      '  vec3 pencilPigment=mix(vec3(pencilTone),clamp(c,0.0,1.0),.56);',
      '  float fibre=sin(sp.y*.115+noise*3.1)*.5+.5;',
      '  vec3 paperSketch=mix(paperColor,pencilPigment,.82);',
      '  paperSketch-=lineInk*1.02+hatch*1.22;',
      '  paperSketch+=noise*paper*.045+(fibre-.5)*paper*.025;',
      '  float chromaEnergy=length(chroma);',
      '  float softAtmosphere=smoothstep(.24,.018,chromaEnergy)*smoothstep(.08,.88,baseLuma)*(1.0-clamp(lineInk,0.0,1.0));',
      '  float brightFx=smoothstep(.68,1.25,max(c.r,max(c.g,c.b)));',
      '  vec3 shadowWash=mix(vec3(.82,.87,1.02),vec3(1.0),smoothstep(.12,.72,baseLuma));',
      '  vec3 paintedPigment=mix(rawPigment,paletteColor,pigment*.62)*shadowWash;',
      '  paintedPigment+=materialNoise*pigment*colorNoise*.052+noise*paper*.025;',
      '  vec3 atmosphereWash=paintedPigment+materialNoise*softAtmosphere*atmosphere*colorNoise*.11;',
      '  atmosphereWash+=vec3(1.0,.82,.55)*brightFx*atmosphere*.09;',
      '  vec3 coloredLine=mix(vec3(.035,.028,.025),paintedPigment*.16,.42);',
      '  vec3 storybook=mix(atmosphereWash,coloredLine,clamp(lineInk,0.0,1.0));',
      '  storybook=clamp(storybook-hatch*mix(.72,1.18,pigment),0.0,1.0);',
      '  storybook=mix(storybook,paperColor,paper*.045*softAtmosphere);',
      '  illustrated=mix(illustrated,clamp(paperSketch,0.0,1.0),paperMode);',
      '  illustrated=mix(illustrated,storybook,storybookMode);',
      '  vec3 outColor=mix(c,clamp(illustrated,0.0,1.0),strength);',
      '  outColor=max(mix(vec3(lum(outColor)),outColor,saturation),vec3(0.0));',
      '  outColor=mix(outColor,vec3(lum(outColor)),monochrome);',
      '  outColor*=mix(1.0,lightGain,strength);',
      '  gl_FragColor=vec4(outColor,source.a);',
      '}'
    ].join('\n'),
  }) : null;
  if(sketchPass) composer.addPass(sketchPass);
  // r185 render targets stay in linear working space. OutputPass applies the
  // renderer tone mapping and output color conversion before FXAA samples the
  // final display-referred image.
  const outputPass = typeof THREE.OutputPass !== 'undefined' ? new THREE.OutputPass() : null;
  if(outputPass) composer.addPass(outputPass);
  const fxaaPass = typeof THREE.FXAAShader !== 'undefined' ? new THREE.ShaderPass(THREE.FXAAShader) : null;
  if(fxaaPass) composer.addPass(fxaaPass);

  function syncFxaaResolution(){
    if(!fxaaPass || !fxaaPass.uniforms || !fxaaPass.uniforms.resolution) return;
    const ratio = renderer.getPixelRatio ? renderer.getPixelRatio() : 1;
    fxaaPass.uniforms.resolution.value.set(1 / Math.max(1, currentSize.width * ratio), 1 / Math.max(1, currentSize.height * ratio));
  }
  syncFxaaResolution();

  function hierarchyVisible(object){
    for(let node=object; node; node=node.parent) if(node.visible===false) return false;
    return true;
  }
  function flareHitIgnored(object){
    for(let node=object; node; node=node&&node.parent){
      const data=node.userData||{};
      if(data.editorHelper||data.helperOnly||data.editorOnly||data.nonExportable||data.editorCameraHelper||data.editorCameraHelperPick||data.editorLightHandle||data.colliderPreview||data.lkFlareIgnore) return true;
    }
    return false;
  }
  function flareHitTransmission(hit,nextCamera,direction){
    const object=hit&&hit.object;
    if(!object||flareHitIgnored(object)) return 1;
    if(object.userData&&typeof object.userData.lkFlareTransmission==='function'){
      return Math.max(0,Math.min(1,Number(object.userData.lkFlareTransmission(hit,nextCamera,direction))||0));
    }
    const materials=object.material?(Array.isArray(object.material)?object.material:[object.material]):[];
    const material=materials.length>1&&hit.face&&materials[hit.face.materialIndex]?materials[hit.face.materialIndex]:materials[0];
    if(!material||material.visible===false||material.depthTest===false||material.blending===THREE.AdditiveBlending) return 1;
    const opacity=Math.max(0,Math.min(1,material.opacity==null?1:Number(material.opacity)||0));
    if(opacity<=.002) return 1;
    const optical=Math.max(0,Math.min(1,Number(material.transmission)||0));
    if(optical>0) return Math.max(.05,1-opacity*(1-optical*.82));
    if(material.transparent===true||opacity<.999) return Math.max(.02,1-opacity*.88);
    return 0;
  }
  function sceneLightVisibility(light,nextCamera,worldPosition,occlusionEnabled){
    if(!occlusionEnabled) return 1;
    const now=performance.now();
    let state=sceneFlareOcclusion.get(light);
    if(!state||state.camera!==nextCamera){
      state={camera:nextCamera,value:1,target:1,last:-Infinity};
      sceneFlareOcclusion.set(light,state);
    }
    if(now-state.last>70){
      nextCamera.getWorldPosition(sceneFlareCameraPosition);
      sceneFlareDirection.copy(worldPosition).sub(sceneFlareCameraPosition);
      const distance=sceneFlareDirection.length();
      let transmission=1;
      if(distance>.15){
        sceneFlareRaycaster.set(sceneFlareCameraPosition,sceneFlareDirection.multiplyScalar(1/distance));
        sceneFlareRaycaster.camera=nextCamera;
        sceneFlareRaycaster.near=.05;
        sceneFlareRaycaster.far=Math.max(.05,distance-.12);
        const hits=sceneFlareRaycaster.intersectObjects(scene.children,true);
        const sampled=new Set();
        for(const hit of hits){
          if(!hit||sampled.has(hit.object)) continue;
          sampled.add(hit.object);
          transmission*=flareHitTransmission(hit,nextCamera,sceneFlareRaycaster.ray.direction);
          if(transmission<=.01){ transmission=0; break; }
        }
      }
      state.target=Math.max(0,Math.min(1,transmission));
      state.last=now;
    }
    state.value+=(state.target-state.value)*.24;
    return state.value;
  }
  function refreshSceneFlareCandidates(){
    const now=performance.now();
    if(now-sceneFlareScanTime>250){
      sceneFlareCandidates=[];
      scene.traverse(node=>{
        const authored=node&&node.isLight&&node.userData&&node.userData.cinematicLensFlare;
        if(authored&&authored.enabled===true) sceneFlareCandidates.push(node);
      });
      sceneFlareScanTime=now;
    }
    return sceneFlareCandidates;
  }
  function collectSceneFlareStates(nextCamera){
    if(!nextCamera||!nextCamera.matrixWorldInverse) return [];
    refreshSceneFlareCandidates();
    const visibleCandidates=[];
    for(const light of sceneFlareCandidates){
      const authored=light.userData.cinematicLensFlare||{};
      if(!hierarchyVisible(light)||!(Number(light.intensity)>0)) continue;
      light.getWorldPosition(sceneFlareWorldPosition);
      sceneFlareViewPosition.copy(sceneFlareWorldPosition).applyMatrix4(nextCamera.matrixWorldInverse);
      if(sceneFlareViewPosition.z>=-.02) continue;
      const distance=sceneFlareViewPosition.length();
      sceneFlareNdc.copy(sceneFlareWorldPosition).project(nextCamera);
      if(!Number.isFinite(sceneFlareNdc.x)||!Number.isFinite(sceneFlareNdc.y)||sceneFlareNdc.z < -1||sceneFlareNdc.z > 1||Math.abs(sceneFlareNdc.x)>1.22||Math.abs(sceneFlareNdc.y)>1.22) continue;
      const authoredIntensity=Number(authored.intensity);
      const intensity=Math.max(0,Math.min(2,Number.isFinite(authoredIntensity)?authoredIntensity:.65));
      visibleCandidates.push({
        light,authored,intensity,distance,ndcX:sceneFlareNdc.x,ndcY:sceneFlareNdc.y,
        worldPosition:sceneFlareWorldPosition.clone(),score:intensity/(1+distance*.006),
      });
    }
    // Projecting is cheap; raycast only the four sources that can actually be
    // rendered. Large light-heavy scenes therefore keep a fixed CPU/GPU cost.
    visibleCandidates.sort((a,b)=>b.score-a.score);
    const states=[];
    for(const candidate of visibleCandidates.slice(0,MAX_SCENE_FLARE_OCCLUSION_TESTS)){
      const {light,authored,intensity,distance,ndcX,ndcY,worldPosition}=candidate;
      const visibility=sceneLightVisibility(light,nextCamera,worldPosition,authored.occlusion!==false);
      if(visibility<=.005) continue;
      const flareSize=Math.max(.2,Math.min(3,Number(authored.size)||.7));
      const authoredBloom=Number(authored.bloomIntensity);
      const bloomIntensity=Math.max(0,Math.min(3,Number.isFinite(authoredBloom)?authoredBloom:intensity*.8));
      states.push({
        mode:'cinematic',visible:true,ndcX,ndcY,visibility,
        distance,score:intensity*visibility/(1+distance*.006),
        flare:{enabled:true,intensity,size:flareSize,streak:.42,haloSize:1,ghostOpacity:.52,ghosts:6,spacing:.92,starburst:.62,anamorphic:false},
        bloom:{enabled:bloomIntensity>0,intensity:bloomIntensity,size:flareSize,radius:.12,threshold:.52},
      });
      if(states.length>=MAX_SCENE_CINEMATIC_FLARES) break;
    }
    return states;
  }

  // Volumetric shafts and photographic optics are deliberately independent.
  // The former performs a 36-tap radial integration; the latter renders only
  // authored sun/light flare passes. Keep the composer available for cinematic
  // flare and local-light bloom without silently re-enabling the costly shafts.
  function cinematicOpticsEnabled(){
    const active=renderer&&renderer.userData&&renderer.userData.videoSettings;
    if(active&&active.cinematicLensFlares!=null) return active.cinematicLensFlares===true;
    return !!(video&&video.cinematicLensFlares);
  }
  function needsOpticalPost(nextCamera){
    if(!cinematicOpticsEnabled()) return false;
    const opticalState=typeof lensFlareState==='function'?lensFlareState(nextCamera||activeCamera||camera):null;
    const flare=opticalState&&opticalState.flare||{};
    const bloom=opticalState&&opticalState.bloom||{};
    if(opticalState&&opticalState.mode==='cinematic'&&(
      flare.enabled===true&&Number(flare.intensity)>0 ||
      bloom.enabled===true&&Number(bloom.intensity)>0
    )) return true;
    return refreshSceneFlareCandidates().some(light=>{
      const authored=light&&light.userData&&light.userData.cinematicLensFlare;
      return authored&&authored.enabled===true&&hierarchyVisible(light)&&Number(light.intensity)>0;
    });
  }

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
    if(ssrPass){
      ssrPass.camera = activeCamera;
      const perspective = activeCamera.isPerspectiveCamera !== false;
      const cameraTypeChanged = ssrPass.userData.lkPerspectiveCamera !== perspective;
      ssrPass.userData.lkPerspectiveCamera = perspective;
      if(ssrPass.ssrMaterial && ssrPass.ssrMaterial.uniforms){
        const uniforms = ssrPass.ssrMaterial.uniforms;
        if(uniforms.cameraNear) uniforms.cameraNear.value = activeCamera.near;
        if(uniforms.cameraFar) uniforms.cameraFar.value = activeCamera.far;
        if(uniforms.cameraProjectionMatrix) uniforms.cameraProjectionMatrix.value.copy(activeCamera.projectionMatrix);
        if(uniforms.cameraInverseProjectionMatrix) uniforms.cameraInverseProjectionMatrix.value.copy(activeCamera.projectionMatrixInverse);
        if(ssrPass.ssrMaterial.defines){
          if(perspective) ssrPass.ssrMaterial.defines.PERSPECTIVE_CAMERA = true;
          else delete ssrPass.ssrMaterial.defines.PERSPECTIVE_CAMERA;
          if(cameraTypeChanged) ssrPass.ssrMaterial.needsUpdate = true;
        }
      }
      if(ssrPass.depthRenderMaterial && ssrPass.depthRenderMaterial.uniforms){
        const depthUniforms = ssrPass.depthRenderMaterial.uniforms;
        if(depthUniforms.cameraNear) depthUniforms.cameraNear.value = activeCamera.near;
        if(depthUniforms.cameraFar) depthUniforms.cameraFar.value = activeCamera.far;
        if(ssrPass.depthRenderMaterial.defines){
          ssrPass.depthRenderMaterial.defines.PERSPECTIVE_CAMERA = perspective ? 1 : 0;
          if(cameraTypeChanged) ssrPass.depthRenderMaterial.needsUpdate = true;
        }
      }
    }
    if(gtaoPass){gtaoPass.camera=activeCamera;gtaoPass.gtaoMaterial.defines.PERSPECTIVE_CAMERA=activeCamera.isPerspectiveCamera?1:0;gtaoPass.gtaoMaterial.uniforms.cameraNear.value=activeCamera.near;gtaoPass.gtaoMaterial.uniforms.cameraFar.value=activeCamera.far;}
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
    const requestedWidth = Math.max(1, Math.round(options && options.width || size().width));
    const requestedHeight = Math.max(1, Math.round(options && options.height || size().height));
    if(requestedWidth !== currentSize.width || requestedHeight !== currentSize.height){
      composer.setSize(requestedWidth, requestedHeight);
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
      const map = {
        low:{contrast:1, saturation:1, brightness:0, sharpen:0, vignette:0},
        medium:{contrast:1, saturation:1, brightness:0, sharpen:.02, vignette:0},
        high:{contrast:1, saturation:1, brightness:0, sharpen:.04, vignette:0},
        superhigh:{contrast:1, saturation:1, brightness:0, sharpen:.07, vignette:0},
        extreme:{contrast:1, saturation:1, brightness:0, sharpen:.10, vignette:0},
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
      rayLightingPass.uniforms.strength.value = .14;
    }

    if(gtaoPass){
      const profileKey=video&&video.aoQuality||'medium',profile=aoProfiles[profileKey]||aoProfiles.medium;
      gtaoPass.enabled=!options.interactive&&!!(video&&video.ambientOcclusion!==false);
      gtaoPass.blendIntensity=profile.blend;
      if(gtaoProfileKey!==profileKey){gtaoProfileKey=profileKey;gtaoPass.updateGtaoMaterial({samples:profile.samples,radius:profile.radius,scale:profile.scale,distanceExponent:1.7,thickness:1.2,distanceFallOff:1});gtaoPass.updatePdMaterial({samples:profile.denoiseSamples,rings:2,radiusExponent:2,radius:6,lumaPhi:10,depthPhi:2,normalPhi:3});}
    }

    if(ssrPass){
      ssrPass.enabled = !options.interactive && !!(video && video.rendererMode === 'raytracing' && video.reflections !== false);
      if(ssrPass.enabled) refreshSsrSelection();
      const profile = reflectionProfiles[video && video.reflectionQuality] || reflectionProfiles.high;
      if(Math.abs(ssrPass.resolutionScale - profile.resolutionScale) > .001) ssrPass.resolutionScale = profile.resolutionScale;
      ssrPass.opacity = profile.opacity;
      ssrPass.maxDistance = Math.max(5, Math.min(120, Number(video && video.reflectionDistance) || 35));
      ssrPass.thickness = profile.thickness;
      ssrPass.blur = profile.blur;
    }

    if(volumetricPass){
      const enabled = !!(video && video.volumetricLighting);
      volumetricPass.enabled = enabled;
      if(enabled){
        volumetricPass.uniforms.resolution.value.set(currentSize.width, currentSize.height);
        const opticalState = typeof lensFlareState === 'function' ? lensFlareState(activeCamera) : null;
        let onScreen = false;
        let sourceVisibility = 1;
        if(opticalState && isFinite(opticalState.ndcX) && isFinite(opticalState.ndcY)){
          tmpTargetPos.set(opticalState.ndcX, opticalState.ndcY, 0);
          onScreen = !!opticalState.visible && Math.abs(tmpTargetPos.x) <= 1.05 && Math.abs(tmpTargetPos.y) <= 1.05;
          sourceVisibility = Math.max(0, Math.min(1, Number(opticalState.visibility) || 0));
        } else {
          tmpTargetPos.set(0, 20, -40);
          const target = typeof volumetricTarget === 'function' ? volumetricTarget() : volumetricTarget;
          if(target && target.getWorldPosition) target.getWorldPosition(tmpTargetPos);
          activeCamera.getWorldDirection(tmpCameraForward);
          tmpLightVector.copy(tmpTargetPos).sub(activeCamera.position).normalize();
          const inFront = tmpLightVector.dot(tmpCameraForward) > 0;
          tmpTargetPos.project(activeCamera);
          onScreen = inFront && isFinite(tmpTargetPos.x) && isFinite(tmpTargetPos.y) && tmpTargetPos.z >= -1 && tmpTargetPos.z <= 1 && Math.abs(tmpTargetPos.x) <= 1.05 && Math.abs(tmpTargetPos.y) <= 1.05;
        }
        if(onScreen){
          volumetricPass.uniforms.lightUv.value.set(tmpTargetPos.x * .5 + .5, tmpTargetPos.y * .5 + .5);
        }
        const edgeFade = onScreen ? Math.max(0, Math.min(1, (1.05 - Math.max(Math.abs(tmpTargetPos.x), Math.abs(tmpTargetPos.y))) / .3)) : 0;
        volumetricPass.uniforms.intensity.value = .04 * edgeFade * sourceVisibility;
      }
    }

    if(cinematicFlarePass){
      const state=cinematicOpticsEnabled()&&typeof lensFlareState==='function'?lensFlareState(activeCamera):null;
      cinematicFlarePass.updateFromState(state,currentSize.width,currentSize.height);
    }
    if(sceneCinematicFlarePasses.length){
      const states=cinematicOpticsEnabled()?collectSceneFlareStates(activeCamera):[];
      sceneCinematicFlarePasses.forEach((pass,index)=>{
        if(pass) pass.updateFromState(states[index]||null,currentSize.width,currentSize.height);
      });
    }

    if(sketchPass){
      const illustrated=!!(video&&video.visualStyle==='illustrated-sketch');
      const monochrome=!!(video&&video.monochrome===true);
      // `videoOnly` disables player-camera DOF/grade in editor views; the
      // project-owned visual style must still match viewport, Play and game.
      sketchPass.enabled=illustrated||monochrome;
      sketchPass.uniforms.resolution.value.set(currentSize.width,currentSize.height);
      sketchPass.uniforms.strength.value=illustrated?styleValue(video.sketchStrength,.78):0;
      sketchPass.uniforms.detail.value=styleValue(video&&video.sketchDetail,.72);
      sketchPass.uniforms.hatching.value=styleValue(video&&video.sketchHatching,1);
      sketchPass.uniforms.lineNoise.value=styleValue(video&&video.sketchLineNoise,.35);
      sketchPass.uniforms.pigment.value=styleValue(video&&video.sketchPigment,.82);
      sketchPass.uniforms.colorNoise.value=styleValue(video&&video.sketchColorNoise,1);
      sketchPass.uniforms.saturation.value=styleValue(video&&video.sketchSaturation,1,0,2);
      sketchPass.uniforms.lightGain.value=styleValue(video&&video.sketchLightGain,1,.25,3);
      sketchPass.uniforms.atmosphere.value=styleValue(video&&video.sketchAtmosphere,.68);
      sketchPass.uniforms.paper.value=styleValue(video&&video.sketchPaper,.38);
      sketchPass.uniforms.paperMode.value=video&&video.sketchMedium==='paper-pencil'?1:0;
      sketchPass.uniforms.storybookMode.value=!video||video.sketchMedium==='painted-storybook'?1:0;
      sketchPass.uniforms.monochrome.value=monochrome?1:0;
    }

    if(fxaaPass){
      fxaaPass.enabled = !!(video && video.antialiasing === 'fxaa');
      syncFxaaResolution();
    }

    composer.render();
  }

  return {ok:true, compatibility, composer, renderPass, gtaoPass, bokeh, dofPass, gradePass, videoProfilePass, rayLightingPass, ssrPass, volumetricPass, cinematicFlarePass, sceneCinematicFlarePasses, fxaaPass, render, needsOpticalPost, hasFailed: () => renderFailed, dispose(){composer.dispose();}};
}

window.LK_RUNTIME_POST = Object.freeze({createPost});
})();
