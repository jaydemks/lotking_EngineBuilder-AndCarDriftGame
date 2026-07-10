/* =========================================================
   LOT KING - Plugin host API
   Shared extension points for built-in and future plugins.
   ========================================================= */
(function(){
'use strict';

function createApi(manager, env, plugin){
  function add(kind, value){
    if(manager && manager.addExtension) manager.addExtension(kind, plugin.id, value);
    return value;
  }

  return Object.freeze({
    env,
    plugin,
    command(id, config){
      const cfg = Object.assign({}, config || {}, {id, pluginId:plugin.id});
      if(manager && manager.addCommand) manager.addCommand(cfg);
      return cfg;
    },
    menu(menuId, item){
      return add('menu:' + String(menuId || 'plugins'), item || {});
    },
    sceneType(type, config){
      return add('sceneType', Object.assign({type}, config || {}));
    },
    assetType(type, config){
      return add('assetType', Object.assign({type}, config || {}));
    },
    inspectorProvider(type, provider){
      return add('inspectorProvider', {type, provider});
    },
    runtimeHook(name, hook){
      return add('runtimeHook', {name, hook});
    },
    exportHook(name, hook){
      return add('exportHook', {name, hook});
    },
    capability(name, detail){
      return add('capability', {name, detail:detail || null});
    },
    getCommand(id){
      return manager && manager.command ? manager.command(id) : null;
    },
    runCommand(id, payload){
      return manager && manager.runCommand ? manager.runCommand(id, payload) : undefined;
    },
    extensions(kind){
      return manager && manager.extensions ? manager.extensions(kind) : [];
    },
  });
}

window.LK_PLUGIN_API = Object.freeze({createApi});
})();
