'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../js/runtime/weather-system.js');
const WEATHER = global.LK_RUNTIME_WEATHER;

function makeGame(){
  const cloudCalls = [], rainCalls = [];
  return {
    cloudCalls, rainCalls,
    hooks:{frame:[]},
    systems:{
      sky:{volClouds:{set(patch){ cloudCalls.push(patch); }}},
      rain:{set(patch){ rainCalls.push(patch); }},
    },
  };
}
const last = list => list[list.length - 1];

function run(){
  // --- config normalization ------------------------------------------------
  const normalized = WEATHER.normalizeConfig({preset:'not-a-preset', intensity:4, windDirection:900, transitionTime:-3, surface:'lava'});
  assert.equal(normalized.preset, 'clear', 'an unknown preset falls back to clear');
  assert.equal(normalized.intensity, 1, 'intensity clamps to 0..1');
  assert.equal(normalized.windDirection, 360, 'wind direction clamps');
  assert.equal(normalized.transitionTime, 0, 'a negative transition clamps to instant');
  assert.equal(normalized.surface, 'asphalt', 'an unknown surface family falls back to asphalt');
  assert.equal(normalized.enabled, false, 'the director is opt-in so existing levels are untouched');
  assert.equal(normalized.drivePhysics, true);
  assert.equal(normalized.driveVisuals, true);

  assert.ok(WEATHER.PRESET_IDS.length >= 8, 'the preset set covers the shipped game modes');
  ['clear','overcast','rain','storm','snow','blizzard','fog','humid'].forEach(id => {
    assert.ok(WEATHER.PRESETS[id], 'preset ' + id + ' must exist');
    const preset = WEATHER.normalizePreset({id});
    assert.ok(preset.fogFar > preset.fogNear, id + ': fog far must sit beyond fog near');
    assert.ok(preset.grip > 0 && preset.grip <= 1.5, id + ': grip stays in a sane range');
  });

  // --- intensity blends away from clear ------------------------------------
  const full = WEATHER.resolveTargets(WEATHER.normalizeConfig({preset:'storm', intensity:1}));
  const half = WEATHER.resolveTargets(WEATHER.normalizeConfig({preset:'storm', intensity:.5}));
  const none = WEATHER.resolveTargets(WEATHER.normalizeConfig({preset:'storm', intensity:0}));
  assert.ok(half.rain > none.rain && half.rain < full.rain, 'intensity scales the preset continuously');
  assert.equal(none.rain, 0, 'zero intensity is calm regardless of preset');
  assert.ok(half.grip > full.grip, 'a milder storm grips better than a full one');

  // --- surface response ----------------------------------------------------
  const wet = {surface:'asphalt', wetness:1, snow:0, temperature:10, grip:WEATHER.PRESETS.rain.grip};
  const dry = {surface:'asphalt', wetness:0, snow:0, temperature:18, grip:WEATHER.PRESETS.clear.grip};
  assert.ok(WEATHER.surfaceGrip(wet, 'asphalt') < WEATHER.surfaceGrip(dry, 'asphalt'), 'wet tarmac grips less than dry');
  assert.ok(WEATHER.surfaceGrip(dry, 'ice') < WEATHER.surfaceGrip(dry, 'asphalt'), 'ice grips less than tarmac in the same weather');
  assert.ok(WEATHER.surfaceGrip(dry, 'sand') < WEATHER.surfaceGrip(dry, 'asphalt'), 'loose sand grips less than tarmac');
  const freezing = WEATHER.surfaceGrip({surface:'asphalt', wetness:1, snow:0, temperature:-10, grip:WEATHER.PRESETS.rain.grip}, 'asphalt');
  assert.ok(freezing < WEATHER.surfaceGrip(wet, 'asphalt'), 'standing water below zero is more slippery than rain');
  assert.ok(WEATHER.surfaceGrip(dry, 'asphalt') >= .05, 'grip never reaches zero');
  // Wet sand packs down rather than getting slippery. Hold the preset grip term
  // constant so this isolates the per-surface response from the weather scale.
  const sameGrip = WEATHER.PRESETS.clear.grip;
  const soaked = {surface:'sand', wetness:1, snow:0, temperature:18, grip:sameGrip};
  const parched = {surface:'sand', wetness:0, snow:0, temperature:18, grip:sameGrip};
  assert.ok(WEATHER.surfaceGrip(soaked, 'sand') > WEATHER.surfaceGrip(parched, 'sand'),
    'wet sand packs down and grips better, unlike wet tarmac');
  assert.ok(WEATHER.surfaceGrip({surface:'asphalt', wetness:1, snow:0, temperature:18, grip:sameGrip}, 'asphalt')
    < WEATHER.surfaceGrip({surface:'asphalt', wetness:0, snow:0, temperature:18, grip:sameGrip}, 'asphalt'),
    'wet tarmac grips worse at the same weather scale');

  // --- director lifecycle --------------------------------------------------
  {
    const game = makeGame();
    const director = WEATHER.create(game);
    assert.equal(director.surface().gripMultiplier, 1, 'a disabled director never scales grip');
    director.set({enabled:true, preset:'storm', intensity:1});
    assert.ok(director.surface().gripMultiplier < 1, 'an enabled storm reduces grip');
    assert.ok(last(game.rainCalls).enabled, 'a storm turns rain on');
    assert.ok(last(game.cloudCalls).coverage > .8, 'a storm raises cloud coverage');

    director.set({drivePhysics:false});
    assert.equal(director.surface().gripMultiplier, 1, 'visual-only weather leaves physics alone');
    director.set({drivePhysics:true});

    const before = game.cloudCalls.length;
    director.set({driveVisuals:false, preset:'clear'});
    assert.equal(game.cloudCalls.length, before, 'physics-only weather leaves the look alone');
  }

  // --- snow drives a different particle look than rain ---------------------
  {
    const game = makeGame();
    const director = WEATHER.create(game);
    director.set({enabled:true, preset:'rain', intensity:1});
    const rainLook = last(game.rainCalls);
    director.set({enabled:true, preset:'blizzard', intensity:1});
    const snowLook = last(game.rainCalls);
    assert.ok(snowLook.speed < rainLook.speed, 'snow falls slower than rain');
    assert.ok(snowLook.width > rainLook.width, 'snowflakes are wider than raindrops');
    assert.ok(snowLook.sound < rainLook.sound, 'snow is quieter than rain');
  }

  // --- transitions ---------------------------------------------------------
  {
    const game = makeGame();
    const director = WEATHER.create(game);
    director.set({enabled:true, preset:'clear', transitionTime:4});
    const dryGrip = director.surface().gripMultiplier;
    director.setPreset('storm', {transitionTime:4});
    assert.equal(director.surface().blending, true, 'a timed preset change starts a blend');
    assert.ok(Math.abs(director.surface().gripMultiplier - dryGrip) < .05, 'grip has barely moved on the first frame');
    for(let i = 0; i < 60; i++) director.update(1/60);
    const midGrip = director.surface().gripMultiplier;
    assert.ok(midGrip < dryGrip, 'grip falls as the storm arrives');
    for(let i = 0; i < 200; i++) director.update(1/60);
    assert.equal(director.surface().blending, false, 'the blend finishes');
    assert.ok(director.surface().gripMultiplier < midGrip, 'the fully arrived storm is the most slippery point');

    director.setPreset('clear', {transitionTime:0});
    assert.equal(director.surface().blending, false, 'a zero transition applies immediately');
  }

  // --- a stalled frame must not teleport the weather -----------------------
  {
    const director = WEATHER.create(makeGame());
    director.set({enabled:true, preset:'clear', transitionTime:10});
    director.setPreset('storm', {transitionTime:10});
    director.update(60);
    assert.equal(director.surface().blending, true, 'one huge frame is clamped instead of completing the blend');
  }

  // --- preset cycling ------------------------------------------------------
  {
    const director = WEATHER.create(makeGame());
    director.set({enabled:true, preset:'clear', transitionTime:0,
      cycle:{enabled:true, order:['clear','rain','fog'], holdSeconds:5}});
    assert.equal(director.surface().preset, 'clear');
    for(let i = 0; i < 320; i++) director.update(1/60);
    assert.equal(director.surface().preset, 'rain', 'the cycle advances after its hold time');
    for(let i = 0; i < 320; i++) director.update(1/60);
    assert.equal(director.surface().preset, 'fog');
    for(let i = 0; i < 320; i++) director.update(1/60);
    assert.equal(director.surface().preset, 'clear', 'the cycle wraps around');
  }
  {
    const director = WEATHER.create(makeGame());
    director.set({enabled:true, cycle:{enabled:true, order:['clear','nonsense'], holdSeconds:5}});
    assert.deepEqual(director.get().cycle.order, ['clear'], 'unknown presets are dropped from a cycle');
    for(let i = 0; i < 400; i++) director.update(1/60);
    assert.equal(director.surface().preset, 'clear', 'a single-entry cycle never switches');
  }

  // --- change listeners ----------------------------------------------------
  {
    const director = WEATHER.create(makeGame());
    let seen = 0;
    const off = director.onChange(() => seen++);
    director.set({enabled:true, preset:'fog'});
    assert.ok(seen > 0, 'listeners are notified on change');
    const afterSubscribe = seen;
    off();
    director.set({preset:'clear'});
    assert.equal(seen, afterSubscribe, 'unsubscribing stops notifications');
  }

  // --- gripFor -------------------------------------------------------------
  {
    const director = WEATHER.create(makeGame());
    director.set({enabled:true, preset:'snow', intensity:1, surface:'asphalt'});
    assert.ok(director.gripFor('ice') < director.gripFor('asphalt'), 'gripFor answers per surface family');
    director.set({drivePhysics:false});
    assert.equal(director.gripFor('ice'), 1, 'gripFor respects the physics toggle');
  }

  // --- legacy env.weather blocks from the shipped level templates ----------
  {
    const legacy = WEATHER.normalizeConfig({type:'snow', intensity:.65, wind:[.8, 0, .25], surface:'snow'});
    assert.equal(legacy.preset, 'snow', 'a legacy weather type resolves to its preset');
    assert.equal(legacy.enabled, true, 'a legacy block still drives physics');
    assert.equal(legacy.driveVisuals, false,
      'a legacy block must not overwrite the cloud and rain values its template tuned by hand');
    assert.equal(legacy.drivePhysics, true);
    assert.equal(legacy.surface, 'snow');
    assert.ok(Math.abs(legacy.windDirection - Math.atan2(.25, .8) * 180 / Math.PI) < 1e-6,
      'a legacy wind vector becomes a wind direction');

    assert.equal(WEATHER.normalizeConfig({type:'cumulus', intensity:.34}).preset, 'fair');
    assert.equal(WEATHER.normalizeConfig({type:'clear', intensity:0}).enabled, true);
    const unknown = WEATHER.normalizeConfig({type:'sharknado'});
    assert.equal(unknown.preset, 'clear', 'an unrecognised legacy type is inert');
    assert.equal(unknown.enabled, false, 'an unrecognised legacy type never enables the director');

    // The modern shape must not be reinterpreted as legacy.
    const modern = WEATHER.normalizeConfig({enabled:true, preset:'storm', driveVisuals:true});
    assert.equal(modern.driveVisuals, true, 'an explicit config keeps full authority over visuals');
  }
  {
    // A legacy template block must leave the authored look untouched at runtime.
    const game = makeGame();
    const director = WEATHER.create(game);
    director.set({type:'rain', intensity:.48, wind:[.25, 0, .4], surface:'mud'});
    assert.equal(game.rainCalls.length, 0, 'legacy weather does not rewrite the template rain settings');
    assert.equal(game.cloudCalls.length, 0, 'legacy weather does not rewrite the template cloud settings');
    assert.ok(director.surface().gripMultiplier < 1, 'legacy weather still makes the ground slippery');
  }
  {
    // Every shipped template's weather block must resolve to a real preset and
    // a real surface family, or the mode silently loses its climate.
    const modes = {
      'js/runtime/snowboarding-level-template.js':{preset:'snow', surface:'snow'},
      'js/runtime/jungle-car-escape-level-template.js':{preset:'rain', surface:'mud'},
      'js/runtime/cat-neighborhood-level-template.js':{preset:'fair', surface:'asphalt'},
      'js/runtime/fps-enemy-outpost-level-template.js':{preset:'clear', surface:'concrete'},
    };
    Object.keys(modes).forEach(file => {
      const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
      const match = source.match(/weather:\{([^}]*)\}/);
      assert.ok(match, file + ' must author an env.weather block');
      const typeMatch = match[1].match(/type:'([^']+)'/);
      const surfaceMatch = match[1].match(/surface:'([^']+)'/);
      assert.ok(typeMatch && surfaceMatch, file + ' weather block needs a type and a surface');
      const resolved = WEATHER.normalizeConfig({type:typeMatch[1], surface:surfaceMatch[1]});
      assert.equal(resolved.preset, modes[file].preset, file + ' resolves to the wrong preset');
      assert.equal(resolved.surface, modes[file].surface, file + ' surface family must survive normalization');
      assert.ok(WEATHER.SURFACE_RESPONSE[surfaceMatch[1]], file + ' names an unknown surface family: ' + surfaceMatch[1]);
    });
  }

  // --- install -------------------------------------------------------------
  {
    const game = makeGame();
    const director = WEATHER.install(game);
    assert.equal(game.systems.weather, director);
    assert.equal(game.hooks.frame.length, 1, 'install registers exactly one frame hook');
    assert.equal(WEATHER.install(game), director, 'install is idempotent');
    assert.equal(game.hooks.frame.length, 1, 'a second install does not add a second frame hook');
    assert.equal(WEATHER.gripMultiplier(game), 1, 'a fresh director is neutral');
    assert.equal(WEATHER.gripMultiplier(null), 1, 'a missing GAME is neutral');
    assert.equal(WEATHER.gripMultiplier({systems:{}}), 1, 'a missing director is neutral');
  }

  // --- wiring --------------------------------------------------------------
  const repoRoot = path.join(__dirname, '..');
  const actuator = fs.readFileSync(path.join(repoRoot, 'js/runtime/vehicle-raycast-actuator.js'), 'utf8');
  assert.ok(actuator.includes('gripMultiplier'), 'the shared wheel actuator must accept a grip multiplier');
  assert.ok(!actuator.includes('LOT_KING'), 'the actuator must stay stateless and not reach for globals');

  ['js/lot-king.js', 'js/runtime/vehicle-pawns.js'].forEach(file => {
    const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    assert.ok(source.includes('LK_RUNTIME_WEATHER.gripMultiplier'),
      file + ' must pass the weather grip multiplier into the shared actuator');
  });

  const store = fs.readFileSync(path.join(repoRoot, 'js/engine/scene-store.js'), 'utf8');
  assert.ok(store.includes('env.weather'), 'weather must apply from saved env data');
  assert.ok(store.includes('env.weather = GAME.systems.weather.get()'), 'weather must be collected into saved env data');

  const inspector = fs.readFileSync(path.join(repoRoot, 'js/editor/environment-inspector.js'), 'utf8');
  assert.ok(inspector.includes("section(tr('WEATHER'"), 'the Environment Inspector must expose a Weather section');

  const nodes = fs.readFileSync(path.join(repoRoot, 'js/logic/logic-nodes-weather.js'), 'utf8');
  ['weather.setPreset','weather.setEnabled','weather.setSurface','weather.getState','weather.gripFor']
    .forEach(type => assert.ok(nodes.includes("type:'" + type + "'"), 'node pack must register ' + type));
  assert.ok(nodes.includes('LK_LOGIC_NODE_PACKS'), 'the node pack must self-register with the shared pack list');

  console.log('weather-system.test.js: all assertions passed');
}

try { run(); }
catch(error){ console.error(error); process.exitCode = 1; }
