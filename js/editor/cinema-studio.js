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
  const cinemaFloatPreviewBtn = root.querySelector('#lkCinemaTlFloatPreview');
  const cinemaPreviewModeBtn = root.querySelector('#lkCinemaTlPreviewMode');
  const cinemaAspectSelect = root.querySelector('#lkCinemaTlAspect');
  const cinemaZoomOutBtn = root.querySelector('#lkCinemaTlZoomOut');
  const cinemaZoomInBtn = root.querySelector('#lkCinemaTlZoomIn');
  const cinemaZoomResetBtn = root.querySelector('#lkCinemaTlZoomReset');
  const cinemaCloseBtn = root.querySelector('#lkCinemaTlClose');
  const cinemaDuplicateBtn = root.querySelector('#lkCinemaTlDuplicate');
  const cinemaDeleteBtn = root.querySelector('#lkCinemaTlDelete');
  const cinemaCurveBtn = root.querySelector('#lkCinemaTlCurve');
  const cinemaCurvePanel = root.querySelector('#lkCinemaCurvePanel');
  const cinemaCurveMode = root.querySelector('#lkCinemaCurveMode');
  const cinemaAddCutBtn = root.querySelector('#lkCinemaTlAddCut');
  const cinemaInsertCutBtn = root.querySelector('#lkCinemaTlInsertCut');
  const cinemaAppendCutBtn = root.querySelector('#lkCinemaTlAppendCut');
  const cinemaAddMarkerBtn = root.querySelector('#lkCinemaTlAddMarker');
  const cinemaAddEventBtn = root.querySelector('#lkCinemaTlAddEvent');
  const cinemaCameraSelect = root.querySelector('#lkCinemaTlCamera');
  const cinemaObjectSelect = root.querySelector('#lkCinemaTlObject');
  const cinemaAddObjectBtn = root.querySelector('#lkCinemaTlAddObject');
  const cinemaKeyObjectBtn = root.querySelector('#lkCinemaTlKeyObject');
  const cinemaKeyLensBtn = root.querySelector('#lkCinemaTlKeyLens');
  const cinemaRuler = root.querySelector('#lkCinemaTlRuler');
  const cinemaPlayhead = root.querySelector('#lkCinemaTlPlayhead');
  const cinemaClipPanel = root.querySelector('#lkCinemaClipPanel');
  const cinemaViewportHud = root.querySelector('#lkCinemaViewportHud');
  let shotDrag = null;
  let keyDrag = null;
  let lensDrag = null;
  let eventDrag = null;
  let markerDrag = null;
  let playheadDrag = null;
  let timelineNotice = null;

  if(cinemaTimeline) cinemaTimeline.addEventListener('pointerdown', () => {
    ED.cinemaTimelineFocused = true;
  }, true);
  document.addEventListener('pointerdown', e => {
    if(cinemaTimeline && e.target && !cinemaTimeline.contains(e.target)) ED.cinemaTimelineFocused = false;
  }, true);
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
  if(cinemaFloatPreviewBtn) cinemaFloatPreviewBtn.addEventListener('click', () => {
    const studio = activeStudio();
    if(!studio) return;
    ED.cinemaFloatPreviewOn = !ED.cinemaFloatPreviewOn;
    ED.cinemaTimelineId = studio.userData.editorId;
    ED.cinemaTimelineOpen = true;
    if(!ED.cinemaPreview || ED.cinemaPreview.id !== studio.userData.editorId){
      ED.cinemaPreview = {id:studio.userData.editorId, time:selectedTime(studio), playing:false};
    }
    syncTimeline(currentViewportRect());
  });
  if(cinemaPreviewModeBtn) cinemaPreviewModeBtn.addEventListener('click', () => {
    ED.cinemaPreviewMode = ED.cinemaPreviewMode === 'normal' ? 'final' : 'normal';
    syncTimeline(currentViewportRect());
  });
  if(cinemaAspectSelect) cinemaAspectSelect.addEventListener('change', () => {
    ED.cinemaFloatPreviewAspect = cinemaAspectSelect.value || '16:9';
    syncTimeline(currentViewportRect());
  });
  if(cinemaZoomOutBtn) cinemaZoomOutBtn.addEventListener('click', () => zoomTimeline(.75));
  if(cinemaZoomInBtn) cinemaZoomInBtn.addEventListener('click', () => zoomTimeline(1.35));
  if(cinemaZoomResetBtn) cinemaZoomResetBtn.addEventListener('click', () => resetTimelineZoom());
  if(cinemaCloseBtn) cinemaCloseBtn.addEventListener('click', () => {
    const studio = activeStudio();
    ED.cinemaTimelineOpen = false;
    ED.cinemaTimelineLocked = false;
    ED.cinemaTimelineClosedId = studio && studio.userData && studio.userData.editorId || null;
    ED.cinemaTimelineId = null;
    ED.cinemaSelectedItem = null;
    ED.cinemaTimelineFocused = false;
    hideTimeline();
  });
  if(cinemaDuplicateBtn) cinemaDuplicateBtn.addEventListener('click', () => duplicateSelectedItem());
  if(cinemaDeleteBtn) cinemaDeleteBtn.addEventListener('click', () => deleteSelectedItem());
  if(cinemaCurveBtn) cinemaCurveBtn.addEventListener('click', () => {
    if(cinemaCurvePanel) cinemaCurvePanel.classList.toggle('on');
  });
  if(cinemaCurveMode) cinemaCurveMode.addEventListener('change', () => setSelectedKeyCurve(cinemaCurveMode.value));
  if(cinemaAddCutBtn) cinemaAddCutBtn.addEventListener('click', () => addCutFromTimeline());
  if(cinemaInsertCutBtn) cinemaInsertCutBtn.addEventListener('click', () => insertCutAtPlayhead());
  if(cinemaAppendCutBtn) cinemaAppendCutBtn.addEventListener('click', () => appendCutAfterLast());
  if(cinemaAddMarkerBtn) cinemaAddMarkerBtn.addEventListener('click', () => addMarkerFromTimeline());
  if(cinemaAddEventBtn) cinemaAddEventBtn.addEventListener('click', () => addEventFromTimeline());
  if(cinemaCameraSelect) cinemaCameraSelect.addEventListener('change', () => {
    ED.cinemaTimelineCameraId = cinemaCameraSelect.value || '';
  });
  if(cinemaObjectSelect) cinemaObjectSelect.addEventListener('change', () => {
    ED.cinemaTimelineTargetId = cinemaObjectSelect.value || '';
    selectTrackFromTarget(cinemaObjectSelect.value);
  });
  if(cinemaAddObjectBtn) cinemaAddObjectBtn.addEventListener('click', () => addObjectTrack());
  if(cinemaKeyObjectBtn) cinemaKeyObjectBtn.addEventListener('click', () => keyObjectTrack());
  if(cinemaKeyLensBtn) cinemaKeyLensBtn.addEventListener('click', () => keyLensTrack());
  if(cinemaRuler) cinemaRuler.addEventListener('pointerdown', e => scrubRuler(e));
  if(cinemaPlayhead) cinemaPlayhead.addEventListener('pointerdown', e => beginPlayheadDrag(e));
  const cinemaBody = root.querySelector('#lkCinemaTlBody');
  if(cinemaBody) cinemaBody.addEventListener('wheel', e => onTimelineWheel(e), {passive:false});
  ['#lkCinemaTlTrack', '#lkCinemaTlMarkerTrack', '#lkCinemaTlObjectTrack', '#lkCinemaTlLensTrack', '#lkCinemaTlEventTrack'].forEach(selector => {
    const lane = root.querySelector(selector);
    if(lane) lane.addEventListener('click', e => {
      if(e.target === lane) deselectTimelineItem();
    });
  });
  document.addEventListener('pointermove', onShotDragMove);
  document.addEventListener('pointerup', onShotDragEnd);
  document.addEventListener('pointercancel', onShotDragEnd);
  document.addEventListener('pointermove', onKeyDragMove);
  document.addEventListener('pointerup', onKeyDragEnd);
  document.addEventListener('pointercancel', onKeyDragEnd);
  document.addEventListener('pointermove', onLensDragMove);
  document.addEventListener('pointerup', onLensDragEnd);
  document.addEventListener('pointercancel', onLensDragEnd);
  document.addEventListener('pointermove', onEventDragMove);
  document.addEventListener('pointerup', onEventDragEnd);
  document.addEventListener('pointercancel', onEventDragEnd);
  document.addEventListener('pointermove', onMarkerDragMove);
  document.addEventListener('pointerup', onMarkerDragEnd);
  document.addEventListener('pointercancel', onMarkerDragEnd);
  document.addEventListener('pointermove', onPlayheadDragMove);
  document.addEventListener('pointerup', onPlayheadDragEnd);
  document.addEventListener('pointercancel', onPlayheadDragEnd);
  document.addEventListener('keydown', onTimelineKeyDown, true);

  function currentViewportRect(){
    return deps.editorViewportRect ? deps.editorViewportRect() : {x:0, y:0, w:innerWidth, h:innerHeight};
  }
  function markDirty(){
    if(deps.markDirty) deps.markDirty();
  }
  function pushHistory(cmd){
    if(deps.pushHistory) deps.pushHistory(cmd);
  }
  function buildInspector(){
    if(deps.buildInspector) deps.buildInspector();
  }
  function selectObject(obj){
    if(deps.selectObject) deps.selectObject(obj);
  }
  function setCameraViewSlot(cameraId){
    if(deps.setCameraViewSlot) deps.setCameraViewSlot(cameraId);
    else if(cameraId){
      ED.viewportMode = 'quad';
      ED.viewportSlots[1] = 'cam:' + cameraId;
    }
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
    props.version = Math.max(2, Number(props.version) || 1);
    props.duration = Math.max(.1, Number(props.duration) || 6);
    props.fps = Math.max(1, Number(props.fps) || 24);
    props.playback = props.playback || 'one-shot';
    props.trigger = props.trigger || 'manual';
    props.eventName = props.eventName || '';
    if(!Array.isArray(props.cameraCuts)){
      props.cameraCuts = Array.isArray(props.movieTrack) ? props.movieTrack : [];
    }
    props.movieTrack = props.cameraCuts;
    if(!Array.isArray(props.objectTracks)) props.objectTracks = [];
    if(!Array.isArray(props.lensTracks)) props.lensTracks = [];
    if(!Array.isArray(props.eventTracks)) props.eventTracks = [];
    if(!Array.isArray(props.keyframes)) props.keyframes = [];
    if(!Array.isArray(props.markers)) props.markers = [];
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
    props.lensTracks.forEach(track => {
      track.id = track.id || ('lenstrack_' + Date.now().toString(36));
      track.type = 'lens';
      if(!Array.isArray(track.keyframes)) track.keyframes = [];
      track.keyframes.forEach((key, index) => {
        key.id = key.id || ('lens_' + index + '_' + Date.now().toString(36));
        key.time = Math.max(0, Math.min(props.duration, Number(key.time) || 0));
        key.fov = Math.max(1, Math.min(179, Number(key.fov) || 50));
        key.curve = key.curve || 'linear';
      });
    });
    props.markers.forEach((marker, index) => {
      marker.id = marker.id || ('marker_' + index + '_' + Date.now().toString(36));
      marker.type = 'marker';
      marker.time = Math.max(0, Math.min(props.duration, Number(marker.time) || 0));
      marker.name = marker.name || 'Marker';
      marker.note = marker.note || '';
    });
    props.eventTracks.forEach((event, index) => {
      event.id = event.id || ('event_' + index + '_' + Date.now().toString(36));
      event.type = 'event';
      event.time = Math.max(0, Math.min(props.duration, Number(event.time) || 0));
      event.name = event.name || 'cinema.event';
      event.payload = event.payload || '';
    });
    studio.userData.cinemaProps = props;
    return props;
  }
  function cloneData(value){
    if(value == null) return value;
    try { return JSON.parse(JSON.stringify(value || {})); }
    catch(err){ return value; }
  }
  function uniqueTimelineId(prefix){
    return (prefix || 'item') + '_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1296).toString(36);
  }
  function restoreCinemaProps(studio, props, selectedItem, preview){
    if(!studio || !studio.userData) return;
    studio.userData.cinemaProps = cloneData(props);
    ED.cinemaSelectedItem = selectedItem ? cloneData(selectedItem) : null;
    ED.cinemaPreview = preview ? cloneData(preview) : null;
    propsFor(studio);
    markDirty();
    buildInspector();
    syncTimeline(currentViewportRect());
  }
  function historySnapshot(studio){
    return {
      props:cloneData(studio && studio.userData && studio.userData.cinemaProps || {}),
      selected:cloneData(ED.cinemaSelectedItem || null),
      preview:cloneData(ED.cinemaPreview || null),
    };
  }
  function pushCinemaHistory(studio, before, after, label){
    if(!studio || !before || !after) return;
    const id = studio.userData.editorId;
    pushHistory({
      label:label || 'Cinema timeline edit',
      undo:() => {
        const target = GAME.world.registry.find(o => o && o.userData && o.userData.editorId === id);
        restoreCinemaProps(target, before.props, before.selected, before.preview);
      },
      redo:() => {
        const target = GAME.world.registry.find(o => o && o.userData && o.userData.editorId === id);
        restoreCinemaProps(target, after.props, after.selected, after.preview);
      },
    });
  }
  function cameraLabel(id){
    const cam = GAME.world.registry.find(item => item && item.userData && item.userData.editorId === id);
    return cam && (cam.userData.editorName || cam.userData.editorId) || id || 'Camera';
  }
  function sceneCameraById(id){
    return sceneCameras().find(cam => cam && cam.userData && cam.userData.editorId === id) || null;
  }
  function timelineObjects(){
    return GAME.world.registry.filter(o => o && o.userData && o.userData.editorId && o.userData.editorType !== 'cinemaStudio');
  }
  function timelineObjectById(id){
    if(!id) return null;
    const obj = GAME.world.registry.find(item => item && item.userData && item.userData.editorId === id && item.userData.editorType !== 'cinemaStudio') || null;
    return obj;
  }
  function objectLabel(id){
    const obj = GAME.world.registry.find(item => item && item.userData && item.userData.editorId === id);
    return obj && (obj.userData.editorName || obj.userData.editorId) || id || 'Object';
  }
  function sceneObjectById(id){
    return GAME.world.registry.find(item => item && item.userData && item.userData.editorId === id) || null;
  }
  function validationMessagesFor(validation, kind, id, keyId){
    if(!validation || !validation.messages || !kind || !id) return [];
    return validation.messages
      .filter(item => item.kind === kind && item.id === id && (keyId == null || item.keyId === keyId))
      .map(item => item.text);
  }
  function validateTimeline(studio, props){
    const validation = {messages:[], shotIssues:new Map(), trackIssues:new Map(), keyIssues:new Map(), hasGap:false, hasOverlap:false};
    const cameras = new Set(sceneCameras().map(cam => cam.userData.editorId));
    const seen = new Set();
    const add = (kind, id, text, keyId) => {
      validation.messages.push({kind, id, keyId:keyId || '', text});
      if(kind === 'shot'){
        if(!validation.shotIssues.has(id)) validation.shotIssues.set(id, []);
        validation.shotIssues.get(id).push(text);
      } else if(kind === 'objectTrack'){
        if(!validation.trackIssues.has(id)) validation.trackIssues.set(id, []);
        validation.trackIssues.get(id).push(text);
      } else if(kind === 'objectKey'){
        const mapKey = id + ':' + (keyId || '');
        if(!validation.keyIssues.has(mapKey)) validation.keyIssues.set(mapKey, []);
        validation.keyIssues.get(mapKey).push(text);
      }
    };
    const shots = props.movieTrack.slice().sort((a,b) => (a.time || 0) - (b.time || 0));
    let cursor = 0;
    shots.forEach((shot, index) => {
      if(shot.id){
        const uid = 'shot:' + shot.id;
        if(seen.has(uid)) add('shot', shot.id, 'Duplicate id');
        seen.add(uid);
      }
      const start = Math.max(0, Number(shot.time) || 0);
      const duration = Math.max(0, Number(shot.duration) || 0);
      const end = start + duration;
      if(!shot.cameraId || !cameras.has(shot.cameraId)) add('shot', shot.id, 'Missing camera');
      if(duration <= 0) add('shot', shot.id, 'Zero duration');
      if(start > props.duration || end > props.duration + .0001) add('shot', shot.id, 'Outside timeline duration');
      if(index === 0 && start > frameStep(props)){
        validation.hasGap = true;
        add('shot', shot.id, 'Gap before first cut');
      } else if(index > 0 && start > cursor + frameStep(props)){
        validation.hasGap = true;
        add('shot', shot.id, 'Gap before this cut');
      }
      if(index > 0 && start < cursor - .0001){
        validation.hasOverlap = true;
        add('shot', shot.id, 'Overlaps previous cut');
      }
      cursor = Math.max(cursor, end);
    });
    if(shots.length && cursor < props.duration - frameStep(props)){
      validation.hasGap = true;
      add('shot', shots[shots.length - 1].id, 'Gap after last cut');
    }
    props.objectTracks.forEach(track => {
      if(track.id){
        const uid = 'objectTrack:' + track.id;
        if(seen.has(uid)) add('objectTrack', track.id, 'Duplicate id');
        seen.add(uid);
      }
      if(!track.targetId || !sceneObjectById(track.targetId)) add('objectTrack', track.id, 'Missing target');
      (track.keyframes || []).forEach(key => {
        if(key.id){
          const uid = 'objectKey:' + track.id + ':' + key.id;
          if(seen.has(uid)) add('objectKey', track.id, 'Duplicate id', key.id);
          seen.add(uid);
        }
        if((Number(key.time) || 0) > props.duration + .0001) add('objectKey', track.id, 'Key outside timeline duration', key.id);
      });
    });
    props.lensTracks.forEach(track => {
      if(track.id){
        const uid = 'lensTrack:' + track.id;
        if(seen.has(uid)) add('objectTrack', track.id, 'Duplicate id');
        seen.add(uid);
      }
      if(!track.targetId || !sceneCameraById(track.targetId)) add('objectTrack', track.id, 'Missing camera');
      (track.keyframes || []).forEach(key => {
        if(key.id){
          const uid = 'lensKey:' + track.id + ':' + key.id;
          if(seen.has(uid)) add('objectKey', track.id, 'Duplicate id', key.id);
          seen.add(uid);
        }
        if((Number(key.time) || 0) > props.duration + .0001) add('objectKey', track.id, 'Key outside timeline duration', key.id);
        const fov = Number(key.fov);
        if(!Number.isFinite(fov) || fov < 1 || fov > 179) add('objectKey', track.id, 'FOV outside valid range', key.id);
      });
    });
    props.markers.forEach(marker => {
      if(!marker.id) return;
      const uid = 'marker:' + marker.id;
      if(seen.has(uid)) add('marker', marker.id, 'Duplicate id');
      seen.add(uid);
    });
    props.eventTracks.forEach(event => {
      if(event.id){
        const uid = 'event:' + event.id;
        if(seen.has(uid)) add('marker', event.id, 'Duplicate id');
        seen.add(uid);
      }
      if(!event.name) add('marker', event.id, 'Missing event name');
      if((Number(event.time) || 0) > props.duration + .0001) add('marker', event.id, 'Event outside timeline duration');
    });
    return validation;
  }
  function selectedTime(studio){
    return ED.cinemaPreview && ED.cinemaPreview.id === studio.userData.editorId ? ED.cinemaPreview.time : 0;
  }
  function timelineView(props){
    const duration = Math.max(.1, Number(props && props.duration) || 6);
    const zoom = Math.max(1, Math.min(12, Number(ED.cinemaTimelineZoom) || 1));
    const span = duration / zoom;
    const maxOffset = Math.max(0, duration - span);
    const offset = Math.max(0, Math.min(maxOffset, Number(ED.cinemaTimelineOffset) || 0));
    ED.cinemaTimelineZoom = zoom;
    ED.cinemaTimelineOffset = offset;
    return {duration, zoom, span, offset};
  }
  function timeToTimelinePct(props, time){
    const view = timelineView(props);
    return ((Number(time) || 0) - view.offset) / Math.max(.0001, view.span) * 100;
  }
  function durationToTimelinePct(props, duration){
    const view = timelineView(props);
    return (Number(duration) || 0) / Math.max(.0001, view.span) * 100;
  }
  function setTimelineZoom(studio, nextZoom, anchorTime){
    if(!studio) return;
    const props = propsFor(studio);
    const oldView = timelineView(props);
    const zoom = Math.max(1, Math.min(12, Number(nextZoom) || 1));
    const span = oldView.duration / zoom;
    const anchor = clampTime(props, anchorTime == null ? selectedTime(studio) : anchorTime);
    const alpha = Math.max(0, Math.min(1, (anchor - oldView.offset) / Math.max(.0001, oldView.span)));
    ED.cinemaTimelineZoom = zoom;
    ED.cinemaTimelineOffset = Math.max(0, Math.min(Math.max(0, oldView.duration - span), anchor - alpha * span));
    syncTimeline(currentViewportRect());
  }
  function zoomTimeline(multiplier){
    const studio = activeStudio();
    if(!studio) return;
    setTimelineZoom(studio, (Number(ED.cinemaTimelineZoom) || 1) * (Number(multiplier) || 1), selectedTime(studio));
  }
  function resetTimelineZoom(){
    ED.cinemaTimelineZoom = 1;
    ED.cinemaTimelineOffset = 0;
    syncTimeline(currentViewportRect());
  }
  function revealTimelineTime(props, time){
    const view = timelineView(props);
    const t = Math.max(0, Math.min(view.duration, Number(time) || 0));
    if(t >= view.offset && t <= view.offset + view.span) return;
    ED.cinemaTimelineOffset = Math.max(0, Math.min(Math.max(0, view.duration - view.span), t - view.span * .35));
  }
  function panTimeline(studio, deltaTime){
    if(!studio) return;
    const props = propsFor(studio);
    const view = timelineView(props);
    ED.cinemaTimelineOffset = Math.max(0, Math.min(Math.max(0, view.duration - view.span), view.offset + (Number(deltaTime) || 0)));
    syncTimeline(currentViewportRect());
  }
  function onTimelineWheel(e){
    const studio = activeStudio();
    if(!studio) return;
    const props = propsFor(studio);
    const view = timelineView(props);
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if(e.ctrlKey || e.metaKey){
      setTimelineZoom(studio, view.zoom * (delta > 0 ? .85 : 1.18), timeFromTimelineClientX(studio, e.clientX));
      e.preventDefault();
      return;
    }
    if(e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)){
      panTimeline(studio, delta / 600 * view.span);
      e.preventDefault();
    }
  }
  function scrubRuler(e){
    const studio = activeStudio();
    if(!studio || !cinemaRuler) return;
    const props = propsFor(studio);
    const rect = cinemaRuler.getBoundingClientRect();
    const alpha = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const view = timelineView(props);
    ED.cinemaPreview = {id:studio.userData.editorId, time:clampTime(props, snapTime(props, view.offset + view.span * alpha)), playing:false};
    ED.cinemaForceEditableTargetFrame = true;
    updatePreview(0);
    syncTimeline(currentViewportRect());
  }
  function timeFromTimelineClientX(studio, clientX){
    const body = root.querySelector('#lkCinemaTlBody');
    if(!studio || !body) return 0;
    const props = propsFor(studio);
    const rect = body.getBoundingClientRect();
    const labelW = 106;
    const gap = 6;
    const pad = 4;
    const laneX = rect.left + pad + labelW + gap;
    const laneW = Math.max(1, rect.width - (pad + labelW + gap) - pad);
    const alpha = Math.max(0, Math.min(1, (clientX - laneX) / laneW));
    const view = timelineView(props);
    return clampTime(props, snapTime(props, view.offset + view.span * alpha));
  }
  function scrubTimelineTo(studio, time){
    if(!studio) return;
    const props = propsFor(studio);
    ED.cinemaPreview = {id:studio.userData.editorId, time:clampTime(props, time), playing:false};
    ED.cinemaForceEditableTargetFrame = true;
    updatePreview(0);
    syncTimeline(currentViewportRect());
  }
  function beginPlayheadDrag(e){
    const studio = activeStudio();
    if(!studio || e.button !== 0) return;
    playheadDrag = {studioId:studio.userData.editorId};
    if(e.currentTarget && e.currentTarget.setPointerCapture){
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch(err){}
    }
    scrubTimelineTo(studio, timeFromTimelineClientX(studio, e.clientX));
    e.preventDefault();
  }
  function onPlayheadDragMove(e){
    if(!playheadDrag) return;
    const studio = GAME.world.registry.find(o => o && o.userData && o.userData.editorId === playheadDrag.studioId && o.userData.editorType === 'cinemaStudio');
    if(!studio){ playheadDrag = null; return; }
    scrubTimelineTo(studio, timeFromTimelineClientX(studio, e.clientX));
  }
  function onPlayheadDragEnd(){
    playheadDrag = null;
  }
  function onTimelineKeyDown(e){
    if(!ED.active || ED.playPreview) return;
    const key = (e.key || '').toLowerCase();
    const isSpace = key === ' ' || key === 'spacebar' || e.code === 'Space';
    const isDelete = key === 'delete' || key === 'backspace';
    if(!isSpace && !isDelete) return;
    const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
    if(tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const studio = activeStudio();
    if(!studio) return;
    if(isSpace){
      if(!ED.cinemaTimelineFocused || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      startTimeline(studio, !(ED.cinemaPreview && ED.cinemaPreview.id === studio.userData.editorId && ED.cinemaPreview.playing));
      return;
    }
    if(!ED.cinemaSelectedItem) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    deleteSelectedItem();
  }
  function frameStep(props){
    return 1 / Math.max(1, Number(props && props.fps) || 24);
  }
  function snapTime(props, value){
    const step = frameStep(props);
    return Math.round((Number(value) || 0) / step) * step;
  }
  function clampTime(props, value){
    return Math.max(0, Math.min(props.duration || 0, Number(value) || 0));
  }
  function shotById(props, id){
    return props && Array.isArray(props.movieTrack) ? props.movieTrack.find(shot => shot.id === id) : null;
  }
  function selectedShot(studio){
    const item = ED.cinemaSelectedItem;
    if(!studio || !item || item.type !== 'shot') return null;
    return shotById(propsFor(studio), item.id);
  }
  function markerById(props, id){
    return props && Array.isArray(props.markers) ? props.markers.find(marker => marker.id === id) : null;
  }
  function selectedMarker(studio){
    const item = ED.cinemaSelectedItem;
    if(!studio || !item || item.type !== 'marker') return null;
    return markerById(propsFor(studio), item.id);
  }
  function eventById(props, id){
    return props && Array.isArray(props.eventTracks) ? props.eventTracks.find(event => event.id === id) : null;
  }
  function selectedEvent(studio){
    const item = ED.cinemaSelectedItem;
    if(!studio || !item || item.type !== 'event') return null;
    return eventById(propsFor(studio), item.id);
  }
  function trackById(props, id){
    return props && Array.isArray(props.objectTracks) ? props.objectTracks.find(track => track.id === id) : null;
  }
  function keyById(track, keyId){
    return track && Array.isArray(track.keyframes) ? track.keyframes.find(key => key.id === keyId) : null;
  }
  function selectedObjectKey(studio){
    const item = ED.cinemaSelectedItem;
    if(!studio || !item || item.type !== 'objectKey') return null;
    const track = trackById(propsFor(studio), item.id);
    const key = keyById(track, item.keyId);
    return track && key ? {track, key} : null;
  }
  function selectedObjectTrack(studio){
    const item = ED.cinemaSelectedItem;
    if(!studio || !item || item.type !== 'objectTrack') return null;
    return trackById(propsFor(studio), item.id);
  }
  function lensTrackById(props, id){
    return props && Array.isArray(props.lensTracks) ? props.lensTracks.find(track => track.id === id) : null;
  }
  function lensKeyById(track, keyId){
    return track && Array.isArray(track.keyframes) ? track.keyframes.find(key => key.id === keyId) : null;
  }
  function selectedLensKey(studio){
    const item = ED.cinemaSelectedItem;
    if(!studio || !item || item.type !== 'lensKey') return null;
    const track = lensTrackById(propsFor(studio), item.id);
    const key = lensKeyById(track, item.keyId);
    return track && key ? {track, key} : null;
  }
  function selectedLensTrack(studio){
    const item = ED.cinemaSelectedItem;
    if(!studio || !item || item.type !== 'lensTrack') return null;
    return lensTrackById(propsFor(studio), item.id);
  }
  function applyShotPatch(studio, shot, patch, opts){
    if(!studio || !shot) return null;
    opts = opts || {};
    const before = opts.skipHistory ? null : historySnapshot(studio);
    const props = propsFor(studio);
    const minDur = Math.max(.05, frameStep(props));
    let start = Number(shot.time) || 0;
    let duration = Math.max(minDur, Number(shot.duration) || minDur);
    let end = start + duration;
    if(patch && Object.prototype.hasOwnProperty.call(patch, 'time')) start = Number(patch.time) || 0;
    if(patch && Object.prototype.hasOwnProperty.call(patch, 'start')) start = Number(patch.start) || 0;
    if(patch && Object.prototype.hasOwnProperty.call(patch, 'duration')) duration = Number(patch.duration) || minDur;
    if(patch && Object.prototype.hasOwnProperty.call(patch, 'end')) end = Number(patch.end) || 0;
    if(patch && Object.prototype.hasOwnProperty.call(patch, 'cameraId')) shot.cameraId = patch.cameraId || '';
    if(patch && Object.prototype.hasOwnProperty.call(patch, 'name')) shot.name = String(patch.name || '');
    if(patch && Object.prototype.hasOwnProperty.call(patch, 'end')) duration = end - start;
    if(opts.snap){
      start = snapTime(props, start);
      duration = Math.max(minDur, snapTime(props, duration));
    }
    start = Math.max(0, Math.min(Math.max(0, props.duration - minDur), clampTime(props, start)));
    duration = Math.max(minDur, duration);
    duration = Math.max(minDur, Math.min(duration, props.duration - start));
    shot.time = start;
    shot.duration = duration;
    props.movieTrack.sort((a,b) => (a.time || 0) - (b.time || 0));
    studio.userData.cinemaProps = props;
    if(opts.previewStart){
      ED.cinemaPreview = {id:studio.userData.editorId, time:Math.max(0, Math.min(props.duration, shot.time || 0)), playing:false};
      updatePreview(0);
    }
    markDirty();
    if(opts.rebuildInspector) buildInspector();
    syncTimeline(currentViewportRect());
    if(before) pushCinemaHistory(studio, before, historySnapshot(studio), opts.label || 'Edit camera cut');
    return shot;
  }
  function createDetailInput(label, value, step, oninput){
    const wrap = document.createElement('label');
    const span = document.createElement('span');
    const input = document.createElement('input');
    span.textContent = label;
    input.type = 'number';
    input.min = '0';
    input.step = step;
    input.value = Number.isFinite(Number(value)) ? (+value).toFixed(3).replace(/\.?0+$/, '') : '0';
    input.addEventListener('input', () => oninput(parseFloat(input.value) || 0));
    wrap.appendChild(span);
    wrap.appendChild(input);
    return wrap;
  }
  function createDetailText(label, value, oninput){
    const wrap = document.createElement('label');
    const span = document.createElement('span');
    const input = document.createElement('input');
    span.textContent = label;
    input.type = 'text';
    input.value = value || '';
    input.addEventListener('input', () => oninput(input.value));
    wrap.appendChild(span);
    wrap.appendChild(input);
    return wrap;
  }
  function createDetailSelect(label, value, options, onchange){
    const wrap = document.createElement('label');
    const span = document.createElement('span');
    const select = document.createElement('select');
    span.textContent = label;
    options.forEach(opt => {
      const node = document.createElement('option');
      node.value = opt.value;
      node.textContent = opt.label;
      select.appendChild(node);
    });
    select.value = options.some(opt => opt.value === value) ? value : (options[0] && options[0].value || '');
    select.addEventListener('change', () => onchange(select.value));
    wrap.appendChild(span);
    wrap.appendChild(select);
    return wrap;
  }
  function createDetailStatic(label, value){
    const wrap = document.createElement('label');
    const span = document.createElement('span');
    const input = document.createElement('input');
    span.textContent = label;
    input.type = 'text';
    input.value = value || '';
    input.disabled = true;
    wrap.appendChild(span);
    wrap.appendChild(input);
    return wrap;
  }
  function createDetailActions(actions){
    const wrap = document.createElement('div');
    wrap.className = 'lk-cinema-detail-actions';
    (actions || []).forEach(action => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = action.label || 'Action';
      btn.disabled = !!action.disabled;
      btn.title = action.title || '';
      btn.addEventListener('click', () => {
        if(action.action) action.action();
      });
      wrap.appendChild(btn);
    });
    return wrap;
  }
  function applyMarkerPatch(studio, marker, patch, opts){
    if(!studio || !marker) return;
    opts = opts || {};
    const before = opts.skipHistory ? null : historySnapshot(studio);
    const props = propsFor(studio);
    if(patch && Object.prototype.hasOwnProperty.call(patch, 'time')) marker.time = clampTime(props, opts.snap ? snapTime(props, patch.time) : patch.time);
    if(patch && Object.prototype.hasOwnProperty.call(patch, 'name')) marker.name = String(patch.name || 'Marker');
    if(patch && Object.prototype.hasOwnProperty.call(patch, 'note')) marker.note = String(patch.note || '');
    props.markers.sort((a,b) => (a.time || 0) - (b.time || 0));
    studio.userData.cinemaProps = props;
    if(opts.preview){
      ED.cinemaPreview = {id:studio.userData.editorId, time:marker.time || 0, playing:false};
      updatePreview(0);
    }
    markDirty();
    syncTimeline(currentViewportRect());
    if(before) pushCinemaHistory(studio, before, historySnapshot(studio), opts.label || 'Edit marker');
  }
  function applyEventPatch(studio, event, patch, opts){
    if(!studio || !event) return;
    opts = opts || {};
    const before = opts.skipHistory ? null : historySnapshot(studio);
    const props = propsFor(studio);
    if(patch && Object.prototype.hasOwnProperty.call(patch, 'time')) event.time = clampTime(props, opts.snap ? snapTime(props, patch.time) : patch.time);
    if(patch && Object.prototype.hasOwnProperty.call(patch, 'name')) event.name = String(patch.name || 'cinema.event');
    if(patch && Object.prototype.hasOwnProperty.call(patch, 'payload')) event.payload = String(patch.payload || '');
    props.eventTracks.sort((a,b) => (a.time || 0) - (b.time || 0));
    studio.userData.cinemaProps = props;
    if(opts.preview){
      ED.cinemaPreview = {id:studio.userData.editorId, time:event.time || 0, playing:false};
      updatePreview(0);
    }
    markDirty();
    syncTimeline(currentViewportRect());
    if(before) pushCinemaHistory(studio, before, historySnapshot(studio), opts.label || 'Edit timeline event');
  }
  function applyObjectKeyPatch(studio, track, key, patch, opts){
    if(!studio || !track || !key) return;
    opts = opts || {};
    const before = opts.skipHistory ? null : historySnapshot(studio);
    const props = propsFor(studio);
    if(patch && Object.prototype.hasOwnProperty.call(patch, 'time')){
      key.time = clampTime(props, opts.snap ? snapTime(props, patch.time) : patch.time);
    }
    if(patch && Object.prototype.hasOwnProperty.call(patch, 'curve')){
      key.curve = patch.curve || 'linear';
      if(ED.cinemaSelectedItem && ED.cinemaSelectedItem.type === 'objectKey' && ED.cinemaSelectedItem.id === track.id && ED.cinemaSelectedItem.keyId === key.id){
        ED.cinemaSelectedItem.curve = key.curve;
      }
      if(cinemaCurveMode) cinemaCurveMode.value = key.curve;
    }
    track.keyframes = (track.keyframes || []).slice().sort((a,b) => (a.time || 0) - (b.time || 0));
    studio.userData.cinemaProps = props;
    if(opts.preview){
      ED.cinemaPreview = {id:studio.userData.editorId, time:key.time || 0, playing:false};
      applyAtTime(studio, ED.cinemaPreview.time);
    }
    markDirty();
    syncTimeline(currentViewportRect());
    if(before) pushCinemaHistory(studio, before, historySnapshot(studio), opts.label || 'Edit object key');
  }
  function applyLensKeyPatch(studio, track, key, patch, opts){
    if(!studio || !track || !key) return;
    opts = opts || {};
    const before = opts.skipHistory ? null : historySnapshot(studio);
    const props = propsFor(studio);
    if(patch && Object.prototype.hasOwnProperty.call(patch, 'time')){
      key.time = clampTime(props, opts.snap ? snapTime(props, patch.time) : patch.time);
    }
    if(patch && Object.prototype.hasOwnProperty.call(patch, 'fov')){
      key.fov = Math.max(1, Math.min(179, Number(patch.fov) || 50));
    }
    if(patch && Object.prototype.hasOwnProperty.call(patch, 'curve')){
      key.curve = patch.curve || 'linear';
      if(ED.cinemaSelectedItem && ED.cinemaSelectedItem.type === 'lensKey' && ED.cinemaSelectedItem.id === track.id && ED.cinemaSelectedItem.keyId === key.id){
        ED.cinemaSelectedItem.curve = key.curve;
      }
      if(cinemaCurveMode) cinemaCurveMode.value = key.curve;
    }
    track.keyframes = (track.keyframes || []).slice().sort((a,b) => (a.time || 0) - (b.time || 0));
    studio.userData.cinemaProps = props;
    if(opts.preview){
      ED.cinemaPreview = {id:studio.userData.editorId, time:key.time || 0, playing:false};
      applyAtTime(studio, ED.cinemaPreview.time);
    }
    markDirty();
    syncTimeline(currentViewportRect());
    if(before) pushCinemaHistory(studio, before, historySnapshot(studio), opts.label || 'Edit lens key');
  }
  function selectBoundCamera(shot){
    const cam = shot && sceneCameraById(shot.cameraId);
    if(cam) selectObject(cam);
  }
  function lookThroughBoundCamera(shot){
    const cam = shot && sceneCameraById(shot.cameraId);
    if(!cam) return;
    setCameraViewSlot(cam.userData.editorId);
  }
  function replaceShotCameraWithSelected(studio, shot){
    const cameraId = selectedSceneCameraId();
    if(!studio || !shot || !cameraId || cameraId === shot.cameraId) return;
    applyShotPatch(studio, shot, {cameraId}, {rebuildInspector:true, label:'Replace cut camera'});
  }
  function renderShotDetails(studio, props){
    if(!cinemaClipPanel) return;
    const validation = validateTimeline(studio, props);
    const shot = selectedShot(studio);
    const marker = selectedMarker(studio);
    const timelineEvent = selectedEvent(studio);
    const objectKey = selectedObjectKey(studio);
    const objectTrack = selectedObjectTrack(studio);
    const lensKey = selectedLensKey(studio);
    const lensTrack = selectedLensTrack(studio);
    if(!shot && !marker && !timelineEvent && !objectKey && !objectTrack && !lensKey && !lensTrack){
      cinemaClipPanel.classList.remove('on');
      cinemaClipPanel.innerHTML = '';
      return;
    }
    if(cinemaClipPanel.contains(document.activeElement)) return;
    const step = frameStep(props);
    cinemaClipPanel.innerHTML = '';
    cinemaClipPanel.classList.add('on');
    const title = document.createElement('div');
    title.className = 'lk-cinema-detail-title';
    if(marker){
      title.textContent = 'MARKER';
      cinemaClipPanel.appendChild(title);
      cinemaClipPanel.appendChild(createDetailText('Name', marker.name || 'Marker', value => applyMarkerPatch(studio, marker, {name:value})));
      cinemaClipPanel.appendChild(createDetailInput('Time', marker.time || 0, step, value => applyMarkerPatch(studio, marker, {time:value}, {preview:true})));
      cinemaClipPanel.appendChild(createDetailText('Note', marker.note || '', value => applyMarkerPatch(studio, marker, {note:value})));
      const markerWarnings = validationMessagesFor(validation, 'marker', marker.id);
      if(markerWarnings.length) cinemaClipPanel.appendChild(createDetailStatic('Warnings', markerWarnings.join(' | ')));
      return;
    }
    if(timelineEvent){
      title.textContent = 'EVENT';
      cinemaClipPanel.appendChild(title);
      cinemaClipPanel.appendChild(createDetailText('Name', timelineEvent.name || 'cinema.event', value => applyEventPatch(studio, timelineEvent, {name:value})));
      cinemaClipPanel.appendChild(createDetailInput('Time', timelineEvent.time || 0, step, value => applyEventPatch(studio, timelineEvent, {time:value}, {preview:true})));
      cinemaClipPanel.appendChild(createDetailText('Payload', timelineEvent.payload || '', value => applyEventPatch(studio, timelineEvent, {payload:value})));
      const eventWarnings = validationMessagesFor(validation, 'marker', timelineEvent.id);
      if(eventWarnings.length) cinemaClipPanel.appendChild(createDetailStatic('Warnings', eventWarnings.join(' | ')));
      return;
    }
    if(objectKey){
      title.textContent = 'OBJECT KEY';
      cinemaClipPanel.appendChild(title);
      cinemaClipPanel.appendChild(createDetailStatic('Target', objectLabel(objectKey.track.targetId)));
      cinemaClipPanel.appendChild(createDetailInput('Time', objectKey.key.time || 0, step, value => applyObjectKeyPatch(studio, objectKey.track, objectKey.key, {time:value}, {preview:true})));
      cinemaClipPanel.appendChild(createDetailSelect('Curve', objectKey.key.curve || 'linear', [
        {value:'linear', label:'Linear'},
        {value:'ease-in', label:'Ease in'},
        {value:'ease-out', label:'Ease out'},
        {value:'ease-in-out', label:'Ease in/out'},
        {value:'manual', label:'Manual'},
      ], value => applyObjectKeyPatch(studio, objectKey.track, objectKey.key, {curve:value})));
      const keyWarnings = validationMessagesFor(validation, 'objectKey', objectKey.track.id, objectKey.key.id).filter((text, index, all) => all.indexOf(text) === index);
      if(keyWarnings.length) cinemaClipPanel.appendChild(createDetailStatic('Warnings', keyWarnings.join(' | ')));
      return;
    }
    if(lensKey){
      title.textContent = 'LENS KEY';
      cinemaClipPanel.appendChild(title);
      cinemaClipPanel.appendChild(createDetailStatic('Camera', cameraLabel(lensKey.track.targetId)));
      cinemaClipPanel.appendChild(createDetailInput('Time', lensKey.key.time || 0, step, value => applyLensKeyPatch(studio, lensKey.track, lensKey.key, {time:value}, {preview:true})));
      cinemaClipPanel.appendChild(createDetailInput('FOV', lensKey.key.fov || 50, 1, value => applyLensKeyPatch(studio, lensKey.track, lensKey.key, {fov:value}, {preview:true})));
      cinemaClipPanel.appendChild(createDetailSelect('Curve', lensKey.key.curve || 'linear', [
        {value:'linear', label:'Linear'},
        {value:'ease-in', label:'Ease in'},
        {value:'ease-out', label:'Ease out'},
        {value:'ease-in-out', label:'Ease in/out'},
        {value:'manual', label:'Manual'},
      ], value => applyLensKeyPatch(studio, lensKey.track, lensKey.key, {curve:value})));
      const keyWarnings = validationMessagesFor(validation, 'objectKey', lensKey.track.id, lensKey.key.id).filter((text, index, all) => all.indexOf(text) === index);
      if(keyWarnings.length) cinemaClipPanel.appendChild(createDetailStatic('Warnings', keyWarnings.join(' | ')));
      return;
    }
    if(objectTrack){
      title.textContent = 'OBJECT TRACK';
      cinemaClipPanel.appendChild(title);
      cinemaClipPanel.appendChild(createDetailStatic('Target', objectLabel(objectTrack.targetId)));
      cinemaClipPanel.appendChild(createDetailStatic('Keys', String((objectTrack.keyframes || []).length)));
      const trackWarnings = validationMessagesFor(validation, 'objectTrack', objectTrack.id);
      if(trackWarnings.length) cinemaClipPanel.appendChild(createDetailStatic('Warnings', trackWarnings.join(' | ')));
      return;
    }
    if(lensTrack){
      title.textContent = 'LENS TRACK';
      cinemaClipPanel.appendChild(title);
      cinemaClipPanel.appendChild(createDetailStatic('Camera', cameraLabel(lensTrack.targetId)));
      cinemaClipPanel.appendChild(createDetailStatic('Keys', String((lensTrack.keyframes || []).length)));
      const trackWarnings = validationMessagesFor(validation, 'objectTrack', lensTrack.id);
      if(trackWarnings.length) cinemaClipPanel.appendChild(createDetailStatic('Warnings', trackWarnings.join(' | ')));
      return;
    }
    title.textContent = 'SHOT DETAILS';
    cinemaClipPanel.appendChild(title);
    cinemaClipPanel.appendChild(createDetailText('Name', shot.name || '', value => applyShotPatch(studio, shot, {name:value}, {rebuildInspector:true, label:'Rename camera cut'})));
    const camWrap = document.createElement('label');
    const camLabel = document.createElement('span');
    const camSelect = document.createElement('select');
    camLabel.textContent = 'Camera';
    [{value:'', label:'Missing camera'}].concat(sceneCameras().map(cam => ({value:cam.userData.editorId, label:cam.userData.editorName || cam.userData.editorId}))).forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      camSelect.appendChild(option);
    });
    camSelect.value = sceneCameras().some(cam => cam.userData.editorId === shot.cameraId) ? shot.cameraId : '';
    camSelect.addEventListener('change', () => applyShotPatch(studio, shot, {cameraId:camSelect.value}, {rebuildInspector:true}));
    camWrap.appendChild(camLabel);
    camWrap.appendChild(camSelect);
    cinemaClipPanel.appendChild(camWrap);
    cinemaClipPanel.appendChild(createDetailInput('Start', shot.time || 0, step, value => applyShotPatch(studio, shot, {time:value}, {snap:false, previewStart:true, rebuildInspector:true})));
    cinemaClipPanel.appendChild(createDetailInput('Duration', shot.duration || step, step, value => applyShotPatch(studio, shot, {duration:value}, {snap:false, rebuildInspector:true})));
    cinemaClipPanel.appendChild(createDetailInput('End', (shot.time || 0) + (shot.duration || 0), step, value => applyShotPatch(studio, shot, {end:value}, {snap:false, rebuildInspector:true})));
    const boundCamera = sceneCameraById(shot.cameraId);
    const replacementId = selectedSceneCameraId();
    cinemaClipPanel.appendChild(createDetailActions([
      {label:'Select camera', disabled:!boundCamera, action:() => selectBoundCamera(shot)},
      {label:'Look through', disabled:!boundCamera, action:() => lookThroughBoundCamera(shot)},
      {label:'Replace camera', disabled:!replacementId || replacementId === shot.cameraId, title:'Use the selected Scene Camera for this cut', action:() => replaceShotCameraWithSelected(studio, shot)},
    ]));
    const warnings = validationMessagesFor(validation, 'shot', shot.id);
    if(warnings.length) cinemaClipPanel.appendChild(createDetailStatic('Warnings', warnings.join(' | ')));
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
    const selectedId = ED.selected && ED.selected.userData && ED.selected.userData.editorType === 'camera' ? ED.selected.userData.editorId : '';
    if(selectedId){
      ED.cinemaTimelineCameraId = selectedId;
      return selectedId;
    }
    return '';
  }
  function preferredShotCameraId(props, fallback){
    const cameraId = selectedSceneCameraId()
      || (cinemaCameraSelect && cinemaCameraSelect.value)
      || ED.cinemaTimelineCameraId
      || fallback
      || props.previewCamera
      || '';
    return sceneCameraById(cameraId) ? cameraId : '';
  }
  function selectedTimelineObjectId(){
    const selectedId = ED.selected && ED.selected.userData && ED.selected.userData.editorId && ED.selected.userData.editorType !== 'cinemaStudio'
      ? ED.selected.userData.editorId
      : '';
    if(timelineObjectById(selectedId)){
      ED.cinemaTimelineTargetId = selectedId;
      return selectedId;
    }
    return '';
  }
  function preferredTimelineObjectId(){
    const targetId = selectedTimelineObjectId()
      || (cinemaObjectSelect && cinemaObjectSelect.value)
      || ED.cinemaTimelineTargetId
      || '';
    return timelineObjectById(targetId) ? targetId : '';
  }
  function showTimelineNotice(message){
    if(!message) return;
    timelineNotice = {text:String(message), until:performance.now() + 2200};
    const clock = cinemaTimeline && cinemaTimeline.querySelector('#lkCinemaTlClock');
    if(clock) clock.textContent = timelineNotice.text;
  }
  function startTimeline(studio, playing){
    const current = ED.cinemaPreview && ED.cinemaPreview.id === studio.userData.editorId ? ED.cinemaPreview.time : 0;
    playStudio(studio, {time:current, playing:!!playing, setViewport:true, source:'timeline-ui'});
  }
  function playStudio(studio, opts){
    if(!studio) return null;
    opts = opts || {};
    const props = propsFor(studio);
    const validation = validateTimeline(studio, props);
    const time = opts.time == null ? 0 : opts.time;
    if(opts.setViewport){
      ED.viewportMode = 'quad';
      ED.viewportSlots[1] = 'timeline:' + studio.userData.editorId;
    }
    ED.cinemaTimelineClosedId = null;
    ED.cinemaTimelineId = studio.userData.editorId;
    ED.cinemaTimelineOpen = true;
    ED.cinemaPreview = {
      id:studio.userData.editorId,
      time:Math.max(0, Math.min(props.duration, Number(time) || 0)),
      playing:opts.playing !== false,
      runtime:!!opts.runtime,
      source:opts.source || 'manual',
      lastEventTime:Math.max(0, Math.min(props.duration, Number(time) || 0)),
    };
    updatePreview(0);
    syncTimeline(currentViewportRect());
    return ED.cinemaPreview;
  }
  function stopStudio(studio){
    if(!studio || (ED.cinemaPreview && ED.cinemaPreview.id === studio.userData.editorId)){
      ED.cinemaPreview = null;
      syncTimeline(currentViewportRect());
    }
  }
  function triggerRuntimeEvent(eventName, opts){
    opts = opts || {};
    const started = [];
    GAME.world.registry.forEach(studio => {
      if(!(studio && studio.userData && studio.userData.editorType === 'cinemaStudio')) return;
      const props = propsFor(studio);
      if(props.trigger !== 'runtime-event') return;
      if(props.eventName && eventName && props.eventName !== eventName) return;
      if(props.eventName && !eventName) return;
      started.push(studio);
      playStudio(studio, {time:opts.time || 0, playing:true, runtime:true, source:eventName || 'runtime-event'});
    });
    return started;
  }
  function addCutFromTimeline(){
    const studio = activeStudio();
    if(!studio) return;
    const before = historySnapshot(studio);
    const props = propsFor(studio);
    const cameraId = preferredShotCameraId(props);
    if(!cameraId){
      showTimelineNotice('Select a Scene Camera first');
      return;
    }
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
    ED.cinemaPreview = {id:studio.userData.editorId, time:shot.time || 0, playing:false};
    revealTimelineTime(props, shot.time);
    studio.userData.cinemaProps = props;
    markDirty();
    buildInspector();
    syncTimeline(currentViewportRect());
    pushCinemaHistory(studio, before, historySnapshot(studio), 'Add camera cut');
  }
  function appendCutAfterLast(){
    const studio = activeStudio();
    if(!studio) return;
    const before = historySnapshot(studio);
    const props = propsFor(studio);
    const cameraId = preferredShotCameraId(props);
    if(!cameraId){
      showTimelineNotice('Select a Scene Camera first');
      return;
    }
    const step = frameStep(props);
    const lastEnd = props.movieTrack.reduce((end, shot) => Math.max(end, (Number(shot.time) || 0) + (Number(shot.duration) || 0)), 0);
    const start = Math.min(Math.max(0, props.duration - step), snapTime(props, lastEnd));
    const shot = {
      id:uniqueTimelineId('shot'),
      type:'shot',
      time:start,
      duration:Math.max(step, Math.min(2, props.duration - start)),
      cameraId,
    };
    props.movieTrack.push(shot);
    props.cameraCuts = props.movieTrack;
    props.movieTrack.sort((a,b) => (a.time || 0) - (b.time || 0));
    selectItem({type:'shot', id:shot.id});
    ED.cinemaPreview = {id:studio.userData.editorId, time:shot.time || 0, playing:false};
    revealTimelineTime(props, shot.time);
    updatePreview(0);
    studio.userData.cinemaProps = props;
    markDirty();
    buildInspector();
    syncTimeline(currentViewportRect());
    pushCinemaHistory(studio, before, historySnapshot(studio), 'Append camera cut');
  }
  function insertCutAtPlayhead(){
    const studio = activeStudio();
    if(!studio) return;
    const before = historySnapshot(studio);
    const props = propsFor(studio);
    const step = frameStep(props);
    const time = clampTime(props, snapTime(props, selectedTime(studio)));
    const current = props.movieTrack.slice().sort((a,b) => (a.time || 0) - (b.time || 0)).find(shot => {
      const start = Number(shot.time) || 0;
      const end = start + (Number(shot.duration) || 0);
      return time > start + step && time < end - step;
    });
    const cameraId = preferredShotCameraId(props, current && current.cameraId);
    if(!cameraId){
      showTimelineNotice('Select a Scene Camera first');
      return;
    }
    let shot;
    if(current){
      const start = Number(current.time) || 0;
      const end = start + (Number(current.duration) || 0);
      current.duration = Math.max(step, time - start);
      shot = {
        id:uniqueTimelineId('shot'),
        type:'shot',
        name:current.name ? current.name + ' split' : '',
        time,
        duration:Math.max(step, end - time),
        cameraId,
      };
    } else {
      const start = Math.min(Math.max(0, props.duration - step), time);
      shot = {
        id:uniqueTimelineId('shot'),
        type:'shot',
        time:start,
        duration:Math.max(step, Math.min(2, props.duration - start)),
        cameraId,
      };
    }
    props.movieTrack.push(shot);
    props.cameraCuts = props.movieTrack;
    props.movieTrack.sort((a,b) => (a.time || 0) - (b.time || 0));
    selectItem({type:'shot', id:shot.id});
    ED.cinemaPreview = {id:studio.userData.editorId, time:shot.time || 0, playing:false};
    revealTimelineTime(props, shot.time);
    updatePreview(0);
    studio.userData.cinemaProps = props;
    markDirty();
    buildInspector();
    syncTimeline(currentViewportRect());
    pushCinemaHistory(studio, before, historySnapshot(studio), current ? 'Split camera cut' : 'Insert camera cut');
  }
  function addObjectTrack(){
    const studio = activeStudio();
    if(!studio) return;
    const before = historySnapshot(studio);
    const props = propsFor(studio);
    const targetId = preferredTimelineObjectId();
    const obj = timelineObjectById(targetId);
    if(!obj){
      showTimelineNotice('Select or choose a target first');
      return;
    }
    ED.cinemaTimelineTargetId = targetId;
    let track = props.objectTracks.find(item => item.targetId === targetId);
    if(!track){
      track = {id:'objtrack_' + Date.now().toString(36), type:'object', targetId, keyframes:[]};
      props.objectTracks.push(track);
    }
    const key = transformKeyForObject(obj, selectedTime(studio));
    track.keyframes.push(key);
    track.keyframes.sort((a,b) => (a.time || 0) - (b.time || 0));
    selectItem({type:'objectKey', id:track.id, keyId:key.id, curve:key.curve || 'linear'});
    ED.cinemaPreview = {id:studio.userData.editorId, time:key.time || 0, playing:false};
    revealTimelineTime(props, key.time);
    studio.userData.cinemaProps = props;
    markDirty();
    buildInspector();
    syncTimeline(currentViewportRect());
    revealTimelineLane('#lkCinemaTlObjectTrack');
    pushCinemaHistory(studio, before, historySnapshot(studio), 'Add object key');
  }
  function addMarkerFromTimeline(){
    const studio = activeStudio();
    if(!studio) return;
    const before = historySnapshot(studio);
    const props = propsFor(studio);
    const time = selectedTime(studio);
    const marker = {
      id:'marker_' + Date.now().toString(36),
      type:'marker',
      time:Math.max(0, Math.min(props.duration, time || 0)),
      name:'Marker',
      note:'',
    };
    props.markers.push(marker);
    props.markers.sort((a,b) => (a.time || 0) - (b.time || 0));
    selectItem({type:'marker', id:marker.id});
    ED.cinemaPreview = {id:studio.userData.editorId, time:marker.time || 0, playing:false};
    revealTimelineTime(props, marker.time);
    studio.userData.cinemaProps = props;
    markDirty();
    syncTimeline(currentViewportRect());
    pushCinemaHistory(studio, before, historySnapshot(studio), 'Add marker');
  }
  function addEventFromTimeline(){
    const studio = activeStudio();
    if(!studio) return;
    const before = historySnapshot(studio);
    const props = propsFor(studio);
    const event = {
      id:uniqueTimelineId('event'),
      type:'event',
      time:clampTime(props, snapTime(props, selectedTime(studio))),
      name:'cinema.event',
      payload:'',
    };
    props.eventTracks.push(event);
    props.eventTracks.sort((a,b) => (a.time || 0) - (b.time || 0));
    selectItem({type:'event', id:event.id});
    ED.cinemaPreview = {id:studio.userData.editorId, time:event.time || 0, playing:false};
    revealTimelineTime(props, event.time);
    studio.userData.cinemaProps = props;
    markDirty();
    syncTimeline(currentViewportRect());
    pushCinemaHistory(studio, before, historySnapshot(studio), 'Add timeline event');
  }
  function keyObjectTrack(){
    addObjectTrack();
  }
  function cameraFov(camera){
    const props = camera && camera.userData && camera.userData.cameraProps || {};
    const sceneCam = camera && camera.userData && camera.userData.sceneCamera;
    return Math.max(1, Math.min(179, Number(props.fov) || Number(sceneCam && sceneCam.fov) || 50));
  }
  function keyLensTrack(){
    const studio = activeStudio();
    if(!studio) return;
    const before = historySnapshot(studio);
    const props = propsFor(studio);
    const targetId = preferredShotCameraId(props);
    const cam = sceneCameraById(targetId);
    if(!cam){
      showTimelineNotice('Select or choose a Scene Camera first');
      return;
    }
    ED.cinemaTimelineCameraId = targetId;
    let track = props.lensTracks.find(item => item.targetId === targetId);
    if(!track){
      track = {id:uniqueTimelineId('lenstrack'), type:'lens', targetId, keyframes:[]};
      props.lensTracks.push(track);
    }
    const key = {
      id:uniqueTimelineId('lens'),
      time:clampTime(props, snapTime(props, selectedTime(studio))),
      fov:cameraFov(cam),
      curve:'linear',
    };
    track.keyframes.push(key);
    track.keyframes.sort((a,b) => (a.time || 0) - (b.time || 0));
    selectItem({type:'lensKey', id:track.id, keyId:key.id, curve:key.curve || 'linear'});
    ED.cinemaPreview = {id:studio.userData.editorId, time:key.time || 0, playing:false};
    revealTimelineTime(props, key.time);
    applyAtTime(studio, ED.cinemaPreview.time);
    studio.userData.cinemaProps = props;
    markDirty();
    buildInspector();
    syncTimeline(currentViewportRect());
    revealTimelineLane('#lkCinemaTlLensTrack');
    pushCinemaHistory(studio, before, historySnapshot(studio), 'Add lens key');
  }
  function selectedItemMatches(type, id, keyId){
    const item = ED.cinemaSelectedItem || {};
    return item.type === type && item.id === id && (!keyId || item.keyId === keyId);
  }
  function selectItem(item){
    ED.cinemaSelectedItem = item;
    if(cinemaCurvePanel) cinemaCurvePanel.classList.toggle('on', item && (item.type === 'objectKey' || item.type === 'lensKey'));
    if(cinemaCurveMode && item && (item.type === 'objectKey' || item.type === 'lensKey')) cinemaCurveMode.value = item.curve || 'linear';
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
    ED.cinemaTimelineTargetId = targetId;
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
    if(item.type === 'marker') return 'Delete marker';
    if(item.type === 'event') return 'Delete event';
    if(item.type === 'objectTrack') return 'Delete target';
    if(item.type === 'objectKey') return 'Delete key';
    if(item.type === 'lensTrack') return 'Delete lens track';
    if(item.type === 'lensKey') return 'Delete lens key';
    return 'Delete';
  }
  function duplicateLabel(){
    const item = ED.cinemaSelectedItem;
    if(!item) return 'Duplicate';
    if(item.type === 'shot') return 'Duplicate shot';
    if(item.type === 'marker') return 'Duplicate marker';
    if(item.type === 'event') return 'Duplicate event';
    if(item.type === 'objectKey') return 'Duplicate key';
    if(item.type === 'lensKey') return 'Duplicate lens key';
    return 'Duplicate';
  }
  function canDuplicateSelectedItem(){
    const item = ED.cinemaSelectedItem;
    return !!(item && (item.type === 'shot' || item.type === 'marker' || item.type === 'event' || item.type === 'objectKey' || item.type === 'lensKey'));
  }
  function deselectTimelineItem(){
    if(!ED.cinemaSelectedItem) return;
    ED.cinemaSelectedItem = null;
    if(cinemaCurvePanel) cinemaCurvePanel.classList.remove('on');
    syncTimeline(currentViewportRect());
  }
  function revealTimelineLane(selector){
    const lane = selector ? root.querySelector(selector) : null;
    if(lane && lane.scrollIntoView){
      requestAnimationFrame(() => lane.scrollIntoView({block:'nearest', inline:'nearest'}));
    }
  }
  function duplicateTime(props, start, duration){
    const step = frameStep(props);
    const offset = Math.max(step, Number(duration) || step);
    return clampTime(props, snapTime(props, (Number(start) || 0) + offset));
  }
  function duplicateSelectedItem(){
    const studio = activeStudio();
    const item = ED.cinemaSelectedItem;
    if(!studio || !item || !canDuplicateSelectedItem()) return;
    const before = historySnapshot(studio);
    const props = propsFor(studio);
    if(item.type === 'shot'){
      const source = shotById(props, item.id);
      if(!source) return;
      const step = frameStep(props);
      const copy = cloneData(source);
      copy.id = uniqueTimelineId('shot');
      copy.name = source.name ? source.name + ' copy' : '';
      copy.time = Math.min(Math.max(0, props.duration - step), duplicateTime(props, source.time, source.duration));
      copy.duration = Math.max(step, Math.min(Number(source.duration) || step, props.duration - copy.time));
      props.movieTrack.push(copy);
      props.cameraCuts = props.movieTrack;
      props.movieTrack.sort((a,b) => (a.time || 0) - (b.time || 0));
      selectItem({type:'shot', id:copy.id});
      ED.cinemaPreview = {id:studio.userData.editorId, time:copy.time || 0, playing:false};
      updatePreview(0);
    } else if(item.type === 'marker'){
      const source = markerById(props, item.id);
      if(!source) return;
      const copy = cloneData(source);
      copy.id = uniqueTimelineId('marker');
      copy.name = (source.name || 'Marker') + ' copy';
      copy.time = duplicateTime(props, source.time, frameStep(props));
      props.markers.push(copy);
      props.markers.sort((a,b) => (a.time || 0) - (b.time || 0));
      selectItem({type:'marker', id:copy.id});
      ED.cinemaPreview = {id:studio.userData.editorId, time:copy.time || 0, playing:false};
      updatePreview(0);
    } else if(item.type === 'event'){
      const source = eventById(props, item.id);
      if(!source) return;
      const copy = cloneData(source);
      copy.id = uniqueTimelineId('event');
      copy.name = (source.name || 'cinema.event') + '.copy';
      copy.time = duplicateTime(props, source.time, frameStep(props));
      props.eventTracks.push(copy);
      props.eventTracks.sort((a,b) => (a.time || 0) - (b.time || 0));
      selectItem({type:'event', id:copy.id});
      ED.cinemaPreview = {id:studio.userData.editorId, time:copy.time || 0, playing:false};
      updatePreview(0);
    } else if(item.type === 'objectKey'){
      const track = trackById(props, item.id);
      const source = keyById(track, item.keyId);
      if(!track || !source) return;
      const copy = cloneData(source);
      copy.id = uniqueTimelineId('key');
      copy.time = duplicateTime(props, source.time, frameStep(props));
      track.keyframes.push(copy);
      track.keyframes.sort((a,b) => (a.time || 0) - (b.time || 0));
      selectItem({type:'objectKey', id:track.id, keyId:copy.id, curve:copy.curve || 'linear'});
      ED.cinemaPreview = {id:studio.userData.editorId, time:copy.time || 0, playing:false};
      applyAtTime(studio, ED.cinemaPreview.time);
    } else if(item.type === 'lensKey'){
      const track = lensTrackById(props, item.id);
      const source = lensKeyById(track, item.keyId);
      if(!track || !source) return;
      const copy = cloneData(source);
      copy.id = uniqueTimelineId('lens');
      copy.time = duplicateTime(props, source.time, frameStep(props));
      track.keyframes.push(copy);
      track.keyframes.sort((a,b) => (a.time || 0) - (b.time || 0));
      selectItem({type:'lensKey', id:track.id, keyId:copy.id, curve:copy.curve || 'linear'});
      ED.cinemaPreview = {id:studio.userData.editorId, time:copy.time || 0, playing:false};
      applyAtTime(studio, ED.cinemaPreview.time);
    }
    studio.userData.cinemaProps = props;
    markDirty();
    buildInspector();
    syncTimeline(currentViewportRect());
    pushCinemaHistory(studio, before, historySnapshot(studio), duplicateLabel());
  }
  function deleteSelectedItem(){
    const studio = activeStudio();
    const item = ED.cinemaSelectedItem;
    if(!studio || !item) return;
    const before = historySnapshot(studio);
    const label = deleteLabel();
    const props = propsFor(studio);
    if(item.type === 'shot'){
      props.cameraCuts = props.movieTrack.filter(shot => shot.id !== item.id);
      props.movieTrack = props.cameraCuts;
    } else if(item.type === 'marker'){
      props.markers = props.markers.filter(marker => marker.id !== item.id);
    } else if(item.type === 'event'){
      props.eventTracks = props.eventTracks.filter(event => event.id !== item.id);
    } else if(item.type === 'objectTrack'){
      props.objectTracks = props.objectTracks.filter(track => track.id !== item.id);
    } else if(item.type === 'objectKey'){
      const track = props.objectTracks.find(t => t.id === item.id);
      if(track) track.keyframes = (track.keyframes || []).filter(key => key.id !== item.keyId);
    } else if(item.type === 'lensTrack'){
      props.lensTracks = props.lensTracks.filter(track => track.id !== item.id);
    } else if(item.type === 'lensKey'){
      const track = props.lensTracks.find(t => t.id === item.id);
      if(track) track.keyframes = (track.keyframes || []).filter(key => key.id !== item.keyId);
    }
    studio.userData.cinemaProps = props;
    ED.cinemaSelectedItem = null;
    if(cinemaCurvePanel) cinemaCurvePanel.classList.remove('on');
    markDirty();
    buildInspector();
    syncTimeline(currentViewportRect());
    pushCinemaHistory(studio, before, historySnapshot(studio), label);
  }
  function setSelectedKeyCurve(mode){
    const studio = activeStudio();
    const objectKey = selectedObjectKey(studio);
    if(objectKey){
      applyObjectKeyPatch(studio, objectKey.track, objectKey.key, {curve:mode || 'linear'}, {label:'Edit object key curve'});
      return;
    }
    const lensKey = selectedLensKey(studio);
    if(lensKey) applyLensKeyPatch(studio, lensKey.track, lensKey.key, {curve:mode || 'linear'}, {label:'Edit lens key curve'});
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
  function setTimelineLaneRows(lane, rows){
    if(!lane) return;
    const h = Math.max(26, Math.max(1, rows || 1) * 30 - 4);
    lane.style.height = h + 'px';
    const label = lane.parentElement && lane.parentElement.querySelector ? lane.parentElement.querySelector('.lk-cinema-row-label') : null;
    if(label) label.style.height = h + 'px';
  }
  function appendLaneName(lane, label, top){
    if(!lane) return;
    const node = document.createElement('span');
    node.className = 'lk-cinema-lane-name';
    node.style.top = Math.max(2, Number(top) || 2) + 'px';
    node.textContent = label || '';
    lane.appendChild(node);
  }
  function timelineRenderSignature(props, view){
    const item = ED.cinemaSelectedItem || null;
    return JSON.stringify({
      duration:props.duration,
      fps:props.fps,
      offset:Number(view.offset || 0).toFixed(4),
      span:Number(view.span || 0).toFixed(4),
      selected:item,
      dragging:[
        shotDrag && shotDrag.shotId || '',
        markerDrag && markerDrag.markerId || '',
        keyDrag && (keyDrag.trackId + ':' + keyDrag.keyId) || '',
        lensDrag && (lensDrag.trackId + ':' + lensDrag.keyId) || '',
        eventDrag && eventDrag.eventId || '',
      ],
      shots:(props.movieTrack || []).map(shot => [shot.id, shot.time, shot.duration, shot.cameraId, shot.name || '']),
      markers:(props.markers || []).map(marker => [marker.id, marker.time, marker.name || '', marker.note || '']),
      objects:(props.objectTracks || []).map(track => [track.id, track.targetId, (track.keyframes || []).map(key => [key.id, key.time, key.curve || 'linear'])]),
      lenses:(props.lensTracks || []).map(track => [track.id, track.targetId, (track.keyframes || []).map(key => [key.id, key.time, key.fov, key.curve || 'linear'])]),
      events:(props.eventTracks || []).map(event => [event.id, event.time, event.name || '', event.payload || '']),
    });
  }
  function syncTimeline(viewRect){
    if(!cinemaTimeline) return;
    const studio = activeStudio();
    const on = !!(studio && ED.active && !ED.playPreview);
    ED.cinemaTimelineOpen = on;
    cinemaTimeline.classList.toggle('on', on);
    if(!on){
      if(cinemaViewportHud) cinemaViewportHud.classList.remove('on');
      ED.cinemaTimelineFocused = false;
      return;
    }
    const props = propsFor(studio);
    const validation = validateTimeline(studio, props);
    const state = ED.cinemaPreview && ED.cinemaPreview.id === studio.userData.editorId ? ED.cinemaPreview : null;
    const time = Math.max(0, Math.min(props.duration, state ? state.time || 0 : 0));
    const view = timelineView(props);
    const notice = timelineNotice && performance.now() < timelineNotice.until ? timelineNotice.text : '';
    if(timelineNotice && !notice) timelineNotice = null;
    const x = viewRect.x + 12;
    const w = Math.max(260, viewRect.w - 24);
    const maxTimelineH = Math.max(160, Math.min(innerHeight - 92, viewRect.h - 80));
    const timelineH = Math.min(maxTimelineH, Math.max(150, cinemaTimeline.offsetHeight || 260));
    cinemaTimeline.style.left = x + 'px';
    cinemaTimeline.style.top = (ED.cinemaTimelineDocked ? viewRect.y + viewRect.h + 8 : Math.max(viewRect.y + 70, viewRect.y + viewRect.h - timelineH - 8)) + 'px';
    cinemaTimeline.style.width = w + 'px';
    const name = cinemaTimeline.querySelector('#lkCinemaTlName');
    const clock = cinemaTimeline.querySelector('#lkCinemaTlClock');
    const track = cinemaTimeline.querySelector('#lkCinemaTlTrack');
    const body = cinemaTimeline.querySelector('#lkCinemaTlBody');
    const ruler = cinemaTimeline.querySelector('#lkCinemaTlRuler');
    const markerTrack = cinemaTimeline.querySelector('#lkCinemaTlMarkerTrack');
    const objectTrack = cinemaTimeline.querySelector('#lkCinemaTlObjectTrack');
    const lensTrack = cinemaTimeline.querySelector('#lkCinemaTlLensTrack');
    const eventTrack = cinemaTimeline.querySelector('#lkCinemaTlEventTrack');
    const playhead = cinemaTimeline.querySelector('#lkCinemaTlPlayhead');
    syncSelect(cinemaCameraSelect, [{value:'', label:'Choose camera'}].concat(sceneCameras().map(cam => ({value:cam.userData.editorId, label:cam.userData.editorName || cam.userData.editorId}))), selectedSceneCameraId() || ED.cinemaTimelineCameraId || props.previewCamera);
    syncSelect(cinemaObjectSelect, [{value:'', label:'Choose target'}].concat(timelineObjects().map(obj => ({value:obj.userData.editorId, label:obj.userData.editorName || obj.userData.editorId}))), selectedTargetId(studio) || selectedTimelineObjectId() || ED.cinemaTimelineTargetId);
    if(name) name.textContent = studio.userData.editorName || 'Cinema Studio';
    if(clock) clock.textContent = notice || (time.toFixed(2) + ' / ' + props.duration.toFixed(2) + ' s');
    if(cinemaPlayBtn) cinemaPlayBtn.textContent = state && state.playing ? 'Pause' : 'Play';
    if(cinemaLockBtn) cinemaLockBtn.classList.toggle('on', !!ED.cinemaTimelineLocked);
    if(cinemaDockBtn) cinemaDockBtn.classList.toggle('on', !!ED.cinemaTimelineDocked);
    if(cinemaFloatPreviewBtn) cinemaFloatPreviewBtn.classList.toggle('on', !!ED.cinemaFloatPreviewOn);
    if(cinemaPreviewModeBtn){
      const finalMode = (ED.cinemaPreviewMode || 'final') !== 'normal';
      cinemaPreviewModeBtn.textContent = finalMode ? 'Final' : 'Normal';
      cinemaPreviewModeBtn.classList.toggle('on', finalMode);
    }
    if(cinemaAspectSelect) cinemaAspectSelect.value = ED.cinemaFloatPreviewAspect || '16:9';
    if(cinemaZoomResetBtn) cinemaZoomResetBtn.textContent = view.zoom > 1.01 ? view.zoom.toFixed(view.zoom < 10 ? 1 : 0) + 'x' : '1:1';
    if(cinemaDeleteBtn){
      cinemaDeleteBtn.disabled = !ED.cinemaSelectedItem;
      cinemaDeleteBtn.textContent = deleteLabel();
    }
    if(cinemaDuplicateBtn){
      cinemaDuplicateBtn.disabled = !canDuplicateSelectedItem();
      cinemaDuplicateBtn.textContent = duplicateLabel();
    }
    if(playhead && body){
      const labelW = 106;
      const gap = 6;
      const pad = 4;
      const laneX = pad + labelW + gap;
      const laneW = Math.max(1, body.clientWidth - laneX - pad);
      playhead.style.left = (laneX + ((time - view.offset) / Math.max(.0001, view.span) * laneW) - 1) + 'px';
    }
    const renderSignature = body ? timelineRenderSignature(props, view) : '';
    const shouldRenderTracks = body ? body.dataset.renderSignature !== renderSignature : true;
    if(body && shouldRenderTracks) body.dataset.renderSignature = renderSignature;
    if(shouldRenderTracks && ruler){
      ruler.innerHTML = '';
      const divisions = Math.max(2, Math.min(12, Math.ceil(view.span)));
      for(let i = 0; i <= divisions; i++){
        const tick = document.createElement('span');
        tick.className = 'lk-cinema-tick';
        const t = view.offset + view.span * (i / divisions);
        tick.style.left = (i / divisions * 100) + '%';
        tick.textContent = t.toFixed(t < 10 ? 1 : 0) + 's';
        ruler.appendChild(tick);
      }
    }
    if(shouldRenderTracks && track && markerTrack && objectTrack && lensTrack && eventTrack){
      track.innerHTML = '';
      markerTrack.innerHTML = '';
      objectTrack.innerHTML = '';
      lensTrack.innerHTML = '';
      eventTrack.innerHTML = '';
      setTimelineLaneRows(markerTrack, 1);
      setTimelineLaneRows(objectTrack, props.objectTracks.length || 1);
      setTimelineLaneRows(lensTrack, props.lensTracks.length || 1);
      setTimelineLaneRows(eventTrack, 1);
      props.movieTrack.slice().sort((a,b) => (a.time || 0) - (b.time || 0)).forEach(cut => {
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = 'lk-cinema-marker';
        marker.dataset.shotId = cut.id;
        const left = timeToTimelinePct(props, cut.time || 0);
        const width = Math.max(2, durationToTimelinePct(props, cut.duration || 1));
        marker.style.left = left + '%';
        marker.style.width = width + '%';
        marker.style.transform = 'none';
        marker.style.minWidth = '0';
        marker.style.maxWidth = 'none';
        marker.classList.toggle('selected', selectedItemMatches('shot', cut.id));
        const shotWarnings = validation.shotIssues.get(cut.id) || [];
        marker.classList.toggle('invalid', shotWarnings.length > 0);
        marker.classList.toggle('warning', shotWarnings.length > 0 && !(shotWarnings.includes('Missing camera') || shotWarnings.includes('Zero duration')));
        marker.classList.toggle('dragging', shotDrag && shotDrag.shotId === cut.id);
        marker.textContent = '';
        marker.appendChild(document.createTextNode((cut.name || cameraLabel(cut.cameraId)).slice(0, 14)));
        const trimL = document.createElement('span');
        const trimR = document.createElement('span');
        trimL.className = 'lk-cinema-trim-l';
        trimR.className = 'lk-cinema-trim-r';
        marker.appendChild(trimL);
        marker.appendChild(trimR);
        marker.title = (cut.time || 0).toFixed(2) + 's - ' + ((cut.time || 0) + (cut.duration || 0)).toFixed(2) + 's | ' + cameraLabel(cut.cameraId) + (shotWarnings.length ? ' | ' + shotWarnings.join(' | ') : '');
        marker.addEventListener('pointerdown', e => beginShotDrag(e, studio, cut));
        marker.addEventListener('click', () => {
          if(shotDrag && shotDrag.suppressClick) return;
          selectItem({type:'shot', id:cut.id});
          ED.cinemaPreview = {id:studio.userData.editorId, time:Math.max(0, Math.min(props.duration, cut.time || 0)), playing:false};
          updatePreview(0);
          syncTimeline(currentViewportRect());
        });
        track.appendChild(marker);
      });
      props.markers.slice().sort((a,b) => (a.time || 0) - (b.time || 0)).forEach(note => {
        const markerWarnings = validationMessagesFor(validation, 'marker', note.id);
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = 'lk-cinema-marker note';
        marker.classList.toggle('selected', selectedItemMatches('marker', note.id));
        marker.classList.toggle('warning', markerWarnings.length > 0);
        marker.style.left = timeToTimelinePct(props, note.time || 0) + '%';
        marker.style.width = '56px';
        marker.textContent = (note.name || 'Marker').slice(0, 10);
        marker.title = (note.time || 0).toFixed(2) + 's | ' + (note.name || 'Marker') + (note.note ? ' | ' + note.note : '') + (markerWarnings.length ? ' | ' + markerWarnings.join(' | ') : '');
        marker.classList.toggle('dragging', markerDrag && markerDrag.markerId === note.id);
        marker.addEventListener('pointerdown', e => beginMarkerDrag(e, studio, note));
        marker.addEventListener('click', () => {
          if(markerDrag && markerDrag.suppressClick) return;
          selectItem({type:'marker', id:note.id});
          ED.cinemaPreview = {id:studio.userData.editorId, time:Math.max(0, Math.min(props.duration, note.time || 0)), playing:false};
          updatePreview(0);
          syncTimeline(currentViewportRect());
        });
        markerTrack.appendChild(marker);
      });
      props.objectTracks.forEach((objTrack, trackIndex) => {
        const rowTop = trackIndex * 30 + 3;
        appendLaneName(objectTrack, objectLabel(objTrack.targetId), rowTop);
        (objTrack.keyframes || []).forEach(key => {
          const marker = document.createElement('button');
          marker.type = 'button';
          marker.className = 'lk-cinema-marker object';
          marker.dataset.trackId = objTrack.id;
          marker.dataset.keyId = key.id;
          const targetWarnings = validation.trackIssues.get(objTrack.id) || [];
          const keyWarnings = validation.keyIssues.get(objTrack.id + ':' + key.id) || [];
          marker.classList.toggle('selected', selectedItemMatches('objectKey', objTrack.id, key.id));
          marker.classList.toggle('invalid', targetWarnings.length > 0 || keyWarnings.length > 0);
          marker.classList.toggle('dragging', keyDrag && keyDrag.trackId === objTrack.id && keyDrag.keyId === key.id);
          marker.style.left = timeToTimelinePct(props, key.time || 0) + '%';
          marker.style.top = rowTop + 'px';
          marker.textContent = objectLabel(objTrack.targetId).slice(0, 12);
          marker.title = 'Target key ' + (key.time || 0).toFixed(2) + 's | ' + objectLabel(objTrack.targetId) + (targetWarnings.length || keyWarnings.length ? ' | ' + targetWarnings.concat(keyWarnings).join(' | ') : '');
          marker.addEventListener('pointerdown', e => beginKeyDrag(e, studio, objTrack, key));
          marker.addEventListener('click', () => {
            if(keyDrag && keyDrag.suppressClick) return;
            selectItem({type:'objectKey', id:objTrack.id, keyId:key.id, curve:key.curve || 'linear'});
            ED.cinemaPreview = {id:studio.userData.editorId, time:Math.max(0, Math.min(props.duration, key.time || 0)), playing:false};
            applyAtTime(studio, ED.cinemaPreview.time);
            syncTimeline(currentViewportRect());
          });
          objectTrack.appendChild(marker);
        });
      });
      props.lensTracks.forEach((trackItem, trackIndex) => {
        const rowTop = trackIndex * 30 + 3;
        appendLaneName(lensTrack, cameraLabel(trackItem.targetId), rowTop);
        const targetWarnings = validation.trackIssues.get(trackItem.id) || [];
        (trackItem.keyframes || []).forEach(key => {
          const marker = document.createElement('button');
          marker.type = 'button';
          marker.className = 'lk-cinema-marker lens';
          marker.dataset.trackId = trackItem.id;
          marker.dataset.keyId = key.id;
          const keyWarnings = validation.keyIssues.get(trackItem.id + ':' + key.id) || [];
          marker.classList.toggle('selected', selectedItemMatches('lensKey', trackItem.id, key.id));
          marker.classList.toggle('invalid', targetWarnings.length > 0 || keyWarnings.length > 0);
          marker.classList.toggle('dragging', lensDrag && lensDrag.trackId === trackItem.id && lensDrag.keyId === key.id);
          marker.style.left = timeToTimelinePct(props, key.time || 0) + '%';
          marker.style.top = rowTop + 'px';
          marker.textContent = Math.round(Number(key.fov) || 50) + ' FOV';
          marker.title = 'Lens key ' + (key.time || 0).toFixed(2) + 's | ' + cameraLabel(trackItem.targetId) + ' | FOV ' + Math.round(Number(key.fov) || 50) + (targetWarnings.length || keyWarnings.length ? ' | ' + targetWarnings.concat(keyWarnings).join(' | ') : '');
          marker.addEventListener('pointerdown', e => beginLensDrag(e, studio, trackItem, key));
          marker.addEventListener('click', () => {
            if(lensDrag && lensDrag.suppressClick) return;
            selectItem({type:'lensKey', id:trackItem.id, keyId:key.id, curve:key.curve || 'linear'});
            ED.cinemaPreview = {id:studio.userData.editorId, time:Math.max(0, Math.min(props.duration, key.time || 0)), playing:false};
            applyAtTime(studio, ED.cinemaPreview.time);
            syncTimeline(currentViewportRect());
          });
          lensTrack.appendChild(marker);
        });
      });
      props.eventTracks.slice().sort((a,b) => (a.time || 0) - (b.time || 0)).forEach(event => {
        const eventWarnings = validationMessagesFor(validation, 'marker', event.id);
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = 'lk-cinema-marker event';
        marker.dataset.eventId = event.id;
        marker.classList.toggle('selected', selectedItemMatches('event', event.id));
        marker.classList.toggle('warning', eventWarnings.length > 0);
        marker.classList.toggle('dragging', eventDrag && eventDrag.eventId === event.id);
        marker.style.left = timeToTimelinePct(props, event.time || 0) + '%';
        marker.style.width = '76px';
        marker.textContent = (event.name || 'cinema.event').slice(0, 14);
        marker.title = 'Event ' + (event.time || 0).toFixed(2) + 's | ' + (event.name || 'cinema.event') + (event.payload ? ' | ' + event.payload : '') + (eventWarnings.length ? ' | ' + eventWarnings.join(' | ') : '');
        marker.addEventListener('pointerdown', e => beginEventDrag(e, studio, event));
        marker.addEventListener('click', () => {
          if(eventDrag && eventDrag.suppressClick) return;
          selectItem({type:'event', id:event.id});
          ED.cinemaPreview = {id:studio.userData.editorId, time:Math.max(0, Math.min(props.duration, event.time || 0)), playing:false};
          updatePreview(0);
          syncTimeline(currentViewportRect());
        });
        eventTrack.appendChild(marker);
      });
    }
    renderShotDetails(studio, props);
    syncViewportHud(viewRect, studio, props, time);
  }
  function syncViewportHud(viewRect, studio, props, time){
    if(!cinemaViewportHud) return;
    const shot = activeShot(props, time);
    if(!studio || !shot){
      cinemaViewportHud.classList.remove('on');
      return;
    }
    const camName = shot.cameraId ? cameraLabel(shot.cameraId) : 'Missing camera';
    cinemaViewportHud.innerHTML = '';
    const title = document.createElement('b');
    const meta = document.createElement('span');
    title.textContent = shot.name || 'Shot';
    meta.textContent = camName + ' - ' + time.toFixed(2) + 's';
    cinemaViewportHud.appendChild(title);
    cinemaViewportHud.appendChild(document.createElement('br'));
    cinemaViewportHud.appendChild(meta);
    cinemaViewportHud.style.left = (viewRect.x + 18) + 'px';
    cinemaViewportHud.style.top = (viewRect.y + 18) + 'px';
    cinemaViewportHud.classList.add('on');
  }
  function beginShotDrag(e, studio, cut){
    if(!studio || !cut || e.button !== 0) return;
    const track = root.querySelector('#lkCinemaTlTrack');
    const rect = track && track.getBoundingClientRect ? track.getBoundingClientRect() : null;
    if(!rect || rect.width <= 0) return;
    const props = propsFor(studio);
    const target = e.target;
    let mode = 'move';
    if(target && target.classList && target.classList.contains('lk-cinema-trim-l')) mode = 'trim-start';
    else if(target && target.classList && target.classList.contains('lk-cinema-trim-r')) mode = 'trim-end';
    selectItem({type:'shot', id:cut.id});
    ED.cinemaPreview = {id:studio.userData.editorId, time:Math.max(0, Math.min(props.duration, cut.time || 0)), playing:false};
    shotDrag = {
      studioId:studio.userData.editorId,
      shotId:cut.id,
      mode,
      before:historySnapshot(studio),
      startX:e.clientX,
      trackW:rect.width,
      trackSpan:timelineView(props).span,
      initialTime:Number(cut.time) || 0,
      initialDuration:Number(cut.duration) || frameStep(props),
      moved:false,
      suppressClick:false,
    };
    if(e.currentTarget && e.currentTarget.setPointerCapture){
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch(err){}
    }
    e.preventDefault();
    syncTimeline(currentViewportRect());
  }
  function onShotDragMove(e){
    if(!shotDrag) return;
    const studio = GAME.world.registry.find(o => o && o.userData && o.userData.editorId === shotDrag.studioId && o.userData.editorType === 'cinemaStudio');
    if(!studio){ shotDrag = null; return; }
    const props = propsFor(studio);
    const shot = shotById(props, shotDrag.shotId);
    if(!shot){ shotDrag = null; return; }
    const deltaPx = e.clientX - shotDrag.startX;
    if(Math.abs(deltaPx) > 2) shotDrag.moved = true;
    const deltaTime = deltaPx / Math.max(1, shotDrag.trackW) * (shotDrag.trackSpan || props.duration);
    const minDur = Math.max(.05, frameStep(props));
    const start0 = shotDrag.initialTime;
    const dur0 = Math.max(minDur, shotDrag.initialDuration);
    const end0 = start0 + dur0;
    if(shotDrag.mode === 'move'){
      applyShotPatch(studio, shot, {time:Math.max(0, Math.min(props.duration - minDur, start0 + deltaTime))}, {snap:true, previewStart:true, skipHistory:true});
    } else if(shotDrag.mode === 'trim-start'){
      const nextStart = Math.max(0, Math.min(end0 - minDur, start0 + deltaTime));
      applyShotPatch(studio, shot, {time:nextStart, duration:end0 - nextStart}, {snap:true, previewStart:true, skipHistory:true});
    } else if(shotDrag.mode === 'trim-end'){
      const nextEnd = Math.max(start0 + minDur, Math.min(props.duration, end0 + deltaTime));
      applyShotPatch(studio, shot, {duration:nextEnd - start0}, {snap:true, skipHistory:true});
    }
  }
  function onShotDragEnd(){
    if(!shotDrag) return;
    const hadMove = shotDrag.moved;
    shotDrag.suppressClick = hadMove;
    const studio = GAME.world.registry.find(o => o && o.userData && o.userData.editorId === shotDrag.studioId && o.userData.editorType === 'cinemaStudio');
    const before = shotDrag.before;
    const label = shotDrag.mode === 'move' ? 'Move camera cut' : 'Trim camera cut';
    shotDrag = hadMove ? {suppressClick:true} : null;
    if(studio && hadMove) pushCinemaHistory(studio, before, historySnapshot(studio), label);
    if(studio) buildInspector();
    syncTimeline(currentViewportRect());
    if(hadMove) setTimeout(() => { if(shotDrag && shotDrag.suppressClick) shotDrag = null; }, 0);
  }
  function beginKeyDrag(e, studio, track, key){
    if(!studio || !track || !key || e.button !== 0) return;
    const lane = root.querySelector('#lkCinemaTlObjectTrack');
    const rect = lane && lane.getBoundingClientRect ? lane.getBoundingClientRect() : null;
    if(!rect || rect.width <= 0) return;
    const props = propsFor(studio);
    selectItem({type:'objectKey', id:track.id, keyId:key.id, curve:key.curve || 'linear'});
    ED.cinemaPreview = {id:studio.userData.editorId, time:Math.max(0, Math.min(props.duration, key.time || 0)), playing:false};
    keyDrag = {
      studioId:studio.userData.editorId,
      trackId:track.id,
      keyId:key.id,
      before:historySnapshot(studio),
      startX:e.clientX,
      trackW:rect.width,
      trackSpan:timelineView(props).span,
      initialTime:Number(key.time) || 0,
      moved:false,
      suppressClick:false,
    };
    if(e.currentTarget && e.currentTarget.setPointerCapture){
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch(err){}
    }
    e.preventDefault();
    syncTimeline(currentViewportRect());
  }
  function onKeyDragMove(e){
    if(!keyDrag) return;
    const studio = GAME.world.registry.find(o => o && o.userData && o.userData.editorId === keyDrag.studioId && o.userData.editorType === 'cinemaStudio');
    if(!studio){ keyDrag = null; return; }
    const props = propsFor(studio);
    const track = trackById(props, keyDrag.trackId);
    const key = keyById(track, keyDrag.keyId);
    if(!track || !key){ keyDrag = null; return; }
    const deltaPx = e.clientX - keyDrag.startX;
    if(Math.abs(deltaPx) > 2) keyDrag.moved = true;
    const deltaTime = deltaPx / Math.max(1, keyDrag.trackW) * (keyDrag.trackSpan || props.duration);
    applyObjectKeyPatch(studio, track, key, {time:keyDrag.initialTime + deltaTime}, {snap:true, preview:true, skipHistory:true});
  }
  function onKeyDragEnd(){
    if(!keyDrag) return;
    const hadMove = keyDrag.moved;
    keyDrag.suppressClick = hadMove;
    const studio = GAME.world.registry.find(o => o && o.userData && o.userData.editorId === keyDrag.studioId && o.userData.editorType === 'cinemaStudio');
    const before = keyDrag.before;
    keyDrag = hadMove ? {suppressClick:true} : null;
    if(studio && hadMove) pushCinemaHistory(studio, before, historySnapshot(studio), 'Move object key');
    syncTimeline(currentViewportRect());
    if(hadMove) setTimeout(() => { if(keyDrag && keyDrag.suppressClick) keyDrag = null; }, 0);
  }
  function beginLensDrag(e, studio, track, key){
    if(!studio || !track || !key || e.button !== 0) return;
    const lane = root.querySelector('#lkCinemaTlLensTrack');
    const rect = lane && lane.getBoundingClientRect ? lane.getBoundingClientRect() : null;
    if(!rect || rect.width <= 0) return;
    const props = propsFor(studio);
    selectItem({type:'lensKey', id:track.id, keyId:key.id, curve:key.curve || 'linear'});
    ED.cinemaPreview = {id:studio.userData.editorId, time:Math.max(0, Math.min(props.duration, key.time || 0)), playing:false};
    lensDrag = {
      studioId:studio.userData.editorId,
      trackId:track.id,
      keyId:key.id,
      before:historySnapshot(studio),
      startX:e.clientX,
      trackW:rect.width,
      trackSpan:timelineView(props).span,
      initialTime:Number(key.time) || 0,
      moved:false,
      suppressClick:false,
    };
    if(e.currentTarget && e.currentTarget.setPointerCapture){
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch(err){}
    }
    e.preventDefault();
    syncTimeline(currentViewportRect());
  }
  function onLensDragMove(e){
    if(!lensDrag) return;
    const studio = GAME.world.registry.find(o => o && o.userData && o.userData.editorId === lensDrag.studioId && o.userData.editorType === 'cinemaStudio');
    if(!studio){ lensDrag = null; return; }
    const props = propsFor(studio);
    const track = lensTrackById(props, lensDrag.trackId);
    const key = lensKeyById(track, lensDrag.keyId);
    if(!track || !key){ lensDrag = null; return; }
    const deltaPx = e.clientX - lensDrag.startX;
    if(Math.abs(deltaPx) > 2) lensDrag.moved = true;
    const deltaTime = deltaPx / Math.max(1, lensDrag.trackW) * (lensDrag.trackSpan || props.duration);
    applyLensKeyPatch(studio, track, key, {time:lensDrag.initialTime + deltaTime}, {snap:true, preview:true, skipHistory:true});
  }
  function onLensDragEnd(){
    if(!lensDrag) return;
    const hadMove = lensDrag.moved;
    lensDrag.suppressClick = hadMove;
    const studio = GAME.world.registry.find(o => o && o.userData && o.userData.editorId === lensDrag.studioId && o.userData.editorType === 'cinemaStudio');
    const before = lensDrag.before;
    lensDrag = hadMove ? {suppressClick:true} : null;
    if(studio && hadMove) pushCinemaHistory(studio, before, historySnapshot(studio), 'Move lens key');
    syncTimeline(currentViewportRect());
    if(hadMove) setTimeout(() => { if(lensDrag && lensDrag.suppressClick) lensDrag = null; }, 0);
  }
  function beginEventDrag(e, studio, event){
    if(!studio || !event || e.button !== 0) return;
    const lane = root.querySelector('#lkCinemaTlEventTrack');
    const rect = lane && lane.getBoundingClientRect ? lane.getBoundingClientRect() : null;
    if(!rect || rect.width <= 0) return;
    const props = propsFor(studio);
    selectItem({type:'event', id:event.id});
    ED.cinemaPreview = {id:studio.userData.editorId, time:Math.max(0, Math.min(props.duration, event.time || 0)), playing:false};
    eventDrag = {
      studioId:studio.userData.editorId,
      eventId:event.id,
      before:historySnapshot(studio),
      startX:e.clientX,
      trackW:rect.width,
      trackSpan:timelineView(props).span,
      initialTime:Number(event.time) || 0,
      moved:false,
      suppressClick:false,
    };
    if(e.currentTarget && e.currentTarget.setPointerCapture){
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch(err){}
    }
    e.preventDefault();
    syncTimeline(currentViewportRect());
  }
  function onEventDragMove(e){
    if(!eventDrag) return;
    const studio = GAME.world.registry.find(o => o && o.userData && o.userData.editorId === eventDrag.studioId && o.userData.editorType === 'cinemaStudio');
    if(!studio){ eventDrag = null; return; }
    const props = propsFor(studio);
    const event = eventById(props, eventDrag.eventId);
    if(!event){ eventDrag = null; return; }
    const deltaPx = e.clientX - eventDrag.startX;
    if(Math.abs(deltaPx) > 2) eventDrag.moved = true;
    const deltaTime = deltaPx / Math.max(1, eventDrag.trackW) * (eventDrag.trackSpan || props.duration);
    applyEventPatch(studio, event, {time:eventDrag.initialTime + deltaTime}, {snap:true, preview:true, skipHistory:true});
  }
  function onEventDragEnd(){
    if(!eventDrag) return;
    const hadMove = eventDrag.moved;
    eventDrag.suppressClick = hadMove;
    const studio = GAME.world.registry.find(o => o && o.userData && o.userData.editorId === eventDrag.studioId && o.userData.editorType === 'cinemaStudio');
    const before = eventDrag.before;
    eventDrag = hadMove ? {suppressClick:true} : null;
    if(studio && hadMove) pushCinemaHistory(studio, before, historySnapshot(studio), 'Move timeline event');
    syncTimeline(currentViewportRect());
    if(hadMove) setTimeout(() => { if(eventDrag && eventDrag.suppressClick) eventDrag = null; }, 0);
  }
  function beginMarkerDrag(e, studio, marker){
    if(!studio || !marker || e.button !== 0) return;
    const lane = root.querySelector('#lkCinemaTlMarkerTrack');
    const rect = lane && lane.getBoundingClientRect ? lane.getBoundingClientRect() : null;
    if(!rect || rect.width <= 0) return;
    const props = propsFor(studio);
    selectItem({type:'marker', id:marker.id});
    ED.cinemaPreview = {id:studio.userData.editorId, time:Math.max(0, Math.min(props.duration, marker.time || 0)), playing:false};
    markerDrag = {
      studioId:studio.userData.editorId,
      markerId:marker.id,
      before:historySnapshot(studio),
      startX:e.clientX,
      trackW:rect.width,
      trackSpan:timelineView(props).span,
      initialTime:Number(marker.time) || 0,
      moved:false,
      suppressClick:false,
    };
    if(e.currentTarget && e.currentTarget.setPointerCapture){
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch(err){}
    }
    e.preventDefault();
    syncTimeline(currentViewportRect());
  }
  function onMarkerDragMove(e){
    if(!markerDrag) return;
    const studio = GAME.world.registry.find(o => o && o.userData && o.userData.editorId === markerDrag.studioId && o.userData.editorType === 'cinemaStudio');
    if(!studio){ markerDrag = null; return; }
    const props = propsFor(studio);
    const marker = markerById(props, markerDrag.markerId);
    if(!marker){ markerDrag = null; return; }
    const deltaPx = e.clientX - markerDrag.startX;
    if(Math.abs(deltaPx) > 2) markerDrag.moved = true;
    const deltaTime = deltaPx / Math.max(1, markerDrag.trackW) * (markerDrag.trackSpan || props.duration);
    applyMarkerPatch(studio, marker, {time:markerDrag.initialTime + deltaTime}, {snap:true, preview:true, skipHistory:true});
  }
  function onMarkerDragEnd(){
    if(!markerDrag) return;
    const hadMove = markerDrag.moved;
    markerDrag.suppressClick = hadMove;
    const studio = GAME.world.registry.find(o => o && o.userData && o.userData.editorId === markerDrag.studioId && o.userData.editorType === 'cinemaStudio');
    const before = markerDrag.before;
    markerDrag = hadMove ? {suppressClick:true} : null;
    if(studio && hadMove) pushCinemaHistory(studio, before, historySnapshot(studio), 'Move marker');
    syncTimeline(currentViewportRect());
    if(hadMove) setTimeout(() => { if(markerDrag && markerDrag.suppressClick) markerDrag = null; }, 0);
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
    if(!track || !opts || !opts.skipEditableTarget || opts.forceEditableTarget) return false;
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
  function applyCameraFov(holder, fov){
    if(!holder || !holder.userData) return;
    const nextFov = Math.max(1, Math.min(179, Number(fov) || 50));
    holder.userData.cameraProps = Object.assign({}, holder.userData.cameraProps || {}, {fov:nextFov});
    if(holder.userData.addedEntry && holder.userData.addedEntry.props){
      holder.userData.addedEntry.props = Object.assign({}, holder.userData.addedEntry.props, {fov:nextFov});
    }
    const cam = holder.userData.sceneCamera;
    if(cam){
      cam.fov = nextFov;
      if(cam.updateProjectionMatrix) cam.updateProjectionMatrix();
    }
  }
  function applyLensTrack(track, time){
    const holder = sceneCameraById(track && track.targetId);
    const keys = (track && track.keyframes || []).slice().sort((a,b) => (a.time || 0) - (b.time || 0));
    if(!holder || !keys.length) return;
    let prev = keys[0], next = keys[keys.length - 1];
    for(let i = 0; i < keys.length; i++){
      if((keys[i].time || 0) <= time) prev = keys[i];
      if((keys[i].time || 0) >= time){ next = keys[i]; break; }
    }
    if(prev === next || (next.time || 0) === (prev.time || 0)){
      applyCameraFov(holder, prev.fov);
      return;
    }
    const alpha = curveAlpha((time - (prev.time || 0)) / ((next.time || 0) - (prev.time || 0)), prev.curve || 'linear');
    const fov = (Number(prev.fov) || 50) + ((Number(next.fov) || 50) - (Number(prev.fov) || 50)) * alpha;
    applyCameraFov(holder, fov);
  }
  function applyAtTime(studio, time, opts){
    const props = propsFor(studio);
    const t = Math.max(0, Math.min(props.duration, Number(time) || 0));
    props.objectTracks.forEach(track => applyObjectTrack(track, t, opts));
    props.lensTracks.forEach(track => applyLensTrack(track, t));
    return activeShot(props, t);
  }
  function dispatchTimelineEvent(studio, event, state){
    if(!studio || !event || !event.name) return;
    const detail = {
      studioId:studio.userData.editorId,
      studioName:studio.userData.editorName || studio.userData.editorId,
      eventId:event.id,
      eventName:event.name,
      time:Number(event.time) || 0,
      payload:event.payload || '',
      runtime:!!(state && state.runtime),
      source:state && state.source || 'timeline',
    };
    window.dispatchEvent(new CustomEvent('lotking:timelineevent', {detail}));
  }
  function dispatchTimelineEventsBetween(studio, props, fromTime, toTime, state, includeStart){
    const from = Math.max(0, Math.min(props.duration, Number(fromTime) || 0));
    const to = Math.max(0, Math.min(props.duration, Number(toTime) || 0));
    const eps = .0001;
    props.eventTracks
      .slice()
      .sort((a,b) => (a.time || 0) - (b.time || 0))
      .forEach(event => {
        const t = Number(event.time) || 0;
        const afterStart = includeStart ? t >= from - eps : t > from + eps;
        if(afterStart && t <= to + eps) dispatchTimelineEvent(studio, event, state);
      });
  }
  function updatePreview(dt){
    const state = ED.cinemaPreview;
    if(!state) return;
    const studio = GAME.world.registry.find(o => o && o.userData && o.userData.editorId === state.id && o.userData.editorType === 'cinemaStudio');
    if(!studio){ ED.cinemaPreview = null; return; }
    const props = propsFor(studio);
    const beforeTime = Math.max(0, Math.min(props.duration, Number(state.time) || 0));
    const wasPlaying = !!state.playing;
    if(state.playing){
      state.time += Math.max(0, dt || 0);
      const duration = Math.max(.1, props.duration || 6);
      if(state.time > duration){
        if(props.playback === 'loop') state.time %= duration;
        else { state.time = duration; state.playing = false; }
      }
    }
    const forceEditableTarget = !!ED.cinemaForceEditableTargetFrame;
    ED.cinemaForceEditableTargetFrame = false;
    const cut = applyAtTime(studio, state.time, {skipEditableTarget:!state.playing, forceEditableTarget});
    if(wasPlaying && (dt || 0) > 0){
      if(props.playback === 'loop' && state.time < beforeTime){
        dispatchTimelineEventsBetween(studio, props, beforeTime, props.duration, state, false);
        dispatchTimelineEventsBetween(studio, props, 0, state.time, state, true);
      } else {
        dispatchTimelineEventsBetween(studio, props, beforeTime, state.time, state, false);
      }
      state.lastEventTime = state.time;
    }
    if(cut && cut.cameraId && !state.runtime && ED.viewportSlots[1] !== 'timeline:' + studio.userData.editorId){
      ED.viewportMode = 'quad';
      ED.viewportSlots[1] = 'timeline:' + studio.userData.editorId;
    }
    return cut;
  }
  function hideTimeline(){
    if(cinemaTimeline) cinemaTimeline.classList.remove('on');
    ED.cinemaTimelineFocused = false;
  }

  return Object.freeze({
    activeStudio,
    applyAtTime,
    hideTimeline,
    playStudio,
    propsFor,
    stopStudio,
    syncTimeline,
    triggerRuntimeEvent,
    updatePreview,
  });
}

window.LK_EDITOR_CINEMA_STUDIO = Object.freeze({create});
})();
