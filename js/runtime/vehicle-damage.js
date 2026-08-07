/* =========================================================
   LOT KING — Shared vehicle energy, damage zones and destruction

   Native, Logic Element and DollBody vehicles all attach this component.
   A rig may provide `fuel_tank`, `engine_smoke` and `exhaust` anchors through
   its names/extras; otherwise authorable vehicle-local defaults are used.
   ========================================================= */
(function(root){
'use strict';

const SCHEMA_VERSION=1;
const components=new WeakMap();
let nextId=1;
let smokeParticleGeometry=null,fireParticleGeometry=null;

function finite(value,fallback){const number=Number(value);return Number.isFinite(number)?number:fallback;}
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function merge(base,patch){const out=clone(base||{})||{};Object.keys(patch||{}).forEach(key=>{const value=patch[key];out[key]=value&&typeof value==='object'&&!Array.isArray(value)?merge(out[key],value):clone(value);});return out;}
function triple(value,fallback){const source=Array.isArray(value)?value:fallback;return [finite(source&&source[0],fallback[0]),finite(source&&source[1],fallback[1]),finite(source&&source[2],fallback[2])];}
function vehicleType(pawn,source){const explicit=String(source&&source.type||pawn&&pawn.type||pawn&&pawn.pawnType||pawn&&pawn.kind||'car').toLowerCase();if(/helicopter|heli/.test(explicit))return 'helicopter';if(/airplane|plane|aircraft/.test(explicit))return 'airplane';return 'car';}
function defaults(type){
  if(type==='helicopter')return {energy:1150,tank:[-.65,.72,-.35],engine:[0,1.05,.2],exhaust:[0,.92,-1.35],radius:.48,blast:8};
  if(type==='airplane')return {energy:1400,tank:[0,.42,-.2],engine:[0,.52,1.15],exhaust:[0,.45,-1.65],radius:.5,blast:9};
  return {energy:850,tank:[-.72,.48,-1.18],engine:[0,.72,.82],exhaust:[0,.42,-1.72],radius:.42,blast:7};
}
function normalizeConfig(source,type){
  type=type||'car';const preset=defaults(type),src=source&&typeof source==='object'?source:{};
  const maxEnergy=Math.max(1,finite(src.maxEnergy,finite(src.energy,preset.energy)));
  const anchors=src.anchors||{},tank=src.fuelTank||anchors.fuelTank||{},engine=src.engineSmoke||anchors.engineSmoke||{},exhaust=src.exhaust||anchors.exhaust||{},explosion=src.explosion||{};
  const smokeThreshold=clamp(finite(src.smokeThreshold,.62),0,1),fireThreshold=Math.min(smokeThreshold,clamp(finite(src.fireThreshold,.28),0,1));
  return {
    schemaVersion:SCHEMA_VERSION,enabled:src.enabled!==false,maxEnergy,
    fuelTank:{enabled:tank.enabled!==false,position:triple(tank.position,preset.tank),radius:clamp(finite(tank.radius,preset.radius),.08,5),damageMultiplier:clamp(finite(tank.damageMultiplier,2.5),1,20),dummyVisible:tank.dummyVisible===true},
    engineSmoke:{position:triple(engine.position,preset.engine),dummyVisible:engine.dummyVisible!==false},
    exhaust:{position:triple(exhaust.position,preset.exhaust),dummyVisible:exhaust.dummyVisible!==false},
    smokeThreshold,fireThreshold,
    smokeRate:clamp(finite(src.smokeRate,8),.1,60),fireRate:clamp(finite(src.fireRate,14),.1,80),
    explosion:{delay:clamp(finite(explosion.delay,.75),0,10),radius:clamp(finite(explosion.radius,preset.blast),.5,40),force:clamp(finite(explosion.force,120),0,2000),detachWheels:explosion.detachWheels!==false,blacken:explosion.blacken!==false},
  };
}
function emit(pawn,type,payload){if(!root.dispatchEvent||!root.CustomEvent)return;root.dispatchEvent(new root.CustomEvent('lk-pawn-event',{detail:Object.assign({type,pawn,pawnId:pawn&&pawn.id||null},payload||{})}));}
function isDescendant(node,parent){let cursor=node;while(cursor){if(cursor===parent)return true;cursor=cursor.parent||null;}return false;}
function tags(node){const ud=node&&node.userData||{};return [node&&node.name,ud.data,ud.vehiclePart,ud.sketchbookPart,ud.vehicleDamageAnchor,ud.logicElementSceneId,ud.editorName].filter(Boolean).join(' ').toLowerCase();}
const ROLE_MATCH=Object.freeze({fuelTank:/fuel[ _-]*tank|tank[ _-]*fuel|serbatoio|damage[ _-]*fuel/,engineSmoke:/engine[ _-]*(?:smoke|damage)|damage[ _-]*engine|motor[ _-]*smoke|motore/,exhaust:/exhaust|muffler|tailpipe|scarico|marmitta/});
function rigAnchor(owner,role){let explicit=null,guessed=null;if(owner&&owner.traverse)owner.traverse(node=>{if(node===owner)return;const ud=node.userData||{};if(ud.vehicleDamageFallback||ud.vehicleDamageHitProxy)return;const label=tags(node);if(!explicit&&(ud.vehicleDamageAnchor===role||role==='fuelTank'&&ud.vehicleDamageZone==='fuel'))explicit=node;if(!guessed&&ROLE_MATCH[role].test(label))guessed=node;});return explicit||guessed;}
function localPosition(node,value){if(node&&node.position&&node.position.set)node.position.set(value[0],value[1],value[2]);}
function markRuntime(node){node.userData=Object.assign({},node.userData||{},{logicElementInternal:true,logicElementRuntimeVisual:true,runtimeVisual:true,nonExportable:true});return node;}
function createFallbackAnchor(THREE,owner,role,position){if(!THREE||!owner||!owner.add)return null;const anchor=markRuntime(new THREE.Group());anchor.name='Vehicle '+role+' fallback';anchor.userData.vehicleDamageAnchor=role;anchor.userData.vehicleDamageFallback=true;localPosition(anchor,position);owner.add(anchor);return anchor;}
function helperVisible(config){return config===true&&(root.__LK_STANDALONE_EDITOR===true||!!root.LK_EDITOR||!!root.LK_STORE);}
function createFuelProxy(THREE,anchor,config){
  if(!THREE||!anchor||!anchor.add||config.enabled===false)return null;
  const geometry=new THREE.SphereGeometry(config.radius,12,8),visible=helperVisible(config.dummyVisible),material=new THREE.MeshBasicMaterial({color:0xffb52e,transparent:true,opacity:visible?.18:0,wireframe:true,depthWrite:false,colorWrite:visible});
  const proxy=markRuntime(new THREE.Mesh(geometry,material));proxy.name='Fuel Tank Damage Hit Zone';proxy.userData.vehicleDamageZone='fuel';proxy.userData.vehicleDamageHitProxy=true;proxy.frustumCulled=false;proxy.renderOrder=999;anchor.add(proxy);return proxy;
}
function sceneOf(GAME,pawn){return GAME&&GAME.core&&GAME.core.scene||pawn&&pawn.owner&&function(){let node=pawn.owner;while(node.parent)node=node.parent;return node;}()||null;}
function bodyOf(pawn){return pawn&&pawn.backend&&pawn.backend.body||pawn&&pawn.body||null;}
function wheelNodes(pawn){
  const list=[];const add=node=>{if(node&&node.parent&&list.indexOf(node)<0)list.push(node);};
  (pawn&&pawn.parts&&pawn.parts.wheels||[]).forEach(add);(pawn&&pawn.backend&&pawn.backend.wheelVisuals||[]).forEach(entry=>add(entry&&entry.node));
  if(!list.length&&pawn&&pawn.owner&&pawn.owner.traverse)pawn.owner.traverse(node=>{const label=tags(node);if((node.userData&&node.userData.vehicleWheel)||(node!==pawn.owner&&/(?:^|\b)(?:wheel|tyre|tire|ruota)(?:\b|[_ .-])/.test(label))){if(!Array.from(node.children||[]).some(child=>/(?:wheel|tyre|tire|ruota)/.test(tags(child))))add(node);}});
  return list.slice(0,12);
}
function worldPoint(THREE,node,target){if(!THREE||!node)return null;const out=target||new THREE.Vector3();if(node.getWorldPosition)return node.getWorldPosition(out);return node.position?out.copy(node.position):null;}
function makeParticle(THREE,group,fire){let geometry=fire?fireParticleGeometry:smokeParticleGeometry;if(!geometry){geometry=new THREE.SphereGeometry(1,fire?6:7,fire?4:5);if(fire)fireParticleGeometry=geometry;else smokeParticleGeometry=geometry;}const material=new THREE.MeshBasicMaterial({color:fire?0xff7a1a:0x24272b,transparent:true,opacity:0,depthWrite:false,toneMapped:!fire}),mesh=markRuntime(new THREE.Mesh(geometry,material));mesh.visible=false;group.add(mesh);return {mesh,life:0,total:1,velocity:new THREE.Vector3(),fire};}
function materialArray(value){return Array.isArray(value)?value:[value];}

function attach(GAME,pawn,source){
  if(!pawn||!pawn.owner)return null;if(components.has(pawn))return components.get(pawn);
  const THREE=root.THREE,type=vehicleType(pawn,source),config=normalizeConfig(source||pawn.config&&pawn.config.damage,type),state={energy:0,maxEnergy:0,ratio:1,smoking:false,burning:false,destroyed:false,pendingExplosion:0,lastHitTimer:0,lastZone:'body'};
  const anchors={fuelTank:null,engineSmoke:null,exhaust:null,proxy:null},fallbackAnchors=[],particles=[],particlePools={smoke:[],fire:[]},particleCursors={smoke:0,fire:0},detached=[],materials=[];let particleGroup=null,smokeClock=0,fireClock=0,scanClock=0,hud=null,hudFill=null,hudValue=null,record=null,disposed=false;
  const component={pawn,config,state};
  function updateState(){state.maxEnergy=config.maxEnergy;state.energy=clamp(finite(state.energy,state.maxEnergy),0,state.maxEnergy);state.ratio=state.energy/state.maxEnergy;state.smoking=!state.destroyed&&state.ratio<=config.smokeThreshold;state.burning=!state.destroyed&&state.ratio<=config.fireThreshold;}
  state.energy=config.maxEnergy;updateState();
  function clearProxy(){if(anchors.proxy){if(anchors.proxy.parent)anchors.proxy.parent.remove(anchors.proxy);anchors.proxy.geometry&&anchors.proxy.geometry.dispose();anchors.proxy.material&&anchors.proxy.material.dispose();anchors.proxy=null;}}
  function removeFallbacks(){fallbackAnchors.splice(0).forEach(anchor=>{if(anchor.parent)anchor.parent.remove(anchor);});}
  function removeFallback(role){for(let index=fallbackAnchors.length-1;index>=0;index--){const anchor=fallbackAnchors[index];if(!anchor||!anchor.userData||anchor.userData.vehicleDamageAnchor!==role)continue;if(anchor.parent)anchor.parent.remove(anchor);fallbackAnchors.splice(index,1);}}
  function resolveAnchors(force){
    if(!THREE||!pawn.owner)return false;let changed=false;
    ['fuelTank','engineSmoke','exhaust'].forEach(role=>{const found=rigAnchor(pawn.owner,role);if(found&&found!==anchors[role]){removeFallback(role);anchors[role]=found;changed=true;}else if(!anchors[role]||!isDescendant(anchors[role],pawn.owner)){const fallback=createFallbackAnchor(THREE,pawn.owner,role,config[role].position);if(fallback){fallbackAnchors.push(fallback);anchors[role]=fallback;changed=true;}}else if(anchors[role].userData&&anchors[role].userData.vehicleDamageFallback)localPosition(anchors[role],config[role].position);});
    if(changed||force){clearProxy();anchors.proxy=createFuelProxy(THREE,anchors.fuelTank,config.fuelTank);}
    return changed;
  }
  resolveAnchors(true);
  function ensureParticles(){if(!THREE||particleGroup)return particleGroup;const scene=sceneOf(GAME,pawn);if(!scene||!scene.add)return null;particleGroup=markRuntime(new THREE.Group());particleGroup.name='Vehicle Damage FX '+(pawn.id||nextId++);scene.add(particleGroup);for(let i=0;i<18;i++){const entry=makeParticle(THREE,particleGroup,false);particles.push(entry);particlePools.smoke.push(entry);}for(let i=0;i<12;i++){const entry=makeParticle(THREE,particleGroup,true);particles.push(entry);particlePools.fire.push(entry);}return particleGroup;}
  function spawnParticle(fire){
    if(!ensureParticles())return;const key=fire?'fire':'smoke',pool=particlePools[key],entry=pool[particleCursors[key]++%pool.length],at=worldPoint(THREE,anchors.engineSmoke);if(!entry||!at)return;
    entry.mesh.position.copy(at);entry.total=entry.life=fire?.55+Math.random()*.35:1.25+Math.random()*.9;entry.mesh.scale.setScalar(fire?.13+Math.random()*.12:.18+Math.random()*.18);entry.mesh.material.opacity=fire?.9:.42;entry.mesh.visible=true;entry.velocity.set((Math.random()-.5)*(fire?.35:.7),fire?1.15+Math.random()*.8:.55+Math.random()*.65,(Math.random()-.5)*(fire?.35:.7));
  }
  function updateParticles(dt){particles.forEach(entry=>{if(entry.life<=0||!entry.mesh.visible)return;entry.life-=dt;if(entry.life<=0){entry.mesh.visible=false;return;}entry.velocity.y+=(entry.fire?.2:.45)*dt;entry.mesh.position.addScaledVector(entry.velocity,dt);entry.mesh.scale.multiplyScalar(1+dt*(entry.fire?.8:.48));entry.mesh.material.opacity=(entry.fire?.9:.42)*clamp(entry.life/entry.total,0,1);});}
  function makeHud(){if(typeof document==='undefined'||hud)return;hud=document.createElement('div');hud.className='lk-vehicle-energy';hud.innerHTML='<strong>VEHICLE ENERGY</strong><div><i></i></div><b></b>';hudFill=hud.querySelector('i');hudValue=hud.querySelector('b');document.body.appendChild(hud);}
  function updateHud(){const occupied=pawn.possessed===true||!!pawn.driverPawn,show=occupied||state.lastHitTimer>0;if(!show){if(hud)hud.classList.remove('on');return;}makeHud();if(!hud)return;hud.classList.add('on');hud.classList.toggle('critical',state.ratio<=config.fireThreshold);hud.classList.toggle('destroyed',state.destroyed);if(hudFill)hudFill.style.width=Math.round(state.ratio*100)+'%';if(hudValue)hudValue.textContent=state.destroyed?'DESTROYED':Math.ceil(state.energy)+' / '+Math.ceil(state.maxEnergy);}
  function zoneOf(info){let node=info&&info.raw&&info.raw.object||info&&info.object||null;while(node){if(node.userData&&node.userData.vehicleDamageZone)return String(node.userData.vehicleDamageZone);if(node===pawn.owner)break;node=node.parent||null;}return 'body';}
  function stopVehicle(){
    const body=bodyOf(pawn);if(body){if(body.velocity&&body.velocity.set)body.velocity.set(0,Math.max(1.2,finite(body.velocity.y,0)),0);if(body.angularVelocity&&body.angularVelocity.set)body.angularVelocity.set((Math.random()-.5)*2.2,(Math.random()-.5)*1.4,(Math.random()-.5)*2.2);body.wakeUp&&body.wakeUp();}
    pawn.enginePower=0;if(pawn.state)Object.assign(pawn.state,{speed:0,speedKmh:0,throttle:0,brake:1,handbrake:true,rpm:0,enginePower:0,destroyed:true});
    const occupants=[];if(pawn.driverPawn)occupants.push(pawn.driverPawn);(pawn.parts&&pawn.parts.seats||[]).forEach(seat=>{if(seat&&seat.occupiedBy&&occupants.indexOf(seat.occupiedBy)<0)occupants.push(seat.occupiedBy);});occupants.forEach(character=>{character.entryCooldown=0;if(character.exitVehicle)character.exitVehicle(true);else if(character.exitSeat)character.exitSeat(true);});
    if(pawn.unpossess&&pawn.possessed)pawn.unpossess();
  }
  function blacken(){if(config.explosion.blacken===false||!pawn.owner||!pawn.owner.traverse)return;pawn.owner.traverse(node=>{if(!node.isMesh||!node.material||node.userData&&node.userData.vehicleDamageHitProxy)return;const original=node.material;materials.push({node,original});node.material=materialArray(original).map(material=>{const copy=material&&material.clone?material.clone():material;if(copy&&copy.color)copy.color.multiplyScalar(.08);if(copy&&'roughness' in copy)copy.roughness=1;if(copy&&'metalness' in copy)copy.metalness=Math.min(.25,finite(copy.metalness,0));copy.needsUpdate=true;return copy;});if(!Array.isArray(original))node.material=node.material[0];});}
  function detachWheels(){if(config.explosion.detachWheels===false||!THREE)return;const scene=sceneOf(GAME,pawn),centre=worldPoint(THREE,pawn.owner,new THREE.Vector3());if(!scene||!centre)return;wheelNodes(pawn).forEach((node,index)=>{const parent=node.parent;if(!parent)return;const saved={node,parent,index:parent.children.indexOf(node),position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone(),velocity:new THREE.Vector3(),spin:new THREE.Vector3((Math.random()-.5)*10,(Math.random()-.5)*10,(Math.random()-.5)*10)};const at=worldPoint(THREE,node,new THREE.Vector3()),away=at.clone().sub(centre);away.y=.35+Math.random()*.45;away.normalize().multiplyScalar(3.5+Math.random()*4);away.y+=3.5+Math.random()*3;saved.velocity.copy(away);scene.attach?scene.attach(node):(parent.remove(node),scene.add(node));detached.push(saved);});}
  function restoreDestruction(){materials.splice(0).forEach(entry=>{const current=entry.node.material;materialArray(current).forEach(material=>{if(material&&material!==entry.original&&material.dispose)material.dispose();});entry.node.material=entry.original;});detached.splice(0).forEach(entry=>{if(entry.node.parent)entry.node.parent.remove(entry.node);entry.parent.add(entry.node);entry.node.position.copy(entry.position);entry.node.quaternion.copy(entry.quaternion);entry.node.scale.copy(entry.scale);});}
  function radialDamage(at){
    const contract=root.LK_RUNTIME_DAMAGE_CONTRACT,scene=sceneOf(GAME,pawn);if(!contract||!contract.apply||!contract.holderOf||!scene||!scene.traverse||!at)return 0;
    const holders=[],seen=new Set();scene.traverse(node=>{const holder=contract.holderOf(node);if(!holder||holder===pawn.owner||seen.has(holder))return;seen.add(holder);holders.push(holder);});
    let hits=0;holders.forEach(holder=>{const point=worldPoint(THREE,holder,new THREE.Vector3());if(!point)return;const distance=point.distanceTo(at),radius=config.explosion.radius;if(distance>radius)return;const direction=point.clone().sub(at);if(direction.lengthSq()<.000001)direction.set(0,1,0);else direction.normalize();const falloff=.25+.75*(1-distance/radius),damage=config.explosion.force*falloff;const result=contract.apply(holder,damage,{source:'vehicle-explosion',explosion:true,origin:at,point,direction,force:config.explosion.force*falloff,instigatorPawnId:pawn.id,pawnId:pawn.id});if(result&&result.damage>0)hits++;});return hits;
  }
  function explode(){if(state.destroyed)return false;state.destroyed=true;state.pendingExplosion=0;state.smoking=false;state.burning=false;stopVehicle();blacken();detachWheels();const at=worldPoint(THREE,anchors.fuelTank)||worldPoint(THREE,pawn.owner),radialHits=radialDamage(at);const tracers=GAME&&GAME.systems&&GAME.systems.weaponTracers;if(tracers&&tracers.explode&&at)tracers.explode({at:{x:at.x,y:at.y,z:at.z},radius:config.explosion.radius,damage:config.explosion.force,pawnId:pawn.id,preset:'vehicle-destruction'});emit(pawn,'OnVehicleDestroyed',{energy:0,maxEnergy:state.maxEnergy,at,radialHits,explosion:clone(config.explosion)});return true;}
  function applyDamage(amount,info){
    if(config.enabled===false||state.destroyed)return {health:state.energy,maxHealth:state.maxEnergy,damage:0,dead:state.destroyed,deathHandled:true};
    const zone=zoneOf(info),multiplier=zone==='fuel'?config.fuelTank.damageMultiplier:1,requested=Math.max(0,finite(amount,0))*multiplier,before=state.energy;state.energy=clamp(before-requested,0,state.maxEnergy);state.lastZone=zone;state.lastHitTimer=4;updateState();if(state.energy<=0&&state.pendingExplosion<=0)state.pendingExplosion=Math.max(.0001,config.explosion.delay);
    const damage=before-state.energy;emit(pawn,'OnVehicleDamaged',{damage,requestedDamage:amount,multiplier,zone,energy:state.energy,maxEnergy:state.maxEnergy,ratio:state.ratio,info});return {health:state.energy,maxHealth:state.maxEnergy,damage,killed:before>0&&state.energy<=0,dead:state.energy<=0,deathHandled:true};
  }
  function syncDamageContract(){const contract=root.LK_RUNTIME_DAMAGE_CONTRACT;if(!contract)return null;if(config.enabled===false){if(record&&contract.unbind)contract.unbind(pawn.owner);if(pawn.owner&&pawn.owner.userData&&pawn.owner.userData.damageable===record)delete pawn.owner.userData.damageable;record=null;return null;}if(!record&&contract.bind)record=contract.bind(pawn.owner,{apply:applyDamage,reset},{health:state.energy,maxHealth:state.maxEnergy,pawnId:pawn.id,team:'vehicle'});if(record){record.maxHealth=state.maxEnergy;record.health=state.energy;}return record;}
  function configure(patch){const next=normalizeConfig(merge(config,patch||{}),type);Object.keys(config).forEach(key=>delete config[key]);Object.assign(config,next);if(pawn.config)pawn.config.damage=clone(config);state.maxEnergy=config.maxEnergy;state.energy=clamp(state.energy,0,state.maxEnergy);updateState();resolveAnchors(true);syncDamageContract();return clone(config);}
  function reset(){restoreDestruction();state.energy=config.maxEnergy;state.maxEnergy=config.maxEnergy;state.destroyed=false;state.pendingExplosion=0;state.lastHitTimer=0;state.lastZone='body';updateState();if(record){record.maxHealth=state.maxEnergy;record.health=state.energy;delete record.downedAt;}if(pawn.state)delete pawn.state.destroyed;particles.forEach(entry=>{entry.life=0;entry.mesh.visible=false;});resolveAnchors(true);emit(pawn,'OnVehicleDamageReset',{energy:state.energy,maxEnergy:state.maxEnergy});return snapshot();}
  function step(dt){if(disposed)return;const h=clamp(finite(dt,0),0,.1);scanClock-=h;if(scanClock<=0){scanClock=1;resolveAnchors(false);}state.lastHitTimer=Math.max(0,state.lastHitTimer-h);if(state.pendingExplosion>0){state.pendingExplosion-=h;if(state.pendingExplosion<=0)explode();}if(state.smoking){smokeClock+=h*config.smokeRate;while(smokeClock>=1){smokeClock-=1;spawnParticle(false);}}if(state.burning){fireClock+=h*config.fireRate;while(fireClock>=1){fireClock-=1;spawnParticle(true);}}updateParticles(h);detached.forEach(entry=>{entry.velocity.y-=9.82*h;entry.node.position.addScaledVector(entry.velocity,h);entry.node.rotation.x+=entry.spin.x*h;entry.node.rotation.y+=entry.spin.y*h;entry.node.rotation.z+=entry.spin.z*h;if(entry.node.position.y<.2){entry.node.position.y=.2;entry.velocity.y=Math.abs(entry.velocity.y)*.28;entry.velocity.x*=.72;entry.velocity.z*=.72;}});updateHud();}
  function snapshot(){return {type,energy:state.energy,maxEnergy:state.maxEnergy,ratio:state.ratio,smoking:state.smoking,burning:state.burning,destroyed:state.destroyed,pendingExplosion:state.pendingExplosion,lastZone:state.lastZone,anchors:{fuelTank:anchors.fuelTank,engineSmoke:anchors.engineSmoke,exhaust:anchors.exhaust,proxy:anchors.proxy}};}
  function prewarm(){resolveAnchors(true);const group=ensureParticles();particles.forEach(entry=>{entry.life=0;entry.mesh.visible=false;});return {ready:!!group,particles:particles.length,anchors:!!anchors.fuelTank};}
  function dispose(){if(disposed)return false;disposed=true;const contract=root.LK_RUNTIME_DAMAGE_CONTRACT;if(contract&&contract.unbind)contract.unbind(pawn.owner);clearProxy();removeFallbacks();restoreDestruction();particles.forEach(entry=>{entry.mesh.material&&entry.mesh.material.dispose();});if(particleGroup&&particleGroup.parent)particleGroup.parent.remove(particleGroup);if(hud&&hud.parentNode)hud.parentNode.removeChild(hud);components.delete(pawn);return true;}
  Object.assign(component,{applyDamage,configure,reset,step,explode,dispose,snapshot,prewarm,destroyed:()=>state.destroyed,filterInput:input=>state.destroyed?{}:input,refreshAnchors:()=>resolveAnchors(true)});
  if(pawn.config)pawn.config.damage=clone(config);syncDamageContract();
  pawn.damageRuntime=component;pawn.setDamageConfig=configure;
  const originalStep=typeof pawn.step==='function'?pawn.step:null,originalReset=typeof pawn.reset==='function'?pawn.reset:null,originalDispose=typeof pawn.dispose==='function'?pawn.dispose:null,originalBinding=typeof pawn.applyBinding==='function'?pawn.applyBinding:null;
  if(originalStep)pawn.step=function(dt){const result=originalStep.call(this,dt);component.step(dt);return result;};
  if(originalReset)pawn.reset=function(){const result=originalReset.apply(this,arguments);component.reset();return result;};
  if(originalDispose)pawn.dispose=function(){component.dispose();return originalDispose.apply(this,arguments);};
  if(originalBinding)pawn.applyBinding=function(path,value){const result=originalBinding.call(this,path,value);if(/^damage\./.test(String(path||'')))component.configure(this.config.damage||{});return result;};
  components.set(pawn,component);return component;
}

const api=Object.freeze({SCHEMA_VERSION,normalizeConfig,attach,component:pawn=>components.get(pawn)||null,vehicleType});
root.LK_RUNTIME_VEHICLE_DAMAGE=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
