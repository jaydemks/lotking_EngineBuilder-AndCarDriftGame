'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const SCHEMA=require('../js/runtime/world/procedural-world-schema.js');
const TERRAIN=require('../js/runtime/world/procedural-terrain.js');
const WATER=require('../js/runtime/world/procedural-water.js');
const ARCHIPELAGO=require('../js/runtime/world/procedural-archipelago.js');
function test(name,fn){try{fn();console.log('ok - '+name);}catch(error){console.error('not ok - '+name);throw error;}}

test('new worlds keep authored Y=0 while the collidable procedural stack stays below it',()=>{
  const value=SCHEMA.normalize(null);assert.equal(value.schemaVersion,2);assert.equal(value.enabled,true);assert.equal(value.datum.mode,'preserve-authored');assert.equal(value.datum.authoredY,0);assert.equal(value.datum.islandTopY,-6);assert.equal(value.ocean.seaLevel,-14);assert.equal(value.datum.seabedY,-28);
});
test('the untouched v1 stack migrates down once while custom elevations survive',()=>{
  const migrated=SCHEMA.normalize({schemaVersion:1,datum:{authoredY:0,islandTopY:0,seabedY:-22},ocean:{seaLevel:-8},waterBodies:[{type:'lake',level:.1}]});assert.equal(migrated.datum.islandTopY,-6);assert.equal(migrated.ocean.seaLevel,-14);assert.equal(migrated.datum.seabedY,-28);assert.equal(migrated.waterBodies[0].level,-5.9);assert.deepEqual(SCHEMA.normalize(migrated),migrated,'v2 migration is idempotent');
  const custom=SCHEMA.normalize({schemaVersion:1,datum:{authoredY:0,islandTopY:-3,seabedY:-30},ocean:{seaLevel:-12}});assert.equal(custom.datum.islandTopY,-3);assert.equal(custom.ocean.seaLevel,-12);assert.equal(custom.datum.seabedY,-30);
});
test('opt-out, quality and inland water survive normalization',()=>{
  const value=SCHEMA.normalize({enabled:false,terrain:{quality:'ultra'},waterBodies:[{type:'lake',center:[4,8],radius:17},{type:'river',points:[[0,0],[5,9]],width:3}]});assert.equal(value.enabled,false);assert.equal(value.terrain.quality,'ultra');assert.deepEqual(value.waterBodies.map(body=>body.type),['lake','river']);assert.deepEqual(value.waterBodies[0].center,[4,8]);
});
test('the protected authored footprint is exactly flat at Y=0',()=>{
  const field=TERRAIN.createField({bounds:{cx:10,cz:-5,halfX:80,halfZ:45},top:0,seaLevel:-8,seabedY:-22,shoreWidth:90,relief:14,seed:42});for(const point of [[10,-5],[-69,-49],[89,39],[0,20]])assert.equal(field.heightAt(point[0],point[1]),0);assert.ok(Math.abs(field.heightAt(90.001,-5))<.02,'the coast must leave the plateau continuously');
});
test('terrain is deterministic, finite and reaches below the ocean outside the island',()=>{
  const spec={bounds:{cx:0,cz:0,halfX:70,halfZ:60},top:0,seaLevel:-8,seabedY:-22,shoreWidth:80,relief:12,seed:1337},a=TERRAIN.createField(spec),b=TERRAIN.createField(spec);for(let x=-220;x<=220;x+=11)for(let z=-220;z<=220;z+=13){assert.equal(a.heightAt(x,z),b.heightAt(x,z));assert.ok(Number.isFinite(a.heightAt(x,z)));}assert.ok(a.heightAt(210,0)<a.seaLevel);assert.equal(a.sample(0,0).region,'plateau');assert.equal(a.sample(210,0).region,'seabed');
});
test('Cannon heightfield samples are generated from the same terrain field',()=>{
  const field=TERRAIN.createField({bounds:{cx:5,cz:7,halfX:50,halfZ:50},top:0,seaLevel:-7,seabedY:-20,shoreWidth:60,relief:9,seed:7}),grid=TERRAIN.physicsGrid(field,'low');for(let ix=0;ix<grid.segments;ix+=8)for(let iz=0;iz<grid.segments;iz+=8){const x=grid.originX+ix*grid.elementSize,z=grid.originZ-iz*grid.elementSize;assert.equal(grid.matrix[ix][iz],field.heightAt(x,z));}
});
test('water waves remain bounded and deterministic across renderer backends',()=>{
  const cfg=SCHEMA.normalize(null).ocean,a=WATER.waveSample(12,-4,3.2,cfg,4),b=WATER.waveSample(12,-4,3.2,cfg,4);assert.deepEqual(a,b);assert.ok(Number.isFinite(a.height+a.dx+a.dz));assert.ok(Math.abs(a.height)<=cfg.waveAmplitude*2);
});
test('distant island layout is seeded, bounded and one item per configured island',()=>{
  const cfg=Object.assign({seed:12},SCHEMA.normalize(null).archipelago),bounds={cx:0,cz:0,halfX:120,halfZ:100},a=ARCHIPELAGO.layout(cfg,bounds,-8),b=ARCHIPELAGO.layout(cfg,bounds,-8);assert.deepEqual(a,b);assert.equal(a.length,cfg.count);assert.ok(a.every(item=>Number.isFinite(item.x+item.y+item.z+item.size+item.height)&&Math.hypot(item.x,item.z)>Math.max(bounds.halfX,bounds.halfZ)));
});
test('all runtime shells and portable exports discover the categorized world modules',()=>{
  const refs=['procedural-world-schema.js','procedural-terrain.js','procedural-water.js','procedural-archipelago.js','procedural-world-system.js'];for(const file of ['engine_editor.html','gameplay.html','test-editor.html','scripts.list']){const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');refs.forEach(ref=>assert.ok(source.includes(ref),file+' misses '+ref));}const store=fs.readFileSync(path.join(__dirname,'../js/engine/scene-store.js'),'utf8');assert.ok(store.includes('d.proceduralWorld='));assert.ok(store.includes('proceduralWorld.rebuildFromScene(data)'));assert.ok(store.includes('physics.rebuild(true)'));
});

console.log('\nprocedural world tests passed');
