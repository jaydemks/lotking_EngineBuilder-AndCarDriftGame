'use strict';

const {test, expect} = require('@playwright/test');

async function closeStartupOverlays(page){
  await page.evaluate(() => {
    document.querySelector('#lkWorkspaceClose')?.click();
    document.querySelector('#lkProjectsClose')?.click();
  });
}

test.beforeEach(async ({page}) => {
  page.on('pageerror', error => console.log('[browser pageerror]', error.message));
  page.on('console', message => {
    if(message.type() === 'error') console.log('[browser console]', message.text());
  });
  await page.route(/\/models\/(?:player|car1|car2|cone)\.glb(?:\?.*)?$/, route => route.fulfill({status:404, body:''}));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({mode:'browser', onlineEditor:true, workspaceReady:true}));
  });
  await page.goto('/engine_editor.html?video-e2e=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.LOT_KING && LOT_KING.editor && LOT_KING.editor.state.active === true, null, {timeout:60000});
  await closeStartupOverlays(page);
});

test('every authored configuration family survives Save, LKEP and playable export unchanged', async ({page}) => {
  const audit = await page.evaluate(async () => {
    const scene = LK_STORE.blank();
    scene.counter = 73;
    scene.transforms.audit_builtin = {p:[1.25,2.5,-3.75],r:[.11,.22,.33],s:[.8,1.2,1.4],v:false,name:'Audit Builtin',parent:'audit_parent'};
    scene.props.audit_builtin = {color:0x123456,intensity:731,distance:47,decay:1.85,angle:.62,penumbra:.37,castShadow:true,editorDummyVisible:false,dayNightSchedule:{enabled:true,onHour:19.25,offHour:6.5},cinematicLensFlare:{enabled:true,intensity:.77,size:1.13,bloomIntensity:.91,occlusion:false},collide:true,physics:true,physicsMass:13.7,physicsImpact:.42,colliderKind:'box',colliderDummyVisibility:'show',driveSurface:true};
    scene.env = {skyTime:.713,dayLength:347,dayNightCycleEnabled:false,procEnvEnabled:true,procEnvIntensity:.63,procEnvWarmth:.27,procEnvContrast:.81,surfaceWorldCollision:false,lensFlare:{enabled:true,mode:'cinematic',intensity:.83,size:1.21,opacity:.72,occlusion:true,starburst:.64},lighting:{daySun:1.17,dayAmbient:.76,nightAmbient:.13,moonDirect:.21,moonIndirect:.19},sunBloom:{enabled:true,intensity:1.37,size:1.18,radius:.16,threshold:.41},volClouds:{enabled:true,coverage:.57,density:.68,speed:.23},rain:{enabled:true,intensity:.46,dropThickness:1.7}};
    scene.player = {enabled:true,hidden:false,controllerIndex:2,modelShading:'smooth',spawn:{x:7.1,z:-4.2,heading:.37},transform:{p:[7.1,.2,-4.2],r:[.03,.37,.04],s:[1.02,1.02,1.02],v:true,name:'Audit Player'},tuning:{horsepower:617,torque:7,maxSpeed:8,exposed:{horsepower:false}},cam:{mode:'cinematic',fov:73,freePitch:.41,freeYawOffset:17,lookHeight:1.37,lateralOffset:.28,helperRange:4.5,helperSize:.83,dof:{enabled:true,focus:11.3,aperture:.037,maxblur:.083,autoFocus:false,focusRadius:.21,feather:.46,showFocus:true,bokeh:4.2},grade:{enabled:true,exposure:1.19,brightness:.07,contrast:1.13,saturation:.87,gamma:.94}},lights:{front:{enabled:true,flare:true,flareIntensity:.73,flareSize:.61,flareBloomIntensity:1.17,flareOcclusion:false},rear:{enabled:true,color:0xb8120e,brakeColor:0xff2b1f,reverseColor:0xeef4ff,flare:true,flareIntensity:.39,flareSize:.47,flareBloomIntensity:.84,flareOcclusion:true},neon:{enabled:true,layout:'sides',intensity:1.31,spill:3.4},aux:[{enabled:true,condition:'night',color:0xabcdef,intensity:1.23,glow:true,flare:true,size:.71}],dummies:{visible:true}},collision:{mass:1327,hx:1.03,hy:.48,hz:2.07,offsetX:.11,offsetY:.53,offsetZ:-.17,bodyY:.61,radius:1.52},exhaust:{enabled:true,intensity:.67,smoke:true,fire:true,sources:[{x:-.31,y:.42,z:-2.1}]},skids:{enabled:true,smokeEnabled:true,smokeAmount:.43,smokeThreshold:.52,smokeMinHeat:.39,smokeHeatRate:.82,smokeCoolRate:.31,sources:[{wheel:'rear-left'}]},dataWidgets:{enabled:true,items:[{id:'audit_widget',text:'AUDIT',format:'0.0'}]},rigTransforms:{player_front_light_0:{p:[-.63,.81,2.04],r:[0,.03,0],s:[1,1,1],v:true,name:'Audit Front L'}}};
    scene.ui = {video:{version:1,defaults:{quality:'extreme',rendererMode:'raytracing',antialiasing:'ssaa2x',exposure:1.27,shadows:true,shadowQuality:'ultra',shadowDistance:97,shadowBias:-.0007,shadowNormalBias:.041,shadowSoftness:1.2,reflections:true,reflectionQuality:'ultra',reflectionDistance:83,volumetricLighting:true},exposed:{quality:true,rendererMode:false,antialiasing:true,exposure:true,shadows:false,shadowQuality:true,reflections:true,reflectionQuality:true,reflectionDistance:true,volumetricLighting:false}},radioHud:{enabled:true,width:437,height:129,opacity:.83,buttons:{next:{x:31,y:42}}},musicLibraries:{radio:[{id:'radio_audit',title:'Radio Audit',order:2,url:'data:audio/mp3;base64,AAAA'}],menu:[{id:'menu_audit',title:'Menu Audit',order:1,url:'data:audio/mp3;base64,BBBB'}]}};
    scene.logic = {levelGraph:{version:1,name:'Audit Level Logic',scope:'level',enabled:true,variables:[{name:'AuditValue',type:'number',value:73.125,exposed:true}],nodes:[],edges:[],comments:[],subgraphs:[]}};
    scene.added = [
      {id:'audit_mesh',kind:'primitive',name:'Audit Mesh',shape:'cube',t:{p:[2,1,3],r:[.1,.2,.3],s:[1.1,.9,1.3],v:true,name:'Audit Mesh'},props:{color:0x765432,roughness:.37,metalness:.68,opacity:.81,transparent:true,castShadow:false},collide:true,physics:true,physicsMass:8.4,physicsImpact:.36,colliderKind:'box',colliderShape:{mode:'box',hx:.8,hy:.6,hz:.7,offsetX:.1,offsetY:.2,offsetZ:.3},colliderDummyVisibility:'hide'},
      {id:'audit_light',kind:'light',lightType:'spot',name:'Audit Light',t:{p:[4,5,6],r:[0,.4,0],s:[1,1,1],v:true,name:'Audit Light'},props:{color:0xffcc88,intensity:915,intensityUnit:'candela',distance:61,decay:2,angle:.48,penumbra:.29,castShadow:true,editorDummyVisible:true,dayNightSchedule:{enabled:true,onHour:20,offHour:5.5},cinematicLensFlare:{enabled:true,intensity:.58,size:.92,bloomIntensity:.74,occlusion:true}}},
      {id:'audit_text',kind:'text',name:'Audit Text',t:{p:[0,2,0],r:[0,0,0],s:[1,1,1],v:true,name:'Audit Text'},props:{text:'Persistence',fontSize:.71,color:'#c0ffee',align:'center',opacity:.88}},
      {id:'audit_texture',kind:'texture',name:'Audit Texture',t:{p:[0,1,2],r:[0,0,0],s:[1,1,1],v:true,name:'Audit Texture'},props:{src:'data:image/png;base64,AAAA',width:3.2,height:1.7,opacity:.79,alphaTest:.08,depthBias:.013,materialModel:'lit',roughness:.44,metalness:.21,doubleSide:true,animated:false}},
      {id:'audit_camera',kind:'camera',name:'Audit Camera',t:{p:[8,3,2],r:[0,.5,0],s:[1,1,1],v:true,name:'Audit Camera'},props:{fov:57,near:.07,far:731,helperSize:1.31,preview:false,activeLevelCamera:true,outputPlayerIndex:1}},
      {id:'audit_cinema',kind:'cinemaStudio',name:'Audit Cinema',t:{p:[1,0,1],r:[0,0,0],s:[1,1,1],v:true,name:'Audit Cinema'},props:{version:2,duration:9.7,fps:30,playback:'loop',trigger:'event',eventName:'AuditStart',outputPlayerIndex:1,previewCamera:'audit_camera',cameraCuts:[{time:0,cameraId:'audit_camera'}],objectTracks:[{objectId:'audit_mesh',keys:[{time:0,p:[2,1,3]}]}],lensTracks:[{cameraId:'audit_camera',keys:[{time:0,fov:57}]}],eventTracks:[{time:1.2,event:'AuditEvent'}],markers:[{time:2.3,label:'Audit Marker'}]}},
      {id:'audit_logic',kind:'logicElement',name:'Audit Logic',t:{p:[0,0,0],r:[0,0,0],s:[1,1,1],v:true,name:'Audit Logic'},graph:{version:1,name:'Audit Logic',scope:'element',enabled:true,variables:[{name:'FlarePower',type:'number',value:.73,exposed:true}],nodes:[],edges:[],comments:[],subgraphs:[],vehiclePawn:{schemaVersion:2,enabled:true,playerId:2,spawn:{x:3,y:.2,z:4,heading:.2},collision:{mass:1401,hx:1.01},suspension:{stiffness:37},camera:{mode:'arcade',fov:68},lights:{front:{flareIntensity:.66,flareBloomIntensity:.88,flareOcclusion:false},rear:{flareIntensity:.31,flareBloomIntensity:.55,flareOcclusion:true}},driveSetup:{torque:6,grip:2},tuning:{horsepower:541},exhaust:{intensity:.71},skids:{smokeAmount:.38},dataWidgets:{enabled:true}}}}
    ];
    const meta = {trackId:'persistence-audit',trackName:'Persistence Audit',levelRole:'gameplay',input:{version:1,allowedDevices:{keyboard:true,gamepad:true,touch:false},touchMode:'off',autoAssign:false,players:[{id:'player-1',device:'keyboard-1'}],devices:[{id:'keyboard-1',type:'keyboard'}],contexts:{vehicle:{keyboard:{accelerate:['KeyW']}}}}};
    const saved = LK_STORE.save(scene, meta);
    const loadedProject = LK_STORE.loadProject();
    const local = LK_STORE.verifyPersistenceRoundTrip(scene, loadedProject);
    const lkep = LK_STORE.exportProject(LK_STORE.load(), meta);
    const exported = LK_STORE.verifyPersistenceRoundTrip(scene, lkep);
    const playable = LOT_KING.editor.getPlayableExport();
    const bundle = await playable.buildPlayableBundle([lkep], 'gameplay.html', 'Persistence Audit');
    const playableCheck = LK_STORE.verifyPersistenceRoundTrip(scene, bundle.levels[0].project);
    return {saved,local,exported,playable:playableCheck,input:bundle.levels[0].project.meta.input,front:bundle.levels[0].project.scene.player.lights.front,rear:bundle.levels[0].project.scene.player.lights.rear,logicRear:bundle.levels[0].project.scene.added.find(item => item.id === 'audit_logic').graph.vehiclePawn.lights.rear};
  });
  expect(audit.saved).toBe(true);
  expect(audit.local).toEqual({ok:true,differences:[]});
  expect(audit.exported).toEqual({ok:true,differences:[]});
  expect(audit.playable).toEqual({ok:true,differences:[]});
  expect(audit.input.touchMode).toBe('off');
  expect(audit.front).toMatchObject({flareIntensity:.73,flareBloomIntensity:1.17,flareOcclusion:false});
  expect(audit.rear).toMatchObject({color:0xb8120e,brakeColor:0xff2b1f,reverseColor:0xeef4ff});
  expect(audit.logicRear).toMatchObject({flareIntensity:.31,flareBloomIntensity:.55,flareOcclusion:true});
});

