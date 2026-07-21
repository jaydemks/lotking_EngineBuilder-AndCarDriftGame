/* LOT KING — target-aware Player/Vehicle Pawn collider inspector. */
(function(){
'use strict';

function create(deps){
  const GAME = deps.GAME;
  const tr = (en, it) => GAME && GAME.i18n && GAME.i18n.lang === 'it' ? (it || en) : en;
  function clone(value){ return JSON.parse(JSON.stringify(value || {})); }

  function build(box, target, options){
    const player = target || GAME.player;
    if(!player || !player.collision || !player.setCollision) return;
    const opts = options || {};
    const owner = player.car || player.owner || null;
    const collision = player.collision;
    const section = deps.section(opts.selectedCollider ? 'PLAYER COLLIDER · SELECTED' : 'PLAYER COLLIDER');
    let before = null;
    const snapshot = () => ({collision:clone(collision), dummyVisibility:owner && owner.userData && owner.userData.colliderDummyVisibility});
    const apply = state => {
      player.setCollision(clone(state.collision));
      Object.keys(collision).forEach(key => delete collision[key]); Object.assign(collision, clone(state.collision));
      if(owner && owner.userData){
        if(state.dummyVisibility === 'show' || state.dummyVisibility === 'hide') owner.userData.colliderDummyVisibility = state.dummyVisibility;
        else delete owner.userData.colliderDummyVisibility;
      }
      if(deps.rebuildColliderHelpers) deps.rebuildColliderHelpers();
      if(deps.buildInspector) deps.buildInspector();
      deps.markDirty();
    };
    const begin = () => { before = snapshot(); };
    const commit = () => {
      if(!before || !deps.pushHistory) return;
      const oldState = before, newState = snapshot(); before = null;
      if(JSON.stringify(oldState) === JSON.stringify(newState)) return;
      deps.pushHistory({label:tr('Player collider', 'Collisione player'), undo:() => apply(oldState), redo:() => apply(newState)});
    };
    const set = patch => { player.setCollision(patch); Object.assign(collision, patch); if(deps.rebuildColliderHelpers) deps.rebuildColliderHelpers(); deps.markDirty(); };
    const row = item => { item.root.addEventListener('lk-slider-edit-start', begin); item.root.addEventListener('lk-slider-edit-end', commit); return item.root; };
    section.body.appendChild(deps.el('<div class="lk-hint">' + tr('Collider dimensions and offsets belong only to this Pawn instance.', 'Dimensioni e offset del collider appartengono solo a questa istanza Pawn.') + '</div>'));
    if(owner && owner.userData){
      const visibility = deps.el('<div class="lk-row"><label>Dummy visibility</label><select><option value="auto">Auto</option><option value="show">Always show</option><option value="hide">Always hide</option></select></div>');
      const select = visibility.querySelector('select'); select.value = owner.userData.colliderDummyVisibility || 'auto';
      select.addEventListener('change', () => { begin(); if(select.value === 'auto') delete owner.userData.colliderDummyVisibility; else owner.userData.colliderDummyVisibility = select.value; if(deps.rebuildColliderHelpers) deps.rebuildColliderHelpers(); deps.markDirty(); commit(); });
      section.body.appendChild(visibility);
    }
    [
      ['Half X','hx',.92,.1,4], ['Half Y','hy',.42,.05,2], ['Half Z','hz',1.85,.1,6],
      ['Offset X','offsetX',0,-3,3], ['Offset Y','offsetY',.45,-1,3], ['Offset Z','offsetZ',0,-3,3],
      ['Body height Y','bodyY',.55,.05,3], ['Arcade radius','radius',1.4,.2,5],
    ].forEach(item => section.body.appendChild(row(deps.sliderRow(item[0], collision[item[1]] == null ? item[2] : collision[item[1]], item[3], item[4], .01, value => set({[item[1]]:value}), value => (+value).toFixed(2)))));
    box.appendChild(section.root);
  }
  return Object.freeze({build});
}
window.LK_EDITOR_PLAYER_COLLIDER_INSPECTOR = Object.freeze({create});
})();
