/* =========================================================
   LOT KING - Per-vehicle Engine Sound runtime

   One controller owns one vehicle's sample manager or synth fallback. It is
   intentionally independent from the native Player Car audio singleton: two
   cars can use different Sound Designer sets, RPM and mute state.
   ========================================================= */
(function(){
'use strict';

const root=typeof window!=='undefined'?window:globalThis;
function finite(value,fallback){const number=Number(value);return Number.isFinite(number)?number:fallback;}
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function soundStore(pawn){return pawn&&pawn.services&&pawn.services.STORE||root.LK_STORE||null;}
function soundSetFor(pawn,cfg){
  const store=soundStore(pawn),sets=store&&store.soundSets;
  if(cfg&&cfg.setId&&sets&&typeof sets.get==='function'){
    const stored=sets.get(cfg.setId);if(stored)return stored;
  }
  return cfg&&cfg.set||null;
}
function resolveSource(src){
  if(src&&String(src).indexOf('blob:')===0&&root.LK_ASSET_BLOBS)return root.LK_ASSET_BLOBS.getUrl(String(src).slice(5));
  return Promise.resolve(src);
}
function create(GAME,pawn){
  let runtime=null,signature='';
  function config(){
    pawn.config.engineAudio=Object.assign({enabled:true,volume:.28,pitch:1,setId:null},pawn.config.engineAudio||{});
    return pawn.config.engineAudio;
  }
  function active(){return pawn.enabled!==false&&!pawn.sleeping&&(pawn.possessed===true||!!pawn.driverPawn);}
  function dispose(){
    if(runtime){
      if(runtime.kind==='samples')try{runtime.manager.stop();runtime.manager.setConfig(null);}catch(err){}
      else {
        try{runtime.low.stop();runtime.high.stop();}catch(err){}
        try{runtime.gain.disconnect();}catch(err){}
      }
    }
    runtime=null;signature='';return true;
  }
  function ensure(){
    const cfg=config();
    if(cfg.enabled===false){dispose();return null;}
    const set=soundSetFor(pawn,cfg),nextSignature=String(cfg.setId||'synth')+':'+String(set&&set.updatedAt||set&&set.version||'');
    if(runtime&&signature===nextSignature)return runtime;
    if(runtime)dispose();
    const audio=GAME&&GAME.systems&&GAME.systems.audio,ctx=audio&&audio.getContext?audio.getContext():null,destination=audio&&audio.getCarGain?audio.getCarGain():null;
    if(!ctx||!destination)return null;
    if(set&&root.LK_RUNTIME_ENGINE_AUDIO){
      const manager=root.LK_RUNTIME_ENGINE_AUDIO.create({
        audio,engine:pawn.state,gearbox:{idle:900,redline:6900,limiter:7600},
        getSpeed:()=>pawn.state.speedKmh||0,getTimescale:()=>1,manageFallbackSynth:false,resolveSrc:resolveSource,
      });
      manager.setConfig(set);manager.start({silent:true});runtime={kind:'samples',manager,setId:cfg.setId||null};
    }else{
      const gain=ctx.createGain(),low=ctx.createOscillator(),high=ctx.createOscillator();
      low.type='sawtooth';high.type='triangle';gain.gain.value=0;low.connect(gain);high.connect(gain);gain.connect(destination);low.start();high.start();
      runtime={kind:'synth',ctx,gain,low,high};
    }
    signature=nextSignature;return runtime;
  }
  function update(dt){
    if(!active()&&!runtime)return null;
    const audioRuntime=ensure();if(!audioRuntime)return null;
    const cfg=config(),isActive=active();
    if(audioRuntime.kind==='samples'){
      audioRuntime.manager.setMuted(!isActive);
      audioRuntime.manager.setSkids({drift:pawn.state.drift?1:0,brake:pawn.state.brake||0,accel:pawn.state.throttle||0});
      audioRuntime.manager.update(Math.max(0,finite(dt,0)));return audioRuntime;
    }
    const rpm01=clamp((finite(pawn.state.rpm,900)-900)/6900,0,1),pitch=Math.max(.2,finite(cfg.pitch,1)),frequency=(55+rpm01*330)*pitch,t=audioRuntime.ctx.currentTime;
    audioRuntime.low.frequency.setTargetAtTime(frequency,t,.05);audioRuntime.high.frequency.setTargetAtTime(frequency*1.37,t,.05);
    const volume=isActive?Math.max(0,finite(cfg.volume,.28))*(.12+finite(pawn.state.throttle,0)*.55+rpm01*.25):0;
    audioRuntime.gain.gain.setTargetAtTime(volume,t,.07);return audioRuntime;
  }
  function configure(patch){
    const previous=config(),previousSet=previous.setId;
    pawn.config.engineAudio=Object.assign({},previous,patch||{});
    if(previousSet!==pawn.config.engineAudio.setId||Object.prototype.hasOwnProperty.call(patch||{},'set')||pawn.config.engineAudio.enabled===false)dispose();
    return pawn.config.engineAudio;
  }
  async function prewarm(){
    const audioRuntime=ensure();
    if(!audioRuntime)return {ready:false,kind:null,loaded:0,failed:0};
    if(audioRuntime.kind==='samples'&&audioRuntime.manager&&audioRuntime.manager.prewarm){
      const report=await audioRuntime.manager.prewarm();
      audioRuntime.manager.setMuted(true);
      return Object.assign({ready:true,kind:'samples'},report||{});
    }
    return {ready:true,kind:audioRuntime.kind,loaded:0,failed:0};
  }
  function status(){return {ready:!!runtime,kind:runtime&&runtime.kind||null,setId:config().setId||null,active:active()};}
  return Object.freeze({ensure,update,prewarm,configure,dispose,status});
}

root.LK_RUNTIME_VEHICLE_ENGINE_AUDIO=Object.freeze({create});
if(typeof module!=='undefined'&&module.exports)module.exports=root.LK_RUNTIME_VEHICLE_ENGINE_AUDIO;
})();
