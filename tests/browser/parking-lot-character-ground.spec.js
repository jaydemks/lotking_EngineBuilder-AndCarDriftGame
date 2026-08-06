'use strict';

const {test,expect}=require('@playwright/test');

test('Parking Lot Character resolves only visible authored ground',async({page})=>{
  test.setTimeout(300000);
  await page.addInitScript(()=>{localStorage.clear();sessionStorage.clear();});
  await page.goto('/engine_editor.html?parking-lot-ground-e2e=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!(window.LK_STORE&&LK_STORE.ready&&window.LOT_KING));
  await page.evaluate(async()=>{await Promise.resolve(LK_STORE.ready);});
  await page.waitForFunction(()=>LOT_KING.world.registry.some(object=>object&&object.userData&&object.userData.editorId==='amsgalgzh_3'),null,{timeout:180000});
  await page.evaluate(()=>{
    LOT_KING.assets.benchmark.run=async()=>({mode:'game',reason:'parking-lot-ground-e2e'});
    LOT_KING.state.sceneReady=true;
    document.getElementById('lkPlay').click();
  });
  await page.waitForFunction(()=>!!(LOT_KING.state.started&&LOT_KING.state.editorPreview&&LOT_KING.pawns.getByPlayerId(1)),null,{timeout:180000});
  await page.waitForTimeout(2500);
  try{
    await page.waitForFunction(()=>{
      const helicopter=LOT_KING.pawns.list().find(pawn=>pawn.type==='helicopter');
      return !!(helicopter&&helicopter.body&&helicopter.body.sleepState===2);
    },null,{timeout:15000});
  }catch(error){
    const diagnostic=await page.evaluate(()=>{
      const helicopter=LOT_KING.pawns.list().find(pawn=>pawn.type==='helicopter'),body=helicopter&&helicopter.body,world=helicopter&&helicopter.world;
      return {spawn:helicopter&&helicopter.config.spawn,physicsOriginY:helicopter&&helicopter.physicsOriginY,position:body&&[body.position.x,body.position.y,body.position.z],velocity:body&&[body.velocity.x,body.velocity.y,body.velocity.z],sleepState:body&&body.sleepState,contacts:(world&&world.contacts||[]).filter(contact=>contact.bi===body||contact.bj===body).map(contact=>({self:contact.bi===body?'bi':'bj',normal:contact.ni&&[contact.ni.x,contact.ni.y,contact.ni.z],otherMass:(contact.bi===body?contact.bj:contact.bi).mass,otherType:(contact.bi===body?contact.bj:contact.bi).type,otherUserData:(contact.bi===body?contact.bj:contact.bi).userData||null}))};
    });
    throw new Error('Parked helicopter did not sleep: '+JSON.stringify(diagnostic,null,2));
  }
  const result=await page.evaluate(()=>{
    const pawn=LOT_KING.pawns.getByPlayerId(1),position=pawn.owner.getWorldPosition(new THREE.Vector3()),boxes=[];
    const initialCamera=pawn.firstPerson&&pawn.firstPerson.cameraTransform&&pawn.firstPerson.cameraTransform();
    const cameraBlockers=[];
    if(initialCamera){
      const base=pawn.firstPerson.eyeTransform(),tp=pawn.firstPerson.config().thirdPerson,pivot=base.position.clone();pivot.y+=pawn.firstPerson.state.tpHeight-base.eyeHeight;pivot.addScaledVector(base.forward,tp.pivotForward);const end=pivot.clone().addScaledVector(base.forward,-pawn.firstPerson.state.tpDistance),radius=tp.collisionRadius;
      const hitOf=collider=>{let low=0,high=1;for(const [axis,half] of [['x','hx'],['y','hy'],['z','hz']]){if(collider[axis]==null||collider[half]==null)continue;const start=pivot[axis],delta=end[axis]-start,min=collider[axis]-Math.abs(collider[half])-radius,max=collider[axis]+Math.abs(collider[half])+radius;if(Math.abs(delta)<1e-7){if(start<min||start>max)return null;continue;}let enter=(min-start)/delta,exit=(max-start)/delta;if(enter>exit)[enter,exit]=[exit,enter];low=Math.max(low,enter);high=Math.min(high,exit);if(low>high)return null;}return high>=0&&low<=1?Math.max(0,low):null;};
      (LOT_KING.world.colliders.box||[]).forEach((collider,index)=>{const hit=hitOf(collider);if(hit==null)return;cameraBlockers.push({index,hit,enabled:collider.enabled,physics:collider.physics,compoundRoot:collider.compoundRoot,compoundPart:collider.compoundPart,horizontal:collider.horizontalSurface,walkable:collider.walkable,partName:collider.partName||'',owner:collider.owner&&collider.owner.userData&&(collider.owner.userData.editorName||collider.owner.userData.editorId)||'',x:collider.x,y:collider.y,z:collider.z,hx:collider.hx,hy:collider.hy,hz:collider.hz});});cameraBlockers.sort((a,b)=>a.hit-b.hit);
    }
    const initialCameraDiagnostic=initialCamera?{position:initialCamera.position.toArray(),distance:initialCamera.position.distanceTo(position),bodySafetyFallback:initialCamera.bodySafetyFallback===true,view:pawn.firstPerson.viewMode(),thirdPerson:pawn.config.firstPerson&&pawn.config.firstPerson.thirdPerson,cameraBlockers:cameraBlockers.slice(0,12)}:null;
    const runtimePawns=LOT_KING.pawns.list().map(entry=>({id:entry.id,type:entry.type||entry.pawnType||'',name:entry.owner&&entry.owner.userData&&entry.owner.userData.editorName||'',ownerY:entry.owner&&entry.owner.getWorldPosition?entry.owner.getWorldPosition(new THREE.Vector3()).y:null,bodyY:entry.body&&entry.body.position&&entry.body.position.y,bodyInWorld:entry.bodyInWorld,physicsReady:entry.physicsReady,sleepState:entry.body&&entry.body.sleepState,linearSpeed:entry.body&&entry.body.velocity&&entry.body.velocity.length(),angularSpeed:entry.body&&entry.body.angularVelocity&&entry.body.angularVelocity.length()}));
    const initialAbilityMode=pawn.abilities&&pawn.abilities.mode();
    const initialHang=pawn.abilities&&pawn.abilities.state&&pawn.abilities.state.hang;
    const initialHangCollider=initialHang&&initialHang.collider;
    const initialHangDiagnostic=initialHangCollider?{x:initialHangCollider.x,y:initialHangCollider.y,z:initialHangCollider.z,hx:initialHangCollider.hx,hy:initialHangCollider.hy,hz:initialHangCollider.hz,top:initialHangCollider.y+initialHangCollider.hy,owner:initialHangCollider.owner&&initialHangCollider.owner.userData&&(initialHangCollider.owner.userData.editorName||initialHangCollider.owner.userData.editorId)||'',partName:initialHangCollider.partName||'',horizontal:initialHangCollider.horizontalSurface===true,compoundRoot:initialHangCollider.compoundRoot===true,walkable:initialHangCollider.walkable}:null;
    (LOT_KING.world.colliders.box||[]).forEach((collider,index)=>{
      if(!collider||collider.enabled===false||collider.x==null||collider.z==null||collider.hx==null||collider.hz==null)return;
      if(Math.abs(position.x-collider.x)>collider.hx+.2||Math.abs(position.z-collider.z)>collider.hz+.2)return;
      boxes.push({index,name:collider.partName||'',owner:collider.owner&&collider.owner.userData&&(collider.owner.userData.editorName||collider.owner.userData.editorId)||'',x:collider.x,y:collider.y,z:collider.z,hx:collider.hx,hy:collider.hy,hz:collider.hz,top:collider.y+collider.hy,horizontal:collider.horizontalSurface===true,compoundRoot:collider.compoundRoot===true,partMeshUuid:collider.partMeshUuid||''});
    });
    const jumpSamples=[];
    const points=[[position.x,position.z]];[-50,-25,0,25,50].forEach(x=>[-50,-25,0,25,50].forEach(z=>points.push([x,z])));
    points.forEach(point=>{
      pawn.owner.position.set(point[0],0,point[1]);pawn.movementController.reset();pawn.movementController.jump();let peak=0,last=null;
      for(let frame=0;frame<180;frame++){last=pawn.movementController.step(pawn.owner,{},1/60,0);peak=Math.max(peak,pawn.owner.position.y);}
      const supports=(LOT_KING.world.colliders.box||[]).filter(collider=>collider&&collider.enabled!==false&&!collider.compoundRoot&&collider.x!=null&&collider.hx!=null&&Math.abs(point[0]-collider.x)<=collider.hx+.2&&Math.abs(point[1]-collider.z)<=collider.hz+.2).map(collider=>({name:collider.partName||'',owner:collider.owner&&collider.owner.userData&&(collider.owner.userData.editorName||collider.owner.userData.editorId)||'',top:collider.y+collider.hy,horizontal:collider.horizontalSurface===true,exact:collider._lkGroundRaySample&&collider._lkGroundRaySample.heights||null})).filter(collider=>Math.abs(collider.top-pawn.owner.position.y)<.08||collider.exact&&collider.exact.some(y=>Math.abs(y-pawn.owner.position.y)<.08));
      jumpSamples.push({point,peak,landedY:pawn.owner.position.y,grounded:last.grounded,supports});
    });
    const authoredBoxes=(LOT_KING.world.colliders.box||[]).filter(collider=>collider&&collider.enabled!==false);
    authoredBoxes.forEach(collider=>{collider.enabled=false;});
    pawn.owner.position.set(position.x,0,position.z);pawn.movementController.reset();
    let proceduralFallback=null;
    for(let frame=0;frame<180;frame++)proceduralFallback=pawn.movementController.step(pawn.owner,{},1/60,0);
    proceduralFallback={landedY:pawn.owner.position.y,grounded:proceduralFallback.grounded};
    authoredBoxes.forEach(collider=>{collider.enabled=true;});
    const physics=LOT_KING.systems&&LOT_KING.systems.physics&&LOT_KING.systems.physics.state;
    const procedural=LOT_KING.systems&&LOT_KING.systems.proceduralWorld;
    const descriptor=procedural&&procedural.physicsDescriptor&&procedural.physicsDescriptor();
    const cameraDummies=pawn.owner.userData.pawnCameraDummies||[];
    const bounds=new THREE.Box3().setFromObject(pawn.owner).getSize(new THREE.Vector3()).toArray();
    const viewBefore=pawn.firstPerson&&pawn.firstPerson.viewMode();
    if(pawn.abilities&&pawn.abilities.isHanging())pawn.abilities.releaseHang('test-toggle-isolation');
    pawn.state.grounded=true;pawn.state.airborne=false;pawn.state.velocityY=0;
    const live=pawn.livePlayerDrive;
    pawn.livePlayerDrive=()=>({viewToggle:true});pawn.step(1/60);
    pawn.livePlayerDrive=()=>({viewToggle:false});pawn.step(1/60);
    pawn.livePlayerDrive=live;
    const viewAfter=pawn.firstPerson&&pawn.firstPerson.viewMode();
    return {position:position.toArray(),initialCameraDiagnostic,groundHook:LOT_KING.world.characterGroundHeight&&LOT_KING.world.characterGroundHeight(position.x,position.z),proceduralConfig:procedural&&procedural.get(),terrainDescriptor:!!(descriptor&&descriptor.matrix&&descriptor.matrix.length),terrainCollision:!!(physics&&physics.terrainBody),physicsActive:!!(physics&&physics.active),legacyInfinitePlane:!!(physics&&physics.groundBody),runtimePawns,pawn:{id:pawn.id,firstPerson:!!pawn.firstPerson,config:pawn.config.firstPerson||null,inventory:!!pawn.inventory,loadout:pawn.config.loadout||null,initialAbilityMode,initialHangDiagnostic,viewBefore,viewAfter,abilityMode:pawn.abilities&&pawn.abilities.mode(),cameraRoles:cameraDummies.map(dummy=>dummy.userData.pawnCameraRole).sort(),cameraVisualsDetached:cameraDummies.every(dummy=>dummy.userData.pawnCameraVisual&&dummy.userData.pawnCameraVisual.parent!==dummy),bounds},boxes,jumpSamples,proceduralFallback};
  });
  const helicopterProcedural=await page.evaluate(()=>{
    const helicopter=LOT_KING.pawns.list().find(pawn=>pawn.type==='helicopter');
    const world=helicopter&&helicopter.world,terrain=world&&world.bodies.find(body=>body&&body.userData&&body.userData.proceduralTerrain===true);
    if(!terrain||!helicopter||!helicopter.body||!world)return {ready:false,terrain:!!terrain,helicopter:!!helicopter,body:!!(helicopter&&helicopter.body),world:!!world};
    const removed=world.bodies.filter(body=>body&&body!==terrain&&body!==helicopter.body&&Number(body.mass)===0);
    removed.forEach(body=>world.removeBody(body));
    const allowSleep=helicopter.body.allowSleep;helicopter.body.allowSleep=false;
    helicopter.body.position.set(0,3,0);helicopter.body.velocity.set(0,0,0);helicopter.body.angularVelocity.set(0,0,0);helicopter.body.wakeUp&&helicopter.body.wakeUp();
    for(let frame=0;frame<240;frame++)world.step(1/60);
    const sample={ready:true,bodyY:helicopter.body.position.y,velocityY:helicopter.body.velocity.y};
    helicopter.body.allowSleep=allowSleep;removed.forEach(body=>world.addBody(body));
    return sample;
  });
  expect(helicopterProcedural.ready,JSON.stringify(helicopterProcedural,null,2)).toBe(true);
  expect(result.position[1]).toBeLessThan(.7);
  expect(result.position[1]).toBeGreaterThan(-.08);
  expect(result.proceduralConfig.datum.islandTopY).toBe(-6);
  expect(result.proceduralConfig.ocean.seaLevel).toBe(-14);
  expect(result.proceduralConfig.datum.seabedY).toBe(-28);
  expect(result.groundHook).toBe(-6);
  expect(result.terrainDescriptor).toBe(true);
  if(result.physicsActive)expect(result.terrainCollision).toBe(true);
  expect(result.legacyInfinitePlane).toBe(false);
  const helicopters=result.runtimePawns.filter(pawn=>pawn.type==='helicopter');
  expect(helicopters,JSON.stringify(result.runtimePawns,null,2)).toHaveLength(1);
  expect(helicopters[0].physicsReady).toBe(true);
  expect(helicopters[0].bodyInWorld).toBe(true);
  expect(helicopters[0].ownerY,JSON.stringify(helicopters[0],null,2)).toBeGreaterThan(-.08);
  expect(helicopters[0].sleepState,JSON.stringify(helicopters[0],null,2)).toBe(2);
  expect(helicopters[0].linearSpeed).toBe(0);
  expect(helicopters[0].angularSpeed).toBe(0);
  expect(result.jumpSamples.every(sample=>sample.landedY<.7&&sample.grounded)).toBe(true);
  expect(result.proceduralFallback.grounded).toBe(true);
  expect(result.proceduralFallback.landedY).toBeCloseTo(-6,1);
  expect(helicopterProcedural.bodyY).toBeGreaterThan(-6.1);
  expect(helicopterProcedural.bodyY).toBeLessThan(0);
  const falseTops=result.boxes.filter(box=>box.horizontal).map(box=>box.top);
  expect(result.jumpSamples.every(sample=>falseTops.every(top=>Math.abs(sample.landedY-top)>.08))).toBe(true);
  expect(result.pawn.firstPerson).toBe(true);
  expect(result.pawn.inventory).toBe(true);
  expect(result.pawn.config.view).toBe('third');
  expect(result.initialCameraDiagnostic,JSON.stringify(result.initialCameraDiagnostic,null,2)).toMatchObject({view:'third',bodySafetyFallback:false});
  expect(result.initialCameraDiagnostic.distance,JSON.stringify(result.initialCameraDiagnostic,null,2)).toBeGreaterThan(1);
  expect(result.pawn.viewBefore).toBe('third');
  expect(result.pawn.viewAfter).toBe('first');
  expect(result.pawn.initialAbilityMode,JSON.stringify(result.pawn.initialHangDiagnostic,null,2)).not.toBe('hang');
  expect(result.pawn.abilityMode).not.toBe('hang');
  expect(result.pawn.cameraRoles).toEqual(['character-first','character-third']);
  expect(result.pawn.cameraVisualsDetached).toBe(true);
  expect(result.pawn.bounds[0]).toBeLessThan(3);
  expect(result.pawn.bounds[2]).toBeLessThan(3);
  expect(result.pawn.config.presentation).toBe('body');
  expect(result.pawn.config.viewPawn.kind).toBe('none');
  expect(result.pawn.loadout.map(item=>item.preset)).toEqual(['fists','pistol','knife','grenade']);
});
