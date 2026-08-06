/* =========================================================
   LOT KING - Level template registry
   Level templates self-register here instead of being resolved through a
   hardcoded chain inside scene-store.js. A new game mode ships one module
   that registers a descriptor; the New Level dialog and templateScene()
   pick it up without further edits.
   ========================================================= */
(function(){
'use strict';

const root = typeof window !== 'undefined' ? window : globalThis;
const SCHEMA_VERSION = 1;
const DEFAULT_ID = 'open-world-sketchbook';
const GROUND_MODES = Object.freeze(['none', 'plane', 'drift-apron']);
const CATEGORIES = Object.freeze(['Open world', 'Character', 'Vehicle', 'Sports', 'Shooter', 'Adventure', 'Blank']);

const templates = new Map();

function text(value, fallback){
  value = value == null ? '' : String(value).trim();
  return value || (fallback == null ? '' : String(fallback));
}
function finite(value, fallback){
  value = Number(value);
  return Number.isFinite(value) ? value : fallback;
}

function normalize(descriptor){
  const src = descriptor && typeof descriptor === 'object' ? descriptor : {};
  const id = text(src.id);
  if(!id) return null;
  if(typeof src.build !== 'function') return null;
  const name = text(src.name, id);
  return Object.freeze({
    schemaVersion:SCHEMA_VERSION,
    id,
    name,
    // The New Level dialog is bilingual; a template that omits nameIt reuses
    // its English name rather than showing an empty option.
    nameIt:text(src.nameIt, name),
    description:text(src.description),
    descriptionIt:text(src.descriptionIt, text(src.description)),
    category:CATEGORIES.indexOf(text(src.category)) >= 0 ? text(src.category) : 'Blank',
    order:finite(src.order, 500),
    keepBuiltinPlayer:src.keepBuiltinPlayer === true,
    ground:GROUND_MODES.indexOf(text(src.ground)) >= 0 ? text(src.ground) : 'plane',
    env:src.env && typeof src.env === 'object' ? Object.freeze(Object.assign({}, src.env)) : null,
    build:src.build,
  });
}

function register(descriptor){
  const list = Array.isArray(descriptor) ? descriptor : [descriptor];
  const accepted = [];
  list.forEach(item => {
    const normalized = normalize(item);
    if(!normalized){
      console.warn('LotKing level templates: descriptor rejected', item && item.id);
      return;
    }
    templates.set(normalized.id, normalized);
    accepted.push(normalized.id);
  });
  return accepted;
}
function unregister(id){ return templates.delete(text(id)); }
function get(id){ return templates.get(text(id)) || null; }
function has(id){ return templates.has(text(id)); }
function list(){
  return Array.from(templates.values()).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}
function options(translate){
  const tr = typeof translate === 'function' ? translate : (en => en);
  return list().map(template => ({value:template.id, label:tr(template.name, template.nameIt)}));
}
function defaultId(){ return has(DEFAULT_ID) ? DEFAULT_ID : (list()[0] && list()[0].id) || ''; }

/** Resolve a template id to a descriptor, falling back to the default and then
 *  to any registered template, so an unknown/removed id can never yield null. */
function resolve(id){ return get(id) || get(defaultId()) || list()[0] || null; }

function build(id, scene, context){
  const template = resolve(id);
  if(!template) return scene;
  const result = template.build(scene, Object.assign({template}, context || {}));
  return result || scene;
}

root.LK_LEVEL_TEMPLATES = Object.freeze({
  SCHEMA_VERSION, DEFAULT_ID, GROUND_MODES, CATEGORIES,
  register, unregister, get, has, list, options, defaultId, resolve, build,
});
if(typeof module !== 'undefined' && module.exports) module.exports = root.LK_LEVEL_TEMPLATES;
})();
