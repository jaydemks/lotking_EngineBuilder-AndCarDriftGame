/* =========================================================
   LOT KING - default world generation
   Builds the current parking-lot track from a future-friendly factory.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  const THREE = deps.THREERef;
  const scene = deps.scene;
  const tagEntity = deps.tagEntity;
  const colliders = deps.colliders;
  const srand = deps.srand;
  const LOT = deps.constants.LOT;
  const WALL_H = deps.constants.WALL_H;

  function makeGroundTexture(){
    const S = 2048, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#2a2d33'; g.fillRect(0,0,S,S);
    for(let i=0;i<26000;i++){
      const v = 30 + Math.random()*30|0;
      g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v+4) + ',0.16)';
      g.fillRect(Math.random()*S, Math.random()*S, 2, 2);
    }
    for(let i=0;i<28;i++){
      const x=Math.random()*S, y=Math.random()*S, r=20+Math.random()*60;
      const gr = g.createRadialGradient(x,y,0,x,y,r);
      gr.addColorStop(0,'rgba(10,10,12,.45)'); gr.addColorStop(1,'rgba(10,10,12,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x,y,r,0,7); g.fill();
    }
    const px = u => (u + LOT) / (LOT*2) * S;
    g.strokeStyle = '#d8d8cf'; g.lineWidth = 6; g.lineCap='butt';
    function bayRow(cx, z0, z1, facing){
      const depth = 10, w = 5.4;
      g.beginPath(); g.moveTo(px(cx), px(z0)); g.lineTo(px(cx), px(z1)); g.stroke();
      for(let z=z0; z<=z1; z+=w){
        g.beginPath(); g.moveTo(px(cx), px(z)); g.lineTo(px(cx + facing*depth), px(z)); g.stroke();
      }
    }
    bayRow(-58, -56, 56, +1);
    bayRow( 58, -56, 56, -1);
    bayRow(-5, -50, 50, -1);
    bayRow( 5, -50, 50, +1);
    g.fillStyle = '#cfcfc6';
    function arrow(wx, wz, ang){
      g.save(); g.translate(px(wx), px(wz)); g.rotate(ang);
      g.beginPath(); g.moveTo(0,-34); g.lineTo(14,-6); g.lineTo(5,-6); g.lineTo(5,30); g.lineTo(-5,30); g.lineTo(-5,-6); g.lineTo(-14,-6); g.closePath(); g.fill();
      g.restore();
    }
    arrow(-26, 30, 0); arrow(-26,-30, 0); arrow(26, 30, Math.PI); arrow(26,-30, Math.PI);
    g.fillStyle = '#c9c9c0';
    for(let i=0;i<7;i++) g.fillRect(px(-8 + i*2.4), px(60), 24, 90);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 8;
    return tex;
  }

  function makeSimpleCar(geo, mats, color){
    const gp = new THREE.Group();
    const body = new THREE.Mesh(geo.body, new THREE.MeshStandardMaterial({color, roughness:.35, metalness:.5}));
    body.position.y = .55; body.castShadow = body.receiveShadow = true; gp.add(body);
    const cab = new THREE.Mesh(geo.cab, mats.cab);
    cab.position.set(0, 1.15, -.2); cab.castShadow = true; gp.add(cab);
    for(const [wx,wz] of [[-.95,1.35],[.95,1.35],[-.95,-1.35],[.95,-1.35]]){
      const w = new THREE.Mesh(geo.wheel, mats.wheel); w.rotation.z = Math.PI/2;
      w.position.set(wx,.34,wz); gp.add(w);
    }
    gp.userData.assetKey = 'parked-car-procedural';
    gp.userData.assetName = 'Parked Car Procedural';
    gp.userData.assetSource = 'procedural';
    return gp;
  }

  function buildDefaultParkingLot(track){
    const spec = track || {};
    const parkedGroups = [];
    const cones = [];
    const meshes = {};

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(LOT*2, LOT*2),
      new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness:.95, metalness:0 })
    );
    ground.rotation.x = -Math.PI/2;
    ground.receiveShadow = true;
    scene.add(ground);
    tagEntity(ground, spec.groundName || 'Ground (parking lot)', 'mesh');
    meshes.ground = ground;

    const apron = new THREE.Mesh(new THREE.PlaneGeometry(600,600), new THREE.MeshStandardMaterial({color:0x181b20, roughness:1}));
    apron.rotation.x = -Math.PI/2; apron.position.y = -0.02;
    scene.add(apron);
    tagEntity(apron, 'Outer Apron', 'mesh');
    meshes.apron = apron;

    const wallMat = new THREE.MeshStandardMaterial({color:0x3a3f4a, roughness:.9});
    const stripeMat = new THREE.MeshStandardMaterial({color:0xd9b23a, roughness:.8});
    function wall(x, z, w, d, name){
      const gp = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), wallMat);
      m.position.y = WALL_H/2; m.castShadow = m.receiveShadow = true; gp.add(m);
      const s = new THREE.Mesh(new THREE.BoxGeometry(w+0.05, 0.5, d+0.05), stripeMat);
      s.position.y = 1.0; gp.add(s);
      gp.position.set(x, 0, z); scene.add(gp);
      const col = {x, z, hx:w/2, hz:d/2};
      colliders.box.push(col);
      tagEntity(gp, name, 'mesh', {collider:{kind:'box', ref:col}});
    }
    wall(0, -LOT-1, LOT*2+4, 2, 'Wall North');
    wall(0,  LOT+1, LOT*2+4, 2, 'Wall South');
    wall(-LOT-1, 0, 2, LOT*2+4, 'Wall West');
    wall( LOT+1, 0, 2, LOT*2+4, 'Wall East');

    const pillarGeo = new THREE.BoxGeometry(1.6, 5.5, 1.6);
    const pillarMat = new THREE.MeshStandardMaterial({color:0x8f9299, roughness:.85});
    const pillarBaseMat = new THREE.MeshStandardMaterial({color:0xd9b23a, roughness:.8});
    let pillarN = 0;
    for(const x of [-20, 20]){
      for(let z=-48; z<=48; z+=24){
        const gp = new THREE.Group();
        const p = new THREE.Mesh(pillarGeo, pillarMat);
        p.position.y = 2.75; p.castShadow = p.receiveShadow = true; gp.add(p);
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.7,1.0,1.7), pillarBaseMat);
        b.position.y = .5; gp.add(b);
        gp.position.set(x, 0, z); scene.add(gp);
        const col = {x, z, r:1.35};
        colliders.circle.push(col);
        tagEntity(gp, 'Pillar ' + (++pillarN), 'mesh', {collider:{kind:'circle', ref:col}});
      }
    }

    const poleMat = new THREE.MeshStandardMaterial({color:0x25282e, roughness:.6, metalness:.4});
    const lampMat = new THREE.MeshStandardMaterial({color:0xfff2c0, emissive:0xffe08a, emissiveIntensity:2});
    let poleN = 0;
    for(const [x,z] of [[-40,-40],[-40,40],[40,-40],[40,40],[0,0]]){
      const gp = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.16,.2,8,8), poleMat);
      pole.position.y = 4; pole.castShadow = true; gp.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.6,.3,.7), lampMat);
      head.position.y = 8; gp.add(head);
      gp.position.set(x, 0, z); scene.add(gp);
      const col = {x, z, r:.5};
      colliders.circle.push(col);
      tagEntity(gp, 'Light Pole ' + (++poleN), 'mesh', {collider:{kind:'circle', ref:col}});
    }
    const pl1 = new THREE.PointLight(0xffe6a8, .8, 60); pl1.position.set(0, 9, 0); scene.add(pl1);
    const pl2 = new THREE.PointLight(0xaac6ff, .5, 70); pl2.position.set(-40, 9, 40); scene.add(pl2);
    tagEntity(pl1, 'Point Light Warm', 'light');
    tagEntity(pl2, 'Point Light Cool', 'light');

    const parkedPalette = [0x9b2226, 0x005f73, 0x555b6e, 0xe9d8a6, 0x3d405b, 0x6a994e, 0x8d99ae];
    const simpleCarGeo = {
      body: new THREE.BoxGeometry(2, .7, 4.2),
      cab: new THREE.BoxGeometry(1.8, .55, 2.2),
      wheel: new THREE.CylinderGeometry(.34,.34,.3,10),
    };
    const simpleCarMats = {
      cab: new THREE.MeshStandardMaterial({color:0x11141a, roughness:.2, metalness:.6}),
      wheel: new THREE.MeshStandardMaterial({color:0x14161a, roughness:.9}),
    };
    let parkedN = 0;
    function park(x, z, rotY){
      const c = makeSimpleCar(simpleCarGeo, simpleCarMats, parkedPalette[srand()*parkedPalette.length|0]);
      c.position.set(x, 0, z); c.rotation.y = rotY; scene.add(c);
      parkedGroups.push(c);
      const along = Math.abs(Math.sin(rotY)) > .5;
      const col = {x, z, hx: along?2.2:1.1, hz: along?1.1:2.2};
      colliders.box.push(col);
      tagEntity(c, 'Parked Car ' + (++parkedN), 'mesh', {collider:{kind:'box', ref:col}});
      c.userData.assetKey = 'parked-car-procedural';
      c.userData.assetName = 'Parked Car Procedural';
      c.userData.assetSource = 'procedural';
    }
    for(let z=-52; z<=52; z+=5.4){ if(srand()<.62) park(-63, z+2.7, Math.PI/2); }
    for(let z=-52; z<=52; z+=5.4){ if(srand()<.62) park( 63, z+2.7, Math.PI/2); }
    for(let z=-46; z<=46; z+=5.4){ if(srand()<.35) park(-10, z+2.7, Math.PI/2); }
    for(let z=-46; z<=46; z+=5.4){ if(srand()<.35) park( 10, z+2.7, Math.PI/2); }

    const coneGeo = new THREE.ConeGeometry(.35, .9, 10);
    const coneMat = new THREE.MeshStandardMaterial({color:0xff6b35, roughness:.7});
    const coneStripe = new THREE.MeshStandardMaterial({color:0xffffff, roughness:.7});
    function cone(x, z){
      const gp = new THREE.Group();
      const c = new THREE.Mesh(coneGeo, coneMat); c.position.y = .45; c.castShadow = true; gp.add(c);
      const s = new THREE.Mesh(new THREE.CylinderGeometry(.26,.3,.14,10), coneStripe);
      s.position.y = .5; gp.add(s);
      gp.position.set(x, 0, z);
      scene.add(gp);
      cones.push({m:gp, vel:new THREE.Vector3(), ang:new THREE.Vector3(), hit:false});
      tagEntity(gp, 'Cone ' + cones.length, 'mesh');
    }
    for(let i=0;i<10;i++) cone(-26 + i*6, 14);
    for(let i=0;i<10;i++) cone(-26 + i*6, -14);
    for(let a=0;a<10;a++) cone(Math.cos(a/10*6.28)*7, Math.sin(a/10*6.28)*7 + 34);

    const planterMat = new THREE.MeshStandardMaterial({color:0x5e5346, roughness:.9});
    const bushMat = new THREE.MeshStandardMaterial({color:0x2f5d3a, roughness:1});
    let planterN = 0;
    for(const [x,z] of [[-52,-64],[52,-64],[-52,64],[52,64]]){
      const gp = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(3,1,3), planterMat);
      box.position.y = .5; box.castShadow = true; gp.add(box);
      const bush = new THREE.Mesh(new THREE.SphereGeometry(1.3, 10, 8), bushMat);
      bush.position.y = 1.6; bush.castShadow = true; gp.add(bush);
      gp.position.set(x, 0, z); scene.add(gp);
      const col = {x,z,hx:1.6,hz:1.6};
      colliders.box.push(col);
      tagEntity(gp, 'Planter ' + (++planterN), 'mesh', {collider:{kind:'box', ref:col}});
    }

    const boothGp = new THREE.Group();
    const booth = new THREE.Mesh(new THREE.BoxGeometry(4,3,3), new THREE.MeshStandardMaterial({color:0x35618e, roughness:.7}));
    booth.position.y = 1.5; booth.castShadow = true; boothGp.add(booth);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.8,.3,3.8), new THREE.MeshStandardMaterial({color:0xd9b23a}));
    roof.position.y = 3.1; boothGp.add(roof);
    boothGp.position.set(0, 0, 64); scene.add(boothGp);
    const boothCol = {x:0,z:64,hx:2,hz:1.5};
    colliders.box.push(boothCol);
    tagEntity(boothGp, 'Ticket Booth', 'mesh', {collider:{kind:'box', ref:boothCol}});

    return {
      meshes,
      parkedGroups,
      cones,
      materials: {lamp: lampMat},
      lights: {pl1, pl2},
      sourceTrack: spec,
    };
  }

  return {buildDefaultParkingLot};
}

window.LK_RUNTIME_WORLD_GENERATION = Object.freeze({create});
})();
