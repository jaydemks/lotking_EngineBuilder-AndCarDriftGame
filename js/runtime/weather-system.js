/* =========================================================
   LOT KING - Weather director

   One authored weather state that drives BOTH presentation and physics:
   sky/fog tint, volumetric cloud coverage, rain, wind — and the surface grip
   every vehicle, character and animal Pawn drives on.

   Before this module each template hand-set `scene.env.fog`, `env.rain` and
   `env.volClouds` independently, so "rain" was a look with no consequence.
   A preset here changes the weather everywhere at once and blends between
   states over time, which is what lets the Open World actually change climate
   during play instead of only at level load.

   It owns no rendering. It writes into the existing sky / rain / cloud systems
   through their public setters and exposes a read-only surface state that
   physics consumers sample. Removing this script leaves every one of those
   systems working exactly as it did before.
   ========================================================= */
(function(){
'use strict';

const root = typeof window !== 'undefined' ? window : globalThis;
const SCHEMA_VERSION = 1;

function finite(value, fallback){
  value = Number(value);
  return Number.isFinite(value) ? value : (fallback == null ? 0 : fallback);
}
function clamp(value, min, max){ return Math.max(min, Math.min(max, finite(value, min))); }
function lerp(a, b, t){ return a + (b - a) * t; }
function text(value, fallback){
  value = value == null ? '' : String(value).trim();
  return value || (fallback == null ? '' : String(fallback));
}

/** Presets are authored intent, not hard values: every field is blended toward
 *  by `intensity`, so "rain at 0.3" is a real drizzle rather than a flag. */
const PRESETS = Object.freeze({
  clear:{
    label:'Clear', labelIt:'Sereno',
    cloudCoverage:.18, cloudDensity:.5, rain:0, snow:0, wind:.12,
    fogNear:180, fogFar:2200, fogColor:'#a8bbc2', skyTint:1,
    grip:1, wetness:0, temperature:18,
  },
  fair:{
    label:'Fair (scattered cloud)', labelIt:'Poco nuvoloso',
    cloudCoverage:.38, cloudDensity:.62, rain:0, snow:0, wind:.22,
    fogNear:150, fogFar:1900, fogColor:'#a6b8c4', skyTint:.96,
    grip:1, wetness:0, temperature:16,
  },
  overcast:{
    label:'Overcast', labelIt:'Coperto',
    cloudCoverage:.78, cloudDensity:.82, rain:0, snow:0, wind:.3,
    fogNear:110, fogFar:1400, fogColor:'#9aa7b0', skyTint:.78,
    grip:.98, wetness:.12, temperature:12,
  },
  rain:{
    label:'Rain', labelIt:'Pioggia',
    cloudCoverage:.88, cloudDensity:.9, rain:.6, snow:0, wind:.45,
    fogNear:70, fogFar:900, fogColor:'#8d9aa4', skyTint:.62,
    grip:.72, wetness:.75, temperature:10,
  },
  storm:{
    label:'Storm', labelIt:'Temporale',
    cloudCoverage:.97, cloudDensity:1, rain:1, snow:0, wind:1,
    fogNear:40, fogFar:520, fogColor:'#6f7d88', skyTint:.42,
    grip:.55, wetness:1, temperature:8,
  },
  snow:{
    label:'Snow', labelIt:'Neve',
    cloudCoverage:.85, cloudDensity:.8, rain:.35, snow:.8, wind:.4,
    fogNear:60, fogFar:700, fogColor:'#ccd8e2', skyTint:.85,
    grip:.5, wetness:.3, temperature:-4,
  },
  blizzard:{
    label:'Blizzard', labelIt:'Bufera',
    cloudCoverage:1, cloudDensity:1, rain:.6, snow:1, wind:1.4,
    fogNear:20, fogFar:260, fogColor:'#dbe6ee', skyTint:.7,
    grip:.34, wetness:.35, temperature:-12,
  },
  fog:{
    label:'Fog', labelIt:'Nebbia',
    cloudCoverage:.6, cloudDensity:.7, rain:0, snow:0, wind:.06,
    fogNear:8, fogFar:190, fogColor:'#b9c3c9', skyTint:.7,
    grip:.92, wetness:.35, temperature:9,
  },
  humid:{
    label:'Humid (jungle)', labelIt:'Umido (giungla)',
    cloudCoverage:.55, cloudDensity:.75, rain:.18, snow:0, wind:.14,
    fogNear:26, fogFar:340, fogColor:'#8fa88c', skyTint:.82,
    grip:.82, wetness:.5, temperature:29,
  },
});
const PRESET_IDS = Object.freeze(Object.keys(PRESETS));

/** Surface families keep their own response to the same weather, so ice does
 *  not behave like tarmac when it rains and snow only matters where there is
 *  ground to accumulate on. */
const SURFACE_RESPONSE = Object.freeze({
  asphalt:{wetGrip:-.28, snowGrip:-.45, base:1},
  concrete:{wetGrip:-.22, snowGrip:-.42, base:.97},
  dirt:{wetGrip:-.34, snowGrip:-.3, base:.86},
  mud:{wetGrip:-.4, snowGrip:-.2, base:.6},
  sand:{wetGrip:.08, snowGrip:-.15, base:.62},
  grass:{wetGrip:-.24, snowGrip:-.35, base:.78},
  rock:{wetGrip:-.18, snowGrip:-.4, base:.94},
  snow:{wetGrip:-.1, snowGrip:-.08, base:.52},
  ice:{wetGrip:-.25, snowGrip:-.05, base:.28},
});
const SURFACE_IDS = Object.freeze(Object.keys(SURFACE_RESPONSE));

function normalizePreset(source){
  const src = source && typeof source === 'object' ? source : {};
  const base = PRESETS[text(src.id)] || PRESETS.clear;
  return {
    cloudCoverage:clamp(src.cloudCoverage == null ? base.cloudCoverage : src.cloudCoverage, 0, 1),
    cloudDensity:clamp(src.cloudDensity == null ? base.cloudDensity : src.cloudDensity, 0, 1),
    rain:clamp(src.rain == null ? base.rain : src.rain, 0, 1),
    snow:clamp(src.snow == null ? base.snow : src.snow, 0, 1),
    wind:clamp(src.wind == null ? base.wind : src.wind, 0, 2),
    fogNear:clamp(src.fogNear == null ? base.fogNear : src.fogNear, 0, 100000),
    fogFar:clamp(src.fogFar == null ? base.fogFar : src.fogFar, 1, 100000),
    fogColor:text(src.fogColor, base.fogColor),
    skyTint:clamp(src.skyTint == null ? base.skyTint : src.skyTint, 0, 2),
    grip:clamp(src.grip == null ? base.grip : src.grip, .05, 1.5),
    wetness:clamp(src.wetness == null ? base.wetness : src.wetness, 0, 1),
    temperature:clamp(src.temperature == null ? base.temperature : src.temperature, -60, 60),
  };
}

// Level templates originally annotated `env.weather` with a look-only
// `{type, intensity, wind}` blob. Those saved projects must keep their authored
// cloud/rain tuning, so a legacy block resolves to a real preset that drives
// physics while leaving the authored visuals alone.
const LEGACY_TYPES = Object.freeze({
  clear:'clear', cumulus:'fair', fair:'fair', cloudy:'overcast', overcast:'overcast',
  rain:'rain', storm:'storm', thunder:'storm', snow:'snow', blizzard:'blizzard',
  fog:'fog', mist:'fog', humid:'humid', tropical:'humid',
});
function legacyShape(src){
  return !!src && typeof src === 'object' && src.preset == null && src.enabled == null && src.type != null;
}
/** Convert a legacy block into modern keys. Must run on the incoming patch,
 *  before it is merged over an already-normalized config — after the merge the
 *  `preset`/`enabled` keys always exist and the legacy shape is undetectable. */
function adaptLegacy(patch){
  if(!legacyShape(patch)) return patch;
  const preset = LEGACY_TYPES[text(patch.type).toLowerCase()];
  const wind = Array.isArray(patch.wind) ? patch.wind : null;
  return Object.assign({}, patch, {
    preset:preset || 'clear',
    enabled:!!preset,
    // The template already tuned its own clouds and rain by hand; the director
    // only contributes surface grip until an author opts in.
    driveVisuals:false,
    windDirection:patch.windDirection == null && wind
      ? Math.atan2(finite(wind[2]), finite(wind[0])) * 180 / Math.PI
      : patch.windDirection,
  });
}

function normalizeConfig(source){
  const src = adaptLegacy(source && typeof source === 'object' ? source : {});
  const preset = PRESETS[text(src.preset)] ? text(src.preset) : 'clear';
  return {
    schemaVersion:SCHEMA_VERSION,
    enabled:src.enabled === true,
    preset,
    // Intensity scales the whole preset away from `clear`, so one slider takes
    // a template from a hint of weather to its full authored extreme.
    intensity:clamp(src.intensity == null ? 1 : src.intensity, 0, 1),
    windDirection:clamp(src.windDirection == null ? 25 : src.windDirection, -360, 360),
    transitionTime:clamp(src.transitionTime == null ? 6 : src.transitionTime, 0, 600),
    drivePhysics:src.drivePhysics !== false,
    driveVisuals:src.driveVisuals !== false,
    surface:SURFACE_RESPONSE[text(src.surface)] ? text(src.surface) : 'asphalt',
    // A level may cycle through a sequence instead of holding one state.
    cycle:{
      enabled:!!(src.cycle && src.cycle.enabled),
      order:Array.isArray(src.cycle && src.cycle.order)
        ? src.cycle.order.map(id => text(id)).filter(id => !!PRESETS[id])
        : [],
      holdSeconds:clamp(src.cycle && src.cycle.holdSeconds, 5, 36000) || 120,
    },
    overrides:src.overrides && typeof src.overrides === 'object' ? Object.assign({}, src.overrides) : null,
  };
}

/** Blend a preset toward `clear` by intensity, then apply authored overrides. */
function resolveTargets(config){
  const preset = PRESETS[config.preset] || PRESETS.clear;
  const calm = PRESETS.clear;
  const t = config.intensity;
  const blended = {
    cloudCoverage:lerp(calm.cloudCoverage, preset.cloudCoverage, t),
    cloudDensity:lerp(calm.cloudDensity, preset.cloudDensity, t),
    rain:lerp(0, preset.rain, t),
    snow:lerp(0, preset.snow, t),
    wind:lerp(calm.wind, preset.wind, t),
    fogNear:lerp(calm.fogNear, preset.fogNear, t),
    fogFar:lerp(calm.fogFar, preset.fogFar, t),
    fogColor:t >= .5 ? preset.fogColor : calm.fogColor,
    skyTint:lerp(calm.skyTint, preset.skyTint, t),
    grip:lerp(calm.grip, preset.grip, t),
    wetness:lerp(0, preset.wetness, t),
    temperature:lerp(calm.temperature, preset.temperature, t),
  };
  return config.overrides ? normalizePreset(Object.assign({id:config.preset}, blended, config.overrides)) : blended;
}

/** Grip the physics layer should use right now, for a given surface family. */
function surfaceGrip(state, surfaceId){
  const response = SURFACE_RESPONSE[text(surfaceId, state.surface)] || SURFACE_RESPONSE.asphalt;
  const wet = clamp(state.wetness, 0, 1);
  const snow = clamp(state.snow, 0, 1);
  // Freezing standing water is the dangerous case: below zero, wetness stops
  // acting like rain and starts acting like ice.
  const ice = state.temperature <= 0 ? wet * clamp((0 - state.temperature) / 6, 0, 1) : 0;
  const grip = response.base
    * (1 + response.wetGrip * wet)
    * (1 + response.snowGrip * snow)
    * (1 - .45 * ice);
  return clamp(grip * (state.grip / Math.max(.001, PRESETS.clear.grip)), .05, 1.5);
}

function create(GAME){
  const state = {
    config:normalizeConfig(null),
    current:resolveTargets(normalizeConfig(null)),
    target:resolveTargets(normalizeConfig(null)),
    cycleTimer:0,
    cycleIndex:0,
    blend:1,
    listeners:[],
  };

  function systems(){ return GAME && GAME.systems || {}; }

  function pushVisuals(){
    if(!state.config.driveVisuals) return false;
    const sky = systems().sky;
    const rain = systems().rain;
    const current = state.current;
    if(sky && sky.volClouds && sky.volClouds.set){
      sky.volClouds.set({coverage:current.cloudCoverage, density:current.cloudDensity,
        windSpeed:current.wind, windDirection:state.config.windDirection});
    }
    if(rain && rain.set){
      const active = current.rain > .02;
      rain.set({enabled:active, intensity:current.rain, wind:current.wind,
        windAngle:state.config.windDirection,
        // Snow is slow, wide and quiet; rain is fast, thin and audible.
        speed:current.snow > .3 ? 9 + 6 * current.rain : 42 + 30 * current.rain,
        length:current.snow > .3 ? .09 : .35 + .35 * current.rain,
        width:current.snow > .3 ? .08 : .03 + .015 * current.rain,
        opacity:current.snow > .3 ? .55 : .22 + .22 * current.rain,
        sound:current.snow > .3 ? .12 * current.rain : .35 + .5 * current.rain});
    }
    return true;
  }

  function notify(){
    const snapshot = surfaceState();
    state.listeners.forEach(listener => { try { listener(snapshot); } catch(err){} });
  }

  function surfaceState(){
    const current = state.current;
    return Object.freeze({
      preset:state.config.preset,
      intensity:state.config.intensity,
      wetness:current.wetness,
      snow:current.snow,
      rain:current.rain,
      wind:current.wind,
      windDirection:state.config.windDirection,
      temperature:current.temperature,
      grip:current.grip,
      gripMultiplier:state.config.enabled && state.config.drivePhysics ? surfaceGrip(Object.assign({surface:state.config.surface}, current), state.config.surface) : 1,
      surface:state.config.surface,
      blending:state.blend < 1,
    });
  }

  /** Grip for a specific surface family, so a mode can ask "what is grip on
   *  mud right now" without changing the level's default surface. */
  function gripFor(surfaceId){
    if(!state.config.enabled || !state.config.drivePhysics) return 1;
    return surfaceGrip(Object.assign({surface:state.config.surface}, state.current), surfaceId);
  }

  function setPreset(presetId, options){
    const id = text(presetId);
    if(!PRESETS[id]) return false;
    const opts = options || {};
    state.config.preset = id;
    if(opts.intensity != null) state.config.intensity = clamp(opts.intensity, 0, 1);
    state.target = resolveTargets(state.config);
    const time = opts.transitionTime == null ? state.config.transitionTime : clamp(opts.transitionTime, 0, 600);
    state.blend = time > 0 ? 0 : 1;
    state.blendRate = time > 0 ? 1 / time : 0;
    if(state.blend >= 1){ state.current = Object.assign({}, state.target); pushVisuals(); notify(); }
    return true;
  }

  function set(rawPatch){
    const patch = adaptLegacy(rawPatch || {});
    const before = state.config.preset;
    state.config = normalizeConfig(Object.assign({}, state.config, patch));
    state.target = resolveTargets(state.config);
    // An explicit configuration write is an authoring action: apply it now
    // rather than easing, so the editor viewport matches the Inspector.
    if(!patch || patch.preset === before || patch.immediate !== false){
      state.current = Object.assign({}, state.target);
      state.blend = 1;
    }
    pushVisuals();
    notify();
    return get();
  }

  function get(){
    return Object.assign({}, state.config, {cycle:Object.assign({}, state.config.cycle)});
  }

  function update(dt){
    if(!state.config.enabled) return;
    const step = clamp(dt, 0, .25);
    if(state.blend < 1 && state.blendRate > 0){
      state.blend = Math.min(1, state.blend + state.blendRate * step);
      const t = state.blend;
      Object.keys(state.target).forEach(key => {
        const to = state.target[key];
        if(typeof to !== 'number'){ state.current[key] = to; return; }
        state.current[key] = lerp(finite(state.current[key], to), to, Math.min(1, t));
      });
      pushVisuals();
      notify();
    }
    const cycle = state.config.cycle;
    if(!cycle.enabled || cycle.order.length < 2) return;
    state.cycleTimer += step;
    if(state.cycleTimer < cycle.holdSeconds) return;
    state.cycleTimer = 0;
    state.cycleIndex = (state.cycleIndex + 1) % cycle.order.length;
    setPreset(cycle.order[state.cycleIndex], {});
  }

  function onChange(listener){
    if(typeof listener !== 'function') return function(){};
    state.listeners.push(listener);
    return function(){
      const index = state.listeners.indexOf(listener);
      if(index >= 0) state.listeners.splice(index, 1);
    };
  }

  return Object.freeze({
    SCHEMA_VERSION, PRESETS, PRESET_IDS, SURFACE_IDS,
    set, get, setPreset, update, onChange,
    surface:surfaceState, gripFor,
    presetIds:() => PRESET_IDS.slice(),
    isEnabled:() => state.config.enabled === true,
  });
}

function install(GAME){
  if(!GAME) return null;
  GAME.systems = GAME.systems || {};
  if(GAME.systems.weather && GAME.systems.weather.SCHEMA_VERSION === SCHEMA_VERSION) return GAME.systems.weather;
  const director = create(GAME);
  GAME.systems.weather = director;
  if(GAME.hooks && Array.isArray(GAME.hooks.frame) && !GAME.hooks.__lkWeatherFrame){
    GAME.hooks.__lkWeatherFrame = true;
    GAME.hooks.frame.push(dt => director.update(dt));
  }
  return director;
}

/** Single read used by the physics consumers. Kept as a free function so the
 *  stateless raycast actuator can stay stateless. */
function gripMultiplier(GAME, surfaceId){
  const director = GAME && GAME.systems && GAME.systems.weather;
  if(!director) return 1;
  return surfaceId ? director.gripFor(surfaceId) : director.surface().gripMultiplier;
}

function boot(){
  const GAME = root.LOT_KING;
  if(GAME) install(GAME);
}

root.LK_RUNTIME_WEATHER = Object.freeze({
  SCHEMA_VERSION, PRESETS, PRESET_IDS, SURFACE_RESPONSE, SURFACE_IDS,
  normalizeConfig, normalizePreset, resolveTargets, surfaceGrip, gripMultiplier, adaptLegacy,
  create, install, boot,
});
if(typeof module !== 'undefined' && module.exports) module.exports = root.LK_RUNTIME_WEATHER;
if(root.LOT_KING) boot();
else if(typeof document !== 'undefined'){
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
})();
