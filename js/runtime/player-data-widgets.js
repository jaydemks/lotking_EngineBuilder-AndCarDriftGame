/* =========================================================
   LOT KING - player 3D data widgets runtime module
   Floating metric labels attached to the vehicle blueprint.
   ========================================================= */
(function(){
'use strict';

const DEFAULT_CONFIG = {
  enabled:true,
  visibleInEditor:true,
  items:[
    {key:'driftPoints', label:'DRIFT', metric:'driftPoints', enabled:true, dynamicSide:true, mirrorCenterX:0, offset:[1.55,.95,-1.35], scale:1, color:'#ffd166', opacity:.95},
    {key:'gForce', label:'G', metric:'gForce', enabled:false, dynamicSide:false, mirrorCenterX:0, offset:[-1.55,1.12,-.55], scale:.78, color:'#4be3a0', opacity:.9},
    {key:'speed', label:'KM/H', metric:'speed', enabled:false, dynamicSide:false, mirrorCenterX:0, offset:[1.45,1.08,.15], scale:.78, color:'#9db4ff', opacity:.9},
    {key:'rpm', label:'RPM', metric:'rpm', enabled:false, dynamicSide:false, mirrorCenterX:0, offset:[-1.45,.9,.35], scale:.72, color:'#ef476f', opacity:.9},
  ],
};

function clone(v){ return JSON.parse(JSON.stringify(v)); }

function create(deps){
  const THREE = deps.THREERef;
  const car = deps.car;
  const tagEntity = deps.tagEntity;
  const getMetrics = deps.getMetrics;
  const isEditorActive = deps.isEditorActive;
  const isEditorPreview = deps.isEditorPreview;
  const getSelected = deps.getSelected;
  const config = clone(DEFAULT_CONFIG);
  const rig = [];

  function makeTexture(){
    const c = document.createElement('canvas');
    c.width = 512; c.height = 160;
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.needsUpdate = true;
    return {canvas:c, ctx:c.getContext('2d'), texture:tex};
  }

  function createRig(index, cfg){
    const anchor = new THREE.Group();
    anchor.name = 'Player_Data_Widget_' + cfg.key;
    anchor.position.set(cfg.offset[0], cfg.offset[1], cfg.offset[2]);
    anchor.userData.editorType = 'playerDataWidget';
    anchor.userData.widgetIndex = index;
    anchor.userData.linkParentId = 'player';
    const helper = new THREE.Mesh(
      new THREE.SphereGeometry(.08, 10, 6),
      new THREE.MeshBasicMaterial({color:0xffd166, transparent:true, opacity:.65, depthTest:false})
    );
    helper.userData.helperOnly = true;
    const tex = makeTexture();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex.texture,
      transparent:true,
      opacity: cfg.opacity == null ? .95 : cfg.opacity,
      depthWrite:false,
      depthTest:false,
    }));
    sprite.position.y = .16;
    anchor.add(helper, sprite);
    car.add(anchor);

    const mirror = new THREE.Group();
    mirror.name = 'Player_Data_Widget_Mirror_' + cfg.key;
    mirror.userData.helperOnly = true;
    const mirrorHelper = new THREE.Mesh(
      new THREE.SphereGeometry(.06, 10, 6),
      new THREE.MeshBasicMaterial({color:0x9db4ff, transparent:true, opacity:.35, depthTest:false})
    );
    const mirrorSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex.texture,
      transparent:true,
      opacity:.22,
      depthWrite:false,
      depthTest:false,
    }));
    mirrorSprite.position.y = .16;
    mirror.add(mirrorHelper, mirrorSprite);
    car.add(mirror);

    tagEntity(anchor, 'Data Widget ' + cfg.label, 'playerDataWidget', {id:'player_data_' + cfg.key});
    rig[index] = {anchor, helper, sprite, mirror, mirrorHelper, mirrorSprite, tex, lastText:''};
    return rig[index];
  }

  function ensure(){
    for(let i=0;i<config.items.length;i++){
      if(!rig[i]) createRig(i, config.items[i]);
    }
  }

  function formatMetric(metric, metrics){
    if(metric === 'driftPoints') return '+' + Math.round(metrics.driftScore || 0).toLocaleString();
    if(metric === 'gForce') return (metrics.lastLatG || 0).toFixed(1) + 'G';
    if(metric === 'speed') return Math.round(metrics.speedKmh || 0).toString();
    if(metric === 'rpm') return Math.round(metrics.rpm || 0).toLocaleString();
    return '--';
  }

  function metricActive(metric, metrics){
    if(isEditorActive() && !isEditorPreview()) return true;
    if(metric === 'driftPoints') return (metrics.driftScore || 0) > 1 && !!metrics.drifting;
    return true;
  }

  function paint(item, cfg, value){
    const text = cfg.label + '|' + value + '|' + cfg.color + '|' + cfg.opacity;
    if(item.lastText === text) return;
    item.lastText = text;
    const {canvas, ctx, texture} = item.tex;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    const color = cfg.color || '#ffd166';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0,0,0,.85)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = 'rgba(255,255,255,.78)';
    ctx.font = '900 27px Arial, sans-serif';
    ctx.fillText(cfg.label || 'DATA', 58, 50);
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.fillStyle = color;
    ctx.font = '900 68px Arial, sans-serif';
    ctx.fillText(value, 56, 102);
    ctx.shadowColor = 'rgba(0,0,0,.95)';
    ctx.shadowBlur = 2;
    ctx.strokeStyle = 'rgba(0,0,0,.72)';
    ctx.lineWidth = 5;
    ctx.strokeText(value, 56, 102);
    ctx.fillStyle = color;
    ctx.fillText(value, 56, 102);
    ctx.restore();
    texture.needsUpdate = true;
  }

  function syncFromAnchor(anchor){
    if(!anchor || anchor.userData.widgetIndex == null) return;
    const cfg = config.items[anchor.userData.widgetIndex];
    if(!cfg) return;
    cfg.offset = [anchor.position.x, anchor.position.y, anchor.position.z];
  }

  function mirrorX(cfg, x){
    const center = cfg.mirrorCenterX || 0;
    return center * 2 - x;
  }

  function set(patch){
    if(!patch) return;
    if(patch.enabled != null) config.enabled = patch.enabled !== false;
    if(patch.visibleInEditor != null) config.visibleInEditor = !!patch.visibleInEditor;
    if(Array.isArray(patch.items)){
      patch.items.forEach((itemPatch, i) => {
        if(!itemPatch) return;
        if(!config.items[i]) config.items[i] = itemPatch;
        else Object.assign(config.items[i], itemPatch);
      });
    }
    ensure();
  }

  function update(){
    ensure();
    const metrics = getMetrics();
    const side = metrics.driftSide || 1;
    const selected = getSelected ? getSelected() : null;
    for(let i=0;i<config.items.length;i++){
      const cfg = config.items[i];
      const item = rig[i];
      if(!cfg || !item) continue;
      const selectedInEditor = !!(isEditorActive() && selected === item.anchor);
      if(selectedInEditor) syncFromAnchor(item.anchor);
      const visible = config.enabled !== false && !!cfg.enabled && metricActive(cfg.metric, metrics);
      item.anchor.visible = visible || (!!isEditorActive() && !!config.visibleInEditor);
      item.helper.visible = !!isEditorActive() && !!config.visibleInEditor;
      if(!selectedInEditor){
        const dynamicRuntime = !!cfg.dynamicSide && !(isEditorActive() && !isEditorPreview());
        const center = cfg.mirrorCenterX || 0;
        const dist = Math.abs((cfg.offset[0] || 0) - center);
        const x = dynamicRuntime ? center + dist * side : cfg.offset[0];
        item.anchor.position.set(x, cfg.offset[1], cfg.offset[2]);
      }
      const scale = Math.max(.2, cfg.scale == null ? 1 : cfg.scale);
      item.sprite.scale.set(2.35 * scale, .74 * scale, 1);
      item.sprite.material.opacity = visible ? (cfg.opacity == null ? .95 : cfg.opacity) : .28;
      item.sprite.visible = visible || isEditorActive();
      const showMirror = !!cfg.dynamicSide && !!isEditorActive() && !!config.visibleInEditor;
      item.mirror.visible = showMirror;
      if(showMirror){
        item.mirror.position.set(mirrorX(cfg, item.anchor.position.x), item.anchor.position.y, item.anchor.position.z);
        item.mirrorSprite.scale.copy(item.sprite.scale);
        item.mirrorSprite.material.opacity = selectedInEditor ? .32 : .18;
        item.mirrorHelper.visible = true;
      }
      paint(item, cfg, formatMetric(cfg.metric, metrics));
    }
  }

  function add(item){
    const index = config.items.length;
    config.items.push(Object.assign({
      key:'data' + (index + 1), label:'DATA', metric:'speed', enabled:true,
      dynamicSide:false, mirrorCenterX:0, offset:[0,1,0], scale:.8, color:'#ffd166', opacity:.9,
    }, clone(item || {})));
    ensure();
    return rig[index] && rig[index].anchor || null;
  }

  function remove(index){
    const i = Number(index) | 0;
    if(i < 0 || i >= config.items.length) return false;
    dispose();
    config.items.splice(i, 1);
    ensure();
    return true;
  }

  function duplicate(index){
    const i = Number(index) | 0;
    if(i < 0 || i >= config.items.length) return null;
    const copy = clone(config.items[i]);
    copy.key = String(copy.key || 'data') + '_copy';
    return add(copy);
  }

  function move(index, direction){
    const from = Number(index) | 0, to = from + (Number(direction) < 0 ? -1 : 1);
    if(from < 0 || from >= config.items.length || to < 0 || to >= config.items.length) return false;
    dispose();
    const item = config.items.splice(from, 1)[0]; config.items.splice(to, 0, item);
    ensure();
    return true;
  }

  function dispose(){
    rig.forEach(item => {
      if(!item) return;
      [item.anchor, item.mirror].forEach(node => {
        if(node && node.parent) node.parent.remove(node);
        if(node && node.traverse) node.traverse(child => {
          if(child.geometry && child.geometry.dispose) child.geometry.dispose();
          if(child.material){
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach(material => { if(material && material.dispose) material.dispose(); });
          }
        });
      });
      if(item.tex && item.tex.texture && item.tex.texture.dispose) item.tex.texture.dispose();
    });
    rig.length = 0;
  }

  ensure();
  return {config, update, set, add, remove, duplicate, move, syncFromAnchor, dispose};
}

window.LK_RUNTIME_PLAYER_DATA_WIDGETS = Object.freeze({create});
})();
