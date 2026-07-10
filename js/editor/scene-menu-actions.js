/* =========================================================
   LOT KING - EDITOR SCENE MENU ACTIONS
   Context-menu definitions and small menu-triggered scene actions.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const THREE = deps.THREE;
  const GAME = deps.GAME;
  const STORE = deps.STORE;
  const ED = deps.ED;
  const scene = deps.scene;
  const camE = deps.camE;
  const $ = deps.$;
  const t = (key, fallback) => GAME && GAME.i18n ? GAME.i18n.t(key, fallback) : fallback;
  const tr = (en, it) => GAME && GAME.i18n && GAME.i18n.lang === 'it' ? (it || en) : en;
  const isOnlineDemo = () => window.LK_PROJECT_WORKSPACE && window.LK_PROJECT_WORKSPACE.isOnlineDemoMode && window.LK_PROJECT_WORKSPACE.isOnlineDemoMode();
  function blockOnlineDemoAction(){
    deps.status(tr('Online demo only. Run the project locally to edit this scene.', 'Demo online: avvia il progetto in locale per modificare la scena.'));
  }

  function addMenuItems(at){
    if(isOnlineDemo()) return [
      {label:tr('Online demo: additions disabled', 'Demo online: aggiunte disabilitate'), icon:'◇', disabled:true},
    ];
    const P = at ? {x: at.x, y: at.y, z: at.z} : deps.spawnPointAhead();
    const prim = k => ({label: k[0].toUpperCase()+k.slice(1), icon:'▣', action: () => deps.addPrimitive(k, P)});
    return [
      {label:tr('Primitive', 'Primitiva'), icon:'▣', sub: ['box','sphere','cylinder','cone','plane','torus','ramp'].map(prim)},
      {label:'Collision', icon:'▧', sub: [
        {label:'Collision Box', icon:'▧', action:() => deps.addPrimitive('collisionBox', P)},
      ]},
      {label:tr('Light', 'Luce'), icon:'💡', sub: [
        {label:'Point Light', icon:'💡', action:() => deps.addLight('point', P)},
        {label:'Spot Light', icon:'🔦', action:() => deps.addLight('spot', P)},
        {label:'Directional Light', icon:'☀️', action:() => deps.addLight('directional', P)},
        {label:'Hemisphere Light', icon:'🌗', action:() => deps.addLight('hemisphere', P)},
        {label:'Ambient Light', icon:'💠', action:() => deps.addLight('ambient', P)},
      ]},
      {label:tr('Effect', 'Effetto'), icon:'✨', sub: Object.keys(STORE.EFFECT_PRESETS).map(k => (
        {label: k[0].toUpperCase()+k.slice(1), icon:'✨', action:() => deps.addEffect(k, P)}
      ))},
      {label:tr('Text', 'Testo'), icon:'T', sub: [
        {label:'Text 2D', icon:'T', action:() => deps.addText('2d', P)},
        {label:'Text 3D', icon:'T', action:() => deps.addText('3d', P)},
      ]},
	      {label:t('editor.freeTexture', 'Free Texture / Decal'), icon:'▧', sub: [
	        {label:t('editor.decalSurface', tr('Surface decal', 'Decal su superficie')), icon:'▧', action:() => deps.addTexture('decal', P)},
	        {label:t('editor.freeImage', tr('Free image', 'Immagine libera')), icon:'▣', action:() => deps.addTexture('image', P)},
	      ]},
	      {label:'Camera', icon:'🎥', action:() => deps.addCamera(P)},
	      {label:'Cinema Studio', icon:'▤', action:() => deps.addCinemaStudio(P)},
	      {label:'Logic', icon:'◇', sub: [
	        {label:'Logic Element', icon:'◇', action:() => deps.addLogicElement(P)},
	      ]},
	      {sep:true},
      {label:tr('Import GLB/texture asset...', 'Importa asset GLB/Texture...'), icon:'📦', action:() => deps.openGlbImportAt(P)},
    ];
  }

  function objectMenuItems(o, fromOutliner, gp){
    const isCinemaStudio = !!(o && o.userData && o.userData.editorType === 'cinemaStudio');
    if(isOnlineDemo()){
      const demoItems = [
        {label:'Select', icon:'◎', action:() => deps.selectObject(o)},
        {label:'Focus', icon:'🔍', action: deps.focusSelected},
      ];
      if(isCinemaStudio && deps.openCinemaTimeline){
        demoItems.push({label:tr('Open Cinema timeline', 'Apri timeline Cinema'), icon:'▤', action:() => deps.openCinemaTimeline(o)});
      }
      demoItems.push(
        {label:tr('Online demo: editing disabled', 'Demo online: modifica disabilitata'), icon:'◇', disabled:true},
      );
      return demoItems;
    }
    const multi = Array.isArray(ED.multiSelected) && ED.multiSelected.includes(o) ? ED.multiSelected.filter(Boolean) : [];
    if(multi.length > 1){
      return [
        {label:'Group tools', icon:'✥', sub: [
          {label:'Move group  W', icon:'✥', action:() => deps.setTool('translate')},
          {label:'Rotate group  E', icon:'⟳', action:() => deps.setTool('rotate')},
          {label:'Scale group  R', icon:'⤢', action:() => deps.setTool('scale')},
        ]},
        {label:'Focus selection', icon:'🔍', action:deps.focusSelected},
        {label:'Select similar to clicked', icon:'☑', action:() => deps.selectSimilarObjects ? deps.selectSimilarObjects(o) : deps.selectObject(o)},
        {sep:true},
        {label:'Hide selected', icon:'👁', action:() => multi.forEach(item => { if(item.visible) deps.toggleVisible(item); })},
        {label:'Show selected', icon:'👁', action:() => multi.forEach(item => { if(!item.visible) deps.toggleVisible(item); })},
        {label:'Unlink selected from parents', icon:'×', action:() => multi.forEach(item => deps.unlinkObject(item))},
        {sep:true},
        {label:tr('Delete selected', 'Elimina selezionati'), icon:'🗑', action:() => deps.requestDeleteSelection ? deps.requestDeleteSelection() : deps.requestDeleteEntity(o)},
      ];
    }
    const items = [
      {label:tr('Tool', 'Strumento'), icon:'✥', sub: [
        {label:'Select  Q', icon:'☝', action:() => deps.setTool('select')},
        {label:'Move  W', icon:'✥', action:() => { deps.selectObject(o); deps.setTool('translate'); }},
        {label:'Rotate  E', icon:'⟳', action:() => { deps.selectObject(o); deps.setTool('rotate'); }},
        {label:'Scale  R', icon:'⤢', action:() => { deps.selectObject(o); deps.setTool('scale'); }},
      ]},
      {label:'Select', icon:'◎', sub: [
        {label:'Object', icon:'▣', action:() => deps.selectObject(o)},
        {label:'Collider', icon:'▧', disabled:!(o.userData && o.userData.collider && o.userData.collider.ref), action:() => { deps.selectCollider ? deps.selectCollider(o) : deps.selectObject(o); deps.setTool('translate'); }},
      ]},
      {label:'Focus', icon:'🔍', action: deps.focusSelected},
      ...(isCinemaStudio && deps.openCinemaTimeline ? [{label:tr('Open Cinema timeline', 'Apri timeline Cinema'), icon:'▤', action:() => deps.openCinemaTimeline(o)}] : []),
      {label:'Select similar', icon:'☑', action:() => deps.selectSimilarObjects ? deps.selectSimilarObjects(o) : deps.selectObject(o)},
      {label:tr('Duplicate', 'Duplica'), icon:'⧉', sub: [
        {label:tr('Duplicate  Ctrl+D', 'Duplica  Ctrl+D'), icon:'⧉', action:() => deps.duplicateEntity(o)},
        {label:tr('Populate row x5', 'Popola in fila x5'), icon:'▦', action:() => duplicateLine(o, 5)},
      ]},
      {label:tr('Apply last transform  Ctrl+R', 'Applica ultima trasformazione  Ctrl+R'), icon:'↻', disabled:!deps.hasLastTransformRepeat(), action:deps.applyLastTransform},
      {label:'Link / Parent', icon:'⛓', sub: [
        {label:'Set as link parent', icon:'◎', action:() => deps.setLinkParent(o)},
        {label:'Link to ' + (ED.linkParent ? (ED.linkParent.userData.editorName || 'parent') : 'parent'), icon:'→', disabled:!ED.linkParent || ED.linkParent === o, action:() => deps.linkToParent(o, ED.linkParent)},
        {label:'Unlink from parent', icon:'×', disabled:!o.parent || o.parent === scene, action:() => deps.unlinkObject(o)},
        {label:'Clear pending parent', icon:'⌫', disabled:!ED.linkParent, action:() => deps.setLinkParent(null)},
      ]},
      {label: o.visible ? tr('Hide', 'Nascondi') : tr('Show', 'Mostra'), icon:'👁', action:() => deps.toggleVisible(o)},
      {label:tr('Rename...', 'Rinomina...'), icon:'✏️', action:() => renameEntity(o)},
      {label:tr('Reset transform', 'Reset trasformazione'), icon:'↺', action:() => resetTransform(o)},
      {sep:true},
      {label:'Replace with GLB...', icon:'📦', action:() => deps.beginReplaceObject(o)},
    ];
    if(!fromOutliner && gp){
      items.push({sep:true});
      items.push({label:'Add here', icon:'＋', sub: addMenuItems(gp)});
    }
    items.push({sep:true});
    items.push({label:tr('Delete', 'Elimina'), icon:'🗑', action:() => deps.requestDeleteEntity(o)});
    return items;
  }

  function duplicateLine(o, count){
    if(isOnlineDemo()){ blockOnlineDemoAction(); return; }
    if(!o) return;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camE.quaternion).setY(0);
    if(right.lengthSq() < .01) right.set(1, 0, 0);
    right.normalize();
    const spacing = Math.max(2.5, new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).length() * .45);
    for(let i=1;i<=count;i++) deps.duplicateEntity(o, right.clone().multiplyScalar(spacing * i));
    deps.status(tr('Populated ' + count + ' duplicates', 'Popolati ' + count + ' duplicati'));
  }

  function playerMenuItems(){
    if(isOnlineDemo()){
      return [
        {label:'Select', icon:'◎', action:() => deps.selectObject(GAME.player.car)},
        {label:'Focus', icon:'🔍', action: deps.focusSelected},
        {label:tr('Online demo: player editing disabled', 'Demo online: modifica player disabilitata'), icon:'◇', disabled:true},
      ];
    }
    return [
      {label:'Select', icon:'◎', sub: [
        {label:'Object', icon:'▣', action:() => deps.selectObject(GAME.player.car)},
        {label:'Collider', icon:'▧', action:() => deps.selectPlayerCollider ? deps.selectPlayerCollider() : deps.selectObject(GAME.player.car)},
      ]},
      {label:'Focus', icon:'🔍', action: deps.focusSelected},
      {label:tr('Open player_car Logic', 'Apri player_car Logic'), icon:'🚗', action:() => deps.buildInspector()},
      {label:'Copy car logic', icon:'◇', action: deps.copyPlayerBlueprintAsset},
      {label:'Replace GLB model...', icon:'📦', action:() => $('#lkPlayerModelInput').click()},
      {label:tr('Set spawn here', 'Imposta spawn qui'), icon:'📍', action: setSpawnHere},
    ];
  }

  function canvasMenuItems(gp){
    const items = [
      {label:'Add', icon:'＋', sub: addMenuItems(gp)},
      {sep:true},
      {label:tr('Deselect', 'Deseleziona'), icon:'✕', action: deps.deselect},
      {label: ED.gridOn ? tr('Hide grid', 'Nascondi griglia') : tr('Show grid', 'Mostra griglia'), icon:'▦', action:() => deps.setGrid(!ED.gridOn)},
      {label:tr('Go to player', 'Vai al player'), icon:'🚗', action:() => { deps.selectObject(GAME.player.car); deps.focusSelected(); }},
    ];
    if(!isOnlineDemo()) items.push({label:'Save track', icon:'💾', action: deps.saveScene});
    else items.push({label:tr('Online demo: save disabled', 'Demo online: salvataggio disabilitato'), icon:'◇', disabled:true});
    return items;
  }

  async function renameEntity(o){
    if(isOnlineDemo()){ blockOnlineDemoAction(); return; }
    const n = await deps.promptEditorAction({title:tr('Rename object', 'Rinomina oggetto'), message:tr('New name:', 'Nuovo nome:'), value:o.userData.editorName || '', okText:tr('Rename', 'Rinomina')});
    if(n){ o.userData.editorName = n; deps.markDirty(); deps.refreshOutliner(); deps.buildInspector(); }
  }

  function resetTransform(o){
    if(isOnlineDemo()){ blockOnlineDemoAction(); return; }
    const prev = ED.selected;
    if(ED.selected !== o) ED.selected = o;
    deps.withTransformHistory('Reset transform', target => {
      target.rotation.set(0, target.userData.editorType === 'mesh' && target.userData.builtin ? target.rotation.y : 0, 0);
      target.scale.set(1,1,1);
      STORE.syncCollider(target);
    });
    ED.selected = prev;
    deps.markDirty(); deps.syncTransformFields();
  }

  function setSpawnHere(){
    if(isOnlineDemo()){ blockOnlineDemoAction(); return; }
    const car = GAME.player.car;
    if(GAME.player.syncSpawnFromVisibleTransform) GAME.player.syncSpawnFromVisibleTransform();
    else {
      const heading = GAME.player.visibleHeading ? GAME.player.visibleHeading() : car.rotation.y;
      if(GAME.player.spawn){
        GAME.player.spawn.x = car.position.x;
        GAME.player.spawn.z = car.position.z;
        GAME.player.spawn.heading = heading;
      }
      GAME.player.physics.pos.copy(car.position);
      GAME.player.physics.heading = heading;
      if(GAME.systems.physics) GAME.systems.physics.syncPlayer();
    }
    deps.markDirty();
    if(deps.syncTransformFields) deps.syncTransformFields();
    if(deps.buildInspector) deps.buildInspector();
    deps.status(tr('Player spawn updated', 'Spawn del player aggiornato'));
  }

  return Object.freeze({
    addMenuItems,
    objectMenuItems,
    duplicateLine,
    playerMenuItems,
    canvasMenuItems,
    renameEntity,
    resetTransform,
    setSpawnHere,
  });
}

window.LK_EDITOR_SCENE_MENU_ACTIONS = Object.freeze({create});
})();
