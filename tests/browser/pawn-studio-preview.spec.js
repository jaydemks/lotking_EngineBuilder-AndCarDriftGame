'use strict';

// Regression coverage for two Pawn Studio preview bugs reported after the
// FBX-to-GLB / Motion Animation Set work: converted sources appeared to
// "disappear" from the preview panel.
//
// Root causes fixed in js/editor/pawn-studio.js:
// 1. When a motion entry's asset loaded a mesh but no matching animation
//    clip, the code added the mesh to the scene and then immediately
//    disposed its geometry/materials without removing it, leaving a
//    broken, invisible object as the active preview.
// 2. previewMainModel()/previewMotion() only checked whether Pawn Studio
//    was still open, not whether a newer preview request had since
//    superseded the in-flight one. Clicking through several motion
//    entries quickly (a normal workflow after a batch FBX import) started
//    overlapping async GLB loads that could resolve out of order, letting
//    a stale response clear what a later click had just set up.
const {test, expect} = require('@playwright/test');

function captureFailures(page){
  const failures = [];
  page.on('pageerror', error => failures.push('pageerror: ' + error.message));
  page.on('console', message => { if(message.type() === 'error') failures.push('console: ' + message.text() + ' @ ' + (message.location().url || 'unknown')); });
  page.on('response', response => { if(response.status() >= 400) failures.push('http ' + response.status() + ': ' + response.url()); });
  return failures;
}

// The repository intentionally omits the oversized demo models and the
// editor probes for the native player fallback GLB on every boot; both
// produce expected 404s unrelated to Pawn Studio (see three-r185.spec.js).
function unexpectedFailures(failures){
  return failures.filter(message =>
    !/models\/(?:player|car1|car2|cone)(?:\.glb|\/scene\.gltf)/.test(message) &&
    !/__lotking\/project-state/.test(message));
}

async function seedWorkspace(page){
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({mode:'browser', onlineEditor:true, workspaceReady:true}));
  });
}

// Builds a bare Character Pawn graph (no Main Mesh) with two motion entries
// pointing at two different real GLB fixtures already in the repo, then
// opens Pawn Studio against it directly through the public API — the same
// entry point the Logic Element inspector's "Open Pawn Studio…" button uses.
async function openStudioWithTwoMotions(page){
  return page.evaluate(() => {
    const graph = {
      characterPawn:{
        schemaVersion:2, model:null,
        animationSet:[
          {id:'entry-a', name:'Entry A', state:'grounded', direction:[0,1], speed:2, speedTolerance:2, asset:{src:'models/player_v2.glb', kind:'glb', clips:[]}, clip:'', loop:true, priority:1, playbackRate:1},
          {id:'entry-b', name:'Entry B', state:'grounded', direction:[0,1], speed:2, speedTolerance:2, asset:{src:'models/player_4.glb', kind:'glb', clips:[]}, clip:'', loop:true, priority:1, playbackRate:1},
        ],
        movement:{}, camera:{}, appearance:{},
      },
      logicScene:{elements:[]},
    };
    const object = {userData:{editorName:'Pawn Studio Test Character', logicGraph:graph}};
    window.__pawnStudioMotionGraph=graph;
    const studio = window.LK_EDITOR_PAWN_STUDIO.create({
      STORE: window.LK_STORE,
      assetLibraryLoad: () => [],
      importAssetFiles: () => Promise.resolve([]),
      onSave: () => {},
      GAME: window.LOT_KING,
      pluginManager: window.LOT_KING.editor.plugins,
    });
    window.__pawnStudioTest = studio;
    return studio.open(object, graph);
  });
}

