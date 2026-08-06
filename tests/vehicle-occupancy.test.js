'use strict';

// Every vehicle boards with the same controls, whatever runtime drives it.
// Driving physics is explicitly NOT part of this contract.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../js/runtime/vehicle-occupancy.js');
const OCC = global.LK_RUNTIME_VEHICLE_OCCUPANCY;

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}
const owner = () => ({isObject3D:true});
const sketchbookCar = () => ({pawnType:'sketchbook-car', owner:owner(), config:{}, parts:{seats:[
  {id:'d', type:'driver', occupiedBy:null, reservedBy:null},
  {id:'p', type:'passenger', occupiedBy:null, reservedBy:null},
]}});
const nativeCar = () => ({id:'native-player-car', kind:'native-adapter', pawnType:'vehicle', owner:owner(), config:{}});
const logicVehicle = () => ({kind:'logic-element', pawnType:'logic-vehicle', owner:owner(), config:{wheels:[{}]}});

test('a vehicle is boardable because it has a seat, not because of its pawn type', () => {
  assert.equal(OCC.isEnterable(sketchbookCar()), true);
  assert.equal(OCC.isEnterable(nativeCar()), true, 'the native player car must board like any other vehicle');
  assert.equal(OCC.isEnterable(logicVehicle()), true, 'a Logic Vehicle Pawn must board like any other vehicle');
  assert.equal(OCC.isEnterable({pawnType:'sketchbook-advanced-character', owner:owner(), config:{}}), false,
    'a character is not a vehicle');
  assert.equal(OCC.isEnterable({kind:'logic-element', owner:owner(), config:{}}), false,
    'a Logic Element that does not drive is not a vehicle');
  assert.equal(OCC.isEnterable(null), false);
});

test('a vehicle can refuse entry without changing the contract', () => {
  assert.equal(OCC.isEnterable(Object.assign(nativeCar(), {enabled:false})), false);
  assert.equal(OCC.isEnterable(Object.assign(nativeCar(), {hidden:true})), false, 'an invisible parked vehicle is neither an obstacle nor an entry target');
  assert.equal(OCC.isEnterable(Object.assign(nativeCar(), {disposed:true})), false);
  assert.equal(OCC.isEnterable({id:'native-player-car', kind:'native-adapter', pawnType:'vehicle', owner:owner(), config:{entry:{enabled:false}}}), false);
  // Hydration is readiness, not capability: the caller prepares the vehicle and
  // re-checks. Rejecting it here would stop it ever preparing.
  const hydrating = Object.assign(sketchbookCar(), {assetHydrationState:'pending'});
  assert.equal(OCC.isEnterable(hydrating), true, 'a not-yet-prepared vehicle is still a vehicle');
});

test('seats are live records: occupancy written by either side is seen by both', () => {
  const car = nativeCar();
  const first = OCC.seatsOf(car);
  assert.equal(first.length, 1);
  assert.equal(first[0].type, 'driver');
  assert.equal(OCC.seatsOf(car), first, 'the same record set is returned, not a fresh copy');

  assert.equal(OCC.availableSeats(car, 'driver').length, 1);
  first[0].occupiedBy = {id:'character'};
  assert.equal(OCC.availableSeats(car, 'driver').length, 0, 'a taken seat is no longer offered');
  assert.equal(OCC.isFree(first[0]), false);

  first[0].occupiedBy = null;
  first[0].reservedBy = {id:'other'};
  assert.equal(OCC.isFree(first[0]), false, 'a reserved seat is not free for someone else');
  assert.equal(OCC.isFree(first[0], first[0].reservedBy), true, 'but it is free for whoever reserved it');
});

test('roles are honoured and unknown roles never resolve to the driver seat', () => {
  const car = sketchbookCar();
  assert.equal(OCC.availableSeats(car, 'driver').length, 1);
  assert.equal(OCC.availableSeats(car, 'passenger').length, 1);
  assert.equal(OCC.availableSeats(car, 'nonsense').length, 1,
    'an unknown role falls back to passenger, never to the driver seat');
  assert.equal(OCC.availableSeats(car, 'nonsense')[0].type, 'passenger');
});

test('the synthetic seat follows a rebuilt owner instead of a disposed one', () => {
  const car = nativeCar();
  const before = OCC.seatsOf(car)[0].node;
  const rebuilt = owner();
  car.owner = rebuilt;
  assert.equal(OCC.seatsOf(car)[0].node, rebuilt, 'the seat anchor must track the current owner');
  assert.notEqual(before, rebuilt);
});

test('entry Use must be released before the same control can exit', () => {
  const car=nativeCar();
  OCC.requireExitInputRelease(car);
  assert.equal(OCC.consumeExitInput(car,true),false,'the held entry press is not a new exit');
  assert.equal(OCC.consumeExitInput(car,true),false,'holding remains inert');
  assert.equal(OCC.consumeExitInput(car,false),false,'release arms the next edge without firing it');
  assert.equal(OCC.consumeExitInput(car,true),true,'a fresh press exits exactly once');
  assert.equal(OCC.consumeExitInput(car,true),false,'the fresh press is edge-triggered');
});

