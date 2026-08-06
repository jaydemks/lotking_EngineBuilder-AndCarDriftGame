/* =========================================================
   LOT KING - CINEMA VIDEO EXPORT
   Deterministic fixed-step rendering, WebCodecs encoding and WebM muxing.
   ========================================================= */
(function(global){
'use strict';

const WEBM_IDS = Object.freeze({
  EBML:0x1a45dfa3,
  EBML_VERSION:0x4286,
  EBML_READ_VERSION:0x42f7,
  EBML_MAX_ID_LENGTH:0x42f2,
  EBML_MAX_SIZE_LENGTH:0x42f3,
  DOC_TYPE:0x4282,
  DOC_TYPE_VERSION:0x4287,
  DOC_TYPE_READ_VERSION:0x4285,
  SEGMENT:0x18538067,
  INFO:0x1549a966,
  TIMECODE_SCALE:0x2ad7b1,
  DURATION:0x4489,
  MUXING_APP:0x4d80,
  WRITING_APP:0x5741,
  TRACKS:0x1654ae6b,
  TRACK_ENTRY:0xae,
  TRACK_NUMBER:0xd7,
  TRACK_UID:0x73c5,
  TRACK_TYPE:0x83,
  FLAG_LACING:0x9c,
  CODEC_ID:0x86,
  DEFAULT_DURATION:0x23e383,
  VIDEO:0xe0,
  PIXEL_WIDTH:0xb0,
  PIXEL_HEIGHT:0xba,
  DISPLAY_WIDTH:0x54b0,
  DISPLAY_HEIGHT:0x54ba,
  CLUSTER:0x1f43b675,
  TIMECODE:0xe7,
  SIMPLE_BLOCK:0xa3,
});

function bytes(){
  const parts = Array.prototype.slice.call(arguments).filter(Boolean);
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  parts.forEach(part => {
    const view = part instanceof Uint8Array ? part : new Uint8Array(part);
    out.set(view, offset);
    offset += view.byteLength;
  });
  return out;
}

function idBytes(value){
  let next = Math.max(0, Math.floor(Number(value) || 0));
  const out = [];
  do {
    out.unshift(next % 256);
    next = Math.floor(next / 256);
  } while(next > 0);
  return new Uint8Array(out);
}

function vint(value, forcedWidth){
  const next = Math.max(0, Math.floor(Number(value) || 0));
  let width = Math.max(1, Math.min(8, Number(forcedWidth) || 1));
  while(!forcedWidth && width < 8 && next >= Math.pow(2, width * 7) - 1) width += 1;
  if(next >= Math.pow(2, width * 7) - 1) throw new Error('WebM element is too large');
  const out = new Uint8Array(width);
  let remainder = next;
  for(let index = width - 1; index >= 0; index -= 1){
    out[index] = remainder % 256;
    remainder = Math.floor(remainder / 256);
  }
  out[0] |= 1 << (8 - width);
  return out;
}

function uintBytes(value, forcedWidth){
  let next = Math.max(0, Math.floor(Number(value) || 0));
  let width = Math.max(1, Number(forcedWidth) || 1);
  if(!forcedWidth){
    while(width < 8 && next >= Math.pow(2, width * 8)) width += 1;
  }
  const out = new Uint8Array(width);
  for(let index = width - 1; index >= 0; index -= 1){
    out[index] = next % 256;
    next = Math.floor(next / 256);
  }
  return out;
}

function float64Bytes(value){
  const out = new Uint8Array(8);
  new DataView(out.buffer).setFloat64(0, Number(value) || 0, false);
  return out;
}

function textBytes(value){
  if(typeof TextEncoder !== 'undefined') return new TextEncoder().encode(String(value == null ? '' : value));
  return new Uint8Array(Array.from(String(value == null ? '' : value)).map(char => char.charCodeAt(0) & 255));
}

function element(id, data){
  const payload = data instanceof Uint8Array ? data : new Uint8Array(data || 0);
  return bytes(idBytes(id), vint(payload.byteLength), payload);
}

function uintElement(id, value, width){
  return element(id, uintBytes(value, width));
}

function textElement(id, value){
  return element(id, textBytes(value));
}

function masterElement(id){
  return element(id, bytes.apply(null, Array.prototype.slice.call(arguments, 1)));
}

function simpleBlock(chunk, clusterTimeMs){
  const timestampMs = Math.round((Number(chunk.timestamp) || 0) / 1000);
  const relative = Math.max(-32768, Math.min(32767, timestampMs - clusterTimeMs));
  const header = new Uint8Array(4);
  header[0] = 0x81;
  new DataView(header.buffer).setInt16(1, relative, false);
  header[3] = chunk.type === 'key' ? 0x80 : 0;
  return element(WEBM_IDS.SIMPLE_BLOCK, bytes(header, chunk.data));
}

function makeCluster(clusterTimeMs, chunks){
  const blocks = chunks.map(chunk => simpleBlock(chunk, clusterTimeMs));
  return masterElement.apply(null, [WEBM_IDS.CLUSTER, uintElement(WEBM_IDS.TIMECODE, clusterTimeMs)].concat(blocks));
}

function muxWebM(options){
  options = options || {};
  const width = Math.max(2, Math.round(Number(options.width) || 2));
  const height = Math.max(2, Math.round(Number(options.height) || 2));
  const fps = Math.max(1, Number(options.fps) || 24);
  const frameDurationUs = 1000000 / fps;
  const chunks = (options.chunks || []).slice().sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));
  if(!chunks.length) throw new Error('No encoded video frames');
  const durationUs = Number(options.durationUs) || Math.round(chunks.length * frameDurationUs);
  const codecId = options.codecId === 'V_VP8' ? 'V_VP8' : 'V_VP9';
  const ebml = masterElement(
    WEBM_IDS.EBML,
    uintElement(WEBM_IDS.EBML_VERSION, 1),
    uintElement(WEBM_IDS.EBML_READ_VERSION, 1),
    uintElement(WEBM_IDS.EBML_MAX_ID_LENGTH, 4),
    uintElement(WEBM_IDS.EBML_MAX_SIZE_LENGTH, 8),
    textElement(WEBM_IDS.DOC_TYPE, 'webm'),
    uintElement(WEBM_IDS.DOC_TYPE_VERSION, 4),
    uintElement(WEBM_IDS.DOC_TYPE_READ_VERSION, 2)
  );
  const info = masterElement(
    WEBM_IDS.INFO,
    uintElement(WEBM_IDS.TIMECODE_SCALE, 1000000),
    element(WEBM_IDS.DURATION, float64Bytes(durationUs / 1000)),
    textElement(WEBM_IDS.MUXING_APP, 'Lot King Cinema Studio'),
    textElement(WEBM_IDS.WRITING_APP, 'Lot King Engine 0.7.8')
  );
  const video = masterElement(
    WEBM_IDS.VIDEO,
    uintElement(WEBM_IDS.PIXEL_WIDTH, width),
    uintElement(WEBM_IDS.PIXEL_HEIGHT, height),
    uintElement(WEBM_IDS.DISPLAY_WIDTH, width),
    uintElement(WEBM_IDS.DISPLAY_HEIGHT, height)
  );
  const tracks = masterElement(
    WEBM_IDS.TRACKS,
    masterElement(
      WEBM_IDS.TRACK_ENTRY,
      uintElement(WEBM_IDS.TRACK_NUMBER, 1),
      uintElement(WEBM_IDS.TRACK_UID, 1),
      uintElement(WEBM_IDS.TRACK_TYPE, 1),
      uintElement(WEBM_IDS.FLAG_LACING, 0),
      textElement(WEBM_IDS.CODEC_ID, codecId),
      uintElement(WEBM_IDS.DEFAULT_DURATION, Math.round(1000000000 / fps)),
      video
    )
  );
  const clusters = [];
  let clusterStart = null;
  let clusterChunks = [];
  chunks.forEach(chunk => {
    const timestampMs = Math.round((Number(chunk.timestamp) || 0) / 1000);
    if(clusterStart == null) clusterStart = timestampMs;
    if(timestampMs - clusterStart > 10000 && clusterChunks.length){
      clusters.push(makeCluster(clusterStart, clusterChunks));
      clusterStart = timestampMs;
      clusterChunks = [];
    }
    clusterChunks.push(chunk);
  });
  if(clusterChunks.length) clusters.push(makeCluster(clusterStart || 0, clusterChunks));
  // Unknown Segment length lets us keep clusters as separate Blob parts and
  // avoids a second full-size allocation for long or high-bitrate exports.
  const unknownSegmentSize = new Uint8Array([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  return new Blob([ebml, idBytes(WEBM_IDS.SEGMENT), unknownSegmentSize, info, tracks].concat(clusters), {type:'video/webm'});
}

function abortError(){
  try { return new DOMException('Cinema export cancelled', 'AbortError'); }
  catch(err){
    const fallback = new Error('Cinema export cancelled');
    fallback.name = 'AbortError';
    return fallback;
  }
}

function yieldToUi(){
  return new Promise(resolve => {
    if(typeof requestAnimationFrame === 'function'){
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else setTimeout(resolve, 0);
  });
}

async function supportedEncoderConfig(options){
  if(typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined'){
    throw new Error('WebCodecs is not available in this browser');
  }
  const base = {
    width:options.width,
    height:options.height,
    bitrate:options.bitrate,
    framerate:options.fps,
    latencyMode:'quality',
  };
  const candidates = [
    {codec:'vp09.00.10.08', codecId:'V_VP9'},
    {codec:'vp8', codecId:'V_VP8'},
  ];
  for(const candidate of candidates){
    const variants = [
      Object.assign({}, base, {codec:candidate.codec}),
      Object.assign({}, base, {codec:candidate.codec, latencyMode:'realtime'}),
    ];
    for(const config of variants){
      try {
        const result = VideoEncoder.isConfigSupported ? await VideoEncoder.isConfigSupported(config) : {supported:true, config};
        if(result && result.supported) return {config:Object.assign({}, config, result.config || {}), codecId:candidate.codecId};
      } catch(err){}
    }
  }
  throw new Error('This browser/GPU cannot encode VP9 or VP8 at the selected resolution');
}

async function encodeDeterministicWebM(options){
  options = options || {};
  const width = Math.max(2, Math.round(Number(options.width) || 1920));
  const height = Math.max(2, Math.round(Number(options.height) || 1080));
  const fps = Math.max(1, Math.min(120, Number(options.fps) || 24));
  const duration = Math.max(1 / fps, Number(options.duration) || 1);
  const frameCount = Math.max(1, Math.ceil(duration * fps - 0.000001));
  const bitrate = Math.max(1000000, Math.round(Number(options.bitrate) || width * height * fps * .16));
  const signal = options.signal;
  const selected = await supportedEncoderConfig({width, height, fps, bitrate});
  const chunks = [];
  let encoderError = null;
  const encoder = new VideoEncoder({
    output:chunk => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push({
        type:chunk.type,
        timestamp:Number(chunk.timestamp) || 0,
        duration:Number(chunk.duration) || 0,
        data,
      });
    },
    error:error => { encoderError = error; },
  });
  encoder.configure(selected.config);
  try {
    for(let index = 0; index < frameCount; index += 1){
      if(signal && signal.aborted) throw abortError();
      if(encoderError) throw encoderError;
      const timestamp = Math.round(index * 1000000 / fps);
      const nextTimestamp = Math.round((index + 1) * 1000000 / fps);
      const source = await options.renderFrame({
        index,
        frameCount,
        time:index / fps,
        timestamp,
        duration:nextTimestamp - timestamp,
      });
      if(signal && signal.aborted) throw abortError();
      const frame = new VideoFrame(source, {timestamp, duration:nextTimestamp - timestamp});
      try {
        encoder.encode(frame, {keyFrame:index === 0 || index % Math.max(1, Math.round(fps * 2)) === 0});
      } finally {
        frame.close();
      }
      if(encoder.encodeQueueSize > 8) await encoder.flush();
      if(typeof options.onProgress === 'function'){
        options.onProgress({index:index + 1, frameCount, time:(index + 1) / fps, duration});
      }
      await yieldToUi();
    }
    await encoder.flush();
    if(encoderError) throw encoderError;
  } finally {
    try { encoder.close(); } catch(err){}
  }
  if(chunks.length !== frameCount){
    throw new Error('Encoder returned ' + chunks.length + ' frames instead of ' + frameCount);
  }
  const durationUs = Math.round(frameCount * 1000000 / fps);
  return {
    blob:muxWebM({width, height, fps, chunks, durationUs, codecId:selected.codecId}),
    codec:selected.codecId,
    frameCount,
    duration:durationUs / 1000000,
    bitrate,
  };
}

function safeFileName(value){
  const cleaned = String(value || 'cinema').trim().replace(/[<>:\"/\\|?*\u0000-\u001f]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return (cleaned || 'cinema') + '.webm';
}

function formatBytes(value){
  const bytesValue = Math.max(0, Number(value) || 0);
  if(bytesValue >= 1024 * 1024 * 1024) return (bytesValue / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  if(bytesValue >= 1024 * 1024) return (bytesValue / (1024 * 1024)).toFixed(1) + ' MB';
  return Math.round(bytesValue / 1024) + ' KB';
}

function create(deps){
  deps = deps || {};
  const THREE = deps.THREE;
  const GAME = deps.GAME;
  const ED = deps.ED;
  const root = deps.root;
  const renderer = deps.renderer;
  const scene = deps.scene;
  const overlay = root && root.querySelector('#lkCinemaExportOverlay');
  const form = root && root.querySelector('#lkCinemaExportForm');
  const startButton = root && root.querySelector('#lkCinemaExportStart');
  const cancelButton = root && root.querySelector('#lkCinemaExportCancel');
  const closeButton = root && root.querySelector('#lkCinemaExportClose');
  const resolutionSelect = root && root.querySelector('#lkCinemaExportResolution');
  const fpsInput = root && root.querySelector('#lkCinemaExportFps');
  const qualitySelect = root && root.querySelector('#lkCinemaExportQuality');
  const postInput = root && root.querySelector('#lkCinemaExportPost');
  const fileInput = root && root.querySelector('#lkCinemaExportFile');
  const summary = root && root.querySelector('#lkCinemaExportSummary');
  const progress = root && root.querySelector('#lkCinemaExportProgress');
  const progressBar = root && root.querySelector('#lkCinemaExportProgressBar');
  const note = root && root.querySelector('#lkCinemaExportNote');
  let studio = null;
  let abortController = null;
  let running = false;

  const tr = (en, it) => GAME && GAME.i18n && GAME.i18n.lang === 'it' ? (it || en) : en;
  const getCinemaStudio = () => typeof deps.cinemaStudio === 'function' ? deps.cinemaStudio() : deps.cinemaStudio;

  function outputSpec(){
    const pair = String(resolutionSelect && resolutionSelect.value || '1920x1080').split('x');
    let width = Math.max(2, Math.min(3840, Math.round(Number(pair[0]) || 1920)));
    let height = Math.max(2, Math.min(2160, Math.round(Number(pair[1]) || 1080)));
    if(width % 2) width -= 1;
    if(height % 2) height -= 1;
    const props = studio && getCinemaStudio() && getCinemaStudio().propsFor(studio) || {fps:24, duration:1};
    const fps = Math.max(1, Math.min(120, Math.round(Number(fpsInput && fpsInput.value) || props.fps || 24)));
    const duration = Math.max(1 / fps, Number(props.duration) || 1);
    const quality = qualitySelect && qualitySelect.value === 'master' ? 'master' : 'high';
    const bpp = quality === 'master' ? .32 : .16;
    const bitrate = Math.max(2000000, Math.min(80000000, Math.round(width * height * fps * bpp)));
    const frameCount = Math.max(1, Math.ceil(duration * fps - .000001));
    return {width, height, fps, duration, quality, bitrate, frameCount, post:!postInput || postInput.checked};
  }

  function syncSummary(){
    if(!summary || !studio) return;
    const spec = outputSpec();
    const estimate = spec.bitrate * (spec.frameCount / spec.fps) / 8;
    summary.textContent = spec.width + '×' + spec.height + ' · ' + spec.fps + ' FPS · ' +
      spec.frameCount + ' ' + tr('frames', 'frame') + ' · ' + spec.duration.toFixed(2) + ' s · ~' + formatBytes(estimate);
  }

  function setRunning(next){
    running = !!next;
    if(form) Array.from(form.elements || []).forEach(control => {
      if(control !== cancelButton) control.disabled = running;
    });
    if(cancelButton){
      cancelButton.disabled = false;
      cancelButton.textContent = running ? tr('Cancel export', 'Annulla export') : tr('Close', 'Chiudi');
    }
    if(closeButton) closeButton.disabled = running;
    if(overlay) overlay.classList.toggle('rendering', running);
  }

  function setProgress(text, ratio){
    if(progress) progress.textContent = text || '';
    if(progressBar) progressBar.style.width = Math.max(0, Math.min(100, (Number(ratio) || 0) * 100)).toFixed(2) + '%';
  }

  function open(nextStudio){
    if(!overlay || !nextStudio || running) return false;
    studio = nextStudio;
    const cinema = getCinemaStudio();
    const props = cinema && cinema.propsFor(studio) || {fps:24};
    if(fpsInput) fpsInput.value = Math.max(1, Math.round(Number(props.fps) || 24));
    if(fileInput) fileInput.value = String(studio.userData && studio.userData.editorName || 'cinema');
    if(note){
      const pathTracingSelected = GAME && GAME.settings && GAME.settings.video && GAME.settings.video.rendererMode === 'pathtracing';
      note.textContent = typeof VideoEncoder === 'undefined'
        ? tr('WebCodecs is unavailable: use a current Chromium-based browser for deterministic video export.', 'WebCodecs non è disponibile: usa un browser Chromium aggiornato per l’export video deterministico.')
        : tr(
          'Exact fixed-step video. Every frame is rendered before encoding; export can run slower than playback. Video only, no audio.' +
            (pathTracingSelected ? ' Experimental Path Tracing export is not enabled yet; this render uses the stable final raster/post compositor.' : ''),
          'Video a passo fisso esatto. Ogni frame viene renderizzato prima della codifica; l’export può essere più lento del playback. Solo video, senza audio.' +
            (pathTracingSelected ? ' L’export del Path Tracing sperimentale non è ancora attivo; questo render usa il compositore raster/post finale stabile.' : '')
        );
      note.classList.toggle('error', typeof VideoEncoder === 'undefined');
    }
    if(startButton) startButton.disabled = typeof VideoEncoder === 'undefined';
    setProgress(tr('Ready to render', 'Pronto per il rendering'), 0);
    syncSummary();
    overlay.classList.add('on');
    overlay.setAttribute('aria-hidden', 'false');
    return true;
  }

  function close(){
    if(running){
      if(abortController) abortController.abort();
      return;
    }
    if(overlay){
      overlay.classList.remove('on', 'rendering');
      overlay.setAttribute('aria-hidden', 'true');
    }
    studio = null;
  }

  function sceneObjectById(id){
    return GAME && GAME.world && GAME.world.registry && GAME.world.registry.find(object => object && object.userData && object.userData.editorId === id) || null;
  }

  function cameraHolderById(id){
    if(deps.sceneCameraHolderById) return deps.sceneCameraHolderById(id);
    return sceneObjectById(id);
  }

  function snapshotTimelineTargets(props){
    const objects = new Map();
    const cameras = new Map();
    (props.objectTracks || []).forEach(track => {
      const object = sceneObjectById(track.targetId);
      if(object && !objects.has(object)){
        objects.set(object, {
          position:object.position.clone(),
          quaternion:object.quaternion.clone(),
          scale:object.scale.clone(),
        });
      }
    });
    (props.lensTracks || []).forEach(track => {
      const holder = cameraHolderById(track.targetId);
      const camera = holder && deps.normalizeSceneCamera(holder);
      if(camera && !cameras.has(camera)){
        cameras.set(camera, {fov:camera.fov, aspect:camera.aspect, near:camera.near, far:camera.far});
      }
    });
    (props.cameraCuts || props.movieTrack || []).forEach(shot => {
      const holder = cameraHolderById(shot.cameraId);
      const camera = holder && deps.normalizeSceneCamera(holder);
      if(camera && !cameras.has(camera)){
        cameras.set(camera, {fov:camera.fov, aspect:camera.aspect, near:camera.near, far:camera.far});
      }
    });
    return {objects, cameras};
  }

  function restoreTimelineTargets(snapshot){
    if(!snapshot) return;
    snapshot.objects.forEach((state, object) => {
      object.position.copy(state.position);
      object.quaternion.copy(state.quaternion);
      object.scale.copy(state.scale);
      object.updateMatrixWorld(true);
    });
    snapshot.cameras.forEach((state, camera) => {
      camera.fov = state.fov;
      camera.aspect = state.aspect;
      camera.near = state.near;
      camera.far = state.far;
      camera.updateProjectionMatrix();
    });
  }

  function rendererSnapshot(){
    const size = renderer.getSize(new THREE.Vector2());
    const viewport = renderer.getViewport(new THREE.Vector4());
    const scissor = renderer.getScissor(new THREE.Vector4());
    return {
      pixelRatio:renderer.getPixelRatio(),
      width:size.x,
      height:size.y,
      viewport,
      scissor,
      scissorTest:renderer.getScissorTest(),
      target:renderer.getRenderTarget(),
    };
  }

  function restoreRenderer(state){
    renderer.setRenderTarget(state.target || null);
    renderer.setPixelRatio(state.pixelRatio);
    renderer.setSize(state.width, state.height, false);
    renderer.setViewport(state.viewport);
    renderer.setScissor(state.scissor);
    renderer.setScissorTest(state.scissorTest);
    const post = GAME && GAME.systems && GAME.systems.post;
    if(post && post.ok && post.composer) post.composer.setSize(state.width, state.height);
  }

  function cameraForTime(cinema, nextStudio, time, aspect){
    const shot = cinema.applyAtTime(nextStudio, time, {forceEditableTarget:true});
    const holder = shot && shot.cameraId ? cameraHolderById(shot.cameraId) : null;
    const camera = holder && deps.normalizeSceneCamera(holder);
    if(!camera) throw new Error(tr('No valid Scene Camera at ' + time.toFixed(3) + ' s', 'Nessuna Scene Camera valida a ' + time.toFixed(3) + ' s'));
    if(holder && holder.updateMatrixWorld) holder.updateMatrixWorld(true);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    return camera;
  }

  async function warmup(cinema, nextStudio, spec, signal){
    const props = cinema.propsFor(nextStudio);
    const times = [0];
    (props.cameraCuts || props.movieTrack || []).forEach(shot => {
      const time = Math.max(0, Math.min(spec.duration - 1 / spec.fps, Number(shot.time) || 0));
      if(!times.some(value => Math.abs(value - time) < .0001)) times.push(time);
    });
    for(let index = 0; index < times.length; index += 1){
      if(signal.aborted) throw abortError();
      const camera = cameraForTime(cinema, nextStudio, times[index], spec.width / spec.height);
      const hidden = deps.beginFinalRender ? deps.beginFinalRender(true) : [];
      try {
        if(renderer.compileAsync) await renderer.compileAsync(scene, camera);
        renderer.setRenderTarget(null);
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, spec.width, spec.height);
        const post = GAME && GAME.systems && GAME.systems.post;
        if(spec.post && post && post.ok){
          post.render(camera, {width:spec.width, height:spec.height, interactive:false});
        } else renderer.render(scene, camera);
        await waitForGpu(signal);
      } finally {
        if(deps.endFinalRender) deps.endFinalRender(hidden);
      }
      setProgress(tr('Preparing cameras and shaders', 'Preparazione camere e shader') + ' · ' + (index + 1) + '/' + times.length, 0);
      await yieldToUi();
    }
  }

  async function waitForGpu(signal){
    const context = renderer.getContext && renderer.getContext();
    if(!context) return;
    if(context.fenceSync && context.clientWaitSync && context.deleteSync){
      const sync = context.fenceSync(context.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if(sync){
        context.flush();
        try {
          for(;;){
            if(signal && signal.aborted) throw abortError();
            const state = context.clientWaitSync(sync, 0, 0);
            if(state === context.ALREADY_SIGNALED || state === context.CONDITION_SATISFIED) return;
            if(state === context.WAIT_FAILED) break;
            await yieldToUi();
          }
        } finally {
          context.deleteSync(sync);
        }
      }
    }
    // WebGL1 fallback. Modern Lot King renderers use WebGL2 and stay on the
    // asynchronous fence path above.
    if(context.finish) context.finish();
  }

  async function renderFrame(cinema, nextStudio, spec, frame, signal){
    const camera = cameraForTime(cinema, nextStudio, frame.time, spec.width / spec.height);
    const hidden = deps.beginFinalRender ? deps.beginFinalRender(true) : [];
    try {
      renderer.setRenderTarget(null);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, spec.width, spec.height);
      renderer.setScissor(0, 0, spec.width, spec.height);
      const post = GAME && GAME.systems && GAME.systems.post;
      if(spec.post && post && post.ok){
        post.render(camera, {width:spec.width, height:spec.height, interactive:false});
      } else renderer.render(scene, camera);
      // Wait for this exact submission without moving to the next timeline
      // frame. WebGL2 fences yield to the export UI while the GPU works.
      await waitForGpu(signal);
      return renderer.domElement;
    } finally {
      if(deps.endFinalRender) deps.endFinalRender(hidden);
    }
  }

  function download(blob, name){
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = safeFileName(name);
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function start(){
    if(running || !studio) return;
    const nextStudio = studio;
    const cinema = getCinemaStudio();
    if(!cinema) return;
    const spec = outputSpec();
    const props = cinema.propsFor(nextStudio);
    if(!(props.cameraCuts || props.movieTrack || []).length){
      setProgress(tr('Add at least one camera shot before exporting.', 'Aggiungi almeno uno shot camera prima dell’export.'), 0);
      return;
    }
    abortController = new AbortController();
    const rendererState = rendererSnapshot();
    const targetState = snapshotTimelineTargets(props);
    const previewState = ED.cinemaPreview ? Object.assign({}, ED.cinemaPreview) : null;
    const startedAt = performance.now();
    setRunning(true);
    ED.cinemaExporting = true;
    ED.cinemaPreview = {id:nextStudio.userData.editorId, time:0, playing:false, source:'offline-export'};
    try {
      renderer.setRenderTarget(null);
      renderer.setPixelRatio(1);
      renderer.setSize(spec.width, spec.height, false);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, spec.width, spec.height);
      setProgress(tr('Preparing deterministic renderer...', 'Preparazione renderer deterministico...'), 0);
      await yieldToUi();
      if(GAME && GAME.assets && GAME.assets.ensureReady) await GAME.assets.ensureReady('editor');
      await warmup(cinema, nextStudio, spec, abortController.signal);
      const result = await encodeDeterministicWebM({
        width:spec.width,
        height:spec.height,
        fps:spec.fps,
        duration:spec.duration,
        bitrate:spec.bitrate,
        signal:abortController.signal,
        renderFrame:frame => renderFrame(cinema, nextStudio, spec, frame, abortController.signal),
        onProgress:state => {
          const ratio = state.index / state.frameCount;
          const elapsed = (performance.now() - startedAt) / 1000;
          const eta = ratio > .01 ? Math.max(0, elapsed / ratio - elapsed) : 0;
          ED.cinemaPreview.time = Math.min(spec.duration, state.time);
          setProgress(
            tr('Rendering frame', 'Rendering frame') + ' ' + state.index + '/' + state.frameCount +
            ' · ' + Math.min(spec.duration, state.time).toFixed(2) + ' s' +
            (ratio > .01 ? ' · ETA ' + Math.ceil(eta) + ' s' : ''),
            ratio
          );
        },
      });
      if(abortController.signal.aborted) throw abortError();
      download(result.blob, fileInput && fileInput.value || nextStudio.userData.editorName);
      const elapsed = (performance.now() - startedAt) / 1000;
      setProgress(
        tr('Completed', 'Completato') + ' · ' + result.frameCount + ' ' +
        (result.frameCount === 1 ? tr('frame', 'frame') : tr('frames', 'frame')) +
        ' · ' + formatBytes(result.blob.size) + ' · ' + elapsed.toFixed(1) + ' s',
        1
      );
      if(deps.status) deps.status(tr('Cinema video exported frame by frame', 'Video Cinema esportato frame per frame'));
    } catch(error){
      if(error && error.name === 'AbortError'){
        setProgress(tr('Export cancelled. No partial video was saved.', 'Export annullato. Nessun video parziale è stato salvato.'), 0);
      } else {
        console.error('Lot King Cinema export failed', error);
        setProgress(tr('Export failed: ', 'Export fallito: ') + (error && error.message || error), 0);
      }
    } finally {
      restoreTimelineTargets(targetState);
      restoreRenderer(rendererState);
      ED.cinemaPreview = previewState;
      ED.cinemaExporting = false;
      abortController = null;
      setRunning(false);
      syncSummary();
    }
  }

  [resolutionSelect, fpsInput, qualitySelect, postInput].forEach(control => {
    if(control){
      control.addEventListener('input', syncSummary);
      control.addEventListener('change', syncSummary);
    }
  });
  if(startButton) startButton.addEventListener('click', start);
  if(cancelButton) cancelButton.addEventListener('click', close);
  if(closeButton) closeButton.addEventListener('click', close);
  if(overlay) overlay.addEventListener('pointerdown', event => {
    if(event.target === overlay && !running) close();
  });
  document.addEventListener('keydown', event => {
    if(event.key === 'Escape' && overlay && overlay.classList.contains('on')){
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    }
  }, true);

  return Object.freeze({open, close, isExporting:() => running});
}

const api = Object.freeze({
  create,
  encodeDeterministicWebM,
  muxWebM,
  _internals:Object.freeze({bytes, element, idBytes, vint, uintBytes, simpleBlock, safeFileName}),
});

if(global) global.LK_EDITOR_CINEMA_VIDEO_EXPORT = api;
if(typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