test.describe('Pawn Studio motion preview', () => {
  test('a missing canonical GLB falls back to the preserved FBX source', async ({page}) => {
    const failures = captureFailures(page);
    await seedWorkspace(page);
    await page.goto('/engine_editor.html', {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => window.LOT_KING && LOT_KING.state && LOT_KING.state.sceneReady === true, null, {timeout:30000});
    const opened=await page.evaluate(async()=>{
      const attach=THREE.TransformControls.prototype.attach;THREE.TransformControls.prototype.attach=function(object){window.__pawnStudioTransformControl=this;return attach.call(this,object);};
      await LK_ASSET_BLOBS.put('e2e:fbx-source',new Blob([new Uint8Array([1,2,3])],{type:'application/octet-stream'}));
      THREE.FBXLoader.prototype.loadAsync=function(url){window.__directFbxPreviewUrl=url;const root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshStandardMaterial());root.add(mesh);root.animations=[];return Promise.resolve(root);};
      const graph={characterPawn:{schemaVersion:2,model:{id:'fbx-e2e',key:'glb:fbx-e2e',dbKey:'compiled:e2e',name:'Direct FBX',kind:'glb',fit:1.9,sourceFormat:'fbx',sourceDbKey:'e2e:fbx-source',sourceDependencies:[],clips:[]},animationSet:[],movement:{},camera:{},appearance:{}},logicScene:{elements:[{id:'character_model',asset:{id:'fbx-e2e'},linked:true,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}]}};
      const object=LK_STORE.createLogicElement({graph,name:'Direct FBX Test'});object.userData.editorName='Direct FBX Test';
      const onSave=(owner,next)=>{const normalized=LK_LOGIC_GRAPH.normalizeGraph(next,'Direct FBX Test','element');owner.userData.logicGraph=normalized;LK_STORE.syncLogicElementSceneObject(owner,normalized);};
      const studio=LK_EDITOR_PAWN_STUDIO.create({STORE:LK_STORE,assetLibraryLoad:()=>[],importAssetFiles:()=>Promise.resolve([]),onSave,GAME:LOT_KING,pluginManager:LOT_KING.editor.plugins});
      window.__pawnStudioTest=studio;window.__directFbxGraph=graph;window.__directFbxOwner=object;return studio.open(object,graph);
    });
    expect(opened).toBe(true);
    await page.waitForFunction(()=>{const text=document.querySelector('.lk-ps-preview-status')?.textContent||'';return text&&!/Loading main mesh/i.test(text);});
    expect(await page.evaluate(()=>String(window.__directFbxPreviewUrl||'').startsWith('blob:'))).toBe(true);
    await expect(page.locator('.lk-ps-preview-mount canvas')).toBeVisible();
    // The editor pre-benchmark deliberately owns pointer input until it fades.
    // Select through the Studio API surface so this focused authoring test does
    // not spend its timeout waiting for an unrelated GPU warm-up.
    await page.evaluate(()=>document.querySelector('.lk-ps-tree-item[data-id="model"]')?.click());
    const height=page.locator('.lk-ps-field',{hasText:'Normalized character height'}).locator('input');
    const scale=page.locator('.lk-ps-field',{hasText:'Uniform world scale'}).locator('input');
    await height.fill('1.75');await height.dispatchEvent('change');await scale.fill('0.8');await scale.dispatchEvent('change');
    await expect.poll(()=>page.evaluate(()=>({fit:window.__directFbxGraph.characterPawn.model.fit,scale:window.__directFbxGraph.logicScene.elements[0].scale}))).toEqual({fit:1.75,scale:[.8,.8,.8]});
    const ground=page.locator('.lk-ps-field',{hasText:'Ground offset Y'}).locator('input[type="range"]');
    const pitch=page.locator('.lk-ps-field',{hasText:'Forward/back tilt'}).locator('input[type="range"]');
    await ground.fill('0.12');await ground.dispatchEvent('change');await pitch.fill('-3.5');await pitch.dispatchEvent('change');
    await expect.poll(()=>page.evaluate(()=>({position:window.__directFbxGraph.logicScene.elements[0].position,rotation:window.__directFbxGraph.logicScene.elements[0].rotation}))).toEqual({position:[0,.12,0],rotation:[-3.5,0,0]});
    await page.evaluate(()=>{document.querySelector('[data-transform="scale"]')?.click();const control=window.__pawnStudioTransformControl,object=control&&control.object;object.scale.set(.7,.8,.9);control.dispatchEvent({type:'objectChange'});control.dispatchEvent({type:'mouseUp'});});
    await expect.poll(()=>page.evaluate(()=>window.__directFbxGraph.logicScene.elements[0].scale)).toEqual([.7,.8,.9]);
    await expect.poll(()=>page.evaluate(()=>{let node=null;__directFbxOwner.traverse(item=>{if(!node&&item.userData&&item.userData.logicElementSceneId==='character_model'&&item.userData.logicElementAssetKey)node=item;});return node&&{position:node.position.toArray(),rotation:[THREE.MathUtils.radToDeg(node.rotation.x),THREE.MathUtils.radToDeg(node.rotation.y),THREE.MathUtils.radToDeg(node.rotation.z)],scale:node.scale.toArray()};})).toEqual({position:[0,.12,0],rotation:[-3.5,0,0],scale:[.7,.8,.9]});
    expect(unexpectedFailures(failures), failures.join('\n')).toEqual([]);
  });

  test('a mesh with no matching clip stays visible instead of disappearing', async ({page}) => {
    const failures = captureFailures(page);
    await seedWorkspace(page);
    await page.goto('/engine_editor.html', {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => window.LOT_KING && LOT_KING.state && LOT_KING.state.sceneReady === true, null, {timeout:30000});

    await page.evaluate(()=>{
      const attach=THREE.TransformControls.prototype.attach;
      THREE.TransformControls.prototype.attach=function(object){window.__pawnStudioMotionTransformControl=this;return attach.call(this,object);};
    });
    const opened = await openStudioWithTwoMotions(page);
    expect(opened).toBe(true);

    await page.click('.lk-ps-tree-item[data-id="motion:0"]');
    await page.waitForFunction(() => {
      const status = document.querySelector('.lk-ps-preview-status');
      return !!status && status.textContent && status.textContent.trim().length > 0 && status.textContent !== 'Loading main mesh…';
    }, null, {timeout:20000});

    const status = await page.textContent('.lk-ps-preview-status');
    // Neither the old "no render mesh" fallback nor a raw error should show
    // for a fixture that does contain a mesh — it may legitimately have no
    // matching clip (these fixtures are not authored as character motion
    // clips), but the mesh itself must still be the active preview.
    expect(status).not.toMatch(/no render mesh/i);
    expect(status).not.toMatch(/model error/i);

    const canvasVisible = await page.evaluate(() => {
      const canvas = document.querySelector('.lk-ps-preview-mount canvas');
      return !!canvas && canvas.width > 0 && canvas.height > 0;
    });
    expect(canvasVisible).toBe(true);

    await page.evaluate(()=>{
      const control=window.__pawnStudioMotionTransformControl,object=control&&control.object;
      object.position.x+=.25;
      object.rotation.y+=THREE.MathUtils.degToRad(6);
      control.dispatchEvent({type:'objectChange'});
      control.dispatchEvent({type:'mouseUp'});
    });
    await expect.poll(()=>page.evaluate(()=>window.__pawnStudioMotionGraph.characterPawn.animationSet[0].motionTransform)).toEqual({position:[.25,0,0],rotation:[0,6,0]});

    expect(unexpectedFailures(failures), failures.join('\n')).toEqual([]);
  });

  test('a standalone FBX slot cannot overwrite preview scale when animation starts', async ({page}) => {
    const failures=captureFailures(page);await seedWorkspace(page);await page.goto('/engine_editor.html',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.LOT_KING&&LOT_KING.state&&LOT_KING.state.sceneReady===true,null,{timeout:30000});
    const opened=await page.evaluate(()=>{
      const mixerClipAction=THREE.AnimationMixer.prototype.clipAction;THREE.AnimationMixer.prototype.clipAction=function(){const action=mixerClipAction.apply(this,arguments),hips=this._root&&this._root.getObjectByName&&this._root.getObjectByName('Hips');if(hips){window.__standaloneMixer=this;window.__standaloneRoot=this._root;window.__standaloneHips=hips;}return action;};
      const makeSource=()=>{const root=new THREE.Group(),hips=new THREE.Bone(),head=new THREE.Bone();hips.name='Hips';hips.position.y=1;head.name='Head';head.position.y=1;hips.add(head);const geometry=new THREE.BoxGeometry(.4,1,.25),count=geometry.attributes.position.count,indices=new Uint16Array(count*4),weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial({skinning:true}));mesh.add(hips);mesh.bind(new THREE.Skeleton([hips,head]));root.add(mesh);root.animations=[new THREE.AnimationClip('Idle',1,[new THREE.VectorKeyframeTrack('Hips.position',[0,1],[0,1,0,0,100,0]),new THREE.VectorKeyframeTrack('Hips.scale',[0,1],[1,1,1,100,100,100]),new THREE.QuaternionKeyframeTrack('Hips.quaternion',[0,1],[0,0,0,1,0,.3826834,0,.9238795])])];return root;};
      const graph={characterPawn:{schemaVersion:2,model:null,animationSet:[{id:'idle',name:'Idle',state:'grounded',direction:[0,0],speed:0,asset:{id:'raw-fbx',kind:'glb',sourceFormat:'fbx'},clip:'Idle',loop:true,priority:1,playbackRate:1,sourceOrientation:'y-up',previewScale:1}],movement:{},camera:{},appearance:{}},logicScene:{elements:[]}};window.__standaloneGraph=graph;
      const studio=LK_EDITOR_PAWN_STUDIO.create({STORE:{loadLogicElementAsset:()=>Promise.resolve(makeSource())},assetLibraryLoad:()=>[],importAssetFiles:()=>Promise.resolve([]),onSave:()=>{},GAME:LOT_KING,pluginManager:{extensions:()=>[]}});return studio.open({userData:{editorName:'Standalone FBX Scale',logicGraph:graph}},graph);
    });
    expect(opened).toBe(true);await page.evaluate(()=>document.querySelector('.lk-ps-tree-item[data-id="motion:0"]').click());await page.waitForFunction(()=>window.__standaloneMixer&&/tracks bound|tracce collegate/i.test(document.querySelector('.lk-ps-preview-status')?.textContent||''),null,{timeout:20000});
    const scale=page.locator('.lk-ps-field',{hasText:/Animation preview scale|Scala anteprima animazione/}).locator('input');await scale.fill('0,001');await scale.press('Tab');
    await page.waitForFunction(()=>window.__standaloneGraph.characterPawn.animationSet[0].previewScale===.001,null,{timeout:20000});
    await page.waitForFunction(()=>window.__standaloneRoot&&window.__standaloneRoot.scale.x<.01,null,{timeout:20000});
    await page.evaluate(()=>window.__standaloneMixer.update(.5));
    const contract=await page.evaluate(()=>({rootScale:__standaloneRoot.scale.x,hipY:__standaloneHips.position.y,hipScale:__standaloneHips.scale.x}));expect(contract.rootScale).toBeLessThan(.01);expect(contract.hipY).toBeCloseTo(1,5);expect(contract.hipScale).toBeCloseTo(1,5);expect(unexpectedFailures(failures),failures.join('\n')).toEqual([]);
  });

  test('rapidly switching between motion entries settles on the last one selected', async ({page}) => {
    const failures = captureFailures(page);
    await seedWorkspace(page);
    await page.goto('/engine_editor.html', {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => window.LOT_KING && LOT_KING.state && LOT_KING.state.sceneReady === true, null, {timeout:30000});

    const opened = await openStudioWithTwoMotions(page);
    expect(opened).toBe(true);

    // Fire a burst of alternating clicks synchronously in one page task, the
    // same way a user quickly reviewing a freshly imported batch would,
    // ending deliberately on entry B.
    await page.evaluate(() => {
      const a = document.querySelector('.lk-ps-tree-item[data-id="motion:0"]');
      const b = document.querySelector('.lk-ps-tree-item[data-id="motion:1"]');
      [a, b, a, b, a, b].forEach(el => el.click());
    });

    await page.waitForFunction(() => {
      const status = document.querySelector('.lk-ps-preview-status');
      return !!status && status.textContent && status.textContent.trim().length > 0 && status.textContent !== 'Loading main mesh…';
    }, null, {timeout:20000});
    // Let any stale in-flight promises from the earlier clicks resolve too.
    await page.waitForTimeout(1500);

    const selected = await page.evaluate(() => document.querySelector('.lk-ps-tree-item[data-id="motion:1"]').classList.contains('on'));
    expect(selected).toBe(true);

    const status = await page.textContent('.lk-ps-preview-status');
    expect(status).toMatch(/Entry B/);
    expect(status).not.toMatch(/Entry A/);

    const canvasVisible = await page.evaluate(() => {
      const canvas = document.querySelector('.lk-ps-preview-mount canvas');
      return !!canvas && canvas.width > 0 && canvas.height > 0;
    });
    expect(canvasVisible).toBe(true);

    expect(unexpectedFailures(failures), failures.join('\n')).toEqual([]);
  });

  test('a Mixamo-named slot advances with Play and freezes with Stop', async ({page}) => {
    const failures=captureFailures(page);
    await seedWorkspace(page);
    await page.goto('/engine_editor.html',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.LOT_KING&&LOT_KING.state&&LOT_KING.state.sceneReady===true,null,{timeout:30000});
    const opened=await page.evaluate(()=>{
      const attach=THREE.TransformControls.prototype.attach;THREE.TransformControls.prototype.attach=function(object){window.__pawnStudioMotionTransform=this;return attach.call(this,object);};
      window.__pawnStudioMixerDeltas=[];const mixerUpdate=THREE.AnimationMixer.prototype.update,mixerClipAction=THREE.AnimationMixer.prototype.clipAction;THREE.AnimationMixer.prototype.clipAction=function(){const action=mixerClipAction.apply(this,arguments),bone=this._root&&this._root.getObjectByName&&this._root.getObjectByName('Hips');if(bone){window.__pawnStudioAnimatedBone=bone;window.__pawnStudioMixer=this;window.__pawnStudioMixerRoot=this._root;window.__pawnStudioRetargetClip=action&&action._clip;}return action;};THREE.AnimationMixer.prototype.update=function(delta){const bone=this._root&&this._root.getObjectByName&&this._root.getObjectByName('Hips');if(bone){window.__pawnStudioAnimatedBone=bone;window.__pawnStudioMixer=this;window.__pawnStudioMixerRoot=this._root;window.__pawnStudioRetargetClip=this._actions&&this._actions[0]&&this._actions[0]._clip;window.__pawnStudioMixerDeltas.push(delta);}return mixerUpdate.call(this,delta);};
      const makeMain=()=>{
        const root=new THREE.Group(),bone=new THREE.Bone(),head=new THREE.Bone();bone.name='Hips';bone.position.y=1;head.name='Head';head.position.y=1;bone.add(head);const geometry=new THREE.BoxGeometry(.4,1,.25),count=geometry.attributes.position.count,indices=new Uint16Array(count*4),weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial({skinning:true}));mesh.add(bone);mesh.bind(new THREE.Skeleton([bone,head]));root.add(mesh);
        root.animations=[];window.__pawnStudioAnimatedBone=bone;return root;
      };
      const makeAnimation=()=>{
        const root=new THREE.Group(),bone=new THREE.Bone(),head=new THREE.Bone();root.rotation.x=-Math.PI/2;bone.name='mixamorigHips';bone.position.y=100;head.name='mixamorigHead';head.position.y=100;bone.add(head);root.add(bone);root.animations=[new THREE.AnimationClip('mixamo.com',1,[new THREE.VectorKeyframeTrack('mixamorigHips.position',[0,.5,1],[0,100,0,50,110,0,100,100,0]),new THREE.QuaternionKeyframeTrack('mixamorigHips.quaternion',[0,.5,1],[0,0,0,1,0,.7071068,0,.7071068,0,0,0,1]),new THREE.QuaternionKeyframeTrack('mixamorigHead.quaternion',[0,.5,1],[0,0,0,1,.3826834,0,0,.9238795,0,0,0,1])])];return root;
      };
      const store={loadLogicElementAsset:ref=>Promise.resolve(ref&&ref.id==='main'?makeMain():makeAnimation())};
      const graph={characterPawn:{schemaVersion:2,model:{id:'main',kind:'glb'},animationSet:[{id:'idle-slot',name:'Idle',state:'grounded',direction:[0,0],speed:0,asset:{id:'idle',kind:'glb'},clip:'mixamo.com',loop:true,priority:1,playbackRate:1}],movement:{},camera:{},appearance:{}},logicScene:{elements:[{id:'character_model',asset:{id:'main'},linked:true,position:[0,0,0],rotation:[0,0,0],scale:[.4,.4,.4]}]}};
      const studio=LK_EDITOR_PAWN_STUDIO.create({STORE:store,assetLibraryLoad:()=>[],importAssetFiles:()=>Promise.resolve([]),onSave:()=>{},GAME:LOT_KING,pluginManager:LOT_KING.editor.plugins});
      window.__pawnStudioTest=studio;window.__pawnStudioGraph=graph;const object={userData:{editorName:'Mixamo Timer Test',logicGraph:graph}};return studio.open(object,graph);
    });
    expect(opened).toBe(true);
    await page.evaluate(()=>document.querySelector('.lk-ps-tree-item[data-id="motion:0"]').click());
    await page.waitForFunction(()=>/(?:tracks bound|tracce collegate)/i.test(document.querySelector('.lk-ps-preview-status')?.textContent||'')&&/retarget/i.test(document.querySelector('.lk-ps-preview-status')?.textContent||''));
    const orientation=page.locator('.lk-ps-field',{hasText:/Source orientation|Orientamento sorgente/}).locator('select');
    await expect(orientation).toHaveValue('y-up');
    await expect(orientation.locator('option')).toHaveCount(7);
    await expect(page.locator('.lk-ps-field',{hasText:/Animation preview scale|Scala anteprima animazione/}).locator('input')).toHaveValue('1');
    await page.waitForFunction(()=>window.__pawnStudioMixer&&window.__pawnStudioAnimatedBone,null,{timeout:20000});
    const movingStart=await page.evaluate(()=>({quaternion:__pawnStudioAnimatedBone.quaternion.toArray()}));
    await page.evaluate(()=>__pawnStudioMixer.update(.25));
    const moving=await page.evaluate(start=>new THREE.Quaternion().fromArray(start).angleTo(__pawnStudioAnimatedBone.quaternion),movingStart.quaternion);
    expect(moving).toBeGreaterThan(.001);
    const scaleContract=await page.evaluate(()=>({rootScale:__pawnStudioMixerRoot.scale.x,hipX:__pawnStudioAnimatedBone.position.x,hipY:__pawnStudioAnimatedBone.position.y,upY:new THREE.Vector3(0,1,0).applyQuaternion(__pawnStudioAnimatedBone.quaternion).y,retargetScale:__pawnStudioRetargetClip&&__pawnStudioRetargetClip.userData&&__pawnStudioRetargetClip.userData.lkRetargetScale}));
    expect(scaleContract.rootScale).toBeCloseTo(.4,5);
    expect(scaleContract.retargetScale).toBeCloseTo(.01,5);
    expect(Math.abs(scaleContract.hipX)).toBeLessThan(1e-5);
    expect(Math.abs(scaleContract.hipY)).toBeLessThan(2);
    expect(scaleContract.upY).toBeGreaterThan(.9);
    const rigButton=page.locator('[data-action="rig"]');
    await expect(rigButton).toBeEnabled();await page.evaluate(()=>document.querySelector('[data-action="rig"]')?.click());await expect(rigButton).toHaveClass(/on/);
    await expect(page.locator('.lk-ps-preview-status')).toContainText(/Edit Rig/i);
    await expect(page.locator('[data-action="rig-bone"]')).toHaveValue('hips');
    await page.evaluate(()=>{const control=window.__pawnStudioMotionTransform,bone=control&&control.object;bone.rotateX(.2);control.dispatchEvent({type:'objectChange'});control.dispatchEvent({type:'mouseUp'});});
    await expect.poll(()=>page.evaluate(()=>window.__pawnStudioGraph.characterPawn.animationSet[0].rigCorrections&&window.__pawnStudioGraph.characterPawn.animationSet[0].rigCorrections.hips&&window.__pawnStudioGraph.characterPawn.animationSet[0].rigCorrections.hips[0])).toBeCloseTo(11.459,2);
    await expect(page.locator('[data-transform="translate"]')).toBeVisible();await expect(page.locator('[data-transform="rotate"]')).toBeVisible();await expect(page.locator('[data-transform="scale"]')).toBeVisible();
    await page.evaluate(()=>document.querySelector('[data-action="rig"]')?.click());
    await page.evaluate(()=>document.querySelector('[data-action="stop"]').click());
    const stoppedStart=await page.evaluate(()=>__pawnStudioAnimatedBone.quaternion.toArray());
    // Stop is a mixer contract, independent of whether headless Chromium is
    // currently throttling the canvas/render timer.
    await page.evaluate(()=>__pawnStudioMixer.update(.25));
    // Compare raw components: generated retarget quaternions can differ from
    // exact unit length by float precision, so Quaternion.angleTo(q, q) may
    // itself report a tiny non-zero angle even while the pose is frozen.
    const stopped=await page.evaluate(start=>Math.max(...start.map((value,index)=>Math.abs(value-__pawnStudioAnimatedBone.quaternion.toArray()[index]))),stoppedStart);
    expect(stopped).toBeLessThan(1e-7);
    await page.evaluate(()=>document.querySelector('[data-action="play"]').click());
    await page.waitForFunction(()=>/preview (?:playing|in riproduzione)/i.test(document.querySelector('.lk-ps-preview-status')?.textContent||''));
    await page.evaluate(()=>__pawnStudioMixer.update(.25));
    const restarted=await page.evaluate(()=>new THREE.Quaternion().angleTo(__pawnStudioAnimatedBone.quaternion));
    expect(restarted).toBeGreaterThan(.001);
    await expect(page.locator('.lk-ps-slot-preview-actions button').first()).toContainText(/Test this animation slot|Prova questo slot animazione/);
    const previewScale=page.locator('.lk-ps-field',{hasText:/Animation preview scale|Scala anteprima animazione/}).locator('input');
    await previewScale.fill('.5');await previewScale.press('Tab');
    await page.waitForFunction(()=>window.__pawnStudioGraph.characterPawn.animationSet[0].previewScale===.5&&Math.abs((window.__pawnStudioMixerRoot&&window.__pawnStudioMixerRoot.scale.x||0)-.2)<1e-5,null,{timeout:20000});
    expect(unexpectedFailures(failures),failures.join('\n')).toEqual([]);
  });
});
