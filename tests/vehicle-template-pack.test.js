'use strict';
const assert=require('node:assert/strict');
global.window=global;
require('../js/logic/logic-graph.js');
require('../js/logic/logic-templates.js');
require('../js/logic/logic-templates-sketchbook.js');
require('../js/logic/logic-templates-vehicle-pack.js');

const PACK=global.LK_LOGIC_TEMPLATES_VEHICLE_PACK,REGISTRY=global.LK_LOGIC_TEMPLATES;
assert.ok(PACK);assert.equal(PACK.SPECS.length,10);
const ids=PACK.SPECS.map(spec=>spec.id);
assert.deepEqual(ids,['small-boat','medium-boat','ship','truck','trailer','sport-motorcycle','dirt-bike','scooter','bmx','mountain-bike']);

for(const profile of PACK.RIG_PROFILES)for(const spec of PACK.SPECS){
  const id='logic-template-vehicle-'+profile+'-'+spec.id,template=REGISTRY.get(id);
  assert.ok(template,id+' must be registered');assert.equal(template.graph.vehiclePawn.rigProfile,profile);
  assert.equal(template.graph.vehiclePawn.archetype,spec.id);assert.equal(template.graph.vehiclePawn.vehicleClass,spec.className);
  assert.ok(template.graph.logicScene.elements.some(element=>element.vehicleRigRole==='seat-driver'),id+' needs a driver-seat dummy');
  assert.ok(template.graph.logicScene.elements.some(element=>element.vehicleRigRole==='camera'),id+' needs a camera dummy');
  const cameraRoles=template.graph.logicScene.elements.filter(element=>element.cameraRigRole).map(element=>element.cameraRigRole).sort();
  assert.deepEqual(cameraRoles,['vehicle-external','vehicle-interior'],id+' needs persistent external and interior camera dummies');
  assert.ok(template.graph.logicScene.elements.some(element=>element.vehicleRigRole==='damage-fuel-tank'),id+' needs an editable damage dummy');
  assert.ok(template.graph.variables.some(variable=>variable.name==='ModelAsset'&&variable.type==='asset'),id+' must accept a replacement GLB');
  assert.ok(template.graph.variables.some(variable=>variable.name==='RigProfile'&&variable.value===profile),id+' exposes its export contract');
  const elementIds=template.graph.logicScene.elements.map(element=>element.id);
  assert.equal(new Set(elementIds).size,elementIds.length,id+' placeholder ids must be unique');
}

for(const kind of ['airplane','helicopter']){
  const template=REGISTRY.get('logic-template-vehicle-normal-'+kind);
  assert.ok(template,'normal '+kind+' Logic Element is required');
  assert.equal(template.graph.sketchbookPawn.rigProfile,'normal');assert.equal(template.graph.sketchbookPawn.modelAsset,null);
  assert.ok(template.graph.logicScene.elements.some(element=>element.vehicleRigRole==='fuselage'));
  assert.deepEqual(template.graph.logicScene.elements.filter(element=>element.cameraRigRole).map(element=>element.cameraRigRole).sort(),['vehicle-external','vehicle-interior']);
}
const boat=REGISTRY.get('logic-template-vehicle-normal-small-boat').graph.vehiclePawn;
assert.equal(boat.physicsBackend,'arcade-fallback');assert.equal(boat.watercraft.enabled,true);
const truck=REGISTRY.get('logic-template-vehicle-normal-truck').graph.vehiclePawn;
assert.equal(truck.wheels.length,6);assert.equal(truck.towing.enabled,true);
const trailer=REGISTRY.get('logic-template-vehicle-normal-trailer').graph.vehiclePawn;
assert.equal(trailer.entry.enabled,false);assert.equal(trailer.towable.enabled,true);
const trailerScene=REGISTRY.get('logic-template-vehicle-normal-trailer').graph.logicScene;
assert.deepEqual(trailerScene.elements.find(element=>element.id==='tow_coupler').position,trailer.towable.coupler.position,
  'the editable coupler dummy and runtime constraint use one position');
const truckScene=REGISTRY.get('logic-template-vehicle-normal-truck').graph.logicScene;
assert.deepEqual(truckScene.elements.find(element=>element.id==='driver_seat').position,[-.42,1.65,1.75],
  'an asymmetric authored seat keeps its lateral placement');

const first=PACK.makeTemplates(),second=PACK.makeTemplates();first[0].graph.logicScene.elements[0].position[0]=999;
assert.notEqual(second[0].graph.logicScene.elements[0].position[0],999,'generated Logic Elements cannot share mutable placeholder transforms');
console.log('vehicle-template-pack.test.js: all assertions passed');
