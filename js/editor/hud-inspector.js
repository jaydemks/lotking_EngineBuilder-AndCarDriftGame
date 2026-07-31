/* =========================================================
   LOT KING — HUD / RADIO TAB INSPECTOR
   Dynamic radio HUD layout and button controls.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const GAME = deps.GAME;
  const ED = deps.ED || GAME && GAME.editor && GAME.editor.state || {};
  const markDirty = deps.markDirty;
  const buildInspector = deps.buildInspector || function(){};
  const musicLibrarySection = deps.musicLibrarySection;
  const section = deps.section;
  const selectRow = deps.selectRow;
  const sliderRow = deps.sliderRow;
  const checkRow = deps.checkRow;
  const btnRow = deps.btnRow;
  const el = deps.el;
  const tr = (en, it) => GAME && GAME.i18n && GAME.i18n.lang === 'it' ? (it || en) : en;

  function build(box){
    const hud = GAME.ui && GAME.ui.radioHud;
    const setHud = GAME.ui && GAME.ui.setRadioHud;
    const radar = GAME.ui && GAME.ui.vehicleRadar;
    const setRadar = GAME.ui && GAME.ui.setVehicleRadar;
    box.appendChild(el('<div class="lk-head"><span class="lk-head-ic">▣</span><span class="lk-bp-title">HUD / LEVEL UI</span><span class="lk-head-id">editable runtime overlays</span></div>'));

    if(radar && setRadar){
      const updRadar = patch => {
        setRadar(patch);
        if(GAME.ui.previewVehicleRadar) GAME.ui.previewVehicleRadar(true);
        markDirty();
      };
      const overview = section(tr('VEHICLE RADAR / MINIMAP', 'RADAR VEICOLO / MINIMAPPA'), false);
      overview.body.appendChild(checkRow(tr('Enabled in vehicle gameplay', 'Attivo nel gameplay veicolo'), radar.enabled !== false, value => updRadar({enabled:value})).root);
      overview.body.appendChild(btnRow([
        {label:tr('Show editor preview', 'Mostra anteprima editor'), action:() => GAME.ui.previewVehicleRadar(true)},
        {label:tr('Hide preview', 'Nascondi anteprima'), action:() => GAME.ui.previewVehicleRadar(false)},
      ]));
      overview.body.appendChild(checkRow(tr('Rotate with vehicle', 'Ruota con il veicolo'), radar.rotate !== false, value => updRadar({rotate:value})).root);
      overview.body.appendChild(checkRow(tr('Circular frame', 'Cornice circolare'), radar.circular !== false, value => updRadar({circular:value})).root);
      overview.body.appendChild(checkRow(tr('Draw physical obstacles', 'Disegna ostacoli fisici'), radar.showObstacles !== false, value => updRadar({showObstacles:value})).root);
      overview.body.appendChild(checkRow(tr('Draw items / actors', 'Disegna oggetti / actor'), radar.showItems !== false, value => updRadar({showItems:value})).root);
      overview.body.appendChild(el('<div class="lk-hint">' + tr(
        'The map reads the real level colliders and actors on a throttled Canvas 2D layer. It does not create a second 3D camera or render target.',
        'La mappa legge collider e actor reali del livello su un Canvas 2D a frequenza limitata. Non crea una seconda camera 3D né un render target.'
      ) + '</div>'));
      box.appendChild(overview.root);

      const radarLayout = section(tr('RADAR LAYOUT / COST', 'LAYOUT / COSTO RADAR'), true);
      radarLayout.body.appendChild(btnRow([
        {label:tr('↖ Snap to top-left', '↖ Porta in alto a sinistra'), action:() => {
          updRadar({left:0, top:0, layoutVersion:2});
          buildInspector();
        }},
      ]));
      radarLayout.body.appendChild(sliderRow('Left', radar.left == null ? 0 : radar.left, 0, 90, .1, value => updRadar({left:value,layoutVersion:2}), value => (+value).toFixed(1) + '%').root);
      radarLayout.body.appendChild(sliderRow('Top', radar.top == null ? 0 : radar.top, 0, 85, .1, value => updRadar({top:value,layoutVersion:2}), value => (+value).toFixed(1) + '%').root);
      radarLayout.body.appendChild(sliderRow(tr('Size', 'Dimensione'), radar.size || 176, 90, 420, 2, value => updRadar({size:value}), value => Math.round(value) + ' px').root);
      radarLayout.body.appendChild(sliderRow(tr('World range', 'Raggio mondo'), radar.range || 92, 20, 240, 2, value => updRadar({range:value}), value => Math.round(value) + ' m').root);
      radarLayout.body.appendChild(sliderRow(tr('Opacity', 'Opacità'), radar.opacity == null ? .9 : radar.opacity, .1, 1, .01, value => updRadar({opacity:value}), value => Math.round(value * 100) + '%').root);
      radarLayout.body.appendChild(sliderRow(tr('Refresh rate', 'Frequenza aggiornamento'), radar.refreshHz || 15, 5, 30, 1, value => updRadar({refreshHz:Math.round(value)}), value => Math.round(value) + ' Hz').root);
      box.appendChild(radarLayout.root);
    }

    if(!hud || !setHud){
      box.appendChild(el('<div class="lk-empty">' + tr('Radio HUD unavailable.', 'HUD radio non disponibile.') + '</div>'));
      return;
    }
    const upd = patch => {
      setHud(patch);
      if(GAME.ui.previewRadioHud) GAME.ui.previewRadioHud(true);
      markDirty();
    };
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

    const binding = section(tr('RADIO OWNERSHIP', 'PROPRIETÀ RADIO'), true);
    binding.body.appendChild(selectRow(tr('Runtime binding', 'Collegamento runtime'), hud.bindingMode || 'vehicle', [
      {value:'vehicle', label:tr('Possessed vehicle (recommended)', 'Veicolo posseduto (consigliato)')},
      {value:'actor', label:tr('Specific actor', 'Actor specifico')},
      {value:'global', label:tr('Global gameplay', 'Gameplay globale')},
    ], value => upd({bindingMode:value})).root);
    const actorOptions = [{value:'', label:tr('Select an actor...', 'Seleziona un actor...')}];
    if(GAME.world && GAME.world.registry && GAME.world.registry.forEach){
      GAME.world.registry.forEach(object => {
        if(!object) return;
        const data = object.userData || {};
        const id = String(data.editorId || data.logicInstanceId || data.entityId || data.id || '');
        if(!id) return;
        actorOptions.push({value:id, label:String(data.editorName || data.name || object.name || id)});
      });
    }
    binding.body.appendChild(selectRow(
      tr('Bound actor', 'Actor collegato'),
      hud.bindingActorId || '',
      actorOptions,
      value => upd({bindingActorId:value})
    ).root);
    binding.body.appendChild(el('<div class="lk-hint">' + tr(
      'By default the radio and its TAB interface exist only while Player 1 possesses an enabled native or Logic Element vehicle. Actor and Global are explicit overrides for custom projects.',
      'Per impostazione predefinita la radio e la sua interfaccia TAB esistono solo mentre il Giocatore 1 possiede un veicolo nativo o Logic Element attivo. Actor e Globale sono override espliciti per progetti personalizzati.'
    ) + '</div>'));
    box.appendChild(binding.root);

    const radioApi = GAME.systems && GAME.systems.radio;
    box.appendChild(musicLibrarySection('GAME RADIO LIBRARY', radioApi));
    const loadingMusicApi = GAME.systems && GAME.systems.loadingMusic;
    box.appendChild(musicLibrarySection(
      tr('LOADING MUSIC LIBRARY', 'LIBRERIA MUSICA CARICAMENTO'),
      loadingMusicApi
    ));
    const menuController = GAME.systems && GAME.systems.menuMusic;
    const editorMenuApi = GAME.systems && GAME.systems.editorMenuMusic;
    const gameMenuApi = GAME.systems && GAME.systems.gameMenuMusic;
    const initialMenuTarget = ED.menuMusicLibraryTarget ||
      (ED.levelRole === 'editor-menu' ? 'editor-menu' : 'game-menu');
    ED.menuMusicLibraryTarget = initialMenuTarget;
    if(menuController && menuController.setEditorTarget) menuController.setEditorTarget(initialMenuTarget);
    const menuTargetSection = section(tr('MENU MUSIC DESTINATION', 'DESTINAZIONE MUSICA MENU'), true);
    const menuTarget = selectRow(tr('Edit library for', 'Modifica libreria per'), initialMenuTarget, [
      {value:'editor-menu', label:tr('Editor Menu', 'Menu Editor')},
      {value:'game-menu', label:tr('Game Menu', 'Menu di gioco')},
    ], value => {
      ED.menuMusicLibraryTarget = value;
      if(menuController && menuController.setEditorTarget) menuController.setEditorTarget(value);
      renderMenuLibrary();
    });
    menuTargetSection.body.appendChild(menuTarget.root);
    menuTargetSection.body.appendChild(el('<div class="lk-hint">' + tr(
      'Editor Menu and Game Menu have independent ordered playlists. The first row is the track that starts when that menu opens.',
      'Menu Editor e Menu di gioco hanno playlist ordinate indipendenti. La prima riga è il brano che parte quando si apre quel menu.'
    ) + '</div>'));
    box.appendChild(menuTargetSection.root);
    const menuLibraryHost = el('<div></div>');
    box.appendChild(menuLibraryHost);
    function renderMenuLibrary(){
      menuLibraryHost.innerHTML = '';
      const target = ED.menuMusicLibraryTarget === 'editor-menu' ? 'editor-menu' : 'game-menu';
      const api = target === 'editor-menu' ? editorMenuApi : gameMenuApi;
      const title = target === 'editor-menu'
        ? tr('EDITOR MENU MUSIC LIBRARY', 'LIBRERIA MUSICA MENU EDITOR')
        : tr('GAME MENU MUSIC LIBRARY', 'LIBRERIA MUSICA MENU DI GIOCO');
      menuLibraryHost.appendChild(musicLibrarySection(title, api));
    }
    renderMenuLibrary();

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
