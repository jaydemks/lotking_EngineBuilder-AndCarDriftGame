/* =========================================================
   LOT KING - Weather node pack

   Graph surface for js/runtime/weather-system.js. Lets a level change climate
   during play — a storm rolling into the Open World, a snowfall triggered by
   reaching a checkpoint — and lets gameplay read the resulting grip so a mode
   can react to conditions instead of only looking at them.
   ========================================================= */
(function(){
'use strict';

const execIn = {name:'exec', kind:'exec', direction:'input'};
const completedOut = {name:'completed', kind:'exec', direction:'output'};
const dataIn = (name, type, value) => ({name, kind:'data', direction:'input', type:type || 'any', defaultValue:value});
const dataOut = (name, type) => ({name, kind:'data', direction:'output', type:type || 'any'});
const number = value => Number(value) || 0;
const text = value => value == null ? '' : String(value);

function director(api){
  const GAME = api && api.context && api.context.GAME;
  if(GAME && GAME.systems && GAME.systems.weather) return GAME.systems.weather;
  const factory = typeof window !== 'undefined' && window.LK_RUNTIME_WEATHER;
  return factory && GAME && factory.install ? factory.install(GAME) : null;
}
function presetOptions(){
  const factory = typeof window !== 'undefined' && window.LK_RUNTIME_WEATHER;
  const ids = factory && factory.PRESET_IDS ? factory.PRESET_IDS : ['clear'];
  return ids.map(id => ({value:id, label:factory.PRESETS[id] ? factory.PRESETS[id].label : id}));
}

function registerWeatherNodes(registry){
  registry.register({
    type:'weather.setPreset', title:'Set Weather', category:'Weather',
    description:'Blends the level to a weather preset over the given time. Drives cloud coverage, rain, fog, wind and tyre grip together.',
    inputs:[
      execIn,
      dataIn('preset', 'string', 'clear'),
      dataIn('intensity', 'number', 1),
      dataIn('transitionTime', 'number', 6),
    ],
    outputs:[completedOut, dataOut('changed', 'boolean')],
    options:{preset:presetOptions},
    run(api){
      const weather = director(api);
      const changed = !!(weather && weather.setPreset(text(api.getInput('preset')), {
        intensity:number(api.getInput('intensity')),
        transitionTime:number(api.getInput('transitionTime')),
      }));
      api.node.data.__weather = changed;
      return {exec:'completed'};
    },
    evaluate(api){ return api.node.data.__weather === true; },
  });
  registry.register({
    type:'weather.setEnabled', title:'Enable Weather Director', category:'Weather',
    description:'Turns the weather director on or off. While off, hand-tuned cloud and rain values are left alone and grip is unscaled.',
    inputs:[execIn, dataIn('enabled', 'boolean', true)],
    outputs:[completedOut],
    run(api){
      const weather = director(api);
      if(weather) weather.set({enabled:api.getInput('enabled') !== false});
      return {exec:'completed'};
    },
  });
  registry.register({
    type:'weather.setSurface', title:'Set Ground Surface', category:'Weather',
    description:'Selects which surface family the level grips on, so the same rain behaves differently on tarmac, dirt, sand or ice.',
    inputs:[execIn, dataIn('surface', 'string', 'asphalt')],
    outputs:[completedOut],
    run(api){
      const weather = director(api);
      if(weather) weather.set({surface:text(api.getInput('surface'))});
      return {exec:'completed'};
    },
  });
  registry.register({
    type:'weather.getState', title:'Get Weather', category:'Weather',
    description:'Reads live conditions: the active preset, wetness, snow, wind, temperature and the grip multiplier physics is applying.',
    outputs:[
      dataOut('preset', 'string'), dataOut('intensity', 'number'), dataOut('wetness', 'number'),
      dataOut('snow', 'number'), dataOut('rain', 'number'), dataOut('wind', 'number'),
      dataOut('temperature', 'number'), dataOut('gripMultiplier', 'number'), dataOut('freezing', 'boolean'),
    ],
    evaluate(api, pin){
      const weather = director(api);
      if(!weather) return pin === 'preset' ? '' : (pin === 'freezing' ? false : (pin === 'gripMultiplier' ? 1 : 0));
      const surface = weather.surface();
      if(pin === 'preset') return text(surface.preset);
      if(pin === 'freezing') return number(surface.temperature) <= 0;
      return number(surface[pin]);
    },
  });
  registry.register({
    type:'weather.gripFor', title:'Get Grip For Surface', category:'Weather',
    description:'Grip multiplier the current weather would produce on a named surface family, without changing the level default.',
    inputs:[dataIn('surface', 'string', 'asphalt')],
    outputs:[dataOut('gripMultiplier', 'number')],
    evaluate(api){
      const weather = director(api);
      return weather ? number(weather.gripFor(text(api.getInput('surface')))) : 1;
    },
  });

  return registry;
}

const packs = window.LK_LOGIC_NODE_PACKS || (window.LK_LOGIC_NODE_PACKS = []);
packs.push(registerWeatherNodes);
window.LK_LOGIC_NODES_WEATHER = Object.freeze({register:registerWeatherNodes});
})();
