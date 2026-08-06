'use strict';

const assert = require('node:assert/strict');

global.window = global;
global.CustomEvent = class CustomEvent { constructor(type, init){ this.type=type;this.detail=(init||{}).detail||{}; } };
global.dispatchEvent = () => true;

require('../js/logic/logic-graph.js');
require('../js/logic/logic-registry.js');
require('../js/logic/logic-nodes-mvp.js');
require('../js/logic/logic-nodes-fps.js');
require('../js/logic/logic-runtime.js');
require('../js/logic/logic-validator.js');
require('../js/runtime/first-person-controller.js');
require('../js/runtime/item-system.js');
require('../js/engine/level-template-registry.js');

const definitions = new Map();
global.LK_LOGIC_TEMPLATES = {
  register(entries){ (Array.isArray(entries)?entries:[entries]).filter(Boolean).forEach(entry=>definitions.set(entry.id,JSON.parse(JSON.stringify(entry)))); },
  get(id){ const entry=definitions.get(id);return entry?JSON.parse(JSON.stringify(entry)):null; },
};
require('../js/logic/logic-templates-fps.js');

function test(name, run){
  try { run(); console.log('ok - '+name); }
  catch(error){ console.error('not ok - '+name); throw error; }
}

test('every available ground weapon is a reusable Logic Element with its own replaceable model', () => {
  const presets=Object.keys(global.LK_LOGIC_TEMPLATES_FPS.WEAPON_PICKUP_PRESETS);
  const registry=global.LK_LOGIC_NODES_MVP.createRegistry();
  assert.deepEqual(presets,['rifle','marksman','shotgun','pistol','smg','knife','bat','flashbang','grenade']);
  const signatures=new Set();
  presets.forEach(preset=>{
    const template=global.LK_LOGIC_TEMPLATES.get('logic-template-weapon-pickup-'+preset);
    assert.ok(template&&template.graph.weaponPickup,'missing pickup template '+preset);
    const graph=template.graph,model=graph.logicScene.elements.find(element=>element.id==='weapon_model');
    assert.ok(model&&model.type==='mesh','pickup exposes one selectable model element');
    assert.equal(model.asset,undefined,'placeholder does not pretend to be an imported asset');
    signatures.add(model.color+':'+model.scale.join(','));
    assert.equal(graph.weaponPickup.preset,preset);
    assert.equal(graph.variables.find(variable=>variable.name==='WeaponPreset').value,preset);
    assert.ok(graph.variables.some(variable=>variable.name==='ReloadAction'&&variable.value==='reload'));
    assert.ok(graph.nodes.some(node=>node.type==='world.makeItem'));
    const validation=global.LK_LOGIC_VALIDATOR.validateGraph(graph,registry);
    assert.deepEqual(validation.errors,[],preset+' pickup graph must validate');
  });
  assert.equal(signatures.size,presets.length,'every preset needs a visually distinct editable placeholder');
});

test('Weapon Pickup graph creates one authored item contract including ammo and Character actions', () => {
  const graph=global.LK_LOGIC_TEMPLATES_FPS.makeWeaponPickupGraph('shotgun');
  const set=(name,value)=>{graph.variables.find(variable=>variable.name===name).value=value;};
  set('WeaponName','Breacher');set('MagazineAmmo',3);set('ReserveAmmo',17);
  set('RespawnSeconds',12);set('ReloadAction','reloadBreacher');set('GeneratedVisual',false);
  const owner={name:'Breacher Pickup',userData:{}};
  const registry=global.LK_LOGIC_NODES_MVP.createRegistry();
  const runtime=global.LK_LOGIC_RUNTIME.create(graph,registry,{
    graphName:graph.name,scope:'element',services:{objects:{owner:()=>owner}},
    debug:{log(){},warn(){},error(message){throw new Error(String(message));}},
  });
  runtime.start();
  assert.equal(owner.userData.item.kind,'weapon');
  assert.equal(owner.userData.item.weapon.preset,'shotgun');
  assert.equal(owner.userData.item.weapon.name,'Breacher');
  assert.equal(owner.userData.item.weapon.characterActions.reload,'reloadBreacher');
  assert.deepEqual(owner.userData.item.ammoState,{ammo:3,reserve:17});
  assert.equal(owner.userData.item.respawn,12);
  assert.equal(owner.userData.item.visual,'','the authored placeholder/GLB stays visible');
});

test('inventory equips pickup ammo and switches Character action mapping with the weapon', () => {
  const equipped=[];
  const pawn={
    id:'pickup-player',config:{animations:{fire:'baseFire',reload:'baseReload',throw:'baseThrow'}},
    setAnimations(patch){Object.assign(this.config.animations,patch);},
    firstPerson:{
      ammo:()=>({ammo:0,reserve:0}),
      equipWeapon(weapon,state){equipped.push({weapon,state});},
    },
  };
  const inventory=global.LK_RUNTIME_ITEMS.createInventory(pawn,{mode:'slots',weaponSlots:7,autoEquip:true});
  inventory.add({preset:'shotgun',characterActions:{fire:'fireShotgun',reload:'reloadShotgun'}},{ammo:2,reserve:11});
  assert.equal(inventory.current().ammo,2);assert.equal(inventory.current().reserve,11);
  assert.equal(pawn.config.animations.fire,'fireShotgun');
  assert.equal(pawn.config.animations.reload,'reloadShotgun');
  assert.equal(pawn.config.animations.throw,'baseThrow','an omitted action retains the Pawn default');
  inventory.add({preset:'pistol'});
  assert.equal(pawn.config.animations.fire,'baseFire');
  assert.equal(pawn.config.animations.reload,'baseReload','weapons without overrides restore the authored Pawn action');
  assert.equal(equipped.at(-1).weapon.preset,'pistol');
});

test('FPS level places guns as Logic Elements instead of hardcoded primitive items', () => {
  global.LK_LOGIC_TEMPLATES.register({
    id:'logic-template-player-first-person',name:'Player stub',graph:{version:1,name:'Player stub',variables:[{name:'ReserveAmmo',value:0},{name:'FirstPersonPresentation',binding:'firstPerson.presentation',value:'arms'}],nodes:[],edges:[],comments:[],logicScene:{root:{id:'root'},elements:[],components:[]},characterPawn:{playerId:1,spawn:{},firstPerson:{weapon:{},thirdPerson:{}},movement:{}}},
  });
  require('../js/runtime/fps-arena-level-template.js');
  const blank={version:1,counter:0,transforms:{},props:{},deleted:[],added:[],env:{},player:{},ui:{},logic:{}};
  const scene=global.LK_RUNTIME_FPS_ARENA_LEVEL_TEMPLATE.buildScene(blank);
  const weapons=scene.added.filter(entry=>entry&&entry.graph&&entry.graph.weaponPickup);
  assert.equal(weapons.length,5,'the arena authors five ground weapons');
  assert.ok(weapons.every(entry=>entry.kind==='logicElement'&&entry.templateGroup==='10 Pickups and Interactables'));
  assert.equal(scene.added.some(entry=>entry.kind==='primitive'&&entry.item&&entry.item.kind==='weapon'),false);
  assert.equal(scene.template.version,6);
  const cache=weapons.find(entry=>entry.name==='Assault Rifle - Cache');
  assert.equal(cache.graph.variables.find(variable=>variable.name==='WeaponPreset').value,'rifle');
  assert.equal(cache.graph.variables.find(variable=>variable.name==='RespawnSeconds').value,40);
});
