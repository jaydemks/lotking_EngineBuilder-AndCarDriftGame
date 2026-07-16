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
  if(THREE.sRGBEncoding != null) texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function createBallMesh(THREE){
  const material = new THREE.MeshStandardMaterial({map:makeBallTexture(THREE), roughness:.42, metalness:.05});
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 24, 18), material);
  mesh.castShadow = true;
  mesh.userData.nonExportable = true;
  mesh.userData.soccerBall = true;
  mesh.userData.logicElementRuntimeVisual = true;
  return mesh;
}

function create(GAME){
  const state = {
    balls:new Map(),   // id -> ball record
    goals:new Map(),   // id -> goal frame definition
    nextBall:1,
    nextGoal:1,
  };

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
      team:String(opts.team || ''),
    });
    return id;
  }
  function clearGoals(){ state.goals.clear(); }

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
      const reach = finite(pawn.config.keeper && pawn.config.keeper.reach, 1.1);
      const px = pawn.owner.position.x, pz = pawn.owner.position.z;
      const chestY = pawn.owner.position.y + (pawn.state && pawn.state.diving ? .7 : 1.05);
      const dx = ball.mesh.position.x - px;
      const dy = ball.mesh.position.y - chestY;
      const dz = ball.mesh.position.z - pz;
      const horizontalReach = reach * (pawn.state && pawn.state.diving ? 1.6 : 1);
      if(dx * dx + dz * dz <= horizontalReach * horizontalReach && Math.abs(dy) <= reach + .6) return pawn;
    }
    return null;
  }

  function resolveBall(ball, outcome, payload){
    if(ball.resolved) return;
    ball.resolved = true;
    ball.outcome = outcome;
    emitSoccerEvent(outcome, Object.assign({ballId:ball.id, ball:ball.mesh.position.clone ? {x:ball.mesh.position.x, y:ball.mesh.position.y, z:ball.mesh.position.z} : null}, payload || {}));
  }

  function stepBall(ball, dt){
    const h = clamp(finite(dt, .016), .0001, .05);
    const mesh = ball.mesh;
    if(!mesh) return;
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

      if(!ball.resolved && ball.inFlight){
        // Goalkeeper save.
        const keeper = keeperSaveCheck(ball);
        if(keeper){
          ball.vx *= -.25; ball.vz *= -.25; ball.vy = Math.max(1.4, Math.abs(ball.vy) * .4);
          ball.curve = 0;
          ball.inFlight = false;
          resolveBall(ball, 'OnBallSaved', {keeperPawnId:keeper.id, playerId:keeper.playerId});
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
              ball.vx *= .25; ball.vz *= .25;
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
      ball = {id, mesh, vx:0, vy:0, vz:0, curve:0, inFlight:false, resolved:false, outcome:null, stillTime:0, groundY:finite(opts.groundY, 0) + BALL_RADIUS, spawn:{x:0, y:0, z:0}};
      state.balls.set(id, ball);
      scene.add(mesh);
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
            state.balls.delete(id);
            registry.unregister(this);
            return true;
          },
        };
        registry.register(ball.pawn);
      }
    }
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
    ball.inFlight = false; ball.resolved = false; ball.outcome = null; ball.stillTime = 0;
    return true;
  }

  function firstBallId(){
    const first = state.balls.keys().next();
    return first && !first.done ? first.value : null;
  }
  function resolveId(id){
    return id == null || id === '' || id === 'self' ? firstBallId() : String(id);
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
    ball.inFlight = true;
    ball.resolved = false;
    ball.outcome = null;
    ball.stillTime = 0;
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
      resolved:ball.resolved === true,
      outcome:ball.outcome,
    };
  }

  function despawn(id){
    const ball = state.balls.get(resolveId(id));
    if(!ball) return false;
    if(ball.pawn) ball.pawn.dispose();
    else {
      if(ball.mesh && ball.mesh.parent) ball.mesh.parent.remove(ball.mesh);
      state.balls.delete(ball.id);
    }
    return true;
  }

  return Object.freeze({
    BALL_RADIUS, GOAL_WIDTH, GOAL_HEIGHT,
    spawn, despawn, reset, kick,
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
