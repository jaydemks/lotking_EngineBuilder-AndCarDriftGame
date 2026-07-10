/* =========================================================
   LOT KING - Logic Element built-in plugin descriptor
   ========================================================= */
(function(){
'use strict';

const plugin = {
  id:'logic-element',
  name:'Logic Element (Experimental)',
  version:'0.6.5',
  category:'Visual Scripting',
  builtIn:true,
  enabledByDefault:true,
  description:'Experimental visual scripting, Level Logic, scene Logic Elements, graph runtime, reusable definitions and exposed variables.',
  capabilities:[
    'Level Logic graph',
    'Scene Logic Element object',
    'Reusable Logic Element definitions',
    'Graph/Viewport editor',
    'Runtime event runner',
    'Portable save/export fallback',
  ],
  register(api){
    if(!api) return;
    api.capability('visual-scripting', 'Node graph authoring and controlled runtime execution');
    api.capability('scene-object', 'Adds the logicElement scene object type');
    api.capability('asset-definition', 'Stores reusable Logic Element definitions');
    api.sceneType('logicElement', {
      label:'Logic Element (Experimental)',
      icon:'◇',
      description:'Scene-owned visual script with internal hierarchy and exposed variables.',
    });
    api.assetType('logic-blueprint', {
      label:'Logic Element Definition (Experimental)',
      icon:'◇',
      description:'Reusable Logic Element graph and internal scene definition.',
    });
    api.inspectorProvider('logicElement', {
      label:'Logic Element Inspector (Experimental)',
      description:'Shows owner transform, management controls and exposed variable overrides.',
    });
    api.runtimeHook('logic-elements-runner', {
      label:'Logic Element Runner (Experimental)',
      description:'Creates Level Logic and Logic Element graph runtimes during preview/gameplay.',
    });
    api.exportHook('logic-element-portable-assets', {
      label:'Logic Element portable assets (Experimental)',
      description:'Embeds reusable definitions and referenced GLB/audio data into project/playable export.',
    });
    api.command('logic.open-level-logic', {
      label:'Open Level Logic',
      menu:'Tools',
      run:() => {
        const env = api.env || {};
        if(env.ED) env.ED.special = 'logic';
        if(env.buildInspector) env.buildInspector();
        if(env.status) env.status('Level Logic');
      },
    });
    api.command('logic.open-profiler', {
      label:'Open Logic Profiler',
      menu:'Tools',
      run:() => {
        const env = api.env || {};
        if(env.appMenuBar && env.appMenuBar.openProfilerPanel) env.appMenuBar.openProfilerPanel();
        else if(env.status) env.status('Logic profiler unavailable');
      },
    });
    api.menu('plugins', {
      label:'Logic Element (Experimental)',
      icon:'◇',
      sub:[
        {label:'Open Level Logic', icon:'◇', action:() => api.runCommand('logic.open-level-logic')},
        {label:'Runtime Profiler', icon:'▧', action:() => api.runCommand('logic.open-profiler')},
      ],
    });
  },
};

window.LK_LOGIC_ELEMENT_PLUGIN = Object.freeze(plugin);
})();
