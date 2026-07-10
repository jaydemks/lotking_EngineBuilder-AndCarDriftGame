/* =========================================================
   LOT KING - Logic Element node registry
   ========================================================= */
(function(){
'use strict';

function create(){
  const defs = new Map();

  function register(def){
    if(!def || !def.type) throw new Error('Logic node definition missing type');
    if(defs.has(def.type)) throw new Error('Duplicate Logic node type: ' + def.type);
    const normalized = Object.assign({
      title:def.type,
      category:'Misc',
      description:'',
      inputs:[],
      outputs:[],
    }, def);
    defs.set(normalized.type, Object.freeze(normalized));
    return normalized;
  }

  function get(type){ return defs.get(type) || null; }
  function list(){ return Array.from(defs.values()).sort((a,b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title)); }
  function listByCategory(category){ return list().filter(def => def.category === category); }
  function categories(){ return Array.from(new Set(list().map(def => def.category))); }

  return Object.freeze({register, get, list, listByCategory, categories});
}

window.LK_LOGIC_REGISTRY = Object.freeze({create});
})();
