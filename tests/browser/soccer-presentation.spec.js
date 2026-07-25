'use strict';

const {test, expect} = require('@playwright/test');

test('penalty preset has daylight, an editor ball marker and contextual football HUD', async ({page}) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({mode:'browser', onlineEditor:true, workspaceReady:true}));
  });
  await page.goto('/engine_editor.html?soccer-presentation=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.LOT_KING && window.LK_RUNTIME_PENALTY_SHOOTOUT_LEVEL_TEMPLATE && window.LK_RUNTIME_GAME_HUD);

  const result = await page.evaluate(() => {
    const scene = window.LK_RUNTIME_PENALTY_SHOOTOUT_LEVEL_TEMPLATE.buildScene({version:1,counter:0,transforms:{},props:{},deleted:[],added:[],env:{},player:{},ui:{},logic:{}});
    const ball = scene.added.find(entry => entry.name === 'Penalty Ball');
    const manager = scene.added.find(entry => entry.name === 'Penalty Shootout Manager');
    const keeper = scene.added.find(entry => entry.name === 'Penalty Goalkeeper');
    const preview = ball.graph.logicScene.elements.find(element => element.id === 'ball_preview');
    const lineEntry = scene.added.find(entry => entry.name === 'Stadium - Goal Line North');
    const pitchEntry = scene.added.find(entry => entry.name === 'Stadium - Pitch Grass');
    const goalEntry = scene.added.find(entry => entry.name === 'Stadium - Goal Post West North');
    const colorProbe = window.LK_STORE.createPrimitive('box', {color:'#8899aa'});
    window.LK_STORE.applyMatProps(colorProbe, {color:'#ffffff'});
    let appliedColor = null;
    colorProbe.traverse(node => { if(appliedColor == null && node.isMesh) appliedColor = '#' + node.material.color.getHexString(); });
    const legacyPawnGraph=JSON.parse(JSON.stringify(window.LK_LOGIC_TEMPLATES.get('logic-template-player-soccer').graph));
    legacyPawnGraph.logicScene.elements.push({id:'camera_anchor',name:'Legacy Player Camera',type:'camera',parentId:'root',position:[0,3,-6],rotation:[0,0,0],scale:[1,1,1]});
    legacyPawnGraph.logicScene.components.push({id:'camera_component',elementId:'camera_anchor',type:'camera'});
    const migratedPawn=window.LK_STORE.createLogicElement({name:'Legacy Soccer Pawn',graph:legacyPawnGraph});
    let migratedPawnCameras=0;migratedPawn.traverse(node=>{if(node.isCamera)migratedPawnCameras++;});
    const ballSystem = window.LOT_KING.systems.soccerBall;
    const runtimeBallId = ballSystem.spawn({id:'presentation-ball',x:0,y:0,z:0,mode:'penalty',locked:true});
    const runtimeBall = window.LOT_KING.core.scene.children.find(child => child.userData && child.userData.soccerBall && ballSystem.state(runtimeBallId));
    const previewOwner=new window.THREE.Group();previewOwner.position.set(0,0,-.4);
    ballSystem.previewNearest({id:'preview-kicker',owner:previewOwner},{target:{x:1.4,y:1.3,z:12},power:24,lift:.14,curve:.2});
    const trajectory=window.LOT_KING.core.scene.children.find(child=>child.userData&&child.userData.soccerTrajectory&&child.visible);
    ballSystem.registerGoal({id:'collision-goal',x:0,y:0,z:8,heading:Math.PI,width:7.32,height:2.44,depth:1.8});
    const collisionBallId=ballSystem.spawn({id:'collision-ball',x:3.66,y:.11,z:0,mode:'match',locked:false});
    ballSystem.kick(collisionBallId,{target:{x:3.66,y:.11,z:12},power:16,lift:0});
    for(let i=0;i<120;i++)window.LOT_KING.pawns.stepAll(1/120);
    const collisionState=ballSystem.state(collisionBallId);
    const hud = window.LK_RUNTIME_GAME_HUD.create();
    hud.setContext('soccer');
    hud.setSoccerData({shootout:true,scoreA:2,scoreB:1,round:3,phase:'ready',charge:.6,aimX:.7,aimY:.35});
    hud.setSoccerData({shootout:true,charge:.6,aimX:.7,aimY:.35,aimReticle:false});
    const reticleDisabled=!document.getElementById('soccerAimReticle').classList.contains('on');
    hud.setSoccerData({shootout:true,scoreA:2,scoreB:1,round:3,phase:'resolved',lastResult:'saved',resultSequence:1,kicksA:['goal','miss'],kicksB:['saved'],aiming:true,aimX:.7,aimY:.35,aimReticle:true});
    window.LK_RUNTIME_GAMEPLAY_DIFFICULTY.set('easy',{persist:false});
    document.getElementById('hud').style.display = 'block';
    window.LOT_KING.player.setEnabled(true);
    const exhaustStarted=window.LOT_KING.player.testExhaust();
    window.LOT_KING.player.setEnabled(false);
    const exhaustRejectedWhileHidden=window.LOT_KING.player.testExhaust()===false;
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve({
      skyTime:scene.env.skyTime,
      cycle:scene.env.dayNightCycleEnabled,
      daySun:scene.env.lighting.daySun,
      preview:preview && {primitive:preview.primitive,runtimeVisual:preview.runtimeVisual},
      palette:{line:lineEntry.props.color,pitch:pitchEntry.props.color,goal:goalEntry.props.color,appliedColor},
      runtimeBall:runtimeBall && {
        internal:runtimeBall.userData.logicElementInternal,
        runtimeVisual:runtimeBall.userData.logicElementRuntimeVisual,
        visible:runtimeBall.visible,
        physicsBackend:ballSystem.state(runtimeBallId).physicsBackend,
      },
      keeperBinding:{
        role:keeper.graph.variables.find(variable=>variable.name==='Role').value,
        controller:keeper.graph.variables.find(variable=>variable.name==='ControllerPlayerId').value,
        shirt:keeper.graph.variables.find(variable=>variable.name==='ShirtColor').value,
      },
      trajectory:trajectory&&{visible:trajectory.visible,points:trajectory.geometry.drawRange.count},
      complexPostCollision:{backend:collisionState.physicsBackend,z:collisionState.position.z,vz:collisionState.velocity.z,outcome:collisionState.outcome},
      managerHasCube:(manager.graph.logicScene.elements || []).some(element => element.name === 'Default Mesh' || element.mesh === 'box'),
      migratedPawnCameras,
      context:document.getElementById('hud').dataset.context,
      soccerDisplay:getComputedStyle(document.getElementById('soccerHud')).display,
      vehicleDisplay:getComputedStyle(document.getElementById('vehicleHud')).display,
      tuneDisplay:getComputedStyle(document.getElementById('tuneDock')).display,
      legend:document.getElementById('legendBody').textContent,
      score:document.getElementById('soccerScoreA').textContent + '-' + document.getElementById('soccerScoreB').textContent,
      result:document.getElementById('soccerResultHud').textContent,
      kicks:document.getElementById('soccerKicksA').textContent+'|'+document.getElementById('soccerKicksB').textContent,
      difficulty:{value:document.getElementById('gameplayDifficulty').value,keeperReach:window.LK_RUNTIME_GAMEPLAY_DIFFICULTY.profile('soccer').keeperReach},
      reticle:{display:getComputedStyle(document.getElementById('soccerAimReticle')).display,left:document.getElementById('soccerAimReticle').style.left,top:document.getElementById('soccerAimReticle').style.top},
      reticleDisabled,
      nativeDisabled:window.LOT_KING.player.enabled===false&&window.LOT_KING.player.hidden===true&&window.LOT_KING.player.car.visible===false,
      exhaustStarted,
      exhaustRejectedWhileHidden,
      visibleNativeExhaust:Array.from(window.LOT_KING.core.scene.children).filter(child=>child.userData&&child.userData.particleSystem==='native-exhaust'&&child.visible).length,
      visibleNativeCameraHelpers:Array.from(window.LOT_KING.core.scene.children)
        .flatMap(node => {
          const found=[]; node.traverse(child => { if(child.type === 'CameraHelper' && child.visible) found.push(child); }); return found;
        }).length,
    }))));
  });

  expect(result).toMatchObject({
    skyTime:.25,
    cycle:false,
    daySun:expect.any(Number),
    preview:{primitive:'sphere',runtimeVisual:false},
    palette:{line:'#ffffff',pitch:'#197a39',goal:'#ffffff',appliedColor:'#ffffff'},
    runtimeBall:{internal:true,runtimeVisual:true,visible:true,physicsBackend:'cannon-complex'},
    keeperBinding:{role:'goalkeeper',controller:-1,shirt:'#facc15'},
    trajectory:{visible:true,points:expect.any(Number)},
    complexPostCollision:{backend:'cannon-complex'},
    managerHasCube:false,
    migratedPawnCameras:0,
    context:'soccer',
    soccerDisplay:'block',
    vehicleDisplay:'none',
    tuneDisplay:'none',
    score:'2-1',
    result:'SAVED!',
    kicks:'●×|×',
    difficulty:{value:'easy',keeperReach:.76},
    reticle:{display:'block',left:'65.4%',top:'39%'},
    reticleDisabled:true,
    nativeDisabled:true,
    exhaustStarted:true,
    exhaustRejectedWhileHidden:true,
    visibleNativeExhaust:0,
    visibleNativeCameraHelpers:0,
  });
  expect(result.daySun).toBeGreaterThanOrEqual(1.4);
  expect(result.trajectory.points).toBeGreaterThan(8);
  expect(result.complexPostCollision.outcome).not.toBe('OnGoalScored');
  expect(result.complexPostCollision.z).toBeLessThan(8.15);
  expect(result.legend).toMatch(/shoot|goalkeeper dive/i);
  expect(pageErrors).toEqual([]);
});