test('Levels always shows hidden menu and orphaned authored levels', async ({page}) => {
  const result = await page.evaluate(() => {
    const makeProject = (id, name, role) => LK_STORE.exportProject(LK_STORE.blank(), {
      trackId:id,
      trackName:name,
      levelRole:role,
      levelVisible:false,
    });
    const menuProject = makeProject('audit-hidden-menu', 'Audit Hidden Menu', 'editor-menu');
    LK_STORE.levels.importProjectAsLevel(menuProject, 'Audit Hidden Menu');
    const orphanProject = makeProject('audit-orphan-level', 'Audit Orphan Level', 'gameplay');
    localStorage.setItem('lotking.level.audit-orphan-level', JSON.stringify(orphanProject));
    document.querySelector('#lkLevels').click();
    return {
      api:LK_STORE.levels.list({includeHidden:true}).map(level => ({name:level.name, visible:level.visible, role:level.levelRole})),
      rows:Array.from(document.querySelectorAll('#lkLevelsList .lk-level-row')).map(row => row.textContent),
    };
  });
  expect(result.api).toEqual(expect.arrayContaining([
    expect.objectContaining({name:'Audit Hidden Menu', visible:false, role:'editor-menu'}),
    expect.objectContaining({name:'Audit Orphan Level', visible:false, role:'gameplay'}),
  ]));
  expect(result.rows.some(text => text.includes('Audit Hidden Menu') && text.includes('INTERNAL'))).toBe(true);
  expect(result.rows.some(text => text.includes('Audit Orphan Level') && text.includes('INTERNAL'))).toBe(true);
});

