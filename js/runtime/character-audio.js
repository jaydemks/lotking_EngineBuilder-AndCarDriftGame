/* =========================================================
   LOT KING — Character Sound Sets (on-foot audio)

   The counterpart of engine-audio.js for characters: footsteps that follow the
   surface underfoot, weapon fire shaped by the weapon class, and body foley
   (jump, land, breathing).

   Everything is PROCEDURAL BY DEFAULT. Every slot is a small synthesis recipe
   that the Web Audio graph renders on the fly, so a project has complete
   character audio with no media files at all. Every slot also carries an
   optional `src`: point it at a sample and the sample wins, exactly like the
   engine sound sets. An empty or unloadable `src` falls back to its recipe, so
   a broken path is never silence.

   Layout of a set:

     footsteps.surfaces[<surface>]   one slot per material underfoot
     footsteps.stride*               how far the character walks per step
     weapons[<class>].{fire,tail,mech,dry,reloadOut,reloadIn,shell}
     body.{jump,land,breath}

   The material under the feet comes from the movement snapshot, which reads it
   from the collider the character is standing on (`surface` on the collider or
   on its scene object). Untagged geometry uses the set's default surface.

   A set is assigned PER PAWN, the way an engine sound set is assigned per
   vehicle: `characterPawn.soundSet = '<set id>'`. A guard, a civilian and the
   player can walk on the same floor and sound like three different people. The
   level's own set is the fallback for any Pawn that does not name one, so a
   project that only wants one set never has to think about it.

   Removing this script removes character audio and nothing else.
   ========================================================= */
