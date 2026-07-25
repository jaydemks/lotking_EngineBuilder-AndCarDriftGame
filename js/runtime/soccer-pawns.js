/* =========================================================
   LOT KING - Soccer Pawn specialization
   Football roles and keeper actions layered on the shared
   Character Pawn base. No movement/camera/mixer duplication.
   ========================================================= */
(function(){
'use strict';
const SCHEMA_VERSION=1;
const ROLES=['striker','winger','midfielder','defender','goalkeeper'];
const ROLE_ANIMATION_DEFAULTS={common:{idle:'Idle',walk:'Walking',run:'Running',strafeLeft:'Left Strafe',strafeRight:'Right Strafe',jump:'Jump',celebrate:'Victory',defeat:'Defeated'},striker:{shoot:'Soccer Strike',pass:'Soccer Pass',cross:'Soccer Pass'},winger:{shoot:'Soccer Strike',pass:'Soccer Pass',cross:'Soccer Pass'},midfielder:{shoot:'Soccer Strike',pass:'Soccer Pass',cross:'Soccer Pass'},defender:{shoot:'Soccer Strike',pass:'Soccer Pass',tackle:'Soccer Tackle'},goalkeeper:{save:'Goalkeeper Catch',diveLeft:'Goalkeeper Dive Left',diveRight:'Goalkeeper Dive Right',shoot:'Soccer Strike',pass:'Soccer Pass'}};
const ROLE_ACTIONS={striker:['shoot','pass','cross','celebrate','defeat'],winger:['shoot','pass','cross','celebrate','defeat'],midfielder:['shoot','pass','cross','celebrate','defeat'],defender:['shoot','pass','tackle','celebrate','defeat'],goalkeeper:['save','diveLeft','diveRight','pass','celebrate','defeat']};
function normalizeRole(value){const role=String(value||'').trim().toLowerCase();return ROLES.includes(role)?role:'striker';}
function roleAnimationDefaults(role){return Object.assign({},ROLE_ANIMATION_DEFAULTS.common,ROLE_ANIMATION_DEFAULTS[normalizeRole(role)]||{});}
function normalizeConfig(source){
  const base=window.LK_RUNTIME_CHARACTER_PAWN_BASE,src=source&&typeof source==='object'?base.clone(source):{},role=normalizeRole(src.role),keeper=src.keeper||{},ball=src.ball||{},fieldAI=src.fieldAI||{};
  const cfg=base.normalizeCommonConfig(src,{schemaVersion:SCHEMA_VERSION,role,playerId:1,movement:{walkSpeed:1.9,runSpeed:6,sprintMultiplier:1.35,acceleration:14,turnRate:10,jumpHeight:1.1,gravity:22,airControl:.35,inputMode:'heading',facingMode:'heading'},animations:roleAnimationDefaults(role),appearance:{shirtColor:'#e11d48',shortsColor:'#f8fafc',socksColor:'#e11d48',hairColor:'#2b2118',skinColor:'#d8a184',hairStyle:'short',number:9},camera:{mode:'free',view:'third',distance:7.5,height:2.6,lag:6.5,fov:60}});
  const hasAi=Object.prototype.hasOwnProperty.call(keeper,'aiEnabled');
  cfg.role=role;cfg.keeper={diveDistance:base.clamp(base.finite(keeper.diveDistance,2.6),.5,5),diveDuration:base.clamp(base.finite(keeper.diveDuration,.55),.2,1.5),reach:base.clamp(base.finite(keeper.reach,1.1),.4,2.5),aiEnabled:hasAi?keeper.aiEnabled!==false:role==='goalkeeper',aiReaction:base.clamp(base.finite(keeper.aiReaction,.14),.02,.8),aiPrediction:base.clamp(base.finite(keeper.aiPrediction,1.15),.2,2.5),aiReturnSpeed:base.clamp(base.finite(keeper.aiReturnSpeed,3.8),.5,10)};
  cfg.fieldAI={enabled:fieldAI.enabled===true,reaction:base.clamp(base.finite(fieldAI.reaction,.32),.05,2),shootDistance:base.clamp(base.finite(fieldAI.shootDistance,1.05),.5,2)};
  cfg.ball={
    autoControl:ball.autoControl!==false,
    controlRadius:base.clamp(base.finite(ball.controlRadius,1.35),.4,3),
    touchDistance:base.clamp(base.finite(ball.touchDistance,.68),.3,1.2),
    shootPower:base.clamp(base.finite(ball.shootPower,26),8,40),
    shotMinPower:base.clamp(base.finite(ball.shotMinPower,10),4,25),
    shotChargeTime:base.clamp(base.finite(ball.shotChargeTime,1.15),.3,3),
    shotCurve:base.clamp(base.finite(ball.shotCurve,.65),0,1),
    aimReticle:ball.aimReticle!==false,
    passPower:base.clamp(base.finite(ball.passPower,10),2,30),
    crossPower:base.clamp(base.finite(ball.crossPower,16),2,35)
  };
  cfg.animations=Object.assign(roleAnimationDefaults(role),src.animations||{});return cfg;
}
function createLogic(GAME,owner,source,services){
  const base=window.LK_RUNTIME_CHARACTER_PAWN_BASE,cfg=normalizeConfig(source);
  const pawn=base.create(GAME,owner,cfg,services,{pawnType:'soccer',ownerKey:'soccerPawnId',idPrefix:'soccer-pawn-',state:{role:cfg.role,diving:false,diveDirection:0,keeperAI:{ballId:null,reaction:0,committed:false}},actionStartedEvent:'OnSoccerActionStarted',actionFinishedEvent:'OnSoccerActionFinished',actionPayload:record=>({role:record.config.role})});
  if(!pawn)return null;
  pawn.setRole=function(role){const next=normalizeRole(role);if(next===this.config.role)return next;this.config.role=next;this.state.role=next;this.config.animations=Object.assign(roleAnimationDefaults(next),this.config.animationOverrides||{});this.rebindLocomotion();base.emitPawnEvent(this,'OnPawnRoleChanged',{role:next});return next;};
  pawn.setKeeper=function(patch){const next=Object.assign({},this.config.keeper,patch||{});this.config.keeper={diveDistance:base.clamp(base.finite(next.diveDistance,2.6),.5,5),diveDuration:base.clamp(base.finite(next.diveDuration,.55),.2,1.5),reach:base.clamp(base.finite(next.reach,1.1),.4,2.5),aiEnabled:next.aiEnabled!==false,aiReaction:base.clamp(base.finite(next.aiReaction,.14),.02,.8),aiPrediction:base.clamp(base.finite(next.aiPrediction,1.15),.2,2.5),aiReturnSpeed:base.clamp(base.finite(next.aiReturnSpeed,3.8),.5,10)};return this.config.keeper;};
  pawn.setFieldAI=function(patch){const next=Object.assign({},this.config.fieldAI,patch||{});this.config.fieldAI={enabled:next.enabled!==false,reaction:base.clamp(base.finite(next.reaction,.32),.05,2),shootDistance:base.clamp(base.finite(next.shootDistance,1.05),.5,2)};return this.config.fieldAI;};
  pawn.setBall=function(patch){this.config.ball=normalizeConfig({role:this.config.role,ball:Object.assign({},this.config.ball,patch||{})}).ball;return this.config.ball;};
  pawn.availableActions=function(){return (ROLE_ACTIONS[this.config.role]||ROLE_ACTIONS.striker).slice();};
  const baseAction=pawn.playAction.bind(pawn);
  pawn.playAction=function(name,options){
    const action=String(name||'').trim(),opts=options||{};
    // Compatibility for v1 Soccer graphs that still invoke Shoot from an
    // OnKeyDown node. When the physical action button is currently held, that
    // node must begin charging instead of creating the old central impulse.
    const live=this.readPlayerDrive?this.readPlayerDrive():null;
    const held=!!(live&&live.action||this.control&&this.control.action);
    if(action==='shoot'&&!opts.ball&&held){
      this.state.shotChargeReadsDevice=true;
      this.state.actionButtonDown=true;
      return this.beginChargedShot(live||this.control||{})||!!this.state.shotCharge;
    }
    if(this.config.role==='goalkeeper'&&(action==='diveLeft'||action==='diveRight')){this.state.diving=true;this.state.diveDirection=action==='diveLeft'?-1:1;this.state.diveElapsed=0;}
    if(['shoot','pass','cross','tackle'].includes(action)){const contact={shoot:.34,pass:.27,cross:.38,tackle:.3}[action];this.state.pendingBallContact={action,time:contact/Math.max(.05,base.finite(opts.speed,1)),options:Object.assign({},opts.ball||{})};}
    return baseAction(action,opts);
  };
  pawn.beginChargedShot=function(move){
    if(this.config.role==='goalkeeper'||this.state.pendingBallContact||this.state.shotCharge)return false;
    const setup=this.state.setupAim;
    this.state.shotCharge={elapsed:0,normalized:0,aimX:base.clamp(base.finite(setup&&setup.aimX,base.finite(move&&move.x,0)),-1,1),aimY:base.clamp(base.finite(setup&&setup.aimY,base.finite(move&&move.z,0)),-1,1),curve:false,pointerAim:!!(setup&&setup.pointerAim)};
    // Start the actual authored kick immediately, then freeze it just before
    // foot contact while the player holds the button. Release resumes this
    // very same clip so there is no invisible charge or animation restart.
    this.state.chargeActionVisual=baseAction('shoot',{speed:.55,fadeIn:.06,fadeOut:.12})===true;
    return true;
  };
  pawn.adjustShotAim=function(dx,dy){
    const charge=this.state.shotCharge||(this.wantsShotAimInput()?this.ensureSetupAim():null);if(!charge)return false;
    let screenSign=1;
    const camera=GAME&&GAME.core&&GAME.core.camera,THREE=window.THREE;
    if(camera&&THREE&&this.buildShotPlan){
      const probe=.04,current=this.buildShotPlan(charge,false),next=this.buildShotPlan(Object.assign({},charge,{aimX:base.clamp(charge.aimX+probe,-1,1)}),false);
      if(current&&next){
        const a=new THREE.Vector3(current.target.x,current.target.y,current.target.z).project(camera);
        const b=new THREE.Vector3(next.target.x,next.target.y,next.target.z).project(camera);
        if(Number.isFinite(a.x)&&Number.isFinite(b.x)&&Math.abs(b.x-a.x)>.00001)screenSign=Math.sign(b.x-a.x);
      }
    }
    charge.aimX=base.clamp(charge.aimX+base.finite(dx,0)*.0032*screenSign,-1,1);
    charge.aimY=base.clamp(charge.aimY-base.finite(dy,0)*.0032,-1,1);
    charge.pointerAim=true;
    return true;
  };
  pawn.penaltyState=function(){return GAME&&GAME.systems&&GAME.systems.penaltyFlow&&GAME.systems.penaltyFlow.state?GAME.systems.penaltyFlow.state():null;};
  pawn.wantsShotAimInput=function(){
    const penalty=this.penaltyState();
    return this.config.role!=='goalkeeper'&&!this.state.pendingBallContact&&!!(this.state.shotCharge||penalty&&(penalty.phase==='ready'||penalty.phase==='aim'));
  };
  pawn.ensureSetupAim=function(){
    const penalty=this.penaltyState(),key=penalty?(String(penalty.round)+'|'+String(penalty.kickingTeam)):'match';
    if(!this.state.setupAim||this.state.setupAimKey!==key){
      this.state.setupAim={normalized:0,aimX:0,aimY:0,curve:false,pointerAim:false};
      this.state.setupAimKey=key;
    }
    return this.state.setupAim;
  };
  pawn.faceShotTarget=function(plan,h){
    const owner=this.owner,target=plan&&plan.target;if(!owner||!owner.position||!owner.rotation||!target)return false;
    const dx=target.x-owner.position.x,dz=target.z-owner.position.z;if(dx*dx+dz*dz<.0001)return false;
    const wanted=Math.atan2(dx,dz);let delta=wanted-owner.rotation.y;
    while(delta>Math.PI)delta-=Math.PI*2;while(delta<-Math.PI)delta+=Math.PI*2;
    const limit=Math.max(.01,base.finite(this.config.movement&&this.config.movement.turnRate,10))*Math.max(.001,base.finite(h,.016));
    owner.rotation.y+=base.clamp(delta,-limit,limit);this.state.heading=owner.rotation.y;
    return true;
  };
  pawn.buildShotPlan=function(charge,applyError){
    if(!charge)return null;
    const system=GAME&&GAME.systems&&GAME.systems.soccerBall,owner=this.owner;
    if(!system||!owner)return null;
    const goals=system.goals?system.goals():[],heading=owner.rotation?base.finite(owner.rotation.y,0):0,fx=Math.sin(heading),fz=Math.cos(heading);
    let goal=null,best=Infinity;
    goals.forEach(candidate=>{const dx=candidate.x-owner.position.x,dz=candidate.z-owner.position.z,forward=dx*fx+dz*fz,d2=dx*dx+dz*dz;if(forward>-.5&&d2<best){best=d2;goal=candidate;}});
    const amount=base.clamp(charge.normalized,0,1),minPower=Math.min(this.config.ball.shotMinPower,this.config.ball.shootPower),power=minPower+(this.config.ball.shootPower-minPower)*(.12+.88*amount);
    let aimX=base.clamp(charge.aimX,-1,1),aimY=base.clamp(charge.aimY,-1,1);
    // A fully powered shot into a tight corner is deliberately less forgiving:
    // deterministic error keeps replays stable while avoiding laser-like kicks.
    const risk=Math.max(0,amount-.78)*Math.max(.15,Math.abs(aimX));
    if(applyError!==false&&risk>0){const seed=Math.sin((this.state.actionTime+power+(this.playerId||1)*17.17)*12.9898)*43758.5453;aimX+=((seed-Math.floor(seed))-.5)*risk*.72;aimY-=risk*.28;}
    const target=goal?{
      // Positive aim is screen-right. Goal heading points out of the mouth,
      // whose local right axis is (cos heading, -sin heading).
      x:goal.x+Math.cos(goal.heading)*aimX*(goal.width*.43),
      y:goal.y+.18+(aimY+1)*.5*(goal.height*.82),
      z:goal.z-Math.sin(goal.heading)*aimX*(goal.width*.43)
    }:{x:owner.position.x+fx*30,y:.5+(aimY+1),z:owner.position.z+fz*30};
    const curve=(charge.curve?this.config.ball.shotCurve:this.config.ball.shotCurve*.22)*aimX;
    return {charge:amount,aimX,aimY,power,curve,target,lift:.08+amount*.16};
  };
  pawn.releaseChargedShot=function(){
    const charge=this.state.shotCharge;if(!charge)return false;
    this.state.shotCharge=null;
    const plan=this.buildShotPlan(charge,true);if(!plan)return false;
    this.state.lastShot=plan;
    const ballOptions={target:plan.target,power:plan.power,lift:plan.lift,curve:plan.curve};
    if(this.state.chargeActionVisual&&this.locomotion&&this.locomotion.resumeAction&&this.locomotion.resumeAction(1.18)){
      this.state.pendingBallContact={action:'shoot',time:.12,options:ballOptions};
      this.state.chargeActionVisual=false;
      return true;
    }
    this.state.chargeActionVisual=false;
    return this.playAction('shoot',{ball:ballOptions});
  };
  pawn.movementScale=function(){return this.state.action&&this.state.action!=='celebrate'?.25:1;};
  pawn.updateKeeperAI=function(h){
    const keeper=this.config.keeper,system=GAME&&GAME.systems&&GAME.systems.soccerBall,ai=this.state.keeperAI||(this.state.keeperAI={ballId:null,reaction:0,committed:false});
    if(this.config.role!=='goalkeeper'||keeper.aiEnabled===false||this.possessed||!system||!system.list||!system.state||!this.owner)return false;
    const goals=system.goals?system.goals():[],owner=this.owner;
    let goal=null,goalDistance=Infinity;
    goals.forEach(candidate=>{const dx=candidate.x-owner.position.x,dz=candidate.z-owner.position.z,d2=dx*dx+dz*dz;if(d2<goalDistance){goalDistance=d2;goal=candidate;}});
    const local=(px,pz)=>{if(!goal)return {x:px-owner.position.x,z:pz-owner.position.z};const dx=px-goal.x,dz=pz-goal.z,sin=Math.sin(goal.heading),cos=Math.cos(goal.heading);return {x:cos*dx-sin*dz,z:sin*dx+cos*dz};};
    let shot=null,bestTime=Infinity,predictedLocalX=0,predictedY=1;
    system.list().forEach(id=>{
      const state=system.state(id);if(!state||!state.inFlight||state.resolved||!state.velocity||!state.position)return;
      let time;
      if(goal){
        const p=local(state.position.x,state.position.z),v=local(state.position.x+state.velocity.x,state.position.z+state.velocity.z);
        const vz=v.z-p.z;if(vz>=-.05)return;time=p.z/-vz;
        if(time>=0&&time<bestTime){bestTime=time;shot=state;predictedLocalX=p.x+(v.x-p.x)*time;predictedY=state.position.y+state.velocity.y*time-4.905*time*time;}
      }else{
        const vz=base.finite(state.velocity.z,0);if(Math.abs(vz)<.05)return;time=(owner.position.z-base.finite(state.position.z,0))/vz;
        if(time>=0&&time<bestTime){bestTime=time;shot=state;predictedLocalX=state.position.x+state.velocity.x*time-owner.position.x;predictedY=state.position.y+state.velocity.y*time-4.905*time*time;}
      }
    });
    const difficulty=window.LK_RUNTIME_GAMEPLAY_DIFFICULTY?window.LK_RUNTIME_GAMEPLAY_DIFFICULTY.profile('soccer'):{keeperReaction:1,keeperPrediction:1,keeperDive:1,keeperTracking:1,keeperPredictionError:0};
    if(!shot){
      ai.ballId=null;ai.reaction=0;ai.committed=false;
      if(!this.state.diving&&this.config.spawn&&owner.position){
        let tx=this.config.spawn.x,tz=this.config.spawn.z;
        if(goal){
          let watched=null,best=Infinity;system.list().forEach(id=>{const candidate=system.state(id);if(!candidate||!candidate.position)return;const dx=candidate.position.x-owner.position.x,dz=candidate.position.z-owner.position.z,d2=dx*dx+dz*dz;if(d2<best){best=d2;watched=candidate;}});
          if(watched){
            const p=local(watched.position.x,watched.position.z),track=base.clamp(p.x*.24,-goal.width*.28,goal.width*.28),sin=Math.sin(goal.heading),cos=Math.cos(goal.heading);
            tx=goal.x+cos*track;tz=goal.z-sin*track;
          }
        }
        const dx=tx-owner.position.x,dz=tz-owner.position.z,distance=Math.sqrt(dx*dx+dz*dz);
        if(distance>.01){const step=Math.min(distance,keeper.aiReturnSpeed*.72*base.finite(difficulty.keeperTracking,1)*h);owner.position.x+=dx/distance*step;owner.position.z+=dz/distance*step;}
      }
      return false;
    }
    if(ai.ballId!==shot.id){ai.ballId=shot.id;ai.reaction=0;ai.committed=false;}
    if(ai.committed||this.state.diving)return false;
    ai.reaction+=h;
    if(ai.reaction<keeper.aiReaction*base.finite(difficulty.keeperReaction,1)||bestTime>keeper.aiPrediction*base.finite(difficulty.keeperPrediction,1)||bestTime<.025)return false;
    const predictionError=base.finite(difficulty.keeperPredictionError,0);
    if(predictionError>0){
      const seed=Math.sin(String(shot.id||'ball').split('').reduce((sum,char)=>sum+char.charCodeAt(0),0)*12.9898+bestTime*31.17)*43758.5453;
      predictedLocalX+=((seed-Math.floor(seed))-.5)*predictionError*2;
    }
    let targetX=shot.position.x+shot.velocity.x*bestTime,targetZ=owner.position.z;
    if(goal){const sin=Math.sin(goal.heading),cos=Math.cos(goal.heading);predictedLocalX=base.clamp(predictedLocalX,-goal.width*.52,goal.width*.52);targetX=goal.x+cos*predictedLocalX;targetZ=goal.z-sin*predictedLocalX;}
    const heading=owner.rotation?owner.rotation.y:0,rightX=Math.cos(heading),rightZ=-Math.sin(heading);
    const lateral=(targetX-owner.position.x)*rightX+(targetZ-owner.position.z)*rightZ;
    ai.committed=true;
    ai.target={x:targetX,y:predictedY,z:targetZ,time:bestTime,lateral};
    const high=predictedY>1.65;
    if(Math.abs(lateral)<=Math.max(.3,keeper.reach*(high?.48:.34)))this.playAction('save',{duration:.55,speed:high?1.12:1});
    else this.playAction(lateral<0?'diveLeft':'diveRight',{duration:keeper.diveDuration,speed:(bestTime<.32?1.18:1)*base.finite(difficulty.keeperDive,1)});
    return true;
  };
  pawn.updateFieldAI=function(h,move){
    const config=this.config.fieldAI,state=this.state.fieldAI||(this.state.fieldAI={reaction:0,cooldown:0,ballId:null}),system=GAME&&GAME.systems&&GAME.systems.soccerBall;
    if(this.config.role==='goalkeeper'||this.possessed||!config||config.enabled===false||!system||!system.list||!system.state||!this.owner)return false;
    const difficulty=window.LK_RUNTIME_GAMEPLAY_DIFFICULTY?window.LK_RUNTIME_GAMEPLAY_DIFFICULTY.profile():{opponentReaction:1,opponentDecisionError:.1,opponentSpeed:.88};
    let ball=null,best=Infinity;
    system.list().forEach(id=>{const candidate=system.state(id);if(!candidate||!candidate.position||candidate.resolved)return;const dx=candidate.position.x-this.owner.position.x,dz=candidate.position.z-this.owner.position.z,d2=dx*dx+dz*dz;if(d2<best){best=d2;ball=candidate;}});
    if(!ball){state.reaction=0;move.x=0;move.z=0;move.sprint=false;return true;}
    if(state.ballId!==ball.id){state.ballId=ball.id;state.reaction=0;}
    state.reaction+=h;state.cooldown=Math.max(0,state.cooldown-h);
    if(state.reaction<config.reaction*base.finite(difficulty.opponentReaction,1)){move.x=0;move.z=0;move.sprint=false;return true;}
    let dx=ball.position.x-this.owner.position.x,dz=ball.position.z-this.owner.position.z,distance=Math.max(.0001,Math.hypot(dx,dz));
    const heading=this.owner.rotation?this.owner.rotation.y:0,cos=Math.cos(heading),sin=Math.sin(heading),speed=base.clamp(base.finite(difficulty.opponentSpeed,.88),.25,1);
    move.x=(cos*dx-sin*dz)/distance*speed;move.z=(sin*dx+cos*dz)/distance*speed;move.sprint=speed>.94;
    if(distance<=config.shootDistance&&state.cooldown<=0&&!this.state.pendingBallContact){
      const error=base.finite(difficulty.opponentDecisionError,.1),seed=Math.sin((this.playerId||7)*17.31+this.state.actionTime*3.17)*43758.5453,aimX=((seed-Math.floor(seed))-.5)*error*2;
      const plan=this.buildShotPlan({normalized:.62+(1-error)*.18,aimX,aimY:-.08,curve:false},true);
      if(plan){this.faceShotTarget(plan,h);this.playAction('shoot',{ball:{target:plan.target,power:plan.power,lift:plan.lift,curve:plan.curve}});state.cooldown=1.1+error;}
    }
    return true;
  };
  pawn.beforeMovementStep=function(h,move){
    this.updateKeeperAI(h);
    this.updateFieldAI(h,move);
    if(this.state.diving){const keeper=this.config.keeper,difficulty=window.LK_RUNTIME_GAMEPLAY_DIFFICULTY?window.LK_RUNTIME_GAMEPLAY_DIFFICULTY.profile('soccer'):null,diveScale=base.finite(difficulty&&difficulty.keeperDive,1);this.state.diveElapsed=(this.state.diveElapsed||0)+h;const t=base.clamp(this.state.diveElapsed/keeper.diveDuration,0,1),speed=(keeper.diveDistance*diveScale/keeper.diveDuration)*(1-t*.55);if(this.owner&&this.owner.position){const heading=this.owner.rotation?this.owner.rotation.y:0;this.owner.position.x+=Math.cos(heading)*this.state.diveDirection*speed*h;this.owner.position.z-=Math.sin(heading)*this.state.diveDirection*speed*h;}if(t>=1)this.state.diving=false;if(this.locomotion)this.locomotion.update({x:0,z:0},h);return true;}
    const rawMove=this.readPlayerDrive?this.readPlayerDrive():null;
    const deviceMove=this.state.shotChargeReadsDevice?rawMove:null;
    const shotMove=deviceMove||Object.assign({},move||{},{lookX:rawMove&&rawMove.lookX||0,lookY:rawMove&&rawMove.lookY||0});
    const pressed=shotMove&&shotMove.action===true;
    if(pressed&&!this.state.actionButtonDown)this.beginChargedShot(move);
    const penalty=this.penaltyState();
    if(!this.state.shotCharge&&this.config.role!=='goalkeeper'&&penalty&&(penalty.phase==='ready'||penalty.phase==='aim')){
      // During the run-up the player may move freely, but keeps a football
      // stance toward the goal instead of sliding sideways with frozen yaw.
      const setupAim=this.ensureSetupAim(),setup=this.buildShotPlan(setupAim,false);
      if(setup){setupAim.target=setup.target;this.faceShotTarget(setup,h);}
    }
    if(this.state.shotCharge){
      const charge=this.state.shotCharge;
      charge.elapsed+=h;charge.normalized=base.clamp(charge.elapsed/this.config.ball.shotChargeTime,0,1);
      const analogX=base.finite(shotMove&&shotMove.lookX,0),analogY=base.finite(shotMove&&shotMove.lookY,0);
      if(Math.abs(analogX)>.04||Math.abs(analogY)>.04){
        charge.aimX=base.clamp(charge.aimX+analogX*h*1.35,-1,1);
        charge.aimY=base.clamp(charge.aimY-analogY*h*1.35,-1,1);
        charge.pointerAim=true;
      }else if(!charge.pointerAim){
        charge.aimX=base.clamp(base.finite(shotMove&&shotMove.x,charge.aimX),-1,1);
        charge.aimY=base.clamp(base.finite(shotMove&&shotMove.z,charge.aimY),-1,1);
      }
      charge.curve=shotMove&&shotMove.sprint===true;
      if(this.state.chargeActionVisual&&this.locomotion&&this.locomotion.actionProgress&&this.locomotion.holdActionAtProgress){
        if(this.locomotion.actionProgress()>=.3||charge.elapsed>=.28)this.locomotion.holdActionAtProgress(.3);
      }
      const system=GAME&&GAME.systems&&GAME.systems.soccerBall,preview=this.buildShotPlan(charge,false);
      if(preview){charge.target=preview.target;this.faceShotTarget(preview,h);}
      if(system&&system.previewNearest&&preview)system.previewNearest(this,preview);
      // Aim input must not walk the player away from the ball while charging.
      move.x=0;move.z=0;move.sprint=false;
    }
    if(!pressed&&this.state.actionButtonDown&&this.state.shotCharge){this.releaseChargedShot();this.state.shotChargeReadsDevice=false;}
    this.state.actionButtonDown=pressed;
    return false;
  };
  pawn.afterMovementStep=function(h){
    const system=GAME&&GAME.systems&&GAME.systems.soccerBall;if(!system)return;
    const pending=this.state.pendingBallContact;
    if(!pending&&this.config.role!=='goalkeeper'&&system.touchNearest)system.touchNearest(this,{radius:this.config.ball.controlRadius},h);
    if(this.config.ball.autoControl&&this.config.role!=='goalkeeper'&&system.controlNearest)system.controlNearest(this,{radius:this.config.ball.controlRadius,distance:this.config.ball.touchDistance},h);
    if(!pending)return;
    pending.time-=h;if(pending.time>0)return;
    this.state.pendingBallContact=null;
    if(system.strikeNearest)system.strikeNearest(this,Object.assign({action:pending.action,power:pending.action==='pass'?this.config.ball.passPower:(pending.action==='cross'?this.config.ball.crossPower:this.config.ball.shootPower)},pending.options));
  };
  const baseBinding=pawn.applyBinding.bind(pawn);
  pawn.applyBinding=function(path,value){const key=String(path||'');if(key==='role'){this.setRole(value);return true;}if(key.indexOf('keeper.')===0){this.setKeeper({[key.slice(7)]:value});return true;}if(key.indexOf('fieldAI.')===0){this.setFieldAI({[key.slice(8)]:value});return true;}if(key.indexOf('ball.')===0){this.setBall({[key.slice(5)]:value});return true;}return baseBinding(path,value);};
  const baseReset=pawn.reset.bind(pawn);
  pawn.reset=function(){const result=baseReset();this.state.role=this.config.role;this.state.diving=false;this.state.diveDirection=0;this.state.pendingBallContact=null;this.state.shotCharge=null;this.state.setupAim=null;this.state.setupAimKey=null;this.state.chargeActionVisual=false;this.state.shotChargeReadsDevice=false;this.state.actionButtonDown=false;this.state.soccerFootHistory=null;this.state.keeperAI={ballId:null,reaction:0,committed:false};this.state.fieldAI={reaction:0,cooldown:0,ballId:null};return result;};
  return pawn;
}
function install(GAME){if(!GAME)return null;const core=window.LK_RUNTIME_PAWN_CORE&&window.LK_RUNTIME_PAWN_CORE.install(GAME);if(core&&core.components&&!core.components.has('soccer'))core.components.register('soccer',options=>createLogic(GAME,options.owner,options.config,options.services));return true;}
const base=window.LK_RUNTIME_CHARACTER_PAWN_BASE;
window.LK_RUNTIME_SOCCER_PAWNS=Object.freeze({SCHEMA_VERSION,ROLES,ROLE_ACTIONS,normalizeConfig,normalizeRole,roleAnimationDefaults,createLogic,install,loadAnimationLibrary:base&&base.loadAnimationLibrary,animationLibraryKey:base&&base.animationLibraryKey});
if(window.LOT_KING)install(window.LOT_KING);
})();