test('seat profiles are isolated by family and exact vehicle asset', () => {
  const helicopter={pawnType:'sketchbook-helicopter',type:'helicopter',owner:owner(),config:{asset:{key:'builtin:sketchbook/helicopter'}},parts:{seats:[]}};
  const imported={kind:'logic-element',pawnType:'vehicle',owner:owner(),config:{wheels:[{}],asset:{key:'user:vehicles/red-heli'}}};
  assert.deepEqual(OCC.vehicleProfileKeys(helicopter),['asset:builtin:sketchbook/helicopter','family:sketchbook-helicopter','default']);
  assert.deepEqual(OCC.vehicleProfileKeys(imported),['asset:user:vehicles/red-heli','family:native-and-logic-vehicles','default']);
  const character={config:{vehicleSeating:{profiles:{'family:sketchbook-helicopter':{position:[1,2,3]}}}}};
  assert.deepEqual(OCC.seatProfile(character,helicopter,{synthetic:false}).position,[1,2,3]);
  character.config.vehicleSeating.profiles['asset:user:vehicles/red-heli']={position:[-.2,-.4,.1]};
  const exact=OCC.seatProfile(character,imported,{synthetic:true},true);
  exact.position[0]=9;
  assert.deepEqual(character.config.vehicleSeating.profiles['family:sketchbook-helicopter'].position,[1,2,3],
    'authoring an exact custom vehicle cannot mutate the helicopter family');
});

test('an imported native Player Car resolves the exact Pawn Studio profile through every saved alias', () => {
  const model=owner(),car=owner();car.userData={modelDbKey:'glb:high-poly-car-v3:30952800',modelName:'high_poly_car_v3'};
  const native=Object.assign(nativeCar(),{owner:car,assetRoot:()=>model});
  assert.deepEqual(OCC.vehicleProfileKeys(native),[
    'asset:glb:high-poly-car-v3:30952800','asset:high_poly_car_v3','family:native-and-logic-vehicles','default',
  ]);
  const exact={schemaVersion:5,position:[.18,-.37,.41],asset:{id:'asset-library-high-poly',dbKey:'glb:high-poly-car-v3:30952800'}};
  const character={config:{vehicleSeating:{profiles:{'asset:asset-library-high-poly':exact}}}};
  const resolved=OCC.seatProfile(character,native,{node:car,synthetic:true},false);
  assert.deepEqual(resolved.position,[.18,-.37,.41],'the existing id-keyed profile wins through its stored dbKey alias');
  assert.equal(resolved.key,'asset:asset-library-high-poly');
  assert.equal(OCC.vehicleAssetRoot(native),model,'the fitted imported model is the shared synthetic-seat root');
  assert.equal(OCC.seatAnchor(native,{node:car,synthetic:true}),model,'Play cannot fall back to the outer physics container');
});

test('a broken provider cannot make every vehicle unenterable', () => {
  OCC.registerProvider({id:'explodes', priority:1000, match(){ throw new Error('boom'); }, seats(){ return []; }});
  assert.equal(OCC.isEnterable(nativeCar()), true, 'a throwing provider is skipped, not fatal');
  OCC.registerProvider({id:'explodes', priority:-1000, match:() => false, seats:() => []});
});

test('the hardcoded pawn-type gate is gone from the entry scan', () => {
  const source = read('js/runtime/sketchbook-pawns.js');
  assert.ok(!source.includes("!/^sketchbook-(?:car|airplane|helicopter)$/.test(String(candidate.pawnType||''))"),
    'entry must not be gated on a hardcoded vehicle pawn-type list');
  assert.ok(source.includes('occupancy.isEnterable(candidate)'), 'entry must use the shared capability check');
  assert.ok(source.includes('occupancy.seatsOf(vehicle)'), 'seat lookup must use the shared contract');
});

test('the contract never touches driving physics', () => {
  // Comments are allowed to *say* physics; the code must not touch it.
  const code = read('js/runtime/vehicle-occupancy.js')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  [/\bvelocity\b/, /\bwheelInfos\b/, /\bsuspension\b/, /applyEngineForce/, /\bsetBrake\b/, /\bbody\./].forEach(pattern => {
    assert.ok(!pattern.test(code), 'occupancy must not reach into physics: ' + pattern);
  });
});

test('the contract reaches every shell and the lazy loader', () => {
  ['engine_editor.html', 'gameplay.html', 'test-editor.html'].forEach(file => {
    const html = read(file);
    const occupancy = html.indexOf('js/runtime/vehicle-occupancy.js');
    const sketchbook = html.indexOf('js/runtime/sketchbook-pawns.js');
    assert.ok(occupancy > 0, file + ' must load the occupancy contract');
    assert.ok(occupancy < sketchbook, file + ' must load the contract before its first consumer');
  });
  assert.ok(read('js/editor/loader.js').includes('js/runtime/vehicle-occupancy.js'),
    'the lazy editor loader must provide the contract too');
});

console.log('vehicle-occupancy.test.js: all assertions passed');