test('project rendering authoring is wired to the shared runtime schema', async ({page}) => {
  await page.evaluate(() => document.querySelector('[data-special="env"]').click());
  await expect(page.locator('#lkInspector')).toContainText('Day / night cycle');

  // The editor root intentionally owns pointer routing over the WebGL canvas;
  // dispatch the pinned inspector action directly in headless mode.
  await page.evaluate(() => document.querySelector('[data-special="rendering"]').click());
  await expect(page.locator('#lkInspector')).toContainText('RENDERING / VIDEO');
  const qualitySelect = page.locator('[data-render-panel="defaults"] .lk-row', {hasText:'Default quality'}).locator('select');
  await expect(qualitySelect.locator('option')).toHaveCount(5);

  const rendererSelect = page.locator('[data-render-panel="defaults"] .lk-row', {hasText:'Renderer'}).locator('select');
  await expect(rendererSelect.locator('option[value="raytracing"]')).toHaveText('Ray lighting');
  const shadowSelect = page.locator('[data-render-panel="defaults"] .lk-row', {hasText:'Shadow quality'}).locator('select');
  await expect(shadowSelect.locator('option[value="ultra"]')).toHaveText('Ultra · 4096');
  await expect(page.locator('[data-render-panel="defaults"]')).toContainText('Normal bias');
  const reflectionSelect = page.locator('[data-render-panel="defaults"] .lk-row', {hasText:'Reflection quality'}).locator('select');
  await expect(reflectionSelect.locator('option[value="ultra"]')).toHaveText('Ultra');
  await expect(page.locator('[data-render-panel="defaults"]')).toContainText('Ray reach');
  await expect(page.locator('#videoReflectionQuality')).toHaveCount(1);
  await expect(page.locator('#videoReflectionDistance')).toHaveAttribute('max', '120');

  const state = await page.evaluate(() => {
    return {
      runtime:LOT_KING.settings.video,
      renderer:LOT_KING.core.renderer.userData.videoSettings,
      project:LOT_KING.settings.getVideoProject(),
      presetCount:Object.keys(LK_RUNTIME_SETTINGS_MENU.presets).length,
      hasRayPass:!!(LOT_KING.systems.post && LOT_KING.systems.post.rayLightingPass),
      hasVideoProfilePass:!!(LOT_KING.systems.post && LOT_KING.systems.post.videoProfilePass),
      hasCinematicFlarePass:!!(LOT_KING.systems.post && LOT_KING.systems.post.cinematicFlarePass),
      sceneCinematicFlarePasses:LOT_KING.systems.post && LOT_KING.systems.post.sceneCinematicFlarePasses ? LOT_KING.systems.post.sceneCinematicFlarePasses.length : 0,
      ssr:LOT_KING.systems.post && LOT_KING.systems.post.ssrPass ? {
        resolutionScale:LOT_KING.systems.post.ssrPass.resolutionScale,
        maxDistance:LOT_KING.systems.post.ssrPass.maxDistance,
        thickness:LOT_KING.systems.post.ssrPass.thickness,
      } : null,
      sun:{
        intensity:LOT_KING.core.lights.sun.intensity,
        mapSize:LOT_KING.core.lights.sun.shadow.mapSize.x,
        distance:LOT_KING.core.lights.sun.shadow.camera.right,
        normalBias:LOT_KING.core.lights.sun.shadow.normalBias,
      },
      hemiIntensity:LOT_KING.core.lights.hemi.intensity,
      lighting:LOT_KING.systems.sky.lighting.get(),
      flare:LOT_KING.systems.sky.flare.get(),
      persistedEnvironment:LK_STORE.collectEnvironment(LOT_KING),
    };
  });
  expect(state.presetCount).toBe(5);
  expect(state.hasRayPass).toBe(true);
  expect(state.hasVideoProfilePass).toBe(true);
  expect(state.hasCinematicFlarePass).toBe(true);
  expect(state.sceneCinematicFlarePasses).toBe(4);
  expect(state.runtime.quality).toBe('high');
  expect(state.renderer.quality).toBe('high');
  expect(state.project.defaults.rendererMode).toBe('webgl');
  expect(state.project.defaults.exposure).toBe(1.12);
  expect(state.project.defaults.shadowDistance).toBe(55);
  expect(state.project.defaults.shadowNormalBias).toBe(0.035);
  expect(state.project.defaults.reflectionQuality).toBe('high');
  expect(state.project.defaults.reflectionDistance).toBe(35);
  expect(state.ssr).not.toBeNull();
  expect(state.ssr.resolutionScale).toBe(1);
  expect(state.ssr.maxDistance).toBe(35);
  expect(state.ssr.thickness).toBe(0.065);
  expect(state.renderer.shadowQuality).toBe('auto');
  expect(state.sun.mapSize).toBe(2048);
  expect(state.sun.distance).toBe(55);
  expect(state.sun.normalBias).toBe(0.035);
  expect(state.sun.intensity).toBeGreaterThan(1.2);
  expect(state.hemiIntensity).toBeGreaterThan(0.75);
  expect(state.lighting.daySun).toBe(1.3);
  expect(state.lighting.moonDirect).toBe(0.16);
  expect(state.lighting.moonIndirect).toBe(0.18);
  expect(state.flare.occlusion).toBe(true);
  expect(state.flare.mode).toBe('classic');
  expect(state.flare.starburst).toBeGreaterThan(0);
  expect(state.persistedEnvironment.lighting.dayAmbient).toBe(0.82);
  expect(state.persistedEnvironment.lensFlare.occlusion).toBe(true);
  expect(state.persistedEnvironment.sunBloom.radius).toBeCloseTo(.14, 4);
  expect(state.project.exposed.rendererMode).toBe(true);
  expect(state.project.exposed.reflectionQuality).toBe(true);
  expect(state.project.exposed.reflectionDistance).toBe(true);

  const authoredLightFlare = await page.evaluate(async () => {
    const light = new THREE.PointLight(0x66bbff, 900, 30, 2);
    light.userData.cinematicLensFlare={enabled:true,intensity:.8,size:.9,bloomIntensity:.6,occlusion:false};
    const direction=new THREE.Vector3();
    LOT_KING.core.camera.getWorldDirection(direction);
    light.position.copy(LOT_KING.core.camera.position).addScaledVector(direction,8);
    LOT_KING.core.scene.add(light);
    await new Promise(resolve=>setTimeout(resolve,420));
    const saved=LK_STORE.lightProps(light).cinematicLensFlare;
    const restored=new THREE.PointLight();
    LK_STORE.applyLightProps(restored,{cinematicLensFlare:saved});
    const active=LOT_KING.systems.post.sceneCinematicFlarePasses.some(pass=>pass&&pass.enabled);
    LOT_KING.core.scene.remove(light);
    return {saved,restored:restored.userData.cinematicLensFlare,active};
  });
  expect(authoredLightFlare.active).toBe(false);
  expect(authoredLightFlare.saved).toEqual({enabled:true,intensity:.8,size:.9,bloomIntensity:.6,occlusion:false});
  expect(authoredLightFlare.restored).toEqual(authoredLightFlare.saved);

  const nightLighting = await page.evaluate(() => {
    const sky = LOT_KING.systems.sky;
    const previousTime = sky.getTime();
    const previousLighting = sky.lighting.get();
    sky.lighting.set({moonDirect:.27, moonIndirect:.31});
    sky.setTime(.75);
    const result = {
      direct:LOT_KING.core.lights.sun.intensity,
      indirect:LOT_KING.core.lights.hemi.intensity,
    };
    sky.lighting.set(previousLighting);
    sky.setTime(previousTime);
    return result;
  });
  expect(nightLighting.direct).toBeCloseTo(.27, 4);
  expect(nightLighting.indirect).toBeCloseTo(.31, 4);

  const punctualLights = await page.evaluate(() => {
    const legacy = LK_STORE.createLight('spot', {intensity:1.5}).userData.light;
    const physical = LK_STORE.createLight('spot', {intensity:750, intensityUnit:'candela'}).userData.light;
    return {legacy:legacy.intensity, physical:physical.intensity, power:physical.power, decay:physical.decay};
  });
  expect(punctualLights.legacy).toBe(600);
  expect(punctualLights.physical).toBe(750);
  expect(punctualLights.power).toBeCloseTo(750 * Math.PI, 4);
  expect(punctualLights.decay).toBe(2);

  const dayNightControls = await page.evaluate(() => {
    const sky = LOT_KING.systems.sky;
    const scene = LOT_KING.core.scene;
    const previousTime = sky.getTime();
    const previousEnabled = sky.getCycleEnabled();
    sky.setCycleEnabled(false);
    sky.setTime(.4);
    sky.update(120);
    const frozenTime = sky.getTime();
    const persistedDisabled = LK_STORE.collectEnvironment(LOT_KING).dayNightCycleEnabled;

    const root = LK_STORE.createLight('spot', {
      intensity:600,
      intensityUnit:'candela',
      dayNightSchedule:{enabled:true, onHour:18, offHour:7},
    });
    scene.add(root);
    const light = root.userData.light;
    sky.setTime(.25);
    const visibleAtNoon = light.visible;
    sky.setTime(.8);
    const visibleAtNight = light.visible;
    sky.setTime(.375);
    const visibleNextDay = light.visible;
    const schedule = Object.assign({}, light.userData.dayNightSchedule);
    scene.remove(root);
    sky.setTime(previousTime);
    sky.setCycleEnabled(previousEnabled);
    sky.setTime(0);
    const dawnHour = sky.getClockHour();
    sky.setTime(.25);
    const noonHour = sky.getClockHour();
    sky.setTime(.5);
    const sunsetHour = sky.getClockHour();
    sky.setTime(.75);
    const midnightHour = sky.getClockHour();
    sky.setClockHour(18);
    const sunsetCycleTime = sky.getTime();
    sky.setTime(previousTime);
    return {frozenTime, persistedDisabled, visibleAtNoon, visibleAtNight, visibleNextDay, schedule, dawnHour, noonHour, sunsetHour, midnightHour, sunsetCycleTime};
  });
  expect(dayNightControls.frozenTime).toBeCloseTo(.4, 8);
  expect(dayNightControls.persistedDisabled).toBe(false);
  expect(dayNightControls.visibleAtNoon).toBe(false);
  expect(dayNightControls.visibleAtNight).toBe(true);
  expect(dayNightControls.visibleNextDay).toBe(false);
  expect(dayNightControls.schedule).toEqual({enabled:true, onHour:18, offHour:7});
  expect(dayNightControls.dawnHour).toBeCloseTo(6, 8);
  expect(dayNightControls.noonHour).toBeCloseTo(12, 8);
  expect(dayNightControls.sunsetHour).toBeCloseTo(18, 8);
  expect(dayNightControls.midnightHour).toBeCloseTo(0, 8);
  expect(dayNightControls.sunsetCycleTime).toBeCloseTo(.5, 8);

  const meshShading = await page.evaluate(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0,0,0, 1,0,0, 0,1,0,
      0,0,0, 0,1,0, 0,0,1,
    ], 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([
      0,0,1, 0,0,1, 0,0,1,
      1,0,0, 1,0,0, 1,0,0,
    ], 3));
    const material = new THREE.MeshStandardMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    const api = LK_RUNTIME_PLAYER_MODEL;
    api.applyModelShading(mesh, 'smooth', THREE);
    const smooth = geometry.getAttribute('normal');
    const sharedNormalsMatch = Math.abs(smooth.getX(0) - smooth.getX(3)) < 1e-6 && Math.abs(smooth.getZ(0) - smooth.getZ(3)) < 1e-6;
    const smoothDiagonal = smooth.getX(0) > .7 && smooth.getZ(0) > .7;
    api.applyModelShading(mesh, 'flat', THREE);
    const flat = material.flatShading;
    api.applyModelShading(mesh, 'original', THREE);
    const original = geometry.getAttribute('normal');
    const originalsRestored = original.getZ(0) === 1 && original.getX(3) === 1 && material.flatShading === false;
    const previous = LOT_KING.player.getModelShading();
    LOT_KING.player.setModelShading('smooth');
    const persisted = LK_STORE.collect(LOT_KING).player.modelShading;
    LOT_KING.player.setModelShading(previous);
    const logicGraph = LK_LOGIC_GRAPH.clone(LK_LOGIC_TEMPLATES.get('logic-template-player-car').graph);
    logicGraph.vehiclePawn.modelShading = 'flat';
    const logicCar = LK_STORE.createLogicElement({graph:logicGraph, name:'Shading Test Vehicle'});
    let logicShadedMaterials = 0;
    let logicFlatMaterials = 0;
    logicCar.traverse(node => {
      const materials = node && node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : [];
      materials.forEach(item => {
        if(item && 'flatShading' in item){ logicShadedMaterials++; if(item.flatShading) logicFlatMaterials++; }
      });
    });
    geometry.dispose(); material.dispose();
    return {
      sharedNormalsMatch, smoothDiagonal, flat, originalsRestored, persisted,
      logicPersisted:logicCar.userData.logicGraph.vehiclePawn.modelShading,
      logicShadedMaterials, logicFlatMaterials,
    };
  });
  expect(meshShading.sharedNormalsMatch).toBe(true);
  expect(meshShading.smoothDiagonal).toBe(true);
  expect(meshShading.flat).toBe(true);
  expect(meshShading.originalsRestored).toBe(true);
  expect(meshShading.persisted).toBe('smooth');
  expect(meshShading.logicPersisted).toBe('flat');
  expect(meshShading.logicShadedMaterials).toBeGreaterThan(0);
  expect(meshShading.logicFlatMaterials).toBe(meshShading.logicShadedMaterials);

  await page.evaluate(() => document.querySelector('[data-special="hud"]').click());
  await expect(page.locator('#lkInspector')).toContainText('HUD / RADIO TAB');
  await page.evaluate(() => {
    document.querySelectorAll('#lkInspector .lk-sec').forEach(section => section.classList.remove('closed'));
  });

  const gameSection = page.locator('.lk-sec', {hasText:'GAME RADIO LIBRARY'});
  const menuSection = page.locator('.lk-sec', {hasText:'MENU MUSIC LIBRARY'});
  await expect(gameSection.locator('button.lk-danger')).not.toHaveCount(0);
  await expect(menuSection.locator('button.lk-danger')).not.toHaveCount(0);

  await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('#lkInspector .lk-sec'));
    const game = sections.find(section => section.textContent.includes('GAME RADIO LIBRARY'));
    const remove = game && game.querySelector('button.lk-danger');
    if(remove) remove.click();
  });
  await expect(page.locator('#lkConfirmOverlay.open')).toBeVisible();
  await expect(page.locator('#lkConfirmTitle')).toHaveText('Remove music track?');
  await expect(page.locator('#lkConfirmOk')).toHaveText('Remove track');

  const freshOriginImport = await page.evaluate(() => {
    const root = LK_STORE.exportProject(LK_STORE.blank(), {trackId:'e2e-root', trackName:'E2E Root', levelRole:'gameplay'});
    const soccer = LK_STORE.exportProject(LK_STORE.blank(), {trackId:'e2e-soccer', trackName:'E2E Soccer', levelRole:'gameplay'});
    soccer.savedAt = '2099-01-01T00:00:00.000Z';
    root.embeddedLevels = [{id:'e2e-soccer', name:'E2E Soccer', role:'gameplay', visible:true, savedAt:soccer.savedAt, project:soccer}];
    Array.from({length:localStorage.length}, (_, i) => localStorage.key(i)).filter(Boolean).forEach(key => {
      if(key === 'lotking.scene.v1' || key === 'lotking.levels.v1' || key.indexOf('lotking.level.') === 0) localStorage.removeItem(key);
    });
    LK_STORE.importProject(root);
    const levels = LK_STORE.levels.list({includeHidden:true});
    return {activeId:LK_STORE.levels.activeId(), levels:levels.map(level => level.id)};
  });
  expect(freshOriginImport.activeId).toBe('e2e-root');
  expect(freshOriginImport.levels).toEqual(expect.arrayContaining(['e2e-root', 'e2e-soccer']));
});

