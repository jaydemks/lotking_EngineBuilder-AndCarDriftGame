'use strict';

// The DollBody vehicle rig, checked against the real bundled GLBs in a real
// browser. The offline suite builds rigs shaped like the bundled ones; this
// applies the actual Open World template, waits for the actual models, and then
// measures what a player would see:
//
//   - every vehicle is a metre-scale vehicle, not a toy beside a 1.8 m character;
//   - the raycast wheels match the wheels that are drawn;
//   - doors swing out of the cabin;
//   - propellers and rotors turn on their own shafts, and the mounts do not move.

const {test, expect} = require('@playwright/test');

test('bundled vehicles load at metre scale with a correct moving rig', async ({page}) => {
  test.setTimeout(420000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({mode:'browser', onlineEditor:true, workspaceReady:true}));
  });
  await page.goto('/engine_editor.html?dollbody-rig-e2e=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => !!(
    window.LK_STORE && window.LK_STORE.levels &&
    window.LK_RUNTIME_SKETCHBOOK_OPEN_WORLD_LEVEL_TEMPLATE &&
    window.LK_RUNTIME_SKETCHBOOK_PAWNS &&
    window.LOT_KING && LOT_KING.systems && LOT_KING.systems.sketchbookPawns
  ));

  // Only the three vehicle Logic Elements, on a flat ground. The 26 MB Open
  // World is what `sketchbook-play-probe.spec.js` already covers; the rig only
  // needs the real vehicle GLBs and the real Logic Element path.
  await page.evaluate(async () => {
    await Promise.resolve(LK_STORE.ready);
    const pack = window.LK_LOGIC_TEMPLATES;
    const place = (kind, x) => {
      const template = pack.get('logic-template-sketchbook-' + kind);
      const graph = JSON.parse(JSON.stringify(template.graph));
      graph.sketchbookPawn.spawn = {x, y:1, z:0, heading:0};
      graph.sketchbookPawn.playerId = -1;
      graph.sketchbookPawn.possessed = false;
      return {
        id:'rig_' + kind, kind:'logicElement', name:'Rig ' + kind, collide:false, graph,
        enabled:true, runInEditorPreview:true,
        asset:{key:'logic:template:logic-template-sketchbook-' + kind, name:'Rig ' + kind, source:'test'},
        t:{p:[x, 1, 0], r:[0, 0, 0], s:[1, 1, 1], v:true},
      };
    };
    const scene = {version:1, counter:0, transforms:{}, props:{}, deleted:[], added:[
      {id:'rig_ground', kind:'primitive', name:'Ground', shape:'box', collide:true, color:'#6b7280',
        t:{p:[0, -.5, 0], r:[0, 0, 0], s:[220, 1, 220], v:true}},
      place('car', -14), place('airplane', 0), place('helicopter', 18),
    ], env:{}, player:{enabled:false, hidden:true, controllerIndex:null}, ui:{}, logic:{}};
    await LK_STORE.apply(LOT_KING, scene, {strict:true});
    const owners = LOT_KING.world.registry.filter(o => o && o.userData && o.userData.editorType === 'logicElement');
    await Promise.all(owners.map(o => Promise.resolve(o.userData.logicElementAssetReady).catch(() => null)));
  });
  // Size is measured here, on the loaded model, and not after Play: suspension
  // travel drops the wheels and a spinning propeller sweeps a wider box, so the
  // running frame is the wrong place to ask how big the model is.
  const sizes = await page.evaluate(() => {
    const out = {};
    LOT_KING.world.registry.forEach(owner => {
      const id = owner && owner.userData && owner.userData.editorId;
      if(!id || String(id).indexOf('rig_') !== 0) return;
      owner.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(owner).getSize(new THREE.Vector3());
      out[String(id).slice(4)] = Number(Math.max(size.x, size.y, size.z).toFixed(2));
    });
    return out;
  });

  // A Logic Element only builds its Pawn in Play, so the rig is measured on the
  // running game rather than on the editor scene.
  await page.evaluate(() => document.getElementById('lkPlay').click());
  await page.waitForFunction(() => {
    const button = document.getElementById('lkPlay');
    return !!(LOT_KING.state.started && LOT_KING.state.editorPreview && button && /STOP/.test(button.textContent || ''));
  }, null, {timeout:180000});
  await page.waitForTimeout(3000);

  const result = await page.evaluate(async () => {
    const RIG = window.LK_RUNTIME_SKETCHBOOK_PAWNS;
    const wanted = {'sketchbook-car':'car', 'sketchbook-airplane':'airplane', 'sketchbook-helicopter':'helicopter'};
    const report = {};
    LOT_KING.pawns.list().forEach(pawn => {
      const kind = wanted[String(pawn && pawn.pawnType || '')];
      if(!kind || report[kind] || !pawn.owner) return;
      const owner = pawn.owner;
      owner.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(owner).getSize(new THREE.Vector3());
      const entry = {
        longest:Number(Math.max(size.x, size.y, size.z).toFixed(2)),
        // Anything named like a mount must never be in a moving-part list.
        mountsTreatedAsParts:[].concat(pawn.parts.rotors, pawn.parts.ailerons, pawn.parts.elevators, pawn.parts.rudders)
          .filter(node => /parent|pivot|mount/i.test(node.name)).map(node => node.name),
        rotors:pawn.parts.rotors.length,
        wheels:pawn.parts.wheels.length,
        doors:(pawn.parts.seats || []).filter(seat => seat.door).length,
        collisionShapes:pawn.body ? pawn.body.shapes.length : 0,
      };

      // Wheels: the raycast radius has to match the wheel that is drawn.
      if(pawn.vehicle && pawn.parts.wheels.length){
        entry.wheelRadiusMatchesVisual = pawn.vehicle.wheelInfos.every((wheel, index) => {
          const node = pawn.parts.wheels[index];
          if(!node) return false;
          const box = RIG.localGeometryBox(node);
          if(!box) return false;
          const local = box.getSize(new THREE.Vector3()).toArray().sort((a, b) => b - a);
          const worldScale = node.getWorldScale(new THREE.Vector3(1, 1, 1));
          const drawn = local[1] * .5 * (Math.abs(worldScale.x) + Math.abs(worldScale.y) + Math.abs(worldScale.z)) / 3;
          return Math.abs(wheel.radius - drawn) < Math.max(.03, drawn * .12);
        });
      }

      // Doors: open each one through the runtime and check it left the body.
      const doors = (pawn.parts.seats || []).filter(seat => seat.door);
      if(doors.length){
        entry.doorsOpenOutward = doors.every(seat => {
          const door = seat.door, node = door.node;
          const box = RIG.localGeometryBox(node);
          const tip = box
            ? new THREE.Vector3(0, 0, box.getCenter(new THREE.Vector3()).z * 2)
            : new THREE.Vector3(0, 0, -.5);
          // Sampled in the OWNER local frame: the car is a live physics body, so
          // a world-space delta would also contain the body settling and turning.
          const localTip = () => {
            node.updateMatrixWorld(true);
            return owner.worldToLocal(node.localToWorld(tip.clone()));
          };
          pawn.afterPhysics(1 / 60);
          const closed = localTip();
          const outward = Math.sign(node.position.x) || 1;
          door.rotation = .9; door.target = .9; door.hold = 2;
          pawn.afterPhysics(1 / 60);
          const open = localTip();
          door.rotation = 0; door.target = 0; door.hold = 0;
          pawn.afterPhysics(1 / 60);
          return (open.x - closed.x) * outward > .04;
        });
      }

      // Rotors: turn about their own shaft, and that shaft is a real axis of the
      // aircraft rather than a diagonal. Read in the AIRCRAFT frame - it is a
      // live physics body, so it has already pitched and rolled on its wheels
      // and a world-space axis would answer a different question.
      const inAircraftFrame = node => {
        owner.updateMatrixWorld(true); node.updateMatrixWorld(true);
        return owner.getWorldQuaternion(new THREE.Quaternion()).invert()
          .multiply(node.getWorldQuaternion(new THREE.Quaternion()));
      };
      if(pawn.parts.rotors.length){
        entry.rotorAxes = pawn.parts.rotors.map(node => {
          const axis = RIG.spinAxis(node);
          const local = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0)
            .applyQuaternion(inAircraftFrame(node));
          const m = Math.max(Math.abs(local.x), Math.abs(local.y), Math.abs(local.z));
          return {aligned:m > .95, axis:m === Math.abs(local.x) ? 'X' : (m === Math.abs(local.y) ? 'Y' : 'Z')};
        });
        const rest = pawn.parts.rotors.map(node => node.getWorldQuaternion(new THREE.Quaternion()));
        RIG.spinParts(pawn.parts.rotors, 1 / 60, 12);
        entry.rotorsTurned = pawn.parts.rotors.every((node, index) => {
          node.updateMatrixWorld(true);
          return node.getWorldQuaternion(new THREE.Quaternion()).angleTo(rest[index]) > 1e-3;
        });
      }

      // Control surfaces: the flap deflects and the wing mount holds still.
      const surfaces = [].concat(pawn.parts.ailerons, pawn.parts.elevators, pawn.parts.rudders);
      if(surfaces.length){
        const mounts = [];
        owner.traverse(node => { if(/parent|pivot|mount/i.test(node.name)) mounts.push({node, q:node.quaternion.clone()}); });
        const before = surfaces.map(node => node.quaternion.clone());
        pawn.controlSurfaces = {aileron:.6, elevator:.5, rudder:.4};
        pawn.afterPhysics(1 / 60);
        entry.surfacesDeflected = surfaces.every((node, index) => node.quaternion.angleTo(before[index]) > 1e-3);
        entry.mountsHeldStill = mounts.every(item => item.node.quaternion.equals(item.q));
        if(pawn.parts.ailerons.length === 2){
          // Trailing-edge travel along the AIRCRAFT's own up axis, for the same
          // reason: the plane is not sitting perfectly level.
          const lift = node => {
            const box = RIG.localGeometryBox(node);
            const centre = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
            const chord = s.x < s.z ? 'x' : 'z';
            const tip = centre.clone(); tip[chord] += s[chord];
            const local = () => {
              node.updateMatrixWorld(true);
              return owner.worldToLocal(node.localToWorld(tip.clone()));
            };
            const deflected = local();
            const base = node.userData.sketchbookBaseQuaternion, held = node.quaternion.clone();
            node.quaternion.set(base.x, base.y, base.z, base.w);
            const at = local();
            node.quaternion.copy(held);
            node.updateMatrixWorld(true);
            return deflected.y - at.y;
          };
          entry.aileronsOpposed = lift(pawn.parts.ailerons[0]) * lift(pawn.parts.ailerons[1]) < 0;
        }
      }
      report[kind] = entry;
    });
    return {report, expectedFit:{
      car:window.LK_LOGIC_TEMPLATES_SKETCHBOOK.ASSETS.car.fit,
      airplane:window.LK_LOGIC_TEMPLATES_SKETCHBOOK.ASSETS.airplane.fit,
      helicopter:window.LK_LOGIC_TEMPLATES_SKETCHBOOK.ASSETS.helicopter.fit,
    }};
  });

  const {report, expectedFit} = result;
  ['car', 'airplane', 'helicopter'].forEach(kind => {
    expect(report[kind], kind + ' pawn was not found in the applied scene').toBeTruthy();
    const entry = report[kind];
    expect(entry.mountsTreatedAsParts, kind + ' mounts must never be animated as parts').toEqual([]);
    // Rendered at the metre scale the asset asks for, so a person fits the door.
    expect(sizes[kind], kind + ' rendered size').toBeCloseTo(expectedFit[kind], 1);
    expect(entry.collisionShapes, kind + ' must build its bundled collision metadata').toBeGreaterThan(1);
  });

  // The whole point of the scale fix: a car is a car next to a 1.8 m character.
  expect(sizes.car, 'a DollBody car must be a real car length').toBeGreaterThan(4);
  expect(report.car.wheels).toBe(4);
  expect(report.car.wheelRadiusMatchesVisual, 'the raycast wheels must match the drawn wheels').toBe(true);
  expect(report.car.doors).toBeGreaterThan(0);
  expect(report.car.doorsOpenOutward, 'car doors must swing out of the cabin').toBe(true);

  expect(report.airplane.rotors).toBe(1);
  expect(report.airplane.rotorAxes.every(entry => entry.aligned), 'the propeller shaft must be a real axis').toBe(true);
  expect(report.airplane.rotorAxes[0].axis, 'a propeller spins on the fuselage axis').toBe('Z');
  expect(report.airplane.rotorsTurned).toBe(true);
  expect(report.airplane.surfacesDeflected).toBe(true);
  expect(report.airplane.mountsHeldStill, 'deflecting a flap must not move the wing').toBe(true);
  expect(report.airplane.aileronsOpposed, 'ailerons must deflect in opposite directions').toBe(true);

  expect(report.helicopter.rotors).toBe(2);
  expect(report.helicopter.rotorAxes.every(entry => entry.aligned)).toBe(true);
  // One rotor lifts, the other counters torque: a vertical shaft and a lateral one.
  expect(report.helicopter.rotorAxes.map(entry => entry.axis).sort()).toEqual(['X', 'Y']);
  expect(report.helicopter.rotorsTurned).toBe(true);
  expect(report.helicopter.doorsOpenOutward, 'helicopter doors must swing out of the cabin').toBe(true);

  expect(pageErrors).toEqual([]);
});
