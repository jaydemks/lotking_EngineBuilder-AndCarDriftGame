/* =========================================================
   LOT KING - compact UV visualizer and procedural mapping inspector
   ========================================================= */
(function(){
'use strict';

function create(options){
  const opts = options || {};
  const tr = (en, it) => window.LOT_KING && LOT_KING.i18n && LOT_KING.i18n.lang === 'it' ? (it || en) : en;
  function mappingOf(edits, id){
    const stored = edits && edits.uvMappings && edits.uvMappings[id];
    return Object.assign({mode:'imported', offset:[0,0], scale:[1,1], rotation:0, padding:.018}, stored || {});
  }
  function drawPreview(canvas, mesh){
    const context = canvas.getContext && canvas.getContext('2d');
    const geometry = mesh && mesh.geometry;
    const uv = geometry && geometry.attributes && geometry.attributes.uv;
    if(!context) return;
    const width = canvas.width, height = canvas.height, tile = 16;
    context.clearRect(0, 0, width, height);
    for(let y = 0; y < height; y += tile) for(let x = 0; x < width; x += tile){
      context.fillStyle = ((x / tile + y / tile) & 1) ? '#172333' : '#0d1622';
      context.fillRect(x, y, tile, tile);
    }
    context.strokeStyle = 'rgba(89,213,255,.14)';
    context.lineWidth = 1;
    for(let i = 0; i <= 4; i++){
      const at = i * width / 4;
      context.beginPath(); context.moveTo(at, 0); context.lineTo(at, height); context.stroke();
      context.beginPath(); context.moveTo(0, at); context.lineTo(width, at); context.stroke();
    }
    if(!uv){
      context.fillStyle = '#93a5b9'; context.font = '12px system-ui'; context.textAlign = 'center';
      context.fillText(tr('No UV channel', 'Nessun canale UV'), width / 2, height / 2);
      return;
    }
    const index = geometry.index;
    const triangleCount = Math.floor((index ? index.count : uv.count) / 3);
    const stride = Math.max(1, Math.ceil(triangleCount / 7000));
    context.strokeStyle = 'rgba(106,226,255,.72)';
    context.lineWidth = .72;
    const vertex = offset => index ? index.getX(offset) : offset;
    for(let triangle = 0; triangle < triangleCount; triangle += stride){
      const start = triangle * 3;
      context.beginPath();
      for(let corner = 0; corner < 3; corner++){
        const id = vertex(start + corner);
        const x = uv.getX(id) * width, y = (1 - uv.getY(id)) * height;
        if(corner) context.lineTo(x, y); else context.moveTo(x, y);
      }
      context.closePath(); context.stroke();
    }
    context.strokeStyle = 'rgba(219,245,255,.72)';
    context.lineWidth = 2; context.strokeRect(1, 1, width - 2, height - 2);
  }
  function numberControl(label, value, min, max, step, onCommit){
    const row = document.createElement('label'); row.className = 'lk-uv-control';
    const name = document.createElement('span'); name.textContent = label;
    const input = document.createElement('input');
    input.type = 'number'; input.min = min; input.max = max; input.step = step; input.value = value;
    input.addEventListener('change', () => {
      const next = Math.max(Number(min), Math.min(Number(max), Number(input.value)));
      if(Number.isFinite(next)) onCommit(next);
    });
    row.append(name, input); return row;
  }
  function build(host, object, selected, edits, edit){
    if(!host || !selected || !selected.length) return;
    const valid = selected.filter(item => item.mesh && item.mesh.geometry && item.mesh.geometry.attributes && item.mesh.geometry.attributes.position);
    if(!valid.length) return;
    const primary = valid[0], current = mappingOf(edits, primary.id);
    const root = document.createElement('div'); root.className = 'lk-uv-editor';
    root.innerHTML = '<div class="lk-uv-title"><span>UV LAB</span><strong>' +
      tr('Visual mapping', 'Mapping visuale') + '</strong><small>' + valid.length + ' ' +
      tr('mesh selected', 'mesh selezionate') + '</small></div>';
    const canvas = document.createElement('canvas');
    canvas.className = 'lk-uv-preview'; canvas.width = 320; canvas.height = 320;
    drawPreview(canvas, primary.mesh); root.appendChild(canvas);
    const modeGrid = document.createElement('div'); modeGrid.className = 'lk-uv-modes';
    [
      ['smart', tr('Smart Atlas', 'Atlante Smart')], ['cube', 'Cube'],
      ['spherical', 'Sphere'], ['cylindrical', 'Cylinder'],
      ['planar-y', 'Planar Top'], ['planar-z', 'Planar Front'], ['planar-x', 'Planar Side'],
    ].forEach(pair => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = pair[1];
      button.classList.toggle('active', current.mode === pair[0]);
      button.addEventListener('click', () => {
        const unsafe = (pair[0] === 'smart' || pair[0] === 'cube') && valid.some(item => item.skinned || item.morph);
        if(unsafe){
          if(opts.status) opts.status(tr(
            'Smart/Cube atlas is disabled for skinned or morph meshes; use Planar, Sphere or Cylinder.',
            'L’atlante Smart/Cube è disattivato per mesh skinned o morph; usa Planar, Sphere o Cylinder.'
          ));
          return;
        }
        edit(object, 'Apply ' + pair[1] + ' UV mapping', next => {
          next.uvMappings = next.uvMappings || {};
          valid.forEach(item => { next.uvMappings[item.id] = Object.assign({}, mappingOf(next, item.id), {mode:pair[0]}); });
        });
      });
      modeGrid.appendChild(button);
    });
    root.appendChild(modeGrid);
    const controls = document.createElement('div'); controls.className = 'lk-uv-controls';
    const patch = values => edit(object, 'Transform UV mapping', next => {
      next.uvMappings = next.uvMappings || {};
      valid.forEach(item => {
        const mapping = mappingOf(next, item.id);
        if(mapping.mode === 'imported') mapping.mode = 'smart';
        next.uvMappings[item.id] = Object.assign({}, mapping, values(mapping));
      });
    });
    controls.appendChild(numberControl('Offset U', current.offset[0], -4, 4, .01, value => patch(mapping => ({offset:[value, mapping.offset[1]]}))));
    controls.appendChild(numberControl('Offset V', current.offset[1], -4, 4, .01, value => patch(mapping => ({offset:[mapping.offset[0], value]}))));
    controls.appendChild(numberControl('Scale U', current.scale[0], .01, 20, .01, value => patch(mapping => ({scale:[value, mapping.scale[1]]}))));
    controls.appendChild(numberControl('Scale V', current.scale[1], .01, 20, .01, value => patch(mapping => ({scale:[mapping.scale[0], value]}))));
    controls.appendChild(numberControl('Rotation', current.rotation, -360, 360, 1, value => patch(() => ({rotation:value}))));
    controls.appendChild(numberControl('Island padding', current.padding, 0, .12, .002, value => patch(() => ({padding:value}))));
    root.appendChild(controls);
    const actions = document.createElement('div'); actions.className = 'lk-uv-actions';
    const fit = document.createElement('button'); fit.type = 'button'; fit.textContent = tr('Fit to 0–1', 'Adatta a 0–1');
    fit.addEventListener('click', () => patch(() => ({offset:[0,0], scale:[1,1], rotation:0})));
    const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = tr('Restore imported UV', 'Ripristina UV importate');
    reset.addEventListener('click', () => edit(object, 'Restore imported UV', next => {
      next.uvMappings = next.uvMappings || {};
      valid.forEach(item => { delete next.uvMappings[item.id]; });
    }));
    actions.append(fit, reset); root.appendChild(actions);
    let drag = null;
    canvas.addEventListener('pointerdown', event => {
      drag = {x:event.clientX, y:event.clientY, u:current.offset[0], v:current.offset[1]};
      canvas.setPointerCapture(event.pointerId); canvas.classList.add('dragging');
    });
    canvas.addEventListener('pointermove', event => {
      if(!drag) return;
      canvas.style.transform = 'translate(' + (event.clientX - drag.x) * .08 + 'px,' + (event.clientY - drag.y) * .08 + 'px)';
    });
    canvas.addEventListener('pointerup', event => {
      if(!drag) return;
      const nextU = drag.u + (event.clientX - drag.x) / canvas.clientWidth;
      const nextV = drag.v - (event.clientY - drag.y) / canvas.clientHeight;
      drag = null; canvas.style.transform = ''; canvas.classList.remove('dragging');
      patch(() => ({offset:[nextU, nextV]}));
    });
    const hint = document.createElement('div'); hint.className = 'lk-hint';
    hint.textContent = tr(
      'Drag the UV preview to reposition it. Smart Atlas projects by the six dominant face directions and packs them into a padded 3×2 atlas.',
      'Trascina l’anteprima UV per riposizionarla. Atlante Smart proietta sulle sei direzioni dominanti e le impacchetta in un atlante 3×2 con padding.'
    );
    root.appendChild(hint); host.appendChild(root);
  }
  return Object.freeze({build, drawPreview});
}

window.LK_EDITOR_UV_EDITOR = Object.freeze({create});
})();