test('Developer Debugger reports live editor telemetry and survives Play Preview', async ({page}) => {
  await page.locator('#lkDevToolsToggle').click();
  await expect(page.locator('#lkDevToolsMenu')).toBeVisible();
  await page.locator('#lkOpenPerformanceDebugger').click();
  const debuggerPanel=page.locator('#lkDeveloperDebugger');
  await expect(debuggerPanel).toHaveClass(/open/);
  await expect(debuggerPanel).toHaveAttribute('aria-hidden','false');
  await expect(page.locator('#lkDbgAutoLog')).toHaveText('AUTO LOG · SAVED');
  await expect.poll(async()=>page.evaluate(()=>fetch('/__lotking/developer-performance').then(response=>response.text()))).toContain('# LOT KING Developer Performance Snapshot');
  await expect(page.locator('#lkDbgSummary .lk-dbg-metric')).toHaveCount(8);
  await expect(page.locator('#lkDbgSummary')).toContainText('PARTICLES LIVE');
  await expect(page.locator('#lkDbgSummary')).toContainText('PARTICLE SYSTEMS');
  const particleSystems=await page.locator('#lkDbgSummary .lk-dbg-metric', {hasText:'PARTICLE SYSTEMS'}).locator('strong').evaluate(node=>Number(node.textContent.replace(/\D/g,'')));
  expect(particleSystems).toBeGreaterThanOrEqual(2);
  await expect(page.locator('#lkDbgHardware')).toContainText('GPU');
  await expect(page.locator('#lkDbgHardware')).toContainText('Particle pool / live');
  const particleCapacity=await page.locator('#lkDbgHardware div', {hasText:'Particle pool / live'}).locator('b').evaluate(node=>Number(node.textContent.split('/')[0].replace(/\D/g,'')));
  expect(particleCapacity).toBeGreaterThanOrEqual(320);
  await expect(page.locator('#lkDbgSceneRows tr').first()).toBeVisible();
  const playerResourceRow=page.locator('#lkDbgSceneRows tr[data-debug-index]', {hasText:'player_car (Logic)'}).first();
  await expect(playerResourceRow).toBeVisible();
  await playerResourceRow.click();
  await expect(playerResourceRow).toHaveClass(/selected/);
  await expect(page.locator('#lkOutliner .lk-item.sel')).toContainText('player_car (Logic)');
  expect(await page.evaluate(()=>LOT_KING.editor.state.selected&&LOT_KING.editor.state.selected.userData.editorType)).toBe('player');
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#lkDbgExport').click();
  const performanceDownload=await downloadPromise;
  expect(performanceDownload.suggestedFilename()).toMatch(/^lotking-performance-.*\.json$/);
  const chartSize=await page.locator('#lkDbgFrameChart').evaluate(canvas=>({width:canvas.width,height:canvas.height}));
  expect(chartSize.width).toBeGreaterThan(10);
  expect(chartSize.height).toBeGreaterThan(10);

  await page.evaluate(()=>window.dispatchEvent(new ErrorEvent('error',{message:'Debugger audit error'})));
  await expect(page.locator('#lkDbgEvents')).toContainText('Debugger audit error');

  await page.evaluate(()=>document.querySelector('#lkPlay').click());
  await expect(page.locator('#lkEditor')).toHaveClass(/play-preview/);
  await expect(debuggerPanel).toBeVisible();
  await expect(page.locator('#lkDbgMode')).toHaveText('PLAY PREVIEW');
  await page.evaluate(()=>document.querySelector('#lkPlay').click());
  await expect(page.locator('#lkEditor')).not.toHaveClass(/play-preview/);
});
