/* =========================================================
   LOT KING - EDITOR CINEMA STUDIO
   Sequencer UI, shot tracks, animated targets and timeline evaluation.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const GAME = deps.GAME;
  const ED = deps.ED;
  const root = deps.root;
  const cinemaTimeline = root.querySelector('#lkCinemaTimeline');
  const cinemaPlayBtn = root.querySelector('#lkCinemaTlPlay');
  const cinemaStopBtn = root.querySelector('#lkCinemaTlStop');
  const cinemaLockBtn = root.querySelector('#lkCinemaTlLock');
  const cinemaDockBtn = root.querySelector('#lkCinemaTlDock');
  const cinemaCloseBtn = root.querySelector('#lkCinemaTlClose');
  const cinemaDeleteBtn = root.querySelector('#lkCinemaTlDelete');
  const cinemaCurveBtn = root.querySelector('#lkCinemaTlCurve');
  const cinemaCurvePanel = root.querySelector('#lkCinemaCurvePanel');
  const cinemaCurveMode = root.querySelector('#lkCinemaCurveMode');
  const cinemaAddCutBtn = root.querySelector('#lkCinemaTlAddCut');
  const cinemaCameraSelect = root.querySelector('#lkCinemaTlCamera');
  const cinemaObjectSelect = root.querySelector('#lkCinemaTlObject');
  const cinemaAddObjectBtn = root.querySelector('#lkCinemaTlAddObject');
  const cinemaKeyObjectBtn = root.querySelector('#lkCinemaTlKeyObject');
  const cinemaScrub = root.querySelector('#lkCinemaTlScrub');

  if(cinemaPlayBtn) cinemaPlayBtn.addEventListener('click', () => {
    const studio = activeStudio();
    if(studio) startTimeline(studio, !(ED.cinemaPreview && ED.cinemaPreview.id === studio.userData.editorId && ED.cinemaPreview.playing));
  });
  if(cinemaStopBtn) cinemaStopBtn.addEventListener('click', () => {
    ED.cinemaPreview = null;
    syncTimeline(currentViewportRect());
  });
  if(cinemaLockBtn) cinemaLockBtn.addEventListener('click', () => {
    const studio = activeStudio();
    if(!studio) return;
    ED.cinemaTimelineLocked = !ED.cinemaTimelineLocked;
    ED.cinemaTimelineId = studio.userData.editorId;
    ED.cinemaTimelineOpen = true;
    syncTimeline(currentViewportRect());
  });
  if(cinemaDockBtn) cinemaDockBtn.addEventListener('click', () => {
    ED.cinemaTimelineDocked = !ED.cinemaTimelineDocked;
    syncTimeline(currentViewportRect());
  });
  if(cinemaCloseBtn) cinemaCloseBtn.addEventListener('click', () => {
    const studio = activeStudio();
    ED.cinemaTimelineOpen = false;
    ED.cinemaTimelineLocked = false;
    ED.cinemaTimelineClosedId = studio && studio.userData && studio.userData.editorId || null;
    ED.cinemaTimelineId = null;
    ED.cinemaSelectedItem = null;
    hideTimeline();
  });
  if(cinemaDeleteBtn) cinemaDeleteBtn.addEventListener('click', () => deleteSelectedItem());
  if(cinemaCurveBtn) cinemaCurveBtn.addEventListener('click', () => {
    if(cinemaCurvePanel) cinemaCurvePanel.classList.toggle('on');
  });
  if(cinemaCurveMode) cinemaCurveMode.addEventListener('change', () => setSelectedKeyCurve(cinemaCurveMode.value));
  if(cinemaAddCutBtn) cinemaAddCutBtn.addEventListener('click', () => addCutFromTimeline());
  if(cinemaObjectSelect) cinemaObjectSelect.addEventListener('change', () => selectTrackFromTarget(cinemaObjectSelect.value));
  if(cinemaAddObjectBtn) cinemaAddObjectBtn.addEventListener('click', () => addObjectTrack());
  if(cinemaKeyObjectBtn) cinemaKeyObjectBtn.addEventListener('click', () => keyObjectTrack());
  if(cinemaScrub) cinemaScrub.addEventListener('input', () => {
    const studio = activeStudio();
    if(!studio) return;
    ED.cinemaPreview = {id:studio.userData.editorId, time:Number(cinemaScrub.value) || 0, playing:false};
    updatePreview(0);
    syncTimeline(currentViewportRect());
  });

  function currentViewportRect(){
    return deps.editorViewportRect ? deps.editorViewportRect() : {x:0, y:0, w:innerWidth, h:innerHeight};
  }
  function markDirty(){
    if(deps.markDirty) deps.markDirty();
  }
  function buildInspector(){
    if(deps.buildInspector) deps.buildInspector();
  }
  function sceneCameras(){
    if(deps.sceneCameras) return deps.sceneCameras();
    return GAME.world.registry.filter(o => o && o.userData && o.userData.editorType === 'camera' && o.userData.sceneCamera);
  }
  function activeStudio(){
    if(ED.selected && ED.selected.userData && ED.selected.userData.editorType === 'cinemaStudio'){
      if(ED.cinemaTimelineClosedId === ED.selected.userData.editorId && !ED.cinemaTimelineLocked && !ED.cinemaTimelineOpen) return null;
      ED.cinemaTimelineId = ED.selected.userData.editorId;
      ED.cinemaTimelineOpen = true;
      return ED.selected;
    }
    if(ED.cinemaTimelineId && (ED.cinemaTimelineLocked || ED.cinemaTimelineOpen)){
      const locked = GAME.world.registry.find(o => o && o.userData && o.userData.editorId === ED.cinemaTimelineId && o.userData.editorType === 'cinemaStudio');
      if(locked) return locked;
    }
    if(ED.cinemaPreview && ED.cinemaPreview.id){
      return GAME.world.registry.find(o => o && o.userData && o.userData.editorId === ED.cinemaPreview.id && o.userData.editorType === 'cinemaStudio') || null;
    }
    return null;
  }
  function propsFor(studio){
    const props = studio.userData.cinemaProps || {};
    props.duration = Math.max(.1, Number(props.duration) || 6);
    props.fps = Math.max(1, Number(props.fps) || 24);
    props.playback = props.playback || 'one-shot';
    if(!Array.isArray(props.movieTrack)) props.movieTrack = [];
    if(!Array.isArray(props.objectTracks)) props.objectTracks = [];
    if(!Array.isArray(props.keyframes)) props.keyframes = [];
    props.movieTrack.forEach((shot, index) => {
      shot.id = shot.id || ('shot_' + index + '_' + Date.now().toString(36));
      shot.type = 'shot';
      shot.time = Math.max(0, Number(shot.time) || 0);
      shot.duration = Math.max(.05, Number(shot.duration) || Math.min(2, props.duration));
    });
    props.objectTracks.forEach(track => {
      track.id = track.id || ('objtrack_' + Date.now().toString(36));
      track.type = 'object';
      if(!Array.isArray(track.keyframes)) track.keyframes = [];
      track.keyframes.forEach((key, index) => {
        key.id = key.id || ('key_' + index + '_' + Date.now().toString(36));
        key.curve = key.curve || 'linear';
      });
    });
    studio.userData.cinemaProps = props;
    return props;
  }
  function cameraLabel(id){
    const cam = GAME.world.registry.find(item => item && item.userData && item.userData.editorId === id);
    return cam && (cam.userData.editorName || cam.userData.editorId) || id || 'Camera';
  }
  function timelineObjects(){
    return GAME.world.registry.filter(o => o && o.userData && o.userData.editorId && o.userData.editorType !== 'cinemaStudio');
  }
  function objectLabel(id){
    const obj = GAME.world.registry.find(item => item && item.userData && item.userData.editorId === id);
    return obj && (obj.userData.editorName || obj.userData.editorId) || id || 'Object';
  }
  function selectedTime(studio){
    return ED.cinemaPreview && ED.cinemaPreview.id === studio.userData.editorId ? ED.cinemaPreview.time : 0;
  }
  function transformKeyForObject(obj, time){
    return {
      id:'key_' + Date.now().toString(36),
      time:Math.max(0, Number(time) || 0),
      position:[obj.position.x, obj.position.y, obj.position.z],
      rotation:[obj.rotation.x, obj.rotation.y, obj.rotation.z],
      scale:[obj.scale.x, obj.scale.y, obj.scale.z],
      curve:'linear',
    };
  }
  function selectedSceneCameraId(){
    return ED.selected && ED.selected.userData && ED.selected.userData.editorType === 'camera' ? ED.selected.userData.editorId : '';
  }
  function selectedTimelineObjectId(){
    return ED.selected && ED.selected.userData && ED.selected.userData.editorId && ED.selected.userData.editorType !== 'cinemaStudio'
      ? ED.selected.userData.editorId
      : '';
  }
  function startTimeline(studio, playing){
    const props = propsFor(studio);
    const current = ED.cinemaPreview && ED.cinemaPreview.id === studio.userData.editorId ? ED.cinemaPreview.time : 0;
    ED.viewportMode = 'quad';
    ED.cinemaTimelineClosedId = null;
    ED.cinemaTimelineId = studio.userData.editorId;
    ED.cinemaTimelineOpen = true;
    ED.cinemaPreview = {id:studio.userData.editorId, time:Math.max(0, Math.min(props.duration, current || 0)), playing:!!playing};
    updatePreview(0);
  }
  function addCutFromTimeline(){
    const studio = activeStudio();
    if(!studio) return;
    const props = propsFor(studio);
    const cameraId = selectedSceneCameraId() || (cinemaCameraSelect && cinemaCameraSelect.value) || props.previewCamera || '';
    if(!cameraId) return;
    const time = selectedTime(studio);
    const shot = {
      id:'shot_' + Date.now().toString(36),
      type:'shot',
      time:Math.max(0, Math.min(props.duration, time || 0)),
      duration:Math.min(2, Math.max(.25, props.duration - (time || 0))),
      cameraId,
    };
    props.movieTrack.push(shot);
    selectItem({type:'shot', id:shot.id});
    props.movieTrack.sort((a,b) => (a.time || 0) - (b.time || 0));
    studio.userData.cinemaProps = props;
    markDirty();
    buildInspector();
    syncTimeline(currentViewportRect());
  }
  function addObjectTrack(){
    const studio = activeStudio();
    if(!studio) return;
    const props = propsFor(studio);
    const targetId = selectedTimelineObjectId() || (cinemaObjectSelect && cinemaObjectSelect.value) || '';
    const obj = GAME.world.registry.find(item => item && item.userData && item.userData.editorId === targetId);
    if(!obj) return;
    let track = props.objectTracks.find(item => item.targetId === targetId);
    if(!track){
      track = {id:'objtrack_' + Date.now().toString(36), type:'object', targetId, keyframes:[]};
      props.objectTracks.push(track);
    }
    const key = transformKeyForObject(obj, selectedTime(studio));
    track.keyframes.push(key);
    track.keyframes.sort((a,b) => (a.time || 0) - (b.time || 0));
    selectItem({type:'objectKey', id:track.id, keyId:key.id, curve:key.curve || 'linear'});
    studio.userData.cinemaProps = props;
    markDirty();
    buildInspector();
    syncTimeline(currentViewportRect());
  }
  function keyObjectTrack(){
    addObjectTrack();
  }
  function selectedItemMatches(type, id, keyId){
    const item = ED.cinemaSelectedItem || {};
    return item.type === type && item.id === id && (!keyId || item.keyId === keyId);
  }
  function selectItem(item){
    ED.cinemaSelectedItem = item;
    if(cinemaCurvePanel) cinemaCurvePanel.classList.toggle('on', item && item.type === 'objectKey');
    if(cinemaCurveMode && item && item.type === 'objectKey') cinemaCurveMode.value = item.curve || 'linear';
  }
  function selectTrackFromTarget(targetId){
    const studio = activeStudio();
    if(!studio) return;
    if(!targetId){
      selectItem(null);
      syncTimeline(currentViewportRect());
      return;
    }
    const track = propsFor(studio).objectTracks.find(item => item.targetId === targetId);
    selectItem(track ? {type:'objectTrack', id:track.id} : null);
    syncTimeline(currentViewportRect());
  }
  function selectedTargetId(studio){
    const item = ED.cinemaSelectedItem;
    if(!studio || !item || (item.type !== 'objectTrack' && item.type !== 'objectKey')) return '';
    const track = propsFor(studio).objectTracks.find(t => t.id === item.id);
    return track && track.targetId || '';
  }
  function deleteLabel(){
    const item = ED.cinemaSelectedItem;
    if(!item) return 'Delete';
    if(item.type === 'shot') return 'Delete shot';
    if(item.type === 'objectTrack') return 'Delete target';
    if(item.type === 'objectKey') return 'Delete key';
    return 'Delete';
  }
  function deleteSelectedItem(){
    const studio = activeStudio();
    const item = ED.cinemaSelectedItem;
    if(!studio || !item) return;
    const props = propsFor(studio);
    if(item.type === 'shot'){
      props.movieTrack = props.movieTrack.filter(shot => shot.id !== item.id);
    } else if(item.type === 'objectTrack'){
      props.objectTracks = props.objectTracks.filter(track => track.id !== item.id);
    } else if(item.type === 'objectKey'){
      const track = props.objectTracks.find(t => t.id === item.id);
      if(track) track.keyframes = (track.keyframes || []).filter(key => key.id !== item.keyId);
    }
    studio.userData.cinemaProps = props;
    ED.cinemaSelectedItem = null;
    if(cinemaCurvePanel) cinemaCurvePanel.classList.remove('on');
    markDirty();
    buildInspector();
    syncTimeline(currentViewportRect());
  }
  function setSelectedKeyCurve(mode){
    const studio = activeStudio();
    const item = ED.cinemaSelectedItem;
    if(!studio || !item || item.type !== 'objectKey') return;
    const props = propsFor(studio);
    const track = props.objectTracks.find(t => t.id === item.id);
    const key = track && (track.keyframes || []).find(k => k.id === item.keyId);
    if(!key) return;
    key.curve = mode || 'linear';
    item.curve = key.curve;
    studio.userData.cinemaProps = props;
    markDirty();
    syncTimeline(currentViewportRect());
  }
  function syncSelect(select, options, value){
    if(!select) return;
    const current = value || select.value;
    select.innerHTML = '';
    options.forEach(opt => {
      const node = document.createElement('option');
      node.value = opt.value;
      node.textContent = opt.label;
      select.appendChild(node);
    });
    select.value = options.some(opt => opt.value === current) ? current : (options[0] && options[0].value || '');
  }
  function syncTimeline(viewRect){
    if(!cinemaTimeline) return;
    const studio = activeStudio();
    const on = !!(studio && ED.active && !ED.playPreview);
    ED.cinemaTimelineOpen = on;
    cinemaTimeline.classList.toggle('on', on);
    if(!on) return;
    const props = propsFor(studio);
    const state = ED.cinemaPreview && ED.cinemaPreview.id === studio.userData.editorId ? ED.cinemaPreview : null;
    const time = Math.max(0, Math.min(props.duration, state ? state.time || 0 : 0));
    const x = viewRect.x + 12;
    const w = Math.max(260, viewRect.w - 24);
    cinemaTimeline.style.left = x + 'px';
    cinemaTimeline.style.top = (ED.cinemaTimelineDocked ? viewRect.y + viewRect.h + 8 : Math.max(viewRect.y + 70, viewRect.y + viewRect.h - 112)) + 'px';
    cinemaTimeline.style.width = w + 'px';
    const name = cinemaTimeline.querySelector('#lkCinemaTlName');
    const clock = cinemaTimeline.querySelector('#lkCinemaTlClock');
    const track = cinemaTimeline.querySelector('#lkCinemaTlTrack');
    syncSelect(cinemaCameraSelect, [{value:'', label:'Choose camera'}].concat(sceneCameras().map(cam => ({value:cam.userData.editorId, label:cam.userData.editorName || cam.userData.editorId}))), selectedSceneCameraId() || props.previewCamera);
    syncSelect(cinemaObjectSelect, [{value:'', label:'Choose target'}].concat(timelineObjects().map(obj => ({value:obj.userData.editorId, label:obj.userData.editorName || obj.userData.editorId}))), selectedTargetId(studio) || selectedTimelineObjectId());
    if(name) name.textContent = studio.userData.editorName || 'Cinema Studio';
    if(clock) clock.textContent = time.toFixed(2) + ' / ' + props.duration.toFixed(2) + ' s';
    if(cinemaPlayBtn) cinemaPlayBtn.textContent = state && state.playing ? 'Pause' : 'Play';
    if(cinemaLockBtn) cinemaLockBtn.classList.toggle('on', !!ED.cinemaTimelineLocked);
    if(cinemaDockBtn) cinemaDockBtn.classList.toggle('on', !!ED.cinemaTimelineDocked);
    if(cinemaDeleteBtn){
      cinemaDeleteBtn.disabled = !ED.cinemaSelectedItem;
      cinemaDeleteBtn.textContent = deleteLabel();
    }
    if(cinemaScrub){
      cinemaScrub.max = props.duration;
      cinemaScrub.step = 1 / Math.max(1, props.fps || 24);
      cinemaScrub.value = time;
    }
    if(track){
      track.innerHTML = '';
      const playhead = document.createElement('button');
      playhead.type = 'button';
      playhead.className = 'lk-cinema-playhead';
      playhead.style.left = (time / props.duration * 100) + '%';
      playhead.title = 'Current time';
      track.appendChild(playhead);
      props.movieTrack.slice().sort((a,b) => (a.time || 0) - (b.time || 0)).forEach(cut => {
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = 'lk-cinema-marker';
        const left = Math.max(0, Math.min(props.duration, cut.time || 0)) / props.duration * 100;
        const width = Math.max(2, Math.min(props.duration, cut.duration || 1) / props.duration * 100);
        marker.style.left = left + '%';
        marker.style.width = width + '%';
        marker.style.transform = 'none';
        marker.style.minWidth = '0';
        marker.style.maxWidth = 'none';
        marker.classList.toggle('selected', selectedItemMatches('shot', cut.id));
        marker.textContent = cameraLabel(cut.cameraId).slice(0, 14);
        marker.title = (cut.time || 0).toFixed(2) + 's - ' + ((cut.time || 0) + (cut.duration || 0)).toFixed(2) + 's | ' + cameraLabel(cut.cameraId);
        marker.addEventListener('click', () => {
          selectItem({type:'shot', id:cut.id});
          ED.cinemaPreview = {id:studio.userData.editorId, time:Math.max(0, Math.min(props.duration, cut.time || 0)), playing:false};
          updatePreview(0);
          syncTimeline(currentViewportRect());
        });
        track.appendChild(marker);
      });
      props.objectTracks.forEach((objTrack, trackIndex) => {
        (objTrack.keyframes || []).forEach(key => {
          const marker = document.createElement('button');
          marker.type = 'button';
          marker.className = 'lk-cinema-marker object';
          marker.classList.toggle('selected', selectedItemMatches('objectKey', objTrack.id, key.id));
          marker.style.left = (Math.max(0, Math.min(props.duration, key.time || 0)) / props.duration * 100) + '%';
          marker.style.top = (3 + ((trackIndex + 1) % 2) * 0) + 'px';
          marker.textContent = objectLabel(objTrack.targetId).slice(0, 12);
          marker.title = 'Target key ' + (key.time || 0).toFixed(2) + 's | ' + objectLabel(objTrack.targetId);
          marker.addEventListener('click', () => {
            selectItem({type:'objectKey', id:objTrack.id, keyId:key.id, curve:key.curve || 'linear'});
            ED.cinemaPreview = {id:studio.userData.editorId, time:Math.max(0, Math.min(props.duration, key.time || 0)), playing:false};
            applyAtTime(studio, ED.cinemaPreview.time);
            syncTimeline(currentViewportRect());
          });
          track.appendChild(marker);
        });
      });
    }
  }
  function activeShot(props, time){
    const shots = props.movieTrack.slice().sort((a,b) => (a.time || 0) - (b.time || 0));
    return shots.find(shot => time >= (shot.time || 0) && time < (shot.time || 0) + (shot.duration || 0)) ||
      shots.filter(shot => (shot.time || 0) <= time).pop() ||
      shots[0] || null;
  }
  function lerpArray(a, b, t){
    return a.map((value, index) => value + ((b[index] == null ? value : b[index]) - value) * t);
  }
  function curveAlpha(t, mode){
    const x = Math.max(0, Math.min(1, t));
    if(mode === 'ease-in') return x * x;
    if(mode === 'ease-out') return 1 - Math.pow(1 - x, 2);
    if(mode === 'ease-in-out' || mode === 'manual') return x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    return x;
  }
  function applyTransformKey(obj, key){
    if(!obj || !key) return;
    if(key.position) obj.position.fromArray(key.position);
    if(key.rotation) obj.rotation.set(key.rotation[0] || 0, key.rotation[1] || 0, key.rotation[2] || 0);
    if(key.scale) obj.scale.fromArray(key.scale);
    obj.updateMatrixWorld(true);
  }
  function shouldSkipEditableTarget(track, opts){
    if(!opts || !opts.skipEditableTarget || !track) return false;
    const selectedId = selectedTimelineObjectId();
    return !!(selectedId && track.targetId === selectedId);
  }
  function applyObjectTrack(track, time, opts){
    if(shouldSkipEditableTarget(track, opts)) return;
    const obj = GAME.world.registry.find(item => item && item.userData && item.userData.editorId === track.targetId);
    const keys = (track.keyframes || []).slice().sort((a,b) => (a.time || 0) - (b.time || 0));
    if(!obj || !keys.length) return;
    let prev = keys[0], next = keys[keys.length - 1];
    for(let i = 0; i < keys.length; i++){
      if((keys[i].time || 0) <= time) prev = keys[i];
      if((keys[i].time || 0) >= time){ next = keys[i]; break; }
    }
    if(prev === next || (next.time || 0) === (prev.time || 0)){
      applyTransformKey(obj, prev);
      return;
    }
    const alpha = curveAlpha((time - (prev.time || 0)) / ((next.time || 0) - (prev.time || 0)), prev.curve || 'linear');
    applyTransformKey(obj, {
      position:lerpArray(prev.position || [obj.position.x, obj.position.y, obj.position.z], next.position || [obj.position.x, obj.position.y, obj.position.z], alpha),
      rotation:lerpArray(prev.rotation || [obj.rotation.x, obj.rotation.y, obj.rotation.z], next.rotation || [obj.rotation.x, obj.rotation.y, obj.rotation.z], alpha),
      scale:lerpArray(prev.scale || [obj.scale.x, obj.scale.y, obj.scale.z], next.scale || [obj.scale.x, obj.scale.y, obj.scale.z], alpha),
    });
  }
  function applyAtTime(studio, time, opts){
    const props = propsFor(studio);
    const t = Math.max(0, Math.min(props.duration, Number(time) || 0));
    props.objectTracks.forEach(track => applyObjectTrack(track, t, opts));
    return activeShot(props, t);
  }
  function updatePreview(dt){
    const state = ED.cinemaPreview;
    if(!state) return;
    const studio = GAME.world.registry.find(o => o && o.userData && o.userData.editorId === state.id && o.userData.editorType === 'cinemaStudio');
    if(!studio){ ED.cinemaPreview = null; return; }
    const props = propsFor(studio);
    if(state.playing){
      state.time += Math.max(0, dt || 0);
      const duration = Math.max(.1, props.duration || 6);
      if(state.time > duration){
        if(props.playback === 'loop') state.time %= duration;
        else { state.time = duration; state.playing = false; }
      }
    }
    const cut = applyAtTime(studio, state.time, {skipEditableTarget:!state.playing});
    if(cut && cut.cameraId && ED.viewportSlots[1] !== 'timeline:' + studio.userData.editorId){
      ED.viewportMode = 'quad';
      ED.viewportSlots[1] = 'timeline:' + studio.userData.editorId;
    }
  }
  function hideTimeline(){
    if(cinemaTimeline) cinemaTimeline.classList.remove('on');
  }

  return Object.freeze({
    activeStudio,
    applyAtTime,
    hideTimeline,
    propsFor,
    syncTimeline,
    updatePreview,
  });
}

window.LK_EDITOR_CINEMA_STUDIO = Object.freeze({create});
})();
