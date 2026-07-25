/* =========================================================
   LOT KING - Soccer ball runtime
   Regulation-size ball with arcade flight physics (gravity,
   bounce, drag, Magnus curve), goal-line detection against
   registered goal frames and goalkeeper save checks.
   Balls register as non-possessable Pawn records so they step
   through the shared GAME.pawns loop and Play Preview cleanup.
   ========================================================= */
(function(){
'use strict';

const BALL_RADIUS = .11;      // FIFA size 5
const GOAL_WIDTH = 7.32;      // regulation inner width (m)
const GOAL_HEIGHT = 2.44;     // regulation crossbar height (m)

function finite(value, fallback){ const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }

function emitSoccerEvent(type, payload){
  if(typeof window === 'undefined' || !window.dispatchEvent || !window.CustomEvent) return;
  window.dispatchEvent(new CustomEvent('lk-pawn-event', {detail:Object.assign({type}, payload || {})}));
}

function makeBallTexture(THREE){
  if(typeof document === 'undefined') return null;
  const S = 256, canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const g = canvas.getContext('2d');
  g.fillStyle = '#f4f4f2'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#15181d';
  for(let row = 0; row < 4; row++){
    for(let col = 0; col < 4; col++){
      const x = (col + (row % 2 ? .5 : 0)) * (S / 4), y = row * (S / 4) + S / 8;
      g.beginPath();
      for(let i = 0; i < 5; i++){
        const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
        const px = x + Math.cos(a) * S * .055, py = y + Math.sin(a) * S * .055;
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath(); g.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  if(THREE.SRGBColorSpace != null) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createBallMesh(THREE){
  const material = new THREE.MeshStandardMaterial({
    map:makeBallTexture(THREE), color:0xffffff, roughness:.42, metalness:.05,
    emissive:0x202020, emissiveIntensity:.16,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 24, 18), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.nonExportable = true;
  // It is a real gameplay visual, even though it is generated and therefore
  // excluded from saved/exported authoring data. Final-render helper filtering
  // must not hide it as if it were an editor dummy.
  mesh.userData.logicElementInternal = true;
  mesh.userData.soccerBall = true;
  mesh.userData.logicElementRuntimeVisual = true;
  return mesh;
}

function createTrajectoryLine(THREE){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(64*3),3));
  geometry.setDrawRange(0,0);
  const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0x67e8f9,transparent:true,opacity:.78,depthWrite:false}));
  line.visible=false;line.frustumCulled=false;
  line.userData.nonExportable=true;
  line.userData.logicElementInternal=true;
  line.userData.logicElementRuntimeVisual=true;
  line.userData.soccerTrajectory=true;
  return line;
}

function create(GAME){
  const state = {
    balls:new Map(),   // id -> ball record
    goals:new Map(),   // id -> goal frame definition
    nextBall:1,
    nextGoal:1,
  };

  function createPhysics(ball){
    const C=window.CANNON;if(!C||!C.World||!C.Body||!C.Sphere)return null;
    const world=new C.World();world.gravity.set(0,-9.81,0);
    world.broadphase=C.SAPBroadphase?new C.SAPBroadphase(world):new C.NaiveBroadphase();
    world.solver.iterations=14;world.solver.tolerance=.0005;
    const ballMaterial=new C.Material('soccer-ball'),surfaceMaterial=new C.Material('soccer-surface');
    world.addContactMaterial(new C.ContactMaterial(ballMaterial,surfaceMaterial,{friction:.34,restitution:.48,contactEquationStiffness:1e8,contactEquationRelaxation:3}));
    const ground=new C.Body({mass:0,material:surfaceMaterial});ground.addShape(new C.Plane());ground.quaternion.setFromEuler(-Math.PI/2,0,0);world.addBody(ground);
    const body=new C.Body({mass:.43,material:ballMaterial,linearDamping:.045,angularDamping:.08});
    body.addShape(new C.Sphere(BALL_RADIUS));body.allowSleep=true;body.sleepSpeedLimit=.08;body.sleepTimeLimit=.65;world.addBody(body);
    const physics={world,body,material:surfaceMaterial,goalBodies:new Map(),ground};
    state.goals.forEach(goal=>addGoalPhysics(physics,goal));
    return physics;
  }
  function addGoalPhysics(physics,goal){
    const C=window.CANNON;if(!physics||!C||physics.goalBodies.has(goal.id))return;
    const bodies=[],sin=Math.sin(goal.heading),cos=Math.cos(goal.heading),right={x:cos,z:-sin},field={x:sin,z:cos};
    const addBox=(lx,y,lz,hx,hy,hz)=>{
      const body=new C.Body({mass:0,material:physics.material});body.addShape(new C.Box(new C.Vec3(hx,hy,hz)));
      body.position.set(goal.x+right.x*lx+field.x*lz,goal.y+y,goal.z+right.z*lx+field.z*lz);
      body.quaternion.setFromEuler(0,goal.heading,0,'XYZ');physics.world.addBody(body);bodies.push(body);
    };
    const addPost=lx=>{
      const body=new C.Body({mass:0,material:physics.material});
      if(C.Cylinder){const shape=new C.Cylinder(.065,.065,goal.height,16),q=new C.Quaternion();q.setFromEuler(-Math.PI/2,0,0,'XYZ');body.addShape(shape,new C.Vec3(0,0,0),q);}
      else body.addShape(new C.Box(new C.Vec3(.065,goal.height/2,.065)));
      body.position.set(goal.x+right.x*lx,goal.y+goal.height/2,goal.z+right.z*lx);physics.world.addBody(body);bodies.push(body);
    };
    addPost(-goal.width/2);addPost(goal.width/2);
    addBox(0,goal.height,0,goal.width/2+.07,.065,.065);
    // Open mouth; only rear, roof and sides physically retain a scored ball.
    addBox(0,goal.height/2,-goal.depth,goal.width/2+.12,goal.height/2,.025);
    addBox(-goal.width/2,goal.height/2,-goal.depth/2,.025,goal.height/2,goal.depth/2);
    addBox(goal.width/2,goal.height/2,-goal.depth/2,.025,goal.height/2,goal.depth/2);
    addBox(0,goal.height,-goal.depth/2,goal.width/2+.12,.025,goal.depth/2);
    physics.goalBodies.set(goal.id,bodies);
  }
  function physicsVelocity(ball){
    const body=ball.physics&&ball.physics.body;if(!body)return;
    const C=window.CANNON,impulse=new C.Vec3((ball.vx-body.velocity.x)*body.mass,(ball.vy-body.velocity.y)*body.mass,(ball.vz-body.velocity.z)*body.mass);
    body.applyImpulse(impulse,new C.Vec3(0,0,0));body.wakeUp();
  }

  function registerGoal(options){
    const opts = options || {};
    const id = String(opts.id || ('goal-' + state.nextGoal++));
    state.goals.set(id, {
      id,
      x:finite(opts.x, 0), y:finite(opts.y, 0), z:finite(opts.z, 0),
      // heading: direction the goal mouth faces (radians around Y).
      heading:finite(opts.heading, 0),
      width:Math.max(1, finite(opts.width, GOAL_WIDTH)),
      height:Math.max(.5, finite(opts.height, GOAL_HEIGHT)),
      depth:clamp(finite(opts.depth, 1.8), .4, 8),
      team:String(opts.team || ''),
    });
    const goal=state.goals.get(id);state.balls.forEach(ball=>addGoalPhysics(ball.physics,goal));
    return id;
  }
  function clearGoals(){ state.goals.clear(); }

  function goalNetVisual(goal){
    const scene=GAME&&GAME.core&&GAME.core.scene;if(!scene||!scene.traverse)return null;
    let nearest=null,best=Infinity;
    scene.traverse(node=>{
      const entry=node&&node.userData&&node.userData.addedEntry;
      if(!(entry&&entry.kind==='primitive'&&entry.prim==='goalNet'))return;
      const dx=node.position.x-goal.x,dz=node.position.z-goal.z,d2=dx*dx+dz*dz;
      if(d2<best){best=d2;nearest=node;}
    });
    return best<4?nearest:null;
  }
  function pulseGoalNet(goal,impactX,impactY,strength){
    const root=goalNetVisual(goal);if(!root)return;
    let lines=null;root.traverse(node=>{if(!lines&&node.isLineSegments&&node.geometry&&node.geometry.attributes&&node.geometry.attributes.position)lines=node;});
    if(!lines)return;
    const attr=lines.geometry.attributes.position,data=lines.userData||(lines.userData={});
    if(!data.soccerNetBase)data.soccerNetBase=new Float32Array(attr.array);
    data.soccerNetWave={time:0,strength:clamp(finite(strength,.35),.08,.75),x:finite(impactX,0),y:finite(impactY,1)};
  }
  function updateGoalNets(dt){
    const scene=GAME&&GAME.core&&GAME.core.scene;if(!scene||!scene.traverse)return;
    const h=clamp(finite(dt,.016),.001,.05);
    scene.traverse(node=>{
      if(!node.isLineSegments||!node.userData||!node.userData.soccerNetWave)return;
      const wave=node.userData.soccerNetWave,base=node.userData.soccerNetBase,attr=node.geometry&&node.geometry.attributes&&node.geometry.attributes.position;
      if(!base||!attr)return;
      wave.time+=h;
      const envelope=Math.exp(-wave.time*4.8)*Math.cos(wave.time*17);
      for(let i=0;i<attr.array.length;i+=3){
        const dx=(base[i]-wave.x)/2.4,dy=(base[i+1]-wave.y)/1.7,near=Math.exp(-(dx*dx+dy*dy)*1.8),depth=clamp(base[i+2]/1.8,.18,1);
        attr.array[i+2]=base[i+2]+wave.strength*near*depth*envelope;
      }
      attr.needsUpdate=true;
      if(wave.time>1.35){attr.array.set(base);attr.needsUpdate=true;delete node.userData.soccerNetWave;}
    });
  }

  function goalLocal(goal, px, pz){
    const dx = px - goal.x, dz = pz - goal.z;
    const sin = Math.sin(goal.heading), cos = Math.cos(goal.heading);
    // Local +z points out of the goal mouth toward the field.
    return {x:cos * dx - sin * dz, z:sin * dx + cos * dz};
  }

  function keeperSaveCheck(ball){
    const registry = GAME && GAME.pawns;
    if(!registry || !registry.list) return null;
    const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy + ball.vz * ball.vz);
    if(speed < 3) return null;
    for(const pawn of registry.list()){
      if(!pawn || pawn.pawnType !== 'soccer' || !pawn.config || pawn.config.role !== 'goalkeeper' || !pawn.owner || pawn.disposed) continue;
      const difficulty=window.LK_RUNTIME_GAMEPLAY_DIFFICULTY?window.LK_RUNTIME_GAMEPLAY_DIFFICULTY.profile('soccer'):null;
      const reach = finite(pawn.config.keeper && pawn.config.keeper.reach, 1.1)*finite(difficulty&&difficulty.keeperReach,1);
      const px = pawn.owner.position.x, pz = pawn.owner.position.z;
      const chestY = pawn.owner.position.y + (pawn.state && pawn.state.diving ? .7 : 1.05);
      const dx = ball.mesh.position.x - px;
      const dy = ball.mesh.position.y - chestY;
      const dz = ball.mesh.position.z - pz;
      const horizontalReach = reach * (pawn.state && pawn.state.diving ? 1.6 : 1);
      const distance=Math.sqrt(dx*dx+dy*dy+dz*dz);
      if(dx * dx + dz * dz <= horizontalReach * horizontalReach && Math.abs(dy) <= reach + .6) return {pawn,dx,dy,dz,distance,chestY,reach};
    }
    return null;
  }

  function keeperHandsPosition(hit){
    const pawn=hit&&hit.pawn,owner=pawn&&pawn.owner,THREE=window.THREE;
    if(!owner||!owner.position||!THREE)return null;
    const hands=[];
    if(owner.traverse)owner.traverse(node=>{
      const key=String(node&&node.name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
      if(!/(lefthand|righthand|handl|handr)$/.test(key)||!node.getWorldPosition)return;
      hands.push(node.getWorldPosition(new THREE.Vector3()));
    });
    if(hands.length){
      const result=new THREE.Vector3();hands.forEach(point=>result.add(point));return result.multiplyScalar(1/hands.length);
    }
    const heading=owner.rotation?finite(owner.rotation.y,0):0;
    return new THREE.Vector3(owner.position.x+Math.sin(heading)*.32,hit.chestY,owner.position.z+Math.cos(heading)*.32);
  }

  function hideTrajectory(ball){
    if(ball&&ball.trajectory){ball.trajectory.visible=false;ball.trajectory.geometry.setDrawRange(0,0);}
  }

  function drawTrajectory(ball,velocity,curve){
    const line=ball&&ball.trajectory,mesh=ball&&ball.mesh;if(!line||!mesh||!velocity){hideTrajectory(ball);return false;}
    const attr=line.geometry.attributes.position,points=attr.array;
    let x=mesh.position.x,y=mesh.position.y,z=mesh.position.z;
    let vx=finite(velocity.x,0),vy=finite(velocity.y,0),vz=finite(velocity.z,0),count=0;
    const step=.035;
    for(let i=0;i<64;i++){
      points[count*3]=x;points[count*3+1]=y;points[count*3+2]=z;count++;
      const speed=Math.hypot(vx,vy,vz);
      if(i>4&&(y<=ball.groundY||speed<.45))break;
      if(Math.abs(curve)>.001&&speed>1){vx+=-vz/speed*curve*9*step;vz+=vx/speed*curve*9*step;}
      vy-=9.81*step;const drag=1-clamp(.18*step,0,.5);vx*=drag;vz*=drag;
      x+=vx*step;y+=vy*step;z+=vz*step;
    }
    attr.needsUpdate=true;line.geometry.setDrawRange(0,count);line.visible=count>1;
    return line.visible;
  }

  function plannedVelocity(ball,options){
    const opts=options||{},target=opts.target||{},tx=finite(target.x,ball.mesh.position.x),ty=finite(target.y,1),tz=finite(target.z,ball.mesh.position.z);
    const power=clamp(finite(opts.power,18),2,40),lift=clamp(finite(opts.lift,.25),0,1),dx=tx-ball.mesh.position.x,dz=tz-ball.mesh.position.z,distance=Math.max(.5,Math.hypot(dx,dz));
    return {x:dx/distance*power,y:clamp((ty-ball.mesh.position.y)/distance*power*.85+lift*power*.38,-4,power*.8),z:dz/distance*power};
  }

  function resolveKeeperSave(ball,hit){
    const pawn=hit.pawn,speed=Math.hypot(ball.vx,ball.vy,ball.vz);
    // Central/moderate shots can be secured. Hard or stretched saves are
    // parried with a reflected physical velocity instead of deleting the ball.
    const diving=!!(pawn.state&&pawn.state.diving),catchable=speed<22&&!diving&&Math.abs(hit.dy)<hit.reach*.72&&hit.distance<=hit.reach*1.05;
    if(catchable){
      ball.caughtBy=pawn;ball.catchOffset=keeperHandsPosition(hit);ball.vx=0;ball.vy=0;ball.vz=0;ball.curve=0;ball.inFlight=false;
      if(ball.physics){ball.physics.body.velocity.set(0,0,0);ball.physics.body.angularVelocity.set(0,0,0);ball.physics.body.type=window.CANNON.Body.KINEMATIC;}
      hideTrajectory(ball);
      resolveBall(ball,'OnBallSaved',{keeperPawnId:pawn.id,playerId:pawn.playerId,saveType:'caught'});
      return true;
    }
    let nx=hit.dx,ny=hit.dy*.45,nz=hit.dz,length=Math.max(.001,Math.hypot(nx,ny,nz));nx/=length;ny/=length;nz/=length;
    const dot=ball.vx*nx+ball.vy*ny+ball.vz*nz,retain=.52;
    if(dot<0){ball.vx=(ball.vx-(1+retain)*dot*nx)*.72;ball.vy=(ball.vy-(1+retain)*dot*ny)*.72;ball.vz=(ball.vz-(1+retain)*dot*nz)*.72;}
    else {ball.vx=nx*speed*.42;ball.vy=Math.max(1.2,ny*speed*.42);ball.vz=nz*speed*.42;}
    ball.curve*=.25;ball.inFlight=false;physicsVelocity(ball);
    drawTrajectory(ball,{x:ball.vx,y:ball.vy,z:ball.vz},ball.curve);
    resolveBall(ball,'OnBallSaved',{keeperPawnId:pawn.id,playerId:pawn.playerId,saveType:'parried'});
    return true;
  }

  function resolveBall(ball, outcome, payload){
    if(ball.resolved) return;
    ball.resolved = true;
    ball.outcome = outcome;
    emitSoccerEvent(outcome, Object.assign({ballId:ball.id, ball:ball.mesh.position.clone ? {x:ball.mesh.position.x, y:ball.mesh.position.y, z:ball.mesh.position.z} : null}, payload || {}));
  }

  function stepBall(ball, dt){
    const h = clamp(finite(dt, .016), .0001, .05);
    updateGoalNets(h);
    const mesh = ball.mesh;
    if(!mesh) return;
    if(ball.caughtBy){
      const hit={pawn:ball.caughtBy,chestY:ball.caughtBy.owner.position.y+1.05},target=keeperHandsPosition(hit);
      if(target){mesh.position.copy(target);if(ball.physics)ball.physics.body.position.set(target.x,target.y,target.z);}
      hideTrajectory(ball);return;
    }
    if(ball.locked){ball.vx=0;ball.vy=0;ball.vz=0;ball.inFlight=false;if(ball.physics){ball.physics.body.position.set(mesh.position.x,mesh.position.y,mesh.position.z);ball.physics.body.velocity.set(0,0,0);ball.physics.body.angularVelocity.set(0,0,0);}return;}
    if(ball.physics){
      const body=ball.physics.body,prevX=body.position.x,prevZ=body.position.z,preSpeed=body.velocity.length();
      if(Math.abs(ball.curve)>.001&&preSpeed>1){
        body.force.x+=-body.velocity.z/preSpeed*ball.curve*9*body.mass;
        body.force.z+=body.velocity.x/preSpeed*ball.curve*9*body.mass;
      }
      ball.physics.world.step(1/120,h,6);
      mesh.position.set(body.position.x,body.position.y,body.position.z);
      mesh.quaternion.set(body.quaternion.x,body.quaternion.y,body.quaternion.z,body.quaternion.w);
      ball.vx=body.velocity.x;ball.vy=body.velocity.y;ball.vz=body.velocity.z;
      const speed=body.velocity.length();
      if(!ball.resolved&&ball.inFlight){
        const keeper=keeperSaveCheck(ball);
        if(keeper){resolveKeeperSave(ball,keeper);return;}
        for(const goal of state.goals.values()){
          const before=goalLocal(goal,prevX,prevZ),after=goalLocal(goal,mesh.position.x,mesh.position.z);
          if(before.z>0&&after.z<=0){
            const t=before.z/Math.max(.0001,before.z-after.z),crossX=before.x+(after.x-before.x)*t,crossY=mesh.position.y-ball.vy*h*(1-t);
            if(Math.abs(crossX)<=goal.width/2&&crossY-goal.y<=goal.height&&crossY>=0){ball.inFlight=false;ball.netGoalId=goal.id;resolveBall(ball,'OnGoalScored',{goalId:goal.id,team:goal.team,impactX:crossX,impactY:crossY,speedKmh:speed*3.6});return;}
          }
        }
      }
      if(speed<.08){ball.stillTime=(ball.stillTime||0)+h;if(ball.inFlight&&!ball.resolved&&ball.stillTime>1.2){ball.inFlight=false;resolveBall(ball,'OnBallOut',{reason:'stopped'});}}
      else ball.stillTime=0;
      if(ball.inFlight&&!ball.resolved){const dx=mesh.position.x-ball.spawn.x,dz=mesh.position.z-ball.spawn.z;if(dx*dx+dz*dz>120*120){ball.inFlight=false;resolveBall(ball,'OnBallOut',{reason:'out-of-bounds'});}}
      if(ball.inFlight)drawTrajectory(ball,{x:ball.vx,y:ball.vy,z:ball.vz},ball.curve);
      else if(!ball.resolved)hideTrajectory(ball);
      return;
    }
    const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy + ball.vz * ball.vz);
    if(speed > .01 || mesh.position.y > ball.groundY + .001){
      // Magnus curve: lateral acceleration perpendicular to velocity.
      if(Math.abs(ball.curve) > .001 && speed > 1){
        const nx = -ball.vz / speed, nz = ball.vx / speed;
        ball.vx += nx * ball.curve * 9 * h;
        ball.vz += nz * ball.curve * 9 * h;
      }
      ball.vy -= 9.81 * h;
      const drag = 1 - clamp(.18 * h, 0, .5);
      ball.vx *= drag; ball.vz *= drag;
      const prevX = mesh.position.x, prevZ = mesh.position.z;
      mesh.position.x += ball.vx * h;
      mesh.position.y += ball.vy * h;
      mesh.position.z += ball.vz * h;
      if(mesh.position.y < ball.groundY){
        mesh.position.y = ball.groundY;
        ball.vy = Math.abs(ball.vy) > 1.2 ? -ball.vy * .55 : 0;
        ball.vx *= .82; ball.vz *= .82;
        ball.curve *= .6;
      }
      mesh.rotation.x += ball.vz / BALL_RADIUS * h;
      mesh.rotation.z -= ball.vx / BALL_RADIUS * h;

      if(ball.netGoalId){
        const netGoal=state.goals.get(ball.netGoalId);
        if(netGoal){
          const local=goalLocal(netGoal,mesh.position.x,mesh.position.z),sin=Math.sin(netGoal.heading),cos=Math.cos(netGoal.heading);
          let localVX=cos*ball.vx-sin*ball.vz,localVZ=sin*ball.vx+cos*ball.vz,hit=false;
          if(local.z < -netGoal.depth+BALL_RADIUS){local.z=-netGoal.depth+BALL_RADIUS;localVZ=Math.abs(localVZ)*.18;hit=true;}
          const sideLimit=netGoal.width/2-BALL_RADIUS;
          if(Math.abs(local.x)>sideLimit){local.x=clamp(local.x,-sideLimit,sideLimit);localVX=-localVX*.22;hit=true;}
          if(mesh.position.y>netGoal.y+netGoal.height-BALL_RADIUS){mesh.position.y=netGoal.y+netGoal.height-BALL_RADIUS;ball.vy=-Math.abs(ball.vy)*.2;hit=true;}
          if(hit){
            mesh.position.x=netGoal.x+cos*local.x+sin*local.z;
            mesh.position.z=netGoal.z-sin*local.x+cos*local.z;
            ball.vx=cos*localVX+sin*localVZ;ball.vz=-sin*localVX+cos*localVZ;
            ball.netPulse=Math.min(1,Math.hypot(localVX,localVZ)/18);
            pulseGoalNet(netGoal,local.x,mesh.position.y-netGoal.y,.12+ball.netPulse*.58);
          }
        }
      }

      if(!ball.resolved && ball.inFlight){
        // Goalkeeper save.
        const keeper = keeperSaveCheck(ball);
        if(keeper){
          resolveKeeperSave(ball,keeper);
          return;
        }
        // Goal-line crossing against every registered goal frame.
        for(const goal of state.goals.values()){
          const before = goalLocal(goal, prevX, prevZ);
          const after = goalLocal(goal, mesh.position.x, mesh.position.z);
          if(before.z > 0 && after.z <= 0){
            const t = before.z / Math.max(.0001, before.z - after.z);
            const crossX = before.x + (after.x - before.x) * t;
            const crossY = mesh.position.y - ball.vy * h * (1 - t);
            if(Math.abs(crossX) <= goal.width / 2 && crossY - goal.y <= goal.height && crossY >= 0){
              ball.vx *= .42; ball.vz *= .42; ball.netGoalId=goal.id;
              ball.inFlight = false;
              resolveBall(ball, 'OnGoalScored', {goalId:goal.id, team:goal.team, impactX:crossX, impactY:crossY, speedKmh:speed * 3.6});
              return;
            }
          }
        }
      }
      ball.stillTime = 0;
    } else {
      ball.vx = 0; ball.vy = 0; ball.vz = 0;
      ball.stillTime = (ball.stillTime || 0) + h;
      if(ball.inFlight && !ball.resolved && ball.stillTime > 1.2){
        ball.inFlight = false;
        resolveBall(ball, 'OnBallOut', {reason:'stopped'});
      }
    }
    if(ball.inFlight && !ball.resolved){
      const dx = mesh.position.x - ball.spawn.x, dz = mesh.position.z - ball.spawn.z;
      if(dx * dx + dz * dz > 120 * 120){
        ball.inFlight = false;
        resolveBall(ball, 'OnBallOut', {reason:'out-of-bounds'});
      }
    }
    if(ball.inFlight)drawTrajectory(ball,{x:ball.vx,y:ball.vy,z:ball.vz},ball.curve);
    else if(!ball.resolved)hideTrajectory(ball);
  }

  function spawn(options){
    const THREE = window.THREE;
    const scene = GAME && GAME.core && GAME.core.scene;
    if(!THREE || !scene) return null;
    const opts = options || {};
    const id = String(opts.id || ('soccer-ball-' + state.nextBall++));
    let ball = state.balls.get(id);
    if(!ball){
      const mesh = createBallMesh(THREE);
      ball = {id, mesh, trajectory:createTrajectoryLine(THREE), vx:0, vy:0, vz:0, curve:0, inFlight:false, resolved:false, outcome:null, stillTime:0, mode:opts.mode==='penalty'?'penalty':'match',locked:opts.locked===true,groundY:finite(opts.groundY, 0) + BALL_RADIUS, spawn:{x:0, y:0, z:0}};
      ball.physics=createPhysics(ball);
      state.balls.set(id, ball);
      scene.add(mesh);scene.add(ball.trajectory);
      // Register as a non-possessable pawn so GAME.pawns.stepAll drives it and
      // disposeLogic() removes it when the Play session ends.
      const registry = GAME.pawns;
      if(registry && registry.register){
        ball.pawn = {
          id:'ball:' + id, kind:'logic-element', pawnType:'soccer-ball', playerId:null, possessed:false,
          enabled:true, hidden:false, started:true, sleeping:false, disposed:false,
          config:{}, state:{},
          step:dt => stepBall(ball, dt),
          possess(){ return false; }, unpossess(){ return true; },
          setEnabled(){ return true; }, setHidden(){ return false; },
          dispose(){
            if(this.disposed) return false;
            this.disposed = true;
            if(ball.mesh && ball.mesh.parent) ball.mesh.parent.remove(ball.mesh);
            if(ball.trajectory&&ball.trajectory.parent)ball.trajectory.parent.remove(ball.trajectory);
            if(ball.trajectory){ball.trajectory.geometry.dispose();ball.trajectory.material.dispose();}
            if(ball.physics){ball.physics.world.removeBody(ball.physics.body);ball.physics=null;}
            state.balls.delete(id);
            registry.unregister(this);
            return true;
          },
        };
        registry.register(ball.pawn);
      }
    }
    if(opts.mode!=null)ball.mode=opts.mode==='penalty'?'penalty':'match';
    if(opts.locked!=null)ball.locked=opts.locked===true;
    ball.spawn = {x:finite(opts.x, 0), y:finite(opts.y, ball.groundY), z:finite(opts.z, 0)};
    reset(id);
    return id;
  }

  function reset(id){
    const ball = state.balls.get(String(id || firstBallId()));
    if(!ball) return false;
    ball.mesh.position.set(ball.spawn.x, Math.max(ball.groundY, ball.spawn.y), ball.spawn.z);
    ball.mesh.rotation.set(0, 0, 0);
    ball.vx = 0; ball.vy = 0; ball.vz = 0; ball.curve = 0;
    ball.inFlight = false; ball.resolved = false; ball.outcome = null; ball.stillTime = 0; ball.touchCooldown = 0; ball.netGoalId = null; ball.netPulse = 0;
    ball.caughtBy=null;hideTrajectory(ball);
    if(ball.physics){ball.physics.body.type=window.CANNON.Body.DYNAMIC;ball.physics.body.mass=.43;ball.physics.body.updateMassProperties();ball.physics.body.position.set(ball.mesh.position.x,ball.mesh.position.y,ball.mesh.position.z);ball.physics.body.velocity.set(0,0,0);ball.physics.body.angularVelocity.set(0,0,0);ball.physics.body.quaternion.set(0,0,0,1);ball.physics.body.wakeUp();}
    return true;
  }

  function firstBallId(){
    const first = state.balls.keys().next();
    return first && !first.done ? first.value : null;
  }
  function resolveId(id){
    return id == null || id === '' || id === 'self' ? firstBallId() : String(id);
  }

  function setMode(id, mode, locked){
    const ball=state.balls.get(resolveId(id));if(!ball)return false;
    ball.mode=mode==='penalty'?'penalty':'match';
    if(locked!=null)ball.locked=locked===true;
    return true;
  }
  function nearestBall(position,maxDistance){
    if(!position)return null;let nearest=null,best=Math.max(.1,finite(maxDistance,1.5))**2;
    state.balls.forEach(ball=>{if(!ball||!ball.mesh)return;const dx=ball.mesh.position.x-position.x,dz=ball.mesh.position.z-position.z,d2=dx*dx+dz*dz;if(d2<=best){best=d2;nearest=ball;}});
    return nearest;
  }
  function automaticTarget(pawn,ball,distance){
    const owner=pawn&&pawn.owner,heading=owner&&owner.rotation?finite(owner.rotation.y,0):0,fx=Math.sin(heading),fz=Math.cos(heading),origin=owner&&owner.position||ball.mesh.position;
    let chosen=null,best=Infinity;state.goals.forEach(goal=>{const dx=goal.x-origin.x,dz=goal.z-origin.z,forward=dx*fx+dz*fz,d2=dx*dx+dz*dz;if(forward>-.5&&d2<best){best=d2;chosen=goal;}});
    return chosen?{x:chosen.x,y:chosen.y+1.05,z:chosen.z}:{x:origin.x+fx*distance,y:ball.groundY+.25,z:origin.z+fz*distance};
  }
  // Match possession is intentionally soft: the ball is never welded to the
  // foot. A critically damped velocity assist keeps it in stride while still
  // allowing tackles, rebounds and another Pawn to take it.
  function controlNearest(pawn,options,dt){
    const owner=pawn&&pawn.owner;if(!owner||!owner.position)return false;
    const opts=options||{},ball=nearestBall(owner.position,finite(opts.radius,1.35));
    if(!ball||ball.mode==='penalty'||ball.locked||ball.inFlight)return false;
    const heading=owner.rotation?finite(owner.rotation.y,0):0,side=finite(opts.side,.12),distance=clamp(finite(opts.distance,.68),.35,1.1),tx=owner.position.x+Math.sin(heading)*distance+Math.cos(heading)*side,tz=owner.position.z+Math.cos(heading)*distance-Math.sin(heading)*side;
    const speed=Math.hypot(ball.vx,ball.vz);if(speed>finite(opts.captureSpeed,8))return false;
    const h=clamp(finite(dt,.016),.001,.05),responsiveness=clamp(finite(opts.responsiveness,11),1,24),maxTouch=clamp(finite(opts.maxTouchSpeed,7),1,12),desiredX=clamp((tx-ball.mesh.position.x)*responsiveness,-maxTouch,maxTouch),desiredZ=clamp((tz-ball.mesh.position.z)*responsiveness,-maxTouch,maxTouch),blend=1-Math.exp(-responsiveness*h);
    ball.vx+=(desiredX-ball.vx)*blend;ball.vz+=(desiredZ-ball.vz)*blend;ball.vy=Math.max(ball.vy,0);ball.controllerPawnId=pawn.id||null;return true;
  }
  function footPositions(pawn){
    const owner=pawn&&pawn.owner,THREE=window.THREE;if(!owner||!owner.position||!THREE)return [];
    const found=[];
    if(owner.traverse)owner.traverse(node=>{
      const key=String(node&&node.name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
      if(!/(leftfoot|rightfoot|footl|footr|lefttoebase|righttoebase)$/.test(key)||!node.getWorldPosition)return;
      const point=node.getWorldPosition(new THREE.Vector3());
      if(Number.isFinite(point.x)&&Number.isFinite(point.y)&&Number.isFinite(point.z))found.push(point);
    });
    if(found.length)return found;
    const heading=owner.rotation?finite(owner.rotation.y,0):0,fx=Math.sin(heading),fz=Math.cos(heading),sx=Math.cos(heading),sz=-Math.sin(heading);
    return [-1,1].map(side=>new THREE.Vector3(owner.position.x+fx*.2+sx*.13*side,owner.position.y+.08,owner.position.z+fz*.2+sz*.13*side));
  }
  // Physical foot engagement. It complements the soft dribble assist: actual
  // animated GLB foot bones are used when available, with a rig-independent
  // fallback for placeholders and differently named skeletons.
  function touchNearest(pawn,options,dt){
    const owner=pawn&&pawn.owner;if(!owner||!owner.position)return false;
    const ball=nearestBall(owner.position,finite(options&&options.radius,1.35));if(!ball||ball.inFlight||ball.resolved)return false;
    ball.touchCooldown=Math.max(0,finite(ball.touchCooldown,0)-clamp(finite(dt,.016),.001,.05));
    if(ball.touchCooldown>0)return false;
    const feet=footPositions(pawn),position=ball.mesh.position,history=pawn.state&&(pawn.state.soccerFootHistory||[]);
    let nearest=null,best=Infinity;
    feet.forEach((foot,index)=>{
      const previous=history[index],ax=previous?previous.x:foot.x,ay=previous?previous.y:foot.y,az=previous?previous.z:foot.z;
      const sx=foot.x-ax,sy=foot.y-ay,sz=foot.z-az,length2=sx*sx+sy*sy+sz*sz;
      const t=length2>1e-8?clamp(((position.x-ax)*sx+(position.y-ay)*sy+(position.z-az)*sz)/length2,0,1):1;
      const cx=ax+sx*t,cy=ay+sy*t,cz=az+sz*t,dx=position.x-cx,dy=position.y-cy,dz=position.z-cz,d2=dx*dx+dy*dy+dz*dz;
      if(d2<best){best=d2;nearest=foot;}
    });
    if(pawn.state)pawn.state.soccerFootHistory=feet.map(foot=>({x:foot.x,y:foot.y,z:foot.z}));
    const contactDistance=BALL_RADIUS+.13;if(!nearest||best>contactDistance*contactDistance)return false;
    const heading=owner.rotation?finite(owner.rotation.y,0):0,fx=Math.sin(heading),fz=Math.cos(heading);
    const pawnVX=finite(pawn.state&&pawn.state.velocityX,0),pawnVZ=finite(pawn.state&&pawn.state.velocityZ,0),forwardSpeed=Math.max(1.4,pawnVX*fx+pawnVZ*fz);
    ball.locked=false;ball.touchCooldown=.18;ball.controllerPawnId=pawn.id||null;
    ball.vx=fx*(2.1+forwardSpeed*.72)+pawnVX*.3;
    ball.vz=fz*(2.1+forwardSpeed*.72)+pawnVZ*.3;
    ball.vy=Math.max(.22,Math.abs(finite(pawn.state&&pawn.state.velocityY,0))*.12);
    ball.curve=0;
    physicsVelocity(ball);
    if(ball.mode==='penalty'){
      ball.inFlight=true;ball.resolved=false;ball.outcome=null;
      emitSoccerEvent('OnBallKicked',{ballId:ball.id,power:Math.hypot(ball.vx,ball.vz),curve:0,kickerPawnId:pawn.id||null,accidental:true});
      resolveBall(ball,'OnBallOut',{reason:'penalty-accidental-touch',kickerPawnId:pawn.id||null});
    }
    return true;
  }
  // Used by Soccer Pawn actions at their authored foot-contact time.
  function strikeNearest(pawn,options){
    const owner=pawn&&pawn.owner;if(!owner||!owner.position)return false;
    const opts=options||{},ball=nearestBall(owner.position,finite(opts.radius,1.65));if(!ball)return false;
    const action=String(opts.action||'shoot'),defaults=action==='pass'?{power:10,lift:.04,distance:12}:action==='cross'?{power:16,lift:.42,distance:24}:action==='tackle'?{power:8,lift:.02,distance:7}:{power:22,lift:.22,distance:30};
    ball.locked=false;
    return kick(ball.id,{target:opts.target||automaticTarget(pawn,ball,defaults.distance),power:finite(opts.power,defaults.power),lift:finite(opts.lift,defaults.lift),curve:finite(opts.curve,0),kickerPawnId:pawn.id||null});
  }

  function previewNearest(pawn,options){
    const owner=pawn&&pawn.owner;if(!owner||!owner.position)return false;
    const ball=nearestBall(owner.position,finite(options&&options.radius,1.8));if(!ball)return false;
    const velocity=plannedVelocity(ball,options||{});
    return drawTrajectory(ball,velocity,finite(options&&options.curve,0));
  }

  // Kick toward a world target with a given speed; lift adds arc, curve bends.
  function kick(id, options){
    const ball = state.balls.get(resolveId(id));
    if(!ball) return false;
    const opts = options || {};
    const target = opts.target || {};
    const tx = finite(target.x != null ? target.x : (Array.isArray(target) ? target[0] : 0), 0);
    const ty = finite(target.y != null ? target.y : (Array.isArray(target) ? target[1] : 1), 1);
    const tz = finite(target.z != null ? target.z : (Array.isArray(target) ? target[2] : 0), 0);
    const power = clamp(finite(opts.power, 18), 2, 40);
    const lift = clamp(finite(opts.lift, .25), 0, 1);
    const dx = tx - ball.mesh.position.x;
    const dz = tz - ball.mesh.position.z;
    const distance = Math.max(.5, Math.sqrt(dx * dx + dz * dz));
    ball.vx = dx / distance * power;
    ball.vz = dz / distance * power;
    // Vertical speed blends a flat drive with a lifted arc toward target height.
    ball.vy = clamp((ty - ball.mesh.position.y) / distance * power * .85 + lift * power * .38, -4, power * .8);
    ball.curve = clamp(finite(opts.curve, 0), -1, 1);
    physicsVelocity(ball);
    ball.inFlight = true;
    ball.resolved = false;
    ball.outcome = null;
    ball.stillTime = 0;
    drawTrajectory(ball,{x:ball.vx,y:ball.vy,z:ball.vz},ball.curve);
    emitSoccerEvent('OnBallKicked', {ballId:ball.id, power, target:{x:tx, y:ty, z:tz}, curve:ball.curve, kickerPawnId:opts.kickerPawnId || null});
    return true;
  }

  function ballState(id){
    const ball = state.balls.get(resolveId(id));
    if(!ball) return null;
    return {
      id:ball.id,
      position:{x:ball.mesh.position.x, y:ball.mesh.position.y, z:ball.mesh.position.z},
      velocity:{x:ball.vx, y:ball.vy, z:ball.vz},
      speedKmh:Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy + ball.vz * ball.vz) * 3.6,
      inFlight:ball.inFlight === true,
      mode:ball.mode,
      locked:ball.locked===true,
      resolved:ball.resolved === true,
      outcome:ball.outcome,
      netPulse:finite(ball.netPulse,0),
      physicsBackend:ball.physics?'cannon-complex':'fallback',
    };
  }

  function despawn(id){
    const ball = state.balls.get(resolveId(id));
    if(!ball) return false;
    if(ball.pawn) ball.pawn.dispose();
    else {
      if(ball.mesh && ball.mesh.parent) ball.mesh.parent.remove(ball.mesh);
      if(ball.trajectory&&ball.trajectory.parent)ball.trajectory.parent.remove(ball.trajectory);
      state.balls.delete(ball.id);
    }
    return true;
  }

  return Object.freeze({
    BALL_RADIUS, GOAL_WIDTH, GOAL_HEIGHT,
    spawn, despawn, reset, kick, strikeNearest, previewNearest, controlNearest, touchNearest, setMode,
    state:ballState,
    registerGoal, clearGoals,
    goals:() => Array.from(state.goals.values()),
    list:() => Array.from(state.balls.keys()),
  });
}

function install(GAME){
  if(!GAME) return null;
  if(GAME.systems && GAME.systems.soccerBall) return GAME.systems.soccerBall;
  const api = create(GAME);
  if(GAME.systems) GAME.systems.soccerBall = api;
  return api;
}

window.LK_RUNTIME_SOCCER_BALL = Object.freeze({BALL_RADIUS, GOAL_WIDTH, GOAL_HEIGHT, create, install});
if(window.LOT_KING) install(window.LOT_KING);
})();
