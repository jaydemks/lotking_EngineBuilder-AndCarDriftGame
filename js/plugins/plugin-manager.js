/* =========================================================
   LOT KING - Plugin manager
   Registry/lifecycle for editor and runtime extensions.
   ========================================================= */
(function(){
'use strict';

const ENABLED_KEY = 'lotking.plugins.enabled.v1';

function readEnabled(){
  try {
    const raw = localStorage.getItem(ENABLED_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch(err){ return {}; }
}

function writeEnabled(map){
  try {
    localStorage.setItem(ENABLED_KEY, JSON.stringify(map || {}));
    return true;
  } catch(err){ return false; }
}

function create(env){
  env = env || {};
  const plugins = new Map();
  const commands = new Map();
  const extensionsByKind = new Map();
  let enabled = readEnabled();

  function addExtension(kind, pluginId, value){
    const key = String(kind || '');
    if(!key) return value;
    const entry = Object.assign({}, value || {}, {pluginId});
    if(!extensionsByKind.has(key)) extensionsByKind.set(key, []);
    extensionsByKind.get(key).push(entry);
    return entry;
  }

  function addCommand(command){
    if(!command || !command.id) return null;
    const id = String(command.id);
    const next = Object.assign({label:id, enabled:() => true, run:() => {}}, command, {id});
    commands.set(id, next);
    return next;
  }

  function register(plugin){
    if(!plugin || !plugin.id) return null;
    const id = String(plugin.id);
    const previous = plugins.get(id);
    if(previous && previous.registered) return previous;
    const record = Object.assign({
      id,
      name:id,
      version:'0.0.0',
      builtIn:false,
      description:'',
      capabilities:[],
      registered:false,
      error:null,
    }, plugin);
    if(record.builtIn && enabled[id] == null) enabled[id] = true;
    if(enabled[id] == null) enabled[id] = record.enabledByDefault !== false;
    plugins.set(id, record);
    try {
      if(typeof record.register === 'function'){
        const api = window.LK_PLUGIN_API && window.LK_PLUGIN_API.createApi
          ? window.LK_PLUGIN_API.createApi(apiObject, env, record)
          : null;
        record.register(api, env);
      }
      record.registered = true;
    } catch(err){
      record.error = err && err.message ? err.message : String(err);
      if(env.status) env.status('Plugin failed: ' + record.name);
      console.warn('LotKing plugin failed:', id, err);
    }
    writeEnabled(enabled);
    return record;
  }

  function setEnabled(id, value){
    id = String(id || '');
    if(!plugins.has(id)) return false;
    const plugin = plugins.get(id);
    if(plugin.builtIn && value === false) return false;
    enabled[id] = !!value;
    writeEnabled(enabled);
    return true;
  }

  function isEnabled(id){
    id = String(id || '');
    const plugin = plugins.get(id);
    if(plugin && plugin.builtIn) return true;
    return enabled[id] !== false;
  }

  function list(){
    return Array.from(plugins.values()).map(plugin => Object.freeze({
      id:plugin.id,
      name:plugin.name,
      version:plugin.version,
      builtIn:!!plugin.builtIn,
      enabled:isEnabled(plugin.id),
      description:plugin.description || '',
      category:plugin.category || 'General',
      capabilities:Array.isArray(plugin.capabilities) ? plugin.capabilities.slice() : [],
      registered:!!plugin.registered,
      error:plugin.error || null,
    }));
  }

  function extensions(kind){
    return (extensionsByKind.get(String(kind || '')) || [])
      .filter(entry => isEnabled(entry.pluginId))
      .slice();
  }

  function command(id){
    const cmd = commands.get(String(id || ''));
    if(!cmd || !isEnabled(cmd.pluginId)) return null;
    return cmd;
  }

  function runCommand(id, payload){
    const cmd = command(id);
    if(!cmd || typeof cmd.run !== 'function') return undefined;
    if(typeof cmd.enabled === 'function' && !cmd.enabled(payload)) return undefined;
    return cmd.run(payload);
  }

  const apiObject = Object.freeze({
    env,
    register,
    list,
    addExtension,
    addCommand,
    extensions,
    command,
    runCommand,
    setEnabled,
    isEnabled,
  });

  return apiObject;
}

window.LK_PLUGIN_MANAGER = Object.freeze({create});
})();
