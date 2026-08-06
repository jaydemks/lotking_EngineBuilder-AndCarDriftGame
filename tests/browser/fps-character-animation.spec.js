'use strict';

const {test, expect} = require('@playwright/test');

test('the normal FPS eye camera uses the same fully animated Character body', async ({page}) => {
  test.setTimeout(240000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1',JSON.stringify({mode:'browser',onlineEditor:true,workspaceReady:true}));
  });
  await page.goto('/engine_editor.html?fps-character-animation=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => !!(
    window.LK_STORE && LK_STORE.levels && window.LOT_KING && LOT_KING.actions &&
    window.LK_RUNTIME_FPS_ARENA_LEVEL_TEMPLATE && window.LK_RUNTIME_CHARACTER_LOCOMOTION
  ));

  const authored=await page.evaluate(async () => {
    await Promise.resolve(LK_STORE.ready);
    const scene=LK_STORE.levels.templateScene(LOT_KING,'fps-shooter-test');
    const player=scene.added.find(entry=>entry&&entry.graph&&entry.graph.characterPawn&&entry.graph.characterPawn.playerId!==null);
    // Keep the exact authored FPS Pawn but omit the thousand-piece range: this
    // regression is about the Character/mixer lifecycle, not arena dressing.
    // Keep one deliberately active scene camera. Character Play must still use
    // the possessed Pawn camera; this reproduces the former fixed-view bug.
    const fallbackCamera={id:'fps-camera-priority-regression',kind:'camera',name:'Active Camera That Must Not Override Player',t:{p:[80,40,60],r:[0,.5,0],s:[1,1,1],v:true,name:'Active Camera That Must Not Override Player'},props:{fov:57,near:.07,far:731,helperSize:1,preview:false,activeLevelCamera:true,outputPlayerIndex:0}};
    scene.added=player?[player,fallbackCamera]:[fallbackCamera];
    await LK_STORE.apply(LOT_KING,scene,{strict:true});
    const owners=LOT_KING.world.registry.filter(object=>object&&object.userData&&object.userData.editorType==='logicElement');
    await Promise.all(owners.map(owner=>Promise.resolve(owner.userData.logicElementAssetReady).catch(()=>null)));
    LOT_KING.assets.benchmark.run=async()=>({mode:'game',reason:'fps-character-animation-e2e'});
    LOT_KING.state.sceneReady=true;
    return {
      hasPlayer:!!player,
      animationSet:player&&player.graph.characterPawn.animationSet&&player.graph.characterPawn.animationSet.length||0,
      presentation:player&&player.graph.characterPawn.firstPerson&&player.graph.characterPawn.firstPerson.presentation,
    };
  });
  expect(authored.hasPlayer).toBe(true);
  expect(authored.animationSet).toBeGreaterThan(0);
  expect(authored.presentation).toBe('body');

  await page.evaluate(() => document.getElementById('lkPlay').click());
  await page.waitForFunction(() => !!(LOT_KING.state.started&&LOT_KING.state.editorPreview&&
    LOT_KING.pawns&&LOT_KING.pawns.getByPlayerId&&LOT_KING.pawns.getByPlayerId(1)),null,{timeout:120000});
  await page.waitForTimeout(4000);
  const diagnostics=await page.evaluate(() => {
    const pawn=LOT_KING.pawns.getByPlayerId(1),owner=pawn.owner,nodes=[];
    owner.traverse(node=>{const data=node&&node.userData||{};if(data.logicElementSceneId==='character_model'||data.logicElementAssetKey||data.logicElementAssetError)nodes.push({name:node.name,sceneId:data.logicElementSceneId||'',assetKey:data.logicElementAssetKey||'',assetError:data.logicElementAssetError||'',visual:data.logicElementAssetVisual===true,children:node.children&&node.children.length||0});});
    const hud=document.getElementById('hud'),cameraOutputs=LOT_KING.state.runtimeVehicleCameraPawnIds||{};
    return {game:{started:LOT_KING.state.started,preview:LOT_KING.state.editorPreview,paused:LOT_KING.state.paused,role:LOT_KING.state.runtimeLevelRole,
        hudDisplay:hud&&getComputedStyle(hud).display,menuPresentation:document.body.classList.contains('lk-menu-presentation'),cameraPawnId:cameraOutputs[1]||LOT_KING.state.runtimeVehicleCameraPawnId||null},
      pawn:{id:pawn.id,started:pawn.started,sleeping:pawn.sleeping,enabled:pawn.enabled,disposed:pawn.disposed,playerId:pawn.playerId},
      registered:LOT_KING.pawns.list().map(item=>({id:item.id,started:item.started,playerId:item.playerId,locomotionKind:item.locomotionKind})),
      logic:LOT_KING.systems.logic&&LOT_KING.systems.logic.stats?LOT_KING.systems.logic.stats():null,
      locomotionKind:pawn.locomotionKind,bound:!!(pawn.locomotion&&pawn.locomotion.isBound()),model:pawn.config.model,
      modelError:owner.userData.characterModelError||'',libraryError:owner.userData.characterLibraryClipError||'',nodes};
  });
  expect(diagnostics,JSON.stringify(diagnostics,null,2)).toMatchObject({locomotionKind:'model',bound:true,modelError:'',libraryError:''});
  expect(diagnostics.game,JSON.stringify(diagnostics,null,2)).toMatchObject({role:'gameplay',hudDisplay:'block',menuPresentation:false,cameraPawnId:diagnostics.pawn.id});

  const sample=()=>page.evaluate(() => {
    const pawn=LOT_KING.pawns.getByPlayerId(1),bones=[];
    pawn.owner.traverse(node=>{if(node&&node.isBone)bones.push([node.name,node.quaternion.x,node.quaternion.y,node.quaternion.z,node.quaternion.w]);});
    let mixerTime=null,mixerTimeScale=null,ownsMixer=false;
    pawn.owner.traverse(node=>{if(node.userData&&node.userData.logicCharacterLocomotionMixerOwner)ownsMixer=true;if(mixerTime==null&&node.userData&&node.userData.logicAnimationMixer){mixerTime=node.userData.logicAnimationMixer.time;mixerTimeScale=node.userData.logicAnimationMixer.timeScale;}});
    return {
      mixerTime,
      mixerTimeScale,
      ownsMixer,
      cameraPosition:LOT_KING.core.camera.position.toArray(),
      pawnPosition:pawn.owner.position.toArray(),
      bones,
      speed:pawn.state.speed,
      clips:pawn.owner.userData.characterAnimationClips||[],
      binding:pawn.owner.userData.characterAnimationBinding||null,
      locomotion:pawn.locomotion.debugState(),
      libraryError:pawn.owner.userData.characterLibraryClipError||'',
    };
  });
  const before=await sample();
  // Software rendering in CI can take longer than the wall-clock wait to
  // complete even one editor frame. Advance the real Pawn deterministically:
  // this tests the controller/mixer contract rather than GPU throughput.
  await page.evaluate(() => {
    const pawn=LOT_KING.pawns.getByPlayerId(1),readLive=pawn.livePlayerDrive;
    pawn.livePlayerDrive=()=>null;
    pawn.control={x:0,z:1,sprint:false,sprintAmount:0,inputMagnitude:1};
    for(let frame=0;frame<24;frame++)pawn.step(.05);
    pawn.livePlayerDrive=readLive;
    if(LOT_KING.actions.renderGameplayCamera)LOT_KING.actions.renderGameplayCamera();
  });
  const moving=await sample();

  const changed=(left,right)=>left.some((bone,index)=>{
    const other=right[index];
    return other&&bone[0]===other[0]&&Math.max(...bone.slice(1).map((value,component)=>Math.abs(value-other[component+1])))>1e-4;
  });
  expect(before.libraryError).toBe('');
  expect(before.clips.length).toBeGreaterThan(0);
  expect(before.binding&&before.binding.bound).toBe(true);
  expect(before.ownsMixer).toBe(true);
  const mixerDiagnostic=JSON.stringify({before:{mixerTime:before.mixerTime,mixerTimeScale:before.mixerTimeScale},moving:{mixerTime:moving.mixerTime,mixerTimeScale:moving.mixerTimeScale,speed:moving.speed,locomotion:moving.locomotion}},null,2);
  expect(moving.mixerTimeScale,mixerDiagnostic).toBeGreaterThan(0);
  expect(moving.mixerTime,mixerDiagnostic).toBeGreaterThan(before.mixerTime);
  expect(moving.speed).toBeGreaterThan(.1);
  expect(Math.hypot(...moving.pawnPosition.map((value,index)=>value-before.pawnPosition[index]))).toBeGreaterThan(.1);
  expect(moving.locomotion.selection.length).toBeGreaterThan(0);
  expect(changed(before.bones,moving.bones)).toBe(true);
  expect(errors).toEqual([]);
});
