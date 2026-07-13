/* Shared per-instance native engine, gearbox, limiter and torque model. */
(function(){
'use strict';
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function create(options){
  const opts=options||{};
  const gearbox=opts.gearbox;
  const drive=opts.drive||{};
  const state=opts.state||{gear:1,rpm:gearbox.idle,rpm01:0,torque01:.6,shiftTimer:0,limiterTimer:0,shiftPulse:0,limiterPulse:0,throttle:0,reverseActive:false,burnout:false,driftShiftSpeed:0};
  const sample=(key,rpm,fallback)=>typeof opts.sampleCurve==='function'?opts.sampleCurve(key,rpm,fallback):fallback;
  function reset(){ Object.assign(state,{gear:1,rpm:gearbox.idle,rpm01:0,torque01:.6,shiftTimer:0,limiterTimer:0,shiftPulse:0,limiterPulse:0,throttle:0,reverseActive:false,driftShiftSpeed:0}); return state; }
  function update(vF,throttle,sliding,dt,driftCtx){
    driftCtx=driftCtx||{};
    const speed=Math.abs(vF), driftSpeed=Number.isFinite(driftCtx.speedTot)?Math.abs(driftCtx.speedTot):speed;
    const driftLat=Number.isFinite(driftCtx.lateral)?driftCtx.lateral:0, driftForward=Number.isFinite(driftCtx.forward)?driftCtx.forward:vF;
    const driftAngle=Math.atan2(Math.abs(driftLat),Math.max(.1,Math.abs(driftForward))), driftAngle01=clamp(driftAngle/.86,0,1);
    const driftActive=!!(sliding&&driftCtx.active&&throttle>.05);
    if(!driftActive||!state.driftShiftSpeed) state.driftShiftSpeed=driftSpeed;
    const previous=state.driftShiftSpeed, driftDecel=driftActive&&driftSpeed<previous-.05;
    state.driftShiftSpeed+=(driftSpeed-state.driftShiftSpeed)*Math.min(1,dt*5.5);
    state.throttle=throttle; state.shiftTimer=Math.max(0,state.shiftTimer-dt); state.limiterTimer=Math.max(0,state.limiterTimer-dt);
    state.shiftPulse=Math.max(0,state.shiftPulse-dt); state.limiterPulse=Math.max(0,state.limiterPulse-dt);
    const g=state.gear-1, top=gearbox.tops[g]||gearbox.tops[0];
    const rpmSpeed=driftActive?Math.max(speed,driftSpeed*(.58+throttle*.22+(1-driftAngle01)*.12)):speed;
    let target=gearbox.idle+clamp(rpmSpeed/top,0,1.25)*(gearbox.redline-gearbox.idle);
    if(throttle>.05){ target+=650*throttle; if(sliding||speed<8) target+=(sliding?(1450+driftAngle01*520):1250)*throttle; }
    if(state.shiftTimer>0) target*=.58;
    state.rpm+=(target-state.rpm)*Math.min(1,dt*(throttle>.05?7.2:4));
    if(throttle>.05&&state.rpm>gearbox.upshift&&state.gear<gearbox.tops.length&&state.shiftTimer<=0){
      const nextTop=gearbox.tops[state.gear]||top, shiftSpeed=driftActive?Math.max(speed,driftSpeed*(.66-driftAngle01*.18)):speed;
      const can=!driftActive||(shiftSpeed>top*(.98+driftAngle01*.12)&&driftSpeed>nextTop*(.46+driftAngle01*.08)&&driftAngle01<.94);
      if(!can){ if(driftActive) state.rpm=Math.min(state.rpm,gearbox.redline+130+driftAngle01*180); else { state.limiterTimer=Math.max(state.limiterTimer,.13+(drive.shiftOverrun||0)*.7); state.limiterPulse=Math.max(state.limiterPulse,.14); } }
      else if(state.limiterTimer<=0){ state.limiterTimer=gearbox.limiterHold+(sliding?(drive.shiftOverrun||0):0); state.limiterPulse=.18; }
      else if(state.limiterTimer<.08){ state.gear++; state.shiftTimer=gearbox.shiftCut; state.shiftPulse=.24; state.limiterTimer=0; state.rpm*=.70; }
    } else if(driftActive&&state.gear>1&&state.shiftTimer<=0&&state.limiterTimer<=0&&driftAngle01>.24&&(driftDecel||state.rpm<4350)&&driftSpeed<top*(.64+driftAngle01*.08)&&state.rpm<(5000+driftAngle01*520)){
      state.gear--; state.rpm=Math.min(gearbox.redline*.94,Math.max(state.rpm*1.30,4550+driftAngle01*950)); state.shiftPulse=.16;
    } else if(state.rpm<gearbox.downshift&&state.gear>1&&(throttle>.05||speed<gearbox.tops[state.gear-2]*.42)){
      state.gear--; state.rpm=Math.min(gearbox.redline*.92,state.rpm*1.34);
    }
    if(state.rpm>gearbox.limiter||state.limiterTimer>0) state.rpm=gearbox.redline+Math.sin((typeof performance!=='undefined'?performance.now():Date.now())*.075)*520;
    const rev01=clamp((state.rpm-gearbox.idle)/(gearbox.redline-gearbox.idle),0,1.12);
    const low=clamp((state.rpm-gearbox.idle)/1150,0,1), mid=clamp((6700-state.rpm)/900,.28,1);
    let curve=clamp(.58+low*.92*mid+rev01*.05,.46,1.34);
    if(throttle>.05&&sliding) curve=Math.max(curve,.84+clamp((3200-state.rpm)/2200,0,1)*.18);
    curve*=clamp(sample('torque',rev01,1),.35,1.8); if(throttle>.05&&sliding) curve*=clamp(sample('driftTorque',rev01,1),.35,1.8);
    state.rpm01=clamp(rev01,0,1.12);
    const shiftTorque=driftActive?clamp(.38+driftAngle01*.20+Math.max(0,(drive.powerScale||1)-1)*.09,.34,.74):.25;
    const limiterTorque=driftActive?clamp(.96+driftAngle01*.06,.94,1.04):.82;
    state.torque01=curve*gearbox.torque[state.gear-1]*(state.shiftTimer>0?shiftTorque:(state.limiterTimer>0?limiterTorque:1));
    return state;
  }
  return Object.freeze({state,reset,update});
}
window.LK_RUNTIME_VEHICLE_ENGINE_CONTROLLER=Object.freeze({create});
})();
