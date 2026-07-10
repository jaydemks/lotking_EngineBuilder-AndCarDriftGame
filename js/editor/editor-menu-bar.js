/* =========================================================
   LOT KING - editor application menu bar
   File/Edit/View/Tools/Plugins surface above the tool toolbar.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const root = deps.root;
  const $ = deps.$;
  const openMenu = deps.openMenu || function(){};
  const pluginManager = deps.pluginManager || null;
  if(!root || !$) return null;

  const pluginPanel = root.querySelector('#lkPluginPanel');
  const pluginList = root.querySelector('#lkPluginList');
  const profilerPanel = root.querySelector('#lkLogicProfilerPanel');
  const profilerBody = root.querySelector('#lkLogicProfilerBody');
  let profilerTimelineFilter = 'all';
  let profilerTimelineSelection = null;

  function tr(en, it){
    const GAME = deps.GAME;
    return GAME && GAME.i18n && GAME.i18n.lang === 'it' ? (it || en) : en;
  }

  function command(id, fallback){
    return () => {
      if(pluginManager && pluginManager.runCommand && pluginManager.command(id)) return pluginManager.runCommand(id);
      if(typeof fallback === 'function') return fallback();
    };
  }

	  function openPluginPanel(){
	    renderPlugins();
	    if(pluginPanel) pluginPanel.classList.add('open');
	    if(pluginPanel) pluginPanel.setAttribute('aria-hidden', 'false');
	    if(deps.status) deps.status(tr('Plugins panel', 'Pannello plugin'));
	  }

	  function closePluginPanel(){
	    if(pluginPanel) pluginPanel.classList.remove('open');
	    if(pluginPanel) pluginPanel.setAttribute('aria-hidden', 'true');
	  }

  function runtimeStats(){
    const runner = logicRunner();
    return runner && runner.stats ? runner.stats() : null;
  }

  function logicRunner(){
    const GAME = deps.GAME;
    const runner = GAME && GAME.systems && GAME.systems.logic || window.LK_LOGIC_ELEMENTS_RUNNER_INSTANCE;
    return runner || null;
  }

  function row(label, value){
    const div = document.createElement('div');
    div.className = 'lk-logic-profiler-stat';
    const k = document.createElement('span');
    k.textContent = label;
    const v = document.createElement('b');
    v.textContent = value == null ? '-' : String(value);
    div.append(k, v);
    return div;
  }

  function renderProfiler(){
    if(!profilerBody) return;
    const stats = runtimeStats();
    profilerBody.innerHTML = '';
    if(!stats){
      const empty = document.createElement('div');
      empty.className = 'lk-plugin-empty';
      empty.textContent = tr('Logic runner not available yet.', 'Runner Logic non ancora disponibile.');
      profilerBody.appendChild(empty);
      return;
    }
    const summary = document.createElement('div');
    summary.className = 'lk-logic-profiler-summary';
    summary.append(
      row('Active', stats.active ? 'yes' : 'no'),
      row('Runtimes', stats.runtimeCount || 0),
      row('Accumulator', Number(stats.accumulator || 0).toFixed(4))
    );
    profilerBody.appendChild(summary);
    const controls = document.createElement('div');
    controls.className = 'lk-logic-profiler-controls';
    const pauseBtn = document.createElement('button');
    pauseBtn.type = 'button';
    pauseBtn.textContent = stats.pauseOnBreakpoints ? tr('Pause on Breakpoint: On', 'Pausa sui Breakpoint: On') : tr('Pause on Breakpoint: Off', 'Pausa sui Breakpoint: Off');
    pauseBtn.className = stats.pauseOnBreakpoints ? 'on' : '';
    pauseBtn.addEventListener('click', () => {
      const runner = logicRunner();
      if(runner && runner.setPauseOnBreakpoints) runner.setPauseOnBreakpoints(!stats.pauseOnBreakpoints);
      renderProfiler();
    });
    const resumeBtn = document.createElement('button');
    resumeBtn.type = 'button';
    resumeBtn.textContent = tr('Resume Breakpoints', 'Riprendi Breakpoint');
    resumeBtn.addEventListener('click', () => {
      const runner = logicRunner();
      if(runner && runner.resumeBreakpoints) runner.resumeBreakpoints();
      renderProfiler();
    });
    const stepBtn = document.createElement('button');
    stepBtn.type = 'button';
    stepBtn.textContent = tr('Step Breakpoint', 'Step Breakpoint');
    stepBtn.addEventListener('click', () => {
      const runner = logicRunner();
      if(runner && runner.stepBreakpoints) runner.stepBreakpoints();
      renderProfiler();
    });
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = tr('Clear Timeline', 'Svuota Timeline');
    clearBtn.addEventListener('click', () => {
      const runner = logicRunner();
      const count = runner && runner.clearProfilerTimeline ? runner.clearProfilerTimeline() : 0;
      if(deps.status) deps.status(count ? tr('Logic profiler timeline cleared.', 'Timeline profiler Logic svuotata.') : tr('No logic timelines to clear.', 'Nessuna timeline Logic da svuotare.'));
      renderProfiler();
    });
    const filter = document.createElement('select');
    [
      ['all', tr('Timeline: All', 'Timeline: Tutto')],
      ['event', tr('Events', 'Eventi')],
      ['node', tr('Nodes', 'Nodi')],
      ['breakpoint', tr('Breakpoints', 'Breakpoint')],
      ['error', tr('Errors', 'Errori')],
    ].forEach(item => {
      const option = document.createElement('option');
      option.value = item[0];
      option.textContent = item[1];
      filter.appendChild(option);
    });
    filter.value = profilerTimelineFilter;
    filter.addEventListener('change', () => {
      profilerTimelineFilter = filter.value || 'all';
      renderProfiler();
    });
    controls.append(pauseBtn, resumeBtn, stepBtn, clearBtn, filter);
    profilerBody.appendChild(controls);
    const runtimes = Array.isArray(stats.runtimes) ? stats.runtimes : [];
    if(!runtimes.length){
      const empty = document.createElement('div');
      empty.className = 'lk-plugin-empty';
      empty.textContent = tr('No active graph runtimes. Start Preview or Simulate to collect runtime stats.', 'Nessun graph runtime attivo. Avvia Preview o Simulate per raccogliere stats.');
      profilerBody.appendChild(empty);
      return;
    }
    runtimes.forEach(runtime => {
      const card = document.createElement('div');
      card.className = 'lk-plugin-row lk-logic-profiler-runtime';
      const meta = document.createElement('div');
      meta.className = 'lk-plugin-meta';
      const title = document.createElement('b');
      title.textContent = runtime.graphName || ('Runtime ' + runtime.index);
      const sub = document.createElement('span');
      sub.textContent = (runtime.scope || 'element') + ' · ' + runtimeStatus(runtime);
      const statsLine = document.createElement('small');
      statsLine.textContent = 'events ' + (runtime.events || 0)
        + ' · nodes ' + (runtime.nodeRuns || 0)
        + ' · eval ' + (runtime.evaluations || 0)
        + ' · max steps ' + (runtime.maxStepsUsed || 0)
        + ((runtime.breakpoints || 0) ? ' · breakpoints ' + runtime.breakpoints : '');
      const last = document.createElement('small');
      last.textContent = 'last event: ' + (runtime.lastEvent || '-')
        + ' · last node: ' + (runtime.lastNode || '-')
        + (runtime.lastBreakpoint ? ' · breakpoint: ' + runtime.lastBreakpoint : '')
        + (runtime.lastError ? ' · error: ' + runtime.lastError : '');
      meta.append(title, sub, statsLine, last);
      if(runtime.paused){
        const pausedLine = document.createElement('small');
        pausedLine.textContent = 'paused at: ' + (runtime.pausedNodeTitle || runtime.pausedNode || '-')
          + (runtime.pausedNode ? ' #' + runtime.pausedNode : '')
          + ' · input ' + (runtime.pausedInputPin || 'exec')
          + ' · pause-on-breakpoint ' + (runtime.pauseOnBreakpoint ? 'on' : 'off');
        meta.appendChild(pausedLine);
      }
      const timelineAll = Array.isArray(runtime.timeline) ? runtime.timeline : [];
      const timelineFiltered = filteredTimeline(runtime.timeline);
      const timeline = timelineFiltered.slice(-10);
      if(timeline.length){
        const trace = document.createElement('small');
        trace.textContent = 'timeline ' + timelineFiltered.length + '/' + timelineAll.length + ': ' + timeline.map(item => {
          if(item.type === 'event') return 'event ' + (item.event || '-');
          if(item.type === 'error') return 'error ' + (item.message || '-');
          if(item.type === 'breakpoint') return 'breakpoint ' + (item.node || '-');
          if(item.type === 'paused' || item.type === 'step-paused') return item.type + ' ' + (item.node || '-');
          if(item.type === 'resumed' || item.type === 'stepped') return item.type + ' ' + (item.node || '-');
          return (item.title || item.nodeType || item.type || '-') + (item.node ? ' #' + item.node : '');
        }).join(' -> ');
        meta.appendChild(trace);
        const detail = renderTimelineInspector(runtime, timelineFiltered);
        if(detail) meta.appendChild(detail);
      }
      card.appendChild(meta);
      profilerBody.appendChild(card);
    });
  }

  function filteredTimeline(timeline){
    const list = Array.isArray(timeline) ? timeline : [];
    if(profilerTimelineFilter === 'all') return list;
    if(profilerTimelineFilter === 'node') return list.filter(item => item && (item.type === 'node' || item.type === 'event-node'));
    if(profilerTimelineFilter === 'event') return list.filter(item => item && item.type === 'event');
    if(profilerTimelineFilter === 'breakpoint') return list.filter(item => item && ['breakpoint', 'paused', 'resumed', 'stepped', 'step-paused'].includes(item.type));
    return list.filter(item => item && item.type === profilerTimelineFilter);
  }

  function timelineEventLabel(item){
    if(!item) return '-';
    if(item.type === 'event') return 'event ' + (item.event || '-');
    if(item.type === 'error') return 'error ' + (item.message || '-');
    if(item.type === 'breakpoint') return 'breakpoint ' + (item.node || '-');
    if(item.type === 'paused' || item.type === 'step-paused') return item.type + ' ' + (item.node || '-');
    if(item.type === 'resumed' || item.type === 'stepped') return item.type + ' ' + (item.node || '-');
    return (item.title || item.nodeType || item.type || '-') + (item.node ? ' #' + item.node : '');
  }

  function renderTimelineInspector(runtime, timeline){
    const list = Array.isArray(timeline) ? timeline : [];
    if(!list.length) return null;
    const runtimeKey = String(runtime.index == null ? runtime.graphName || 'runtime' : runtime.index);
    const wrap = document.createElement('div');
    wrap.className = 'lk-logic-profiler-timeline';
    const recent = list.slice(-8);
    recent.forEach((item, offset) => {
      const absoluteIndex = list.length - recent.length + offset;
      const selected = profilerTimelineSelection
        && profilerTimelineSelection.runtimeKey === runtimeKey
        && profilerTimelineSelection.index === absoluteIndex;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = selected ? 'sel' : '';
      button.textContent = timelineEventLabel(item);
      button.title = tr('Inspect timeline event', 'Ispeziona evento timeline');
      button.addEventListener('click', () => {
        profilerTimelineSelection = selected ? null : {runtimeKey, index:absoluteIndex};
        renderProfiler();
      });
      wrap.appendChild(button);
    });
    const selectedIndex = profilerTimelineSelection && profilerTimelineSelection.runtimeKey === runtimeKey
      ? profilerTimelineSelection.index
      : -1;
    const selectedItem = selectedIndex >= 0 ? list[selectedIndex] : null;
    if(selectedItem){
      const pre = document.createElement('pre');
      pre.className = 'lk-logic-profiler-detail';
      pre.textContent = JSON.stringify(selectedItem, null, 2);
      wrap.appendChild(pre);
    }
    return wrap;
  }

  function runtimeStatus(runtime){
    if(!runtime) return 'stopped';
    if(runtime.paused){
      const title = runtime.pausedNodeTitle || runtime.pausedNode || '-';
      return 'paused at ' + title;
    }
    return runtime.active ? 'active' : 'stopped';
  }

  function openProfilerPanel(){
    renderProfiler();
    if(profilerPanel) profilerPanel.classList.add('open');
    if(profilerPanel) profilerPanel.setAttribute('aria-hidden', 'false');
    if(deps.status) deps.status(tr('Logic profiler', 'Profiler Logic'));
  }

  function closeProfilerPanel(){
    if(profilerPanel) profilerPanel.classList.remove('open');
    if(profilerPanel) profilerPanel.setAttribute('aria-hidden', 'true');
  }

  function renderPlugins(){
    if(!pluginList) return;
    const items = pluginManager && pluginManager.list ? pluginManager.list() : [];
    pluginList.innerHTML = '';
    if(!items.length){
      const empty = document.createElement('div');
      empty.className = 'lk-plugin-empty';
      empty.textContent = tr('No plugins registered.', 'Nessun plugin registrato.');
      pluginList.appendChild(empty);
      return;
    }
    items.forEach(plugin => {
      const row = document.createElement('div');
      row.className = 'lk-plugin-row';
      const meta = document.createElement('div');
      meta.className = 'lk-plugin-meta';
      const title = document.createElement('b');
      title.textContent = plugin.name + (plugin.builtIn ? ' · Built-in' : '');
      const desc = document.createElement('span');
      desc.textContent = plugin.description || plugin.category || '';
      const caps = document.createElement('small');
      caps.textContent = (plugin.capabilities || []).slice(0, 4).join(' · ');
      meta.append(title, desc, caps);
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.textContent = plugin.enabled ? tr('Enabled', 'Attivo') : tr('Disabled', 'Disattivo');
      toggle.className = plugin.enabled ? 'on' : '';
      toggle.disabled = !!plugin.builtIn;
      toggle.title = plugin.builtIn
        ? tr('Built-in plugins are always available.', 'I plugin integrati restano sempre disponibili.')
        : tr('Toggle plugin for this browser profile.', 'Attiva/disattiva plugin per questo profilo browser.');
      toggle.addEventListener('click', () => {
        if(pluginManager && pluginManager.setEnabled) pluginManager.setEnabled(plugin.id, !plugin.enabled);
        renderPlugins();
      });
      row.append(meta, toggle);
      pluginList.appendChild(row);
    });
  }

  function fileItems(){
    return [
      {label:tr('New Level', 'Nuovo livello'), icon:'+', action:deps.newTrack},
      {label:tr('Save', 'Salva'), icon:'💾', action:() => deps.saveScene && deps.saveScene({projectFile:true})},
      {label:tr('Save As', 'Salva come'), icon:'◇', action:deps.saveAsTrack},
      {sep:true},
      {label:tr('Projects', 'Progetti'), icon:'🗂', action:() => deps.setProjectsOverlayOpen && deps.setProjectsOverlayOpen(true)},
      {label:tr('Levels', 'Livelli'), icon:'🗀', action:() => deps.setLevelsOverlayOpen && deps.setLevelsOverlayOpen(true)},
      {sep:true},
      {label:tr('Import Project', 'Importa progetto'), icon:'⇧', action:deps.importProject},
      {label:tr('Export Project', 'Esporta progetto'), icon:'⇩', action:deps.exportProject},
      {label:tr('Export Playable ZIP', 'Esporta playable ZIP'), icon:'⇩', action:deps.exportPlayable},
      {sep:true},
      {label:tr('Exit Editor', 'Esci editor'), icon:'×', action:() => deps.exitEditor && deps.exitEditor(false)},
    ];
  }

  function editItems(){
    return [
      {label:'Undo', icon:'↶', action:deps.undo},
      {label:'Redo', icon:'↷', action:deps.redo},
      {sep:true},
      {label:tr('Delete Selection', 'Cancella selezione'), icon:'⌫', action:deps.requestDeleteSelection},
      {label:tr('Deselect', 'Deseleziona'), icon:'◇', action:deps.deselect},
      {sep:true},
      {label:tr('Focus Selected', 'Inquadra selezione'), icon:'⌖', action:deps.focusSelected},
    ];
  }

  function viewItems(){
    return [
      {label:tr('Toggle Grid', 'Mostra/nascondi griglia'), icon:'▦', action:() => deps.setGrid && deps.setGrid(!deps.ED.gridOn)},
      {label:tr('Scene Panel', 'Pannello scena'), icon:'▤', action:() => deps.setLeftMode && deps.setLeftMode('scene')},
      {label:tr('Assets Panel', 'Pannello asset'), icon:'▧', action:() => deps.setLeftMode && deps.setLeftMode('assets')},
      {label:tr('Restore Floating Panels', 'Ripristina pannelli flottanti'), icon:'□', action:deps.restoreFloatingPanels},
    ];
  }

  function toolsItems(){
    return [
      {label:tr('Add Object', 'Aggiungi oggetto'), icon:'+', action:e => {
        const at = deps.spawnPointAhead ? deps.spawnPointAhead() : null;
        openMenu(deps.addMenuItems ? deps.addMenuItems(at) : [], e && e.clientX || 80, e && e.clientY || 70);
      }},
      {label:'Level Logic', icon:'◇', action:command('logic.open-level-logic')},
      {label:'Logic Profiler', icon:'▧', action:command('logic.open-profiler', openProfilerPanel)},
      {label:'Cinema Studio', icon:'▤', action:() => deps.openCinemaTimeline && deps.openCinemaTimeline(deps.ED && deps.ED.selected)},
      {label:tr('Editor Settings', 'Impostazioni editor'), icon:'⚙', action:deps.openSettings},
    ];
  }

	  function pluginItems(){
	    const items = [
	      {label:tr('Plugin Manager', 'Gestione plugin'), icon:'▧', action:openPluginPanel},
	      {label:tr('Logic Profiler', 'Profiler Logic'), icon:'▧', action:command('logic.open-profiler', openProfilerPanel)},
	    ];
	    return items;
	  }

	  function withPluginItems(menuId, items){
	    const extra = pluginManager && pluginManager.extensions ? pluginManager.extensions('menu:' + menuId) : [];
	    return extra.length ? items.concat([{sep:true}], extra) : items;
	  }

  const menus = {
    file:fileItems,
    edit:editItems,
    view:viewItems,
    tools:toolsItems,
    plugins:pluginItems,
  };

  root.querySelectorAll('[data-app-menu]').forEach(button => {
    button.addEventListener('click', e => {
      const name = button.dataset.appMenu;
	      const builder = menus[name];
	      if(!builder) return;
	      const rect = button.getBoundingClientRect();
	      openMenu(withPluginItems(name, builder()), rect.left, rect.bottom + 2);
	      e.preventDefault();
	    });
	  });

  const close = root.querySelector('#lkPluginClose');
  if(close) close.addEventListener('click', closePluginPanel);
  const profilerClose = root.querySelector('#lkLogicProfilerClose');
  if(profilerClose) profilerClose.addEventListener('click', closeProfilerPanel);
  const profilerRefresh = root.querySelector('#lkLogicProfilerRefresh');
  if(profilerRefresh) profilerRefresh.addEventListener('click', renderProfiler);

  return Object.freeze({openPluginPanel, closePluginPanel, renderPlugins, openProfilerPanel, closeProfilerPanel, renderProfiler});
}

window.LK_EDITOR_MENU_BAR = Object.freeze({create});
})();
