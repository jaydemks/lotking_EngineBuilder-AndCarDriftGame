/* =========================================================
   LOT KING — HUD / RADIO TAB INSPECTOR
   Dynamic radio HUD layout and button controls.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const GAME = deps.GAME;
  const markDirty = deps.markDirty;
  const musicLibrarySection = deps.musicLibrarySection;
  const section = deps.section;
  const sliderRow = deps.sliderRow;
  const checkRow = deps.checkRow;
  const btnRow = deps.btnRow;
  const el = deps.el;
  const tr = (en, it) => GAME && GAME.i18n && GAME.i18n.lang === 'it' ? (it || en) : en;

  function build(box){
    const hud = GAME.ui && GAME.ui.radioHud;
    const setHud = GAME.ui && GAME.ui.setRadioHud;
    if(!hud || !setHud){
      box.appendChild(el('<div class="lk-empty">' + tr('Radio HUD unavailable.', 'HUD radio non disponibile.') + '</div>'));
      return;
    }
    const upd = patch => {
      setHud(patch);
      if(GAME.ui.previewRadioHud) GAME.ui.previewRadioHud(true);
      markDirty();
    };
    box.appendChild(el('<div class="lk-head"><span class="lk-head-ic">▣</span><span class="lk-bp-title">HUD / RADIO TAB</span><span class="lk-head-id">soundhud.png · dynamic UI</span></div>'));

    const sp = section(tr('PREVIEW / STATE', 'PREVIEW / STATO'), false);
    sp.body.appendChild(checkRow(tr('Enabled in game with TAB', 'Attiva in gioco con TAB'), hud.enabled, v => upd({enabled:v})).root);
    sp.body.appendChild(btnRow([
      {label:'Add to game', action:() => upd({enabled:true})},
      {label:tr('Remove from game', 'Rimuovi dal gioco'), action:() => upd({enabled:false})},
    ]));
    sp.body.appendChild(btnRow([
      {label:tr('Show preview', 'Mostra preview'), action:() => { if(GAME.ui.previewRadioHud) GAME.ui.previewRadioHud(true); }},
      {label:tr('Hide preview', 'Nascondi preview'), action:() => { if(GAME.ui.previewRadioHud) GAME.ui.previewRadioHud(false); }},
    ]));
    sp.body.appendChild(btnRow([
      {label:'Edit Frame PNG', action:() => upd({editTarget:'frame'})},
      {label:tr('Edit Interface', 'Edit Interfaccia'), action:() => upd({editTarget:'screen'})},
      {label:tr('Edit Buttons', 'Edit Pulsanti'), action:() => upd({editTarget:'buttons', buttonLayer:10})},
    ]));
    sp.body.appendChild(el('<div class="lk-hint">' + tr('In game it remains TAB + slow-motion. In the editor, preview stays fixed so you can lay it out.', 'In gioco resta TAB + slow-motion. In editor la preview resta ferma per poterla impaginare.') + '</div>'));
    box.appendChild(sp.root);

    const radioApi = GAME.systems && GAME.systems.radio;
    const menuApi = GAME.systems && GAME.systems.menuMusic;
    box.appendChild(musicLibrarySection('GAME RADIO LIBRARY', radioApi));
    box.appendChild(musicLibrarySection('MENU MUSIC LIBRARY', menuApi));

    const si = section('PNG FRAME', false);
    let lock = true;
    const lockRow = checkRow(tr('Lock proportions', 'Proporzioni bloccate'), true, v => { lock = v; });
    si.body.appendChild(lockRow.root);
    si.body.appendChild(sliderRow(tr('Frame X position', 'Posizione X frame'), hud.frameX == null ? 50 : hud.frameX, 5, 95, .1, v => upd({frameX:v}), v => (+v).toFixed(1) + '%').root);
    si.body.appendChild(sliderRow(tr('Height from bottom', 'Altezza dal basso'), hud.frameY == null ? 2 : hud.frameY, 0, 60, .1, v => upd({frameY:v}), v => (+v).toFixed(1) + 'vh').root);
    si.body.appendChild(sliderRow(tr('PNG width', 'Larghezza PNG'), hud.width, 280, 1400, 10, v => upd({width:v})).root);
    si.body.appendChild(sliderRow('PNG X scale', hud.pngScaleX, .45, 1.8, .01, v => {
      upd(lock ? {pngScaleX:v, pngScaleY:v} : {pngScaleX:v});
    }, v => (+v).toFixed(2)).root);
    si.body.appendChild(sliderRow('PNG Y scale', hud.pngScaleY, .45, 1.8, .01, v => {
      upd(lock ? {pngScaleX:v, pngScaleY:v} : {pngScaleY:v});
    }, v => (+v).toFixed(2)).root);
    box.appendChild(si.root);

    const ss = section(tr('DYNAMIC INTERFACE', 'INTERFACCIA DINAMICA'), false);
    ss.body.appendChild(sliderRow('Left %', hud.screenLeft, -20, 40, .1, v => upd({screenLeft:v}), v => (+v).toFixed(1) + '%').root);
    ss.body.appendChild(sliderRow('Top %', hud.screenTop, -20, 40, .1, v => upd({screenTop:v}), v => (+v).toFixed(1) + '%').root);
    ss.body.appendChild(sliderRow('Width %', hud.screenWidth, 20, 130, .1, v => upd({screenWidth:v}), v => (+v).toFixed(1) + '%').root);
    ss.body.appendChild(sliderRow('Height %', hud.screenHeight, 20, 130, .1, v => upd({screenHeight:v}), v => (+v).toFixed(1) + '%').root);
    box.appendChild(ss.root);

    const sb = section(tr('BUTTONS (VOL- / VOL+ / BASS)', 'PULSANTI (VOL- / VOL+ / BASS)'), false);
    sb.body.appendChild(el('<div class="lk-hint">' + tr('Clickable circles above the frame: place them on the buttons drawn in the PNG. With "Edit Buttons" you drag and resize them directly in preview.', 'Cerchietti cliccabili sopra il frame: posizionali sui pulsanti disegnati nella PNG. Con "Edit Pulsanti" li trascini e ridimensioni direttamente nella preview.') + '</div>'));
    sb.body.appendChild(btnRow([
      {label:tr('Show and edit', 'Mostra e modifica'), action:() => upd({editTarget:'buttons', buttonLayer:10})},
      {label:tr('Bring forward', 'Porta davanti'), action:() => upd({buttonLayer:10})},
    ]));
    const knobNames = {volDown:'VOL −', volUp:'VOL +', bass:'BASS BOOST'};
    for(const k of Object.keys(knobNames)){
      const kb = (hud.buttons && hud.buttons[k]) || {x:15, y:80, size:5.5};
      sb.body.appendChild(sliderRow(knobNames[k] + ' · X', kb.x, 0, 100, .1, v => upd({buttons:{[k]:{x:v}}}), v => (+v).toFixed(1) + '%').root);
      sb.body.appendChild(sliderRow(knobNames[k] + ' · Y', kb.y, 0, 100, .1, v => upd({buttons:{[k]:{y:v}}}), v => (+v).toFixed(1) + '%').root);
      sb.body.appendChild(sliderRow(knobNames[k] + ' · Size', kb.size, 2, 25, .1, v => upd({buttons:{[k]:{size:v}}}), v => (+v).toFixed(1) + '%').root);
    }
    sb.body.appendChild(sliderRow(tr('In-game opacity', 'Opacita in gioco'), hud.buttonOpacity == null ? .22 : hud.buttonOpacity, 0, 1, .01, v => upd({buttonOpacity:v}), v => Math.round(v*100) + '%').root);
    const radio = GAME.systems && GAME.systems.radio;
    if(radio && radio.setPlayerVol){
      sb.body.appendChild(btnRow([
        {label:'Test VOL −', action:() => radio.setPlayerVol(radio.getPlayerVol() - 1)},
        {label:'Test VOL +', action:() => radio.setPlayerVol(radio.getPlayerVol() + 1)},
        {label:'Test BASS', action:() => radio.setBass((radio.getBass() + 1) % 4)},
      ]));
    }
    box.appendChild(sb.root);

    const sl = section('LAYER ORDER', false);
    const screenAbove = (hud.screenLayer|0) >= (hud.imageLayer|0);
    sl.body.appendChild(el('<div class="lk-hint">' + tr('Choose the visual order of PNG and interface. VOL/BASS click targets always stay above everything even if the button layer is set low.', 'Decidi l\'ordine visuale di PNG e interfaccia. I target cliccabili VOL/BASS restano sempre sopra a tutto anche se il layer pulsanti viene impostato basso.') + '</div>'));
    sl.body.appendChild(btnRow([
      {label:tr('Interface above', 'Interfaccia sopra'), action:() => upd({imageLayer:1, screenLayer:2})},
      {label:tr('PNG above', 'PNG sopra'), action:() => upd({imageLayer:3, screenLayer:2})},
      {label:tr('Buttons above all', 'Pulsanti sopra tutto'), action:() => upd({buttonLayer:10})},
    ]));
    sl.body.appendChild(sliderRow('Layer PNG', hud.imageLayer, 0, 10, 1, v => upd({imageLayer:Math.round(v)})).root);
    sl.body.appendChild(sliderRow('Layer interfaccia', hud.screenLayer, 0, 10, 1, v => upd({screenLayer:Math.round(v)})).root);
    sl.body.appendChild(sliderRow('Layer pulsanti', hud.buttonLayer == null ? 8 : hud.buttonLayer, 0, 12, 1, v => upd({buttonLayer:Math.round(v)})).root);
    sl.body.appendChild(el('<div class="lk-hint">Ora: ' + (screenAbove ? 'interfaccia sopra al PNG' : 'PNG sopra all\'interfaccia') + ' · click pulsanti sempre sopra.</div>'));
    box.appendChild(sl.root);
  }

  return Object.freeze({build});
}

window.LK_EDITOR_HUD_INSPECTOR = Object.freeze({create});
})();
