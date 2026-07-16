/* =========================================================
   LOT KING - Soccer stadium level builder
   Generates the editor entity descriptors for a penalty-ready
   soccer stadium: regulation pitch markings and goal frames
   (7.32 x 2.44, penalty spot at 11 m), stands with placeholder
   fans, entrances, corner/stadium flags and floodlights.
   Pure data: the editor add-action turns descriptors into
   normal editable primitives/lights that save with the level.
   ========================================================= */
(function(){
'use strict';

// Regulation measures (meters).
const SPEC = Object.freeze({
  fieldLength:105, fieldWidth:68,
  goalWidth:7.32, goalHeight:2.44, postRadius:.06,
  penaltySpot:11, penaltyAreaDepth:16.5, penaltyAreaWidth:40.32,
  goalAreaDepth:5.5, goalAreaWidth:18.32,
  centerCircleRadius:9.15,
});

const LINE_H = .022;       // marking thickness above grass
const LINE_W = .12;        // marking width
const FAN_COLORS = ['#e11d48', '#2563eb', '#f59e0b', '#10b981', '#f8fafc', '#a855f7', '#f97316'];

function prim(primitive, name, p, s, options){
  const o = options || {};
  return Object.assign({
    kind:'primitive', prim:primitive, name:'Stadium - ' + name,
    t:{p:[p[0], p[1], p[2]], r:o.r || [0,0,0], s:[s[0], s[1], s[2]], v:true},
    color:o.color || '#8899aa',
    roughness:o.roughness != null ? o.roughness : .85,
    metalness:o.metalness != null ? o.metalness : 0,
    collide:o.collide === true,
    driveSurface:o.driveSurface === true,
  }, o.extra || {});
}
function light(kindName, name, p, options){
  const o = options || {};
  return {kind:'light', light:kindName, name:'Stadium - ' + name, t:{p:[p[0], p[1], p[2]], r:[0,0,0], s:[1,1,1], v:true}, lightProps:o.props || null};
}

// Primitive base sizes in scene-store: box 2x2x2 (mesh center y=1*s.y),
// cylinder r1 h2, sphere r1.2, plane 4x4 (flat at y~0).
function box(name, center, size, options){
  return prim('box', name, [center[0], center[1], center[2]], [size[0] / 2, size[1] / 2, size[2] / 2], options);
}
function cylinder(name, base, radius, height, options){
  return prim('cylinder', name, base, [radius, height / 2, radius], options);
}

function marking(name, center, size){
  // Flat white box sitting just above the grass.
  return box(name, [center[0], 0, center[1]], [size[0], LINE_H, size[1]], {color:'#f4f6f2', roughness:.6});
}

function buildEntries(origin){
  const ox = origin && Number(origin.x) || 0;
  const oz = origin && Number(origin.z) || 0;
  const entries = [];
  const halfL = SPEC.fieldLength / 2, halfW = SPEC.fieldWidth / 2;

  // ---- Pitch and surroundings ------------------------------------------
  entries.push(prim('plane', 'Pitch Grass', [ox, 0, oz], [(SPEC.fieldWidth + 10) / 4, 1, (SPEC.fieldLength + 10) / 4], {color:'#1e7d38', roughness:.95, driveSurface:true}));
  entries.push(prim('plane', 'Outer Apron', [ox, -.02, oz], [(SPEC.fieldWidth + 46) / 4, 1, (SPEC.fieldLength + 46) / 4], {color:'#20242c', roughness:1, driveSurface:true}));

  // ---- Markings ---------------------------------------------------------
  entries.push(marking('Touchline West', [ox - halfW, oz], [LINE_W, SPEC.fieldLength]));
  entries.push(marking('Touchline East', [ox + halfW, oz], [LINE_W, SPEC.fieldLength]));
  entries.push(marking('Goal Line North', [ox, oz + halfL], [SPEC.fieldWidth, LINE_W]));
  entries.push(marking('Goal Line South', [ox, oz - halfL], [SPEC.fieldWidth, LINE_W]));
  entries.push(marking('Halfway Line', [ox, oz], [SPEC.fieldWidth, LINE_W]));
  entries.push(cylinder('Center Spot', [ox, .005, oz], .18, .02, {color:'#f4f6f2', roughness:.6}));

  const circleSegments = 20;
  for(let i = 0; i < circleSegments; i++){
    const angle = i / circleSegments * Math.PI * 2;
    const cx = ox + Math.cos(angle) * SPEC.centerCircleRadius;
    const cz = oz + Math.sin(angle) * SPEC.centerCircleRadius;
    const segment = box('Center Circle ' + (i + 1), [cx, 0, cz], [LINE_W, LINE_H, 2.9], {color:'#f4f6f2', roughness:.6});
    segment.t.r = [0, -angle, 0];
    entries.push(segment);
  }

  // Per-end markings: penalty area, goal area, penalty spot, penalty arc.
  [1, -1].forEach(side => {
    const endName = side > 0 ? 'North' : 'South';
    const goalZ = oz + side * halfL;
    const areaZ = goalZ - side * SPEC.penaltyAreaDepth;
    entries.push(marking('Penalty Area Front ' + endName, [ox, areaZ], [SPEC.penaltyAreaWidth, LINE_W]));
    entries.push(marking('Penalty Area West ' + endName, [ox - SPEC.penaltyAreaWidth / 2, goalZ - side * SPEC.penaltyAreaDepth / 2], [LINE_W, SPEC.penaltyAreaDepth]));
    entries.push(marking('Penalty Area East ' + endName, [ox + SPEC.penaltyAreaWidth / 2, goalZ - side * SPEC.penaltyAreaDepth / 2], [LINE_W, SPEC.penaltyAreaDepth]));
    const goalAreaZ = goalZ - side * SPEC.goalAreaDepth;
    entries.push(marking('Goal Area Front ' + endName, [ox, goalAreaZ], [SPEC.goalAreaWidth, LINE_W]));
    entries.push(marking('Goal Area West ' + endName, [ox - SPEC.goalAreaWidth / 2, goalZ - side * SPEC.goalAreaDepth / 2], [LINE_W, SPEC.goalAreaDepth]));
    entries.push(marking('Goal Area East ' + endName, [ox + SPEC.goalAreaWidth / 2, goalZ - side * SPEC.goalAreaDepth / 2], [LINE_W, SPEC.goalAreaDepth]));
    entries.push(cylinder('Penalty Spot ' + endName, [ox, .005, goalZ - side * SPEC.penaltySpot], .16, .02, {color:'#f4f6f2', roughness:.6}));
    for(let i = 0; i < 7; i++){
      // Arc outside the penalty area, radius 9.15 around the spot.
      const spread = 1.05;
      const angle = -spread / 2 + i / 6 * spread;
      const ax = ox + Math.sin(angle) * SPEC.centerCircleRadius;
      const az = goalZ - side * (SPEC.penaltySpot + Math.cos(angle) * SPEC.centerCircleRadius);
      const segment = box('Penalty Arc ' + endName + ' ' + (i + 1), [ax, 0, az], [LINE_W, LINE_H, 1.6], {color:'#f4f6f2', roughness:.6});
      segment.t.r = [0, side > 0 ? -angle : angle, 0];
      entries.push(segment);
    }

    // ---- Goal frame (regulation 7.32 x 2.44) ----------------------------
    const postX = SPEC.goalWidth / 2 + SPEC.postRadius;
    entries.push(cylinder('Goal Post West ' + endName, [ox - postX, 0, goalZ], SPEC.postRadius, SPEC.goalHeight, {color:'#f8fafc', roughness:.35, metalness:.25, collide:true}));
    entries.push(cylinder('Goal Post East ' + endName, [ox + postX, 0, goalZ], SPEC.postRadius, SPEC.goalHeight, {color:'#f8fafc', roughness:.35, metalness:.25, collide:true}));
    entries.push(box('Goal Crossbar ' + endName, [ox, SPEC.goalHeight + SPEC.postRadius, goalZ], [SPEC.goalWidth + SPEC.postRadius * 4, SPEC.postRadius * 2, SPEC.postRadius * 2], {color:'#f8fafc', roughness:.35, metalness:.25, collide:true}));
    const netDepth = 1.8, netZ = goalZ + side * netDepth / 2;
    entries.push(box('Goal Net Back ' + endName, [ox, SPEC.goalHeight / 2, goalZ + side * netDepth], [SPEC.goalWidth + .3, SPEC.goalHeight, .04], {color:'#e6e9ee', roughness:1}));
    entries.push(box('Goal Net Roof ' + endName, [ox, SPEC.goalHeight, netZ], [SPEC.goalWidth + .3, .04, netDepth], {color:'#e6e9ee', roughness:1}));
    entries.push(box('Goal Net West ' + endName, [ox - postX, SPEC.goalHeight / 2, netZ], [.04, SPEC.goalHeight, netDepth], {color:'#e6e9ee', roughness:1}));
    entries.push(box('Goal Net East ' + endName, [ox + postX, SPEC.goalHeight / 2, netZ], [.04, SPEC.goalHeight, netDepth], {color:'#e6e9ee', roughness:1}));
  });

  // ---- Stands with placeholder fans -------------------------------------
  // Two long stands (E/W) and two end stands (N/S), 3 stepped tiers each.
  const standInsetW = halfW + 8, standInsetL = halfL + 8;
  const tierColors = ['#3b4252', '#434c5e', '#4c566a'];
  const stands = [
    {name:'East', axis:'x', sign:1, length:SPEC.fieldLength + 14},
    {name:'West', axis:'x', sign:-1, length:SPEC.fieldLength + 14},
    {name:'North', axis:'z', sign:1, length:SPEC.fieldWidth + 14},
    {name:'South', axis:'z', sign:-1, length:SPEC.fieldWidth + 14},
  ];
  stands.forEach(stand => {
    const base = stand.axis === 'x' ? standInsetW : standInsetL;
    for(let tier = 0; tier < 3; tier++){
      const depth = 4, height = 2.2;
      const offset = base + tier * depth + depth / 2;
      const y = tier * height;
      const center = stand.axis === 'x' ? [ox + stand.sign * offset, y, oz] : [ox, y, oz + stand.sign * offset];
      const size = stand.axis === 'x' ? [depth, height, stand.length] : [stand.length, height, depth];
      entries.push(box('Stand ' + stand.name + ' Tier ' + (tier + 1), center, size, {color:tierColors[tier], roughness:.9, collide:tier === 0}));
      // Fan blocks: bright crowd chunks sitting on each tier.
      const blocks = stand.axis === 'x' ? 8 : 6;
      for(let b = 0; b < blocks; b++){
        const t = (b + .5) / blocks - .5;
        const along = t * (stand.length - 6);
        const fx = stand.axis === 'x' ? ox + stand.sign * offset : ox + along;
        const fz = stand.axis === 'x' ? oz + along : oz + stand.sign * offset;
        if(tier === 2 && b % 2) continue; // thinner crowd on the top tier
        entries.push(box('Fans ' + stand.name + ' T' + (tier + 1) + ' ' + (b + 1),
          [fx, y + height, fz],
          stand.axis === 'x' ? [depth * .6, .9, (stand.length - 6) / blocks * .8] : [(stand.length - 6) / blocks * .8, .9, depth * .6],
          {color:FAN_COLORS[(b + tier + (stand.sign > 0 ? 0 : 3)) % FAN_COLORS.length], roughness:1}));
      }
    }
    // Back wall behind the top tier.
    const wallOffset = base + 3 * 4 + .5;
    const wallCenter = stand.axis === 'x' ? [ox + stand.sign * wallOffset, 0, oz] : [ox, 0, oz + stand.sign * wallOffset];
    const wallSize = stand.axis === 'x' ? [1, 8.5, stand.length + 2] : [stand.length + 2, 8.5, 1];
    entries.push(box('Stand Wall ' + stand.name, wallCenter, wallSize, {color:'#2e3440', roughness:.95, collide:true}));
  });

  // ---- Entrances: players tunnel + two public gates ----------------------
  entries.push(box('Players Tunnel Frame', [ox - 14, 0, oz - standInsetL + 1], [6, 4, 3], {color:'#5e81ac', roughness:.8, collide:true}));
  entries.push(box('Players Tunnel Opening', [ox - 14, 0, oz - standInsetL - .6], [4, 3.2, .4], {color:'#0b0d12', roughness:1}));
  entries.push(box('Public Gate East', [ox + standInsetW + 12.5, 0, oz + 20], [1.2, 5, 8], {color:'#0b0d12', roughness:1}));
  entries.push(box('Public Gate West', [ox - standInsetW - 12.5, 0, oz - 20], [1.2, 5, 8], {color:'#0b0d12', roughness:1}));

  // ---- Flags: 4 corner flags + 4 stadium flags ---------------------------
  const cornerFlag = (name, x, z) => {
    entries.push(cylinder('Corner Flag Pole ' + name, [x, 0, z], .025, 1.6, {color:'#f4f6f2', roughness:.6}));
    entries.push(box('Corner Flag ' + name, [x + .28, 1.38, z], [.55, .34, .03], {color:'#e11d48', roughness:.8}));
  };
  cornerFlag('NW', ox - halfW, oz + halfL);
  cornerFlag('NE', ox + halfW, oz + halfL);
  cornerFlag('SW', ox - halfW, oz - halfL);
  cornerFlag('SE', ox + halfW, oz - halfL);
  const stadiumFlag = (name, x, z, color) => {
    entries.push(cylinder('Stadium Flag Pole ' + name, [x, 0, z], .08, 12, {color:'#8f9299', roughness:.6, metalness:.4, collide:true}));
    entries.push(box('Stadium Flag ' + name, [x + 1.05, 11, z], [2, 1.1, .06], {color, roughness:.85}));
  };
  stadiumFlag('NW', ox - standInsetW - 10, oz + standInsetL + 10, '#e11d48');
  stadiumFlag('NE', ox + standInsetW + 10, oz + standInsetL + 10, '#2563eb');
  stadiumFlag('SW', ox - standInsetW - 10, oz - standInsetL - 10, '#f59e0b');
  stadiumFlag('SE', ox + standInsetW + 10, oz - standInsetL - 10, '#10b981');

  // ---- Floodlights --------------------------------------------------------
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz], index) => {
    const x = ox + sx * (standInsetW + 6), z = oz + sz * (standInsetL + 6);
    entries.push(cylinder('Floodlight Pole ' + (index + 1), [x, 0, z], .22, 18, {color:'#25282e', roughness:.6, metalness:.4, collide:true}));
    entries.push(box('Floodlight Head ' + (index + 1), [x, 18.2, z], [2.6, 1.2, .5], {color:'#fff2c0', roughness:.4, extra:{emissive:'#ffe08a'}}));
    entries.push(light('point', 'Floodlight ' + (index + 1), [x, 17, z], {props:{color:'#fff2cc', intensity:1.15, distance:120}}));
  });

  return entries;
}

// Useful anchors for gameplay setup on the generated stadium.
function gameplayAnchors(origin){
  const ox = origin && Number(origin.x) || 0;
  const oz = origin && Number(origin.z) || 0;
  const halfL = SPEC.fieldLength / 2;
  return {
    penaltySpotNorth:{x:ox, y:0, z:oz + halfL - SPEC.penaltySpot},
    goalNorth:{x:ox, y:0, z:oz + halfL, heading:Math.PI},
    penaltySpotSouth:{x:ox, y:0, z:oz - halfL + SPEC.penaltySpot},
    goalSouth:{x:ox, y:0, z:oz - halfL, heading:0},
    kickoff:{x:ox, y:0, z:oz},
  };
}

window.LK_RUNTIME_SOCCER_STADIUM = Object.freeze({SPEC, buildEntries, gameplayAnchors});
})();
