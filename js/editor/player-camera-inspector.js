/* =========================================================
   LOT KING — PLAYER CAMERA INSPECTOR
   Game camera, DOF and visual grade controls.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const GAME = deps.GAME;
  const markDirty = deps.markDirty;
  const section = deps.section;
  const selectRow = deps.selectRow;
  const sliderRow = deps.sliderRow;
  const btnRow = deps.btnRow;
  const checkRow = deps.checkRow;
  const colorRow = deps.colorRow;
  const el = deps.el;
  const pushHistory = deps.pushHistory || function(){};

  function normalizeCameraConfig(cam){
    cam.mode = cam.mode || 'free';
    cam.gameAutoAspect = !!cam.gameAutoAspect;
    cam.arcadeDistance = cam.arcadeDistance == null ? 9 : cam.arcadeDistance;
    cam.arcadeHeight = cam.arcadeHeight == null ? 3.1 : cam.arcadeHeight;
    cam.arcadeLag = cam.arcadeLag == null ? 5.8 : cam.arcadeLag;
    cam.reverseFrontSpeed = cam.reverseFrontSpeed == null ? 7 : cam.reverseFrontSpeed;
    cam.cinematicDriftOrbit = cam.cinematicDriftOrbit == null ? .18 : cam.cinematicDriftOrbit;
    cam.cinematicDriftClose = cam.cinematicDriftClose == null ? 1.65 : cam.cinematicDriftClose;
    cam.cinematicDriftHeight = cam.cinematicDriftHeight == null ? .45 : cam.cinematicDriftHeight;
    cam.cinematicLag = cam.cinematicLag == null ? 4.2 : cam.cinematicLag;
    cam.dof = Object.assign({enabled:false, focus:9, aperture:.025, maxblur:.04, autoFocus:true, focusRadius:.16, feather:.38, showFocus:false, bokeh:3}, cam.dof || {});
    delete cam.dof.exposure;
    if(cam.dof.aperture > 0 && cam.dof.aperture < .006) cam.dof.aperture = .025;
    if(cam.dof.maxblur > 0 && cam.dof.maxblur < .02) cam.dof.maxblur = .04;
    cam.grade = Object.assign({enabled:false, exposure:1, brightness:0, contrast:1, saturation:1, gamma:1}, cam.grade || {});
  }

  function build(box, targetPlayer){
    const player = targetPlayer || deps.player || GAME.player;
    const cam = player.cameraCfg;
    normalizeCameraConfig(cam);
    let replaying = false;
    const restore = snapshot => {
      replaying = true;
      Object.keys(cam).forEach(key => delete cam[key]); Object.assign(cam, JSON.parse(JSON.stringify(snapshot)));
      if(player.setCameraConfig) player.setCameraConfig(JSON.parse(JSON.stringify(snapshot)), true);
      else if(player.applyCameraCfg) player.applyCameraCfg();
      markDirty(); replaying = false;
    };
    const setCam = (patch, reset) => {
      const before = JSON.parse(JSON.stringify(cam));
      if(player.setCameraConfig) player.setCameraConfig(patch, reset);
      else { Object.assign(cam, patch); player.applyCameraCfg(); }
      markDirty();
      const after = JSON.parse(JSON.stringify(cam));
      if(!replaying && JSON.stringify(before) !== JSON.stringify(after)) pushHistory({label:'Vehicle Pawn camera',undo:() => restore(before),redo:() => restore(after)});
    };
    const sc = section('GAME CAMERA');
    sc.body.appendChild(selectRow('Mode', cam.mode, [
      {value:'free', label:'Default free orbit'},
      {value:'arcade', label:'Arcade follow'},
      {value:'cinematic', label:'Cinematic drift'},
    ], v => setCam({mode:v}, true)).root);
    sc.body.appendChild(selectRow('Aspect ratio', cam.aspect || 'auto', [
      {value:'auto', label:'Auto viewport'},
      {value:'16:9', label:'16:9 widescreen'},
      {value:'21:9', label:'21:9 cinematic'},
      {value:'2.39:1', label:'2.39:1 scope'},
      {value:'4:3', label:'4:3 classic'},
      {value:'1:1', label:'1:1 square'},
      {value:'9:16', label:'9:16 vertical'},
    ], v => setCam({aspect:v})).root);
    sc.body.appendChild(checkRow('Auto aspect in game', !!cam.gameAutoAspect, v => setCam({gameAutoAspect:v})).root);
    // fill outside the camera frame (letterbox / crop) — dark grey by default
    const lbHex = parseInt(String(cam.letterboxColor || '#141518').replace('#', ''), 16) || 0x141518;
    if(colorRow) sc.body.appendChild(colorRow('Frame background', lbHex, v => setCam({letterboxColor: '#' + ('000000' + (v >>> 0).toString(16)).slice(-6)})).root);
    sc.body.appendChild(sliderRow('Base FOV', cam.fov, 40, 100, 1, v => setCam({fov:v})).root);
    sc.body.appendChild(sliderRow('Speed FOV gain', cam.fovSpeedGain, 0, .5, .01, v => setCam({fovSpeedGain:v})).root);
    sc.body.appendChild(sliderRow('Free zoom min', cam.minDist, 2, 12, .5, v => setCam({minDist:v})).root);
    sc.body.appendChild(sliderRow('Free zoom max', cam.maxDist, 8, 40, .5, v => setCam({maxDist:v})).root);
    sc.body.appendChild(sliderRow('Arcade distance', cam.arcadeDistance, 4, 18, .25, v => setCam({arcadeDistance:v}), v => (+v).toFixed(2) + ' m').root);
    sc.body.appendChild(sliderRow('Arcade height', cam.arcadeHeight, 1.2, 7, .1, v => setCam({arcadeHeight:v}), v => (+v).toFixed(1) + ' m').root);
    sc.body.appendChild(sliderRow('Arcade smoothness', cam.arcadeLag, 1.5, 12, .1, v => setCam({arcadeLag:v}), v => (+v).toFixed(1)).root);
    sc.body.appendChild(sliderRow('Reverse front speed', cam.reverseFrontSpeed, 1, 16, .25, v => setCam({reverseFrontSpeed:v}), v => (+v).toFixed(1)).root);
    sc.body.appendChild(sliderRow('Drift orbit', cam.cinematicDriftOrbit, 0, .35, .01, v => setCam({cinematicDriftOrbit:v}), v => (+v).toFixed(2)).root);
    sc.body.appendChild(sliderRow('Drift close-up', cam.cinematicDriftClose, 0, 4, .05, v => setCam({cinematicDriftClose:v}), v => (+v).toFixed(2) + ' m').root);
    sc.body.appendChild(sliderRow('Drift height lift', cam.cinematicDriftHeight, 0, 1.8, .05, v => setCam({cinematicDriftHeight:v}), v => (+v).toFixed(2) + ' m').root);
    sc.body.appendChild(sliderRow('Cinematic smoothness', cam.cinematicLag, 1.5, 10, .1, v => setCam({cinematicLag:v}), v => (+v).toFixed(1)).root);
    sc.body.appendChild(sliderRow('View distance', cam.far, 100, 1500, 10, v => setCam({far:v})).root);
    sc.body.appendChild(sliderRow('Fog', cam.fogDensity, 0, .03, .0005, v => setCam({fogDensity:v}), v => (+v).toFixed(4)).root);
    sc.body.appendChild(sliderRow('Impact shake', cam.shake, 0, 2, .05, v => setCam({shake:v})).root);
    box.appendChild(sc.root);

    if(Array.isArray(player.cameraAnchors) && player.setActiveCameraAnchor){
      const anchors = section('CAMERA ANCHORS', false);
      anchors.body.appendChild(selectRow('Active anchor', player.activeCameraAnchorId || 'camera_anchor', player.cameraAnchors.map(item => ({value:item.id, label:item.label || item.name || item.id})), value => { player.setActiveCameraAnchor(value); markDirty(); }).root);
      if(btnRow) anchors.body.appendChild(btnRow([
        {label:'+ Camera anchor', action:() => { if(player.addCameraAnchor) player.addCameraAnchor(); markDirty(); }},
        {label:'Remove active', action:() => { if(player.removeCameraAnchor) player.removeCameraAnchor(player.activeCameraAnchorId); markDirty(); }},
      ]));
      anchors.body.appendChild(el('<div class="lk-hint">Additional anchors remain children of this Pawn and can be positioned from its Logic Hierarchy.</div>'));
      box.appendChild(anchors.root);
    }

    const sdof = section('DEPTH OF FIELD (DOF)');
    if(!GAME.systems.post || !GAME.systems.post.ok){
      sdof.body.appendChild(el('<div class="lk-hint">Post-processing scripts are not loaded, so DOF is unavailable.</div>'));
    } else {
      const updDof = patch => setCam({dof:Object.assign({}, cam.dof, patch)});
      sdof.body.appendChild(checkRow('Enabled in game camera', cam.dof.enabled, v => updDof({enabled:v})).root);
      sdof.body.appendChild(checkRow('Auto focus player', cam.dof.autoFocus !== false, v => updDof({autoFocus:v})).root);
      sdof.body.appendChild(checkRow('Show focus marker', !!cam.dof.showFocus, v => updDof({showFocus:v})).root);
      sdof.body.appendChild(sliderRow('Manual focus distance', cam.dof.focus, .5, 80, .25, v => updDof({focus:v}), v => (+v).toFixed(2) + ' m').root);
      sdof.body.appendChild(sliderRow('Aperture strength', cam.dof.aperture, 0, .12, .001, v => updDof({aperture:v}), v => (+v).toFixed(3)).root);
      sdof.body.appendChild(sliderRow('Max blur', cam.dof.maxblur, 0, .25, .002, v => updDof({maxblur:v}), v => (+v).toFixed(3)).root);
      sdof.body.appendChild(sliderRow('Bokeh highlights', cam.dof.bokeh == null ? 3 : cam.dof.bokeh, 0, 8, .1, v => updDof({bokeh:v}), v => (+v).toFixed(1)).root);
      sdof.body.appendChild(sliderRow('Focus area', cam.dof.focusRadius, .04, .5, .005, v => updDof({focusRadius:v}), v => (+v).toFixed(3)).root);
      sdof.body.appendChild(sliderRow('Blur falloff', cam.dof.feather, .08, .75, .005, v => updDof({feather:v}), v => (+v).toFixed(3)).root);
      sdof.body.appendChild(el('<div class="lk-hint">Visible in Launch Track, Play Preview and Player Camera when post-processing is available.</div>'));
    }
    box.appendChild(sdof.root);

    const sgrade = section('VISUAL GRADE');
    if(!GAME.systems.post || !GAME.systems.post.ok){
      sgrade.body.appendChild(el('<div class="lk-hint">Post-processing scripts are not loaded, so visual grading is unavailable.</div>'));
    } else {
      const updGrade = patch => setCam({grade:Object.assign({}, cam.grade, patch)});
      sgrade.body.appendChild(checkRow('Enabled', cam.grade.enabled, v => updGrade({enabled:v})).root);
      sgrade.body.appendChild(sliderRow('Exposure', cam.grade.exposure, .35, 2.4, .01, v => updGrade({exposure:v}), v => (+v).toFixed(2)).root);
      sgrade.body.appendChild(sliderRow('Brightness', cam.grade.brightness, -.35, .35, .01, v => updGrade({brightness:v}), v => (+v).toFixed(2)).root);
      sgrade.body.appendChild(sliderRow('Gamma', cam.grade.gamma, .55, 1.8, .01, v => updGrade({gamma:v}), v => (+v).toFixed(2)).root);
      sgrade.body.appendChild(sliderRow('Contrast', cam.grade.contrast, .45, 1.8, .01, v => updGrade({contrast:v}), v => (+v).toFixed(2)).root);
      sgrade.body.appendChild(sliderRow('Saturation', cam.grade.saturation, 0, 2, .01, v => updGrade({saturation:v}), v => (+v).toFixed(2)).root);
      sgrade.body.appendChild(el('<div class="lk-hint">These controls affect the actual gameplay camera render, including Play Preview.</div>'));
    }
    box.appendChild(sgrade.root);
  }

  return Object.freeze({build});
}

window.LK_EDITOR_PLAYER_CAMERA_INSPECTOR = Object.freeze({create});
})();