(function(){
'use strict';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const finite = (v, d) => Number.isFinite(Number(v)) ? Number(v) : d;

// ------------------------------------------------ synthesis vocabulary
//
// A recipe is data, not code, so the editor can expose every number and a set
// can be serialised into a project. Three voices are layered:
//
//   noise  filtered noise burst   — the body of an impact
//   tone   pitched sweep          — weight, thump, splash
//   ring   high-Q resonance       — the material's own ring (wood, metal, tile)
//
// `grains` repeats the noise voice a few times with jitter, which is what makes
// gravel and snow read as loose material rather than one flat hit.

function voice(noise, tone, ring, grains){
  return {noise:noise || null, tone:tone || null, ring:ring || null, grains:grains || 0};
}
function noiseVoice(type, freq, q, decay, level, sweep){
  return {type:type || 'bandpass', freq:freq || 1200, q:finite(q, 1), decay:finite(decay, .1), level:finite(level, 1), sweep:finite(sweep, 0)};
}
function toneVoice(freq, freqEnd, decay, level, wave){
  return {freq:freq || 120, freqEnd:finite(freqEnd, freq * .6), decay:finite(decay, .12), level:finite(level, .4), wave:wave || 'sine'};
}
function ringVoice(freq, q, decay, level){
  return {freq:freq || 1200, q:finite(q, 8), decay:finite(decay, .2), level:finite(level, .3)};
}

// ------------------------------------------------ surfaces
//
// Ordered: the editor lists them in this order, and the first entry is the
// fallback for untagged geometry.

const SURFACE_DEFS = [
  {id:'concrete', label:'Concrete',
    recipe:voice(noiseVoice('lowpass', 900, .8, .065, .55), toneVoice(95, 52, .075, .34))},
  {id:'marble', label:'Marble / Tile',
    recipe:voice(noiseVoice('bandpass', 1900, 1.2, .055, .5), toneVoice(120, 70, .06, .24), ringVoice(2400, 6, .1, .08))},
  {id:'wood', label:'Wood',
    recipe:voice(noiseVoice('lowpass', 1100, .9, .07, .5), toneVoice(105, 62, .085, .3), ringVoice(240, 5, .11, .12))},
  {id:'metal', label:'Metal Grate / Deck',
    recipe:voice(noiseVoice('bandpass', 1700, 1.2, .06, .5), toneVoice(115, 65, .06, .2), ringVoice(1300, 8, .17, .14))},
  {id:'gravel', label:'Gravel',
    recipe:voice(noiseVoice('bandpass', 1100, .7, .09, .48, -320), toneVoice(90, 55, .06, .16), null, 3)},
  {id:'dirt', label:'Dirt / Earth',
    recipe:voice(noiseVoice('lowpass', 800, .7, .075, .48), toneVoice(85, 52, .08, .26))},
  {id:'grass', label:'Grass',
    recipe:voice(noiseVoice('bandpass', 1600, .7, .06, .3), toneVoice(90, 58, .05, .12), null, 2)},
  {id:'sand', label:'Sand',
    recipe:voice(noiseVoice('lowpass', 700, .7, .085, .42, -240), toneVoice(80, 48, .07, .14))},
  {id:'snow', label:'Snow',
    recipe:voice(noiseVoice('lowpass', 1500, .8, .07, .34), toneVoice(85, 50, .06, .12), null, 2)},
  {id:'water', label:'Water / Shallow',
    recipe:voice(noiseVoice('lowpass', 1200, .8, .16, .55, -520), toneVoice(360, 130, .18, .22), null, 2)},
  {id:'carpet', label:'Carpet / Cloth',
    recipe:voice(noiseVoice('lowpass', 520, .7, .05, .3), toneVoice(75, 45, .05, .1))},
];
const SURFACES = Object.freeze(SURFACE_DEFS.map(s => Object.freeze({id:s.id, label:s.label})));
const DEFAULT_SURFACE = SURFACE_DEFS[0].id;

// ------------------------------------------------ weapon classes

const WEAPON_DEFS = [
  {id:'rifle', label:'Assault Rifle',
    fire:voice(noiseVoice('highpass', 2400, .8, .055, 1), toneVoice(95, 45, .11, .5)),
    tail:noiseVoice('lowpass', 950, .7, .32, .28)},
  {id:'marksman', label:'Marksman / Sniper',
    fire:voice(noiseVoice('highpass', 1900, .8, .075, 1), toneVoice(72, 34, .16, .6)),
    tail:noiseVoice('lowpass', 700, .7, .58, .34)},
  {id:'shotgun', label:'Shotgun',
    fire:voice(noiseVoice('lowpass', 1700, .7, .11, 1), toneVoice(62, 28, .2, .65)),
    tail:noiseVoice('lowpass', 800, .7, .46, .3)},
  {id:'pistol', label:'Pistol',
    fire:voice(noiseVoice('bandpass', 1900, 1.1, .045, .85), toneVoice(115, 55, .08, .4)),
    tail:noiseVoice('lowpass', 1100, .7, .18, .2)},
  {id:'smg', label:'SMG',
    fire:voice(noiseVoice('bandpass', 2600, 1, .04, .8), toneVoice(105, 52, .07, .35)),
    tail:noiseVoice('lowpass', 1200, .7, .16, .18)},
];
const WEAPON_CLASSES = Object.freeze(WEAPON_DEFS.map(w => Object.freeze({id:w.id, label:w.label})));

// Mechanical foley shared by every class; per-class slots override it.
const MECH = voice(noiseVoice('bandpass', 3200, 5, .028, .55), null, ringVoice(2100, 12, .05, .2));
const SHELL = voice(noiseVoice('highpass', 4200, 2, .05, .35), null, ringVoice(4600, 16, .19, .22), 3);

// ------------------------------------------------ default set

function slot(recipe, volume, pitchRandom){
  return {src:'', enabled:true, volume:finite(volume, 1), pitch:1, pitchRandom:finite(pitchRandom, .08), recipe:recipe};
}

function defaultSet(){
  const surfaces = {};
  SURFACE_DEFS.forEach(def => { surfaces[def.id] = slot(def.recipe, 1, .12); });
  const weapons = {};
  WEAPON_DEFS.forEach(def => {
    weapons[def.id] = {
      fire:slot(def.fire, 1, .05),
      tail:slot(voice(def.tail), .8, .06),
      mech:slot(MECH, .7, .1),
      dry:slot(MECH, .6, .06),
      reloadOut:slot(MECH, .65, .1),
      reloadIn:slot(MECH, .7, .1),
      shell:slot(SHELL, .5, .18),
    };
  });
  return {
    id:'default-foley',
    name:'Default Foley',
    master:{volume:.85},
    footsteps:{
      enabled:true,
      // Footsteps are ambience, not an event: they sit well under weapons and
      // engine audio. This is the single number to raise for louder feet.
      volume:.34,
      // Distance walked between steps. Running lengthens the stride, which is
      // what makes cadence follow speed without a separate timer per gait.
      strideWalk:.72,
      strideRun:1.15,
      runVolume:1.15,
      // Crouching and slow walking are quieter by design, which is what makes
      // them worth using in a stealth-shaped level.
      crouchVolume:.35,
      walkVolume:.62,
      defaultSurface:DEFAULT_SURFACE,
      surfaces:surfaces,
    },
    body:{
      jump:slot(voice(noiseVoice('lowpass', 1400, .8, .1, .3), toneVoice(150, 90, .09, .16)), .4, .1),
      land:slot(voice(noiseVoice('lowpass', 700, .8, .1, .5), toneVoice(80, 38, .16, .42)), .6, .08),
      breath:slot(voice(noiseVoice('lowpass', 700, .9, .26, .28)), .32, .15),
      breathInterval:1.6,
    },
    weapons:weapons,
  };
}

// ------------------------------------------------ normalization

function normalizeSlot(raw, base){
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    src:typeof src.src === 'string' ? src.src : '',
    enabled:src.enabled !== false,
    volume:clamp(finite(src.volume, base.volume), 0, 4),
    pitch:clamp(finite(src.pitch, base.pitch), .25, 4),
    pitchRandom:clamp(finite(src.pitchRandom, base.pitchRandom), 0, 1),
    // Recipes are authored data too, but the editor only exposes the numbers
    // it knows; anything missing falls back to the shipped recipe.
    recipe:src.recipe && typeof src.recipe === 'object' ? src.recipe : base.recipe,
  };
}

function normalizeSet(raw){
  const base = defaultSet();
  if(!raw || typeof raw !== 'object') return base;
  const out = base;
  if(typeof raw.id === 'string' && raw.id) out.id = raw.id;
  if(typeof raw.name === 'string' && raw.name) out.name = raw.name;
  if(raw.master) out.master.volume = clamp(finite(raw.master.volume, out.master.volume), 0, 2);

  const steps = raw.footsteps || {};
  out.footsteps.enabled = steps.enabled !== false;
  out.footsteps.volume = clamp(finite(steps.volume, out.footsteps.volume), 0, 4);
  out.footsteps.strideWalk = clamp(finite(steps.strideWalk, out.footsteps.strideWalk), .2, 4);
  out.footsteps.strideRun = clamp(finite(steps.strideRun, out.footsteps.strideRun), .2, 6);
  out.footsteps.runVolume = clamp(finite(steps.runVolume, out.footsteps.runVolume), 0, 4);
  out.footsteps.crouchVolume = clamp(finite(steps.crouchVolume, out.footsteps.crouchVolume), 0, 4);
  out.footsteps.walkVolume = clamp(finite(steps.walkVolume, out.footsteps.walkVolume), 0, 4);
  if(typeof steps.defaultSurface === 'string' && out.footsteps.surfaces[steps.defaultSurface]) out.footsteps.defaultSurface = steps.defaultSurface;
  SURFACE_DEFS.forEach(def => {
    out.footsteps.surfaces[def.id] = normalizeSlot(steps.surfaces && steps.surfaces[def.id], out.footsteps.surfaces[def.id]);
  });

  const body = raw.body || {};
  ['jump', 'land', 'breath'].forEach(key => { out.body[key] = normalizeSlot(body[key], out.body[key]); });
  out.body.breathInterval = clamp(finite(body.breathInterval, out.body.breathInterval), .4, 8);

  const weapons = raw.weapons || {};
  WEAPON_DEFS.forEach(def => {
    const src = weapons[def.id] || {};
    Object.keys(out.weapons[def.id]).forEach(key => {
      out.weapons[def.id][key] = normalizeSlot(src[key], out.weapons[def.id][key]);
    });
  });
  return out;
}

// Which weapon profile a loadout sounds like. Mirrors the view model: a fully
// custom weapon is classified by behaviour, never by its display name.
function weaponClassFor(weapon){
  const preset = weapon && weapon.preset;
  if(preset && WEAPON_DEFS.some(def => def.id === preset)) return preset;
  if(!weapon) return 'rifle';
  if(finite(weapon.pellets, 1) > 1) return 'shotgun';
  if(finite(weapon.range, 0) > 200) return 'marksman';
  if(finite(weapon.magazine, 30) <= 15 && finite(weapon.fireRate, 9) < 6) return 'pistol';
  if(finite(weapon.fireRate, 9) > 12) return 'smg';
  return 'rifle';
}

// ------------------------------------------------ gait
//
// Pure and DOM-free: it decides WHEN a foot lands, nothing else. Steps are
// spaced by distance travelled rather than by a timer, so cadence follows speed
// at every gait without a special case per animation state.

function createGait(){
  const state = {distance:0, wasGrounded:true};
  return {
    state,
    reset(){ state.distance = 0; state.wasGrounded = true; },
    // Returns the number of footsteps that landed this frame (0 or 1 normally,
    // more only if a frame was very long).
    advance(dt, speed, sprinting, grounded, set){
      if(!grounded || speed < .25){
        // Airborne or standing still: hold the phase just short of a step so
        // the first stride after moving again lands promptly.
        state.distance = Math.min(state.distance, set.strideWalk * .6);
        state.wasGrounded = grounded;
        return 0;
      }
      const stride = sprinting ? set.strideRun : set.strideWalk * (speed < 1.6 ? 1.25 : 1);
      state.distance += Math.max(0, speed) * Math.max(0, dt);
      let steps = 0;
      while(state.distance >= stride && steps < 4){ state.distance -= stride; steps++; }
      state.wasGrounded = grounded;
      return steps;
    },
  };
}

// ------------------------------------------------ runtime

function create(deps){
  const options = deps || {};
  const audio = options.audio || null;                       // js/runtime/audio.js SFX
  const resolveSrc = options.resolveSrc || (src => Promise.resolve(src));
  // `lookupSet` fetches a stored set by id; the host supplies it so this module
  // never has to know about the project store.
  const lookupSet = typeof options.lookupSet === 'function' ? options.lookupSet : null;
  let set = normalizeSet(options.set);                       // the level default
  const named = new Map();                                   // set id → normalized set
  const gaits = new Map();                                   // pawn id → gait clock
  const buffers = new Map();                                 // src → {status, buffer}
  const breath = {timer:0};

  // Which set a Pawn sounds like. Resolution is cached per id, so naming a set
  // on a Pawn costs one store read the first time and nothing afterwards.
  function setFor(pawn){
    const id = pawn && pawn.config && typeof pawn.config.soundSet === 'string' ? pawn.config.soundSet : '';
    if(!id) return set;
    if(named.has(id)) return named.get(id);
    const stored = lookupSet ? lookupSet(id) : null;
    const resolved = stored ? normalizeSet(stored) : set;
    named.set(id, resolved);
    return resolved;
  }

  function ctx(){ return audio && audio.getContext ? audio.getContext() : null; }
  function bus(){ return audio && audio.getSfxGain ? audio.getSfxGain() : null; }

  // --- sample loading (optional; recipes are the default path) -------------
  function sample(src){
    if(!src) return null;
    const known = buffers.get(src);
    if(known) return known.status === 'ok' ? known.buffer : null;
    const context = ctx();
    if(!context) return null;
    const entry = {status:'loading', buffer:null};
    buffers.set(src, entry);
    Promise.resolve(resolveSrc(src))
      .then(url => fetch(url))
      .then(response => response.arrayBuffer())
      .then(data => context.decodeAudioData(data))
      .then(buffer => { entry.status = 'ok'; entry.buffer = buffer; })
      // A missing or undecodable file is not an error worth stopping for: the
      // slot simply keeps using its procedural recipe.
      .catch(() => { entry.status = 'error'; });
    return null;
  }

  function noiseBuffer(context, seconds){
    const buffer = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate * seconds)), context.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // --- one shot ------------------------------------------------------------
  function playRecipe(context, dest, recipe, at, gain, pitch){
    if(!recipe) return;
    const n = recipe.noise;
    if(n){
      const grains = Math.max(1, finite(recipe.grains, 0) || 1);
      for(let g = 0; g < grains; g++){
        const jitter = g === 0 ? 0 : Math.random() * .035;
        const level = n.level * gain * (g === 0 ? 1 : .55 / g);
        const source = context.createBufferSource();
        source.buffer = noiseBuffer(context, Math.max(.03, n.decay * 1.2));
        const filter = context.createBiquadFilter();
        filter.type = n.type;
        filter.frequency.value = clamp(n.freq * pitch, 30, 18000);
        filter.Q.value = Math.max(.0001, n.q);
        if(n.sweep) filter.frequency.exponentialRampToValueAtTime(
          clamp((n.freq + n.sweep) * pitch, 40, 18000), at + jitter + n.decay);
        const envelope = context.createGain();
        const attack = Math.min(.014, Math.max(.003, n.decay * .3));
        envelope.gain.setValueAtTime(0, at + jitter);
        envelope.gain.linearRampToValueAtTime(level, at + jitter + attack);
        envelope.gain.exponentialRampToValueAtTime(.0008, at + jitter + n.decay);
        source.connect(filter); filter.connect(envelope); envelope.connect(dest);
        source.start(at + jitter);
        source.stop(at + jitter + n.decay + .05);
      }
    }
    const t = recipe.tone;
    if(t){
      const osc = context.createOscillator();
      osc.type = t.wave;
      osc.frequency.setValueAtTime(clamp(t.freq * pitch, 20, 8000), at);
      osc.frequency.exponentialRampToValueAtTime(clamp(t.freqEnd * pitch, 20, 8000), at + t.decay);
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(t.level * gain, at + Math.min(.016, Math.max(.004, t.decay * .22)));
      envelope.gain.exponentialRampToValueAtTime(.0008, at + t.decay);
      osc.connect(envelope); envelope.connect(dest);
      osc.start(at);
      osc.stop(at + t.decay + .05);
    }
    const r = recipe.ring;
    if(r){
      // The material's own resonance: noise through a very narrow band reads as
      // the surface ringing, which is what separates tile from carpet.
      const source = context.createBufferSource();
      source.buffer = noiseBuffer(context, Math.max(.05, r.decay));
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = clamp(r.freq * pitch, 60, 16000);
      filter.Q.value = Math.max(1, r.q);
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(r.level * gain, at + .005);
      envelope.gain.exponentialRampToValueAtTime(.0008, at + r.decay);
      source.connect(filter); filter.connect(envelope); envelope.connect(dest);
      source.start(at);
      source.stop(at + r.decay + .05);
    }
  }

  // Plays a slot: the sample if one is loaded, its recipe otherwise.
  function playSlot(slotData, gain, pitchScale, active){
    if(!slotData || slotData.enabled === false) return false;
    const context = ctx();
    const dest = bus();
    if(!context || !dest || context.state === 'suspended') return false;
    const at = context.currentTime + .001;
    const level = slotData.volume * (active || set).master.volume * finite(gain, 1);
    if(level <= .0005) return false;
    const pitch = slotData.pitch * finite(pitchScale, 1) *
      (1 + (Math.random() * 2 - 1) * slotData.pitchRandom);

    const buffer = sample(slotData.src);
    if(buffer){
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = clamp(pitch, .25, 4);
      const envelope = context.createGain();
      envelope.gain.value = level;
      source.connect(envelope); envelope.connect(dest);
      source.start(at);
      return true;
    }
    playRecipe(context, dest, slotData.recipe, at, level, clamp(pitch, .25, 4));
    return true;
  }

  // --- footsteps -----------------------------------------------------------
  function surfaceSlot(surface, active){
    const source = active || set;
    const surfaces = source.footsteps.surfaces;
    return surfaces[surface] || surfaces[source.footsteps.defaultSurface] || surfaces[DEFAULT_SURFACE];
  }
  function footstep(surface, intensity, active){
    const source = active || set;
    if(!source.footsteps.enabled) return false;
    return playSlot(surfaceSlot(surface, source), source.footsteps.volume * finite(intensity, 1), 1, source);
  }

  // Called once per frame per character Pawn. `snapshot` is the movement
  // snapshot, which already carries the surface under the feet.
  function pawnFrame(pawn, dt, snapshot){
    if(!pawn || !snapshot) return 0;
    const active = setFor(pawn);
    if(!active.footsteps.enabled) return 0;
    const id = pawn.id || 'pawn';
    let gait = gaits.get(id);
    if(!gait){ gait = createGait(); gaits.set(id, gait); }

    if(snapshot.justLanded) playSlot(active.body.land, Math.min(1.4, .6 + Math.abs(finite(snapshot.velocityY, 0)) * .08), 1, active);

    const steps = gait.advance(dt, snapshot.speed, snapshot.sprinting, snapshot.grounded, active.footsteps);
    // Gait scales the level: sprinting is loud, crouching is barely audible and
    // a deliberate walk sits between the two. `crouch` is the blend written by
    // the abilities module, so a half-crouch is half-quiet.
    const crouch = pawn.state ? clamp(finite(pawn.state.crouch, 0), 0, 1) : 0;
    const walking = !snapshot.sprinting && snapshot.speed < 2.2;
    let intensity = snapshot.sprinting ? active.footsteps.runVolume : (walking ? finite(active.footsteps.walkVolume, .62) : 1);
    intensity *= 1 - (1 - finite(active.footsteps.crouchVolume, .35)) * crouch;
    for(let i = 0; i < steps; i++) footstep(snapshot.surface, intensity, active);

    if(snapshot.sprinting && active.body.breath.enabled !== false){
      breath.timer -= dt;
      if(breath.timer <= 0){ breath.timer = active.body.breathInterval; playSlot(active.body.breath, 1, 1, active); }
    } else breath.timer = Math.min(breath.timer, active.body.breathInterval * .35);
    return steps;
  }

  function jump(pawn){ const active = setFor(pawn); return playSlot(active.body.jump, 1, 1, active); }

  // --- weapons -------------------------------------------------------------
  function weaponSlots(weapon, active){
    const source = active || set;
    return source.weapons[weaponClassFor(weapon)] || source.weapons.rifle;
  }

  function weaponEvent(type, weapon, pawn){
    const active = setFor(pawn);
    const slots = weaponSlots(weapon, active);
    if(type === 'OnWeaponFired'){
      playSlot(slots.fire, 1, 1, active);
      playSlot(slots.tail, 1, 1, active);
      playSlot(slots.mech, .8, 1, active);
      playSlot(slots.shell, .8, 1, active);
      return true;
    }
    if(type === 'OnWeaponDryFire') return playSlot(slots.dry, 1, 1, active);
    if(type === 'OnWeaponReloadStarted') return playSlot(slots.reloadOut, 1, 1, active);
    if(type === 'OnWeaponReloaded') return playSlot(slots.reloadIn, 1, 1, active);
    return false;
  }

  // The weapon events already travel on the shared Pawn event channel, so
  // hooking them needs no changes anywhere else.
  function onPawnEvent(event){
    const detail = event && event.detail || {};
    if(String(detail.type || '').indexOf('OnWeapon') !== 0) return;
    const rig = options.activeWeapon ? options.activeWeapon(detail.pawnId) : null;
    const pawn = options.pawnById ? options.pawnById(detail.pawnId) : null;
    weaponEvent(detail.type, rig, pawn);
  }
  if(typeof window !== 'undefined' && window.addEventListener) window.addEventListener('lk-pawn-event', onPawnEvent);

  return Object.freeze({
    setSet(next){ set = normalizeSet(next); gaits.clear(); named.clear(); return set; },
    get(){ return set; },
    setFor,
    // Called by the editor when a set is edited, so a Pawn using that set hears
    // the change without a reload.
    invalidate(id){ if(id) named.delete(id); else named.clear(); return true; },
    pawnFrame,
    footstep,
    jump,
    weaponEvent,
    // Single-slot playback, used by the editor to audition one sound at a time
    // through the same path the game uses.
    playBody(key){ return playSlot(set.body[key], 1, 1); },
    playWeaponSlot(weaponClass, key){
      const slots = set.weapons[weaponClass];
      return slots ? playSlot(slots[key], 1, 1) : false;
    },
    surfaces:() => SURFACES,
    weaponClasses:() => WEAPON_CLASSES,
    dispose(){
      if(typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('lk-pawn-event', onPawnEvent);
      gaits.clear();
      buffers.clear();
    },
  });
}

function install(GAME, deps){
  if(!GAME) return null;
  GAME.systems = GAME.systems || {};
  if(GAME.systems.characterAudio) return GAME.systems.characterAudio;
  GAME.systems.characterAudio = create(deps);
  return GAME.systems.characterAudio;
}

window.LK_RUNTIME_CHARACTER_AUDIO = Object.freeze({
  SURFACES,
  WEAPON_CLASSES,
  DEFAULT_SURFACE,
  defaultSet,
  normalizeSet,
  normalizeSlot,
  weaponClassFor,
  createGait,
  create,
  install,
});
})();
