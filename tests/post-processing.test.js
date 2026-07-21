const fs = require('fs');
const path = require('path');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'runtime', 'post.js'), 'utf8');
const cinematicFlareSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'runtime', 'cinematic-lens-flare.js'), 'utf8');
const skySource = fs.readFileSync(path.join(__dirname, '..', 'js', 'runtime', 'sky.js'), 'utf8');
const cameraSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'runtime', 'player-camera.js'), 'utf8');
const editorCoreSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'editor', 'editor-core.js'), 'utf8');
const editorRuntimeSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'editor', 'editor-runtime.js'), 'utf8');
const volumetricCloudSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'runtime', 'volumetric-clouds.js'), 'utf8');
const playerLightRigSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'runtime', 'player-light-rig.js'), 'utf8');

assert(source.includes('float emitter = smoothstep(1.10, 2.40, bright)'), 'volumetric shafts are sourced only by HDR emitters');
assert(source.includes('emitter *= sourceMask'), 'volumetric shafts reject aligned headlights and bright SSR pixels outside the sun source');
assert(source.includes('opticalState.ndcX') && source.includes('opticalState.ndcY'), 'volumetric lighting follows the same camera-relative sun projection as the optical flare');
assert(!source.includes('smokeDensity = smoothstep'), 'bright neutral scene meshes are not misclassified as smoke');
assert(source.includes('onScreen = !!opticalState.visible') && source.includes('onScreen = inFront &&'), 'volumetric lighting is disabled when its optical or fallback source is behind or outside the camera');
assert(source.includes('new THREE.SSRPass'), 'ray reflections use the official Three.js SSR pass when available');
assert(source.includes('ssrPass.isSelective = true'), 'SSR is restricted to reflective metallic meshes');
assert(source.includes('ssrPass.resolutionScale = profile.resolutionScale'), 'SSR quality controls its internal resolution');
assert(source.includes('video && video.reflectionDistance'), 'SSR ray reach follows the project/player setting');
assert(source.includes('mat.metalness >= .35'), 'SSR excludes ordinary rough ground materials');
assert(source.includes('uniforms.cameraProjectionMatrix.value.copy(activeCamera.projectionMatrix)'), 'SSR depth reconstruction follows the active camera projection every frame');
assert(source.includes('/max(a,0.00001)'), 'SSR blur keeps no-hit sky pixels finite and transparent');
assert(source.includes('target === this.ssrRenderTarget || target === this.blurRenderTarget || target === this.blurRenderTarget2'), 'SSR reflection intermediates are cleared between frames');
assert(source.includes('node.userData.lkSkipSsrOverride === true'), 'GPU-deformed transparent effects are excluded from incompatible SSR override passes');
assert(!source.includes('vec3 reflected=max(base-bounce'), 'indirect ray lighting does not add a high-pass halo over the whole frame');
assert(source.includes('low:{contrast:1, saturation:1, brightness:0'), 'quality presets keep color and illumination neutral');
assert(source.includes('videoOnly'), 'editor cameras can render the shared video pipeline without player-camera grading');
assert(source.includes('renderPass.camera = activeCamera'), 'the shared post pipeline accepts editor and gameplay cameras');
assert(source.includes('new THREE.ShaderPass(THREE.FXAAShader)'), 'FXAA uses the Three.js post-process shader');
assert(source.includes('new THREE.OutputPass()'), 'modern Three.js output color conversion is explicit in the composer');
assert(source.includes('LK_RUNTIME_CINEMATIC_LENS_FLARE.createPass'), 'the selectable cinematic sun flare is part of the shared post pipeline');
assert(source.includes('lensFlareState(activeCamera)'), 'cinematic flare projection follows the active editor or gameplay camera');
assert(cinematicFlareSource.includes('lensDirtTexture'), 'cinematic flare retains the licensed lens-dirt optical modulation');
assert(cinematicFlareSource.includes('for (int i = 0; i < 8; i++)'), 'cinematic flare renders a bounded configurable optical ghost chain');
assert(cinematicFlareSource.includes('float dotDistance = length(p-mouse*dist/.5)') && cinematicFlareSource.includes('exp(-(dotDistance*dotDistance)'), 'cinematic point ghosts use bounded soft cores instead of flickering reciprocal singularities');
assert(cinematicFlareSource.includes('bloomRadius') && cinematicFlareSource.includes('bloomThreshold'), 'cinematic sun bloom exposes authored radius and threshold');
assert(source.includes('video&&video.volumetricLighting?state:null') && source.includes('video&&video.volumetricLighting?collectSceneFlareStates(activeCamera):[]'), 'disabling volumetric lighting also disables the heavy cinematic flare passes');
assert(playerLightRigSource.includes('flareIntensity:.24') && playerLightRigSource.includes('flareIntensity:.16'), 'front and rear vehicle flare pairs have independent restrained defaults');
assert(playerLightRigSource.includes('flareBloomIntensity:.19') && playerLightRigSource.includes('flareBloomIntensity:.12'), 'vehicle flare bloom is authored and persisted independently for front and rear pairs');
assert(playerLightRigSource.includes('f.flareOcclusion') && playerLightRigSource.includes('r.flareOcclusion'), 'front and rear vehicle flare occlusion reaches the runtime optical sources');
assert(playerLightRigSource.includes('f.flareIntensity == null ? .24 : f.flareIntensity'), 'both front headlights use the same authored pair flare power without high-beam amplification');
assert(playerLightRigSource.includes('!!r.flare && cinematicPair === true') && playerLightRigSource.includes('rig.rear.position'), 'only the rear position-light pair emits cinematic flare instead of stacking brake and reverse sources');
assert(playerLightRigSource.includes('item.glow.scale.setScalar(f.glowSize)') && playerLightRigSource.includes('item.flare.scale.setScalar(f.flareSize)'), 'high beams preserve the authored front-light dummy and sprite footprint');
assert(!playerLightRigSource.includes('f.glowSize * (1 + highBeamBoost') && !playerLightRigSource.includes('f.flareSize * (1 + highBeamBoost'), 'high beams never make vehicle light markers appear to move by resizing their selected bounds');
assert(playerLightRigSource.includes('function pinEmitterToAnchor(item)') && playerLightRigSource.includes('[item.light, item.point, item.glow, item.flare]'), 'every vehicle emitter and optical sprite is pinned to the exact dummy origin');
assert(playerLightRigSource.includes('function syncAnchorTransforms(resolveSource)') && playerLightRigSource.includes('anchorMatrix.decompose(anchor.position, anchor.quaternion, anchor.scale)'), 'Vehicle Pawn runtime lights inherit the authored Logic Element dummy transform');
assert(skySource.includes('node.userData.editorCameraHelper') && skySource.includes('node.userData.lkFlareIgnore'), 'editor camera helpers never occlude the sun flare');
assert(!skySource.includes("node.userData.editorType === 'player' || node.userData.vehiclePawnId"), 'real Player Car geometry keeps normal sun depth occlusion');
assert(skySource.includes('sunPositionForCamera(camera,_fs,250)') && skySource.includes('sunSprite.onBeforeRender'), 'sun visuals and optical projection are camera-relative sky directions');
assert(skySource.includes('celestialDistance(camera,330)') && skySource.includes('far * .78'), 'celestial visuals stay inside each active camera far plane');
assert(skySource.includes('flareHitTransmission') && skySource.includes('material.transmission') && skySource.includes('flareTextureAlpha'), 'clouds, smoke and glass attenuate optical visibility according to alpha/transmission');
assert(skySource.includes('Math.pow(sourceTransmission,.55)') && skySource.includes('sourceTransmission,'), 'cinematic flare uses a dedicated photographic transmission response');
assert(skySource.includes("document.body.classList.contains('lk-volumetric-lighting')") && skySource.includes('flare.group.visible = !cinematicMode'), 'cinematic mode falls back to the classic sun flare when volumetric lighting is disabled');
assert(volumetricCloudSource.includes('dome.userData.lkFlareTransmission') && volumetricCloudSource.includes('flareDensity'), 'volumetric-cloud flare transmission samples the moving authored density field');
assert(editorCoreSource.includes('helperGroup.userData.lkFlareIgnore = true'), 'the complete editor helper group is excluded from optical occlusion');
assert(editorRuntimeSource.includes('Number(GAME.player.cameraCfg.helperRange) || 5'), 'the editor camera cone uses a compact authored range instead of the gameplay far plane');
assert(cameraSource.includes('freePitch: .32') && cameraSource.includes('helperSize: .7'), 'camera placement and helper sizing have persistent defaults');
assert(source.indexOf('new THREE.OutputPass()') < source.indexOf('new THREE.ShaderPass(THREE.FXAAShader)'), 'OutputPass runs before display-space FXAA');
assert(source.includes("video.antialiasing === 'fxaa'"), 'FXAA pass follows the shared video setting');

console.log('post-processing.test.js: all assertions passed');
