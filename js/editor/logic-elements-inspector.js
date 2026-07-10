/* =========================================================
   LOT KING - Logic Element inspector
   Visual graph editor + validation, backed by the shared registry.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const GAME = deps.GAME;
  const STORE = deps.STORE;
  const ED = deps.ED;
  const el = deps.el;
  const section = deps.section;
  const btnRow = deps.btnRow;
  const checkRow = deps.checkRow;
  const markDirty = deps.markDirty || function(){};
  const refreshOutliner = deps.refreshOutliner || function(){};
  const status = deps.status || function(){};
  const assetLibraryLoad = deps.assetLibraryLoad || function(){ return []; };
  const promptEditorAction = deps.promptEditorAction || function(opts){
    return Promise.resolve(window.prompt((opts && opts.message) || 'Name:', (opts && opts.value) || ''));
  };
  const refreshAssetsPanel = deps.refreshAssetsPanel || function(){};
  const confirmEditorAction = deps.confirmEditorAction || function(opts){
    return Promise.resolve(window.confirm((opts && opts.message) || 'Confirm?'));
  };
  const rebuildInspector = deps.buildInspector || function(){};
  const beginTransformHistory = deps.beginTransformHistory || function(){};
  const commitTransformHistory = deps.commitTransformHistory || function(){};
  const tr = (en, it) => GAME && GAME.i18n && GAME.i18n.lang === 'it' ? (it || en) : en;
  let logicWindowState = null;

  function registry(){
    return window.LK_LOGIC_NODES_MVP ? window.LK_LOGIC_NODES_MVP.createRegistry() : null;
  }

  function validate(graph){
    const reg = registry();
    if(!reg || !window.LK_LOGIC_VALIDATOR) return {ok:false, errors:[{message:'Logic registry unavailable'}]};
    return window.LK_LOGIC_VALIDATOR.validateGraph(graph, reg);
  }

  function defaultGraph(name, scope){
    return window.LK_LOGIC_GRAPH
      ? window.LK_LOGIC_GRAPH.createStarterGraph(name, scope)
      : {version:1, name, scope, enabled:true, variables:[], nodes:[], edges:[]};
  }

  function buildGraphEditor(box, opts){
    opts = opts || {};
    const scope = opts.scope || 'element';
    const title = scope === 'level' ? 'LEVEL LOGIC' : 'LOGIC ELEMENT';
    let graph = opts.graph || defaultGraph(opts.name || title, scope);
    graph = window.LK_LOGIC_GRAPH.normalizeGraph(graph, opts.name || title, scope);

    function saveGraph(nextGraph){
      graph = window.LK_LOGIC_GRAPH.normalizeGraph(nextGraph, opts.name || title, scope);
      if(scope === 'level'){
        if(STORE.setLevelLogicGraph) STORE.setLevelLogicGraph(graph);
      } else if(opts.object && !opts.onSave){
        opts.object.userData.logicGraph = graph;
        if(opts.object.userData.addedEntry) opts.object.userData.addedEntry.graph = window.LK_LOGIC_GRAPH.clone(graph);
      }
      if(opts.onSave) opts.onSave(graph);
      markDirty();
      refreshOutliner();
    }

    buildVisualGraphEditor(box, {
      title,
      scope,
      graph,
      object: opts.object,
      saveGraph,
    });
  }

  function categoryClass(category){
    const key = String(category || '').toLowerCase();
    if(key.indexOf('event') >= 0) return 'event';
    if(key.indexOf('flow') >= 0) return 'flow';
    if(key.indexOf('scene') >= 0) return 'scene';
    if(key.indexOf('debug') >= 0) return 'debug';
    if(key.indexOf('math') >= 0) return 'math';
    if(key.indexOf('variable') >= 0) return 'variable';
    return 'generic';
  }

  function subgraphForCallNode(graph, node){
    if(!graph || !node || node.type !== 'flow.callSubgraph') return null;
    const ref = String(node.data && node.data.subgraph || '').toLowerCase();
    if(!ref) return null;
    return (graph.subgraphs || []).find(sg => sg && (String(sg.id).toLowerCase() === ref || String(sg.name).toLowerCase() === ref)) || null;
  }

  function pinList(def, direction, graph, node){
    const base = ((direction === 'output' ? def.outputs : def.inputs) || []).slice();
    const sg = subgraphForCallNode(graph, node);
    if(!sg) return base;
    if(direction === 'input'){
      (sg.inputs || []).forEach(port => {
        if(!port || !port.name || base.some(pin => pin.name === port.name)) return;
        base.push({name:String(port.name), kind:'data', direction:'input', type:String(port.type || 'any'), defaultValue:null});
      });
    } else {
      (sg.outputs || []).forEach(port => {
        if(!port || !port.name || base.some(pin => pin.name === port.name)) return;
        base.push({name:String(port.name), kind:'data', direction:'output', type:String(port.type || 'any')});
      });
    }
    return base;
  }

  function edgeId(){
    return 'edge_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  function nodeId(type){
    return type.replace(/[^a-z0-9]+/gi, '_') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5);
  }

  function defaultNodeData(def){
    const data = {};
    (def.inputs || []).forEach(pin => {
      if(pin.kind === 'data' && pin.defaultValue !== undefined) data[pin.name] = window.LK_LOGIC_GRAPH.clone(pin.defaultValue);
    });
    return data;
  }

  function dataInputValue(node, pin){
    if(node.data && Object.prototype.hasOwnProperty.call(node.data, pin.name)) return node.data[pin.name];
    return pin.defaultValue;
  }

  function setNodeData(graph, node, pin, value){
    node.data = Object.assign({}, node.data || {});
    if(pin.type === 'number') node.data[pin.name] = Number(value) || 0;
    else if(pin.type === 'boolean') node.data[pin.name] = value === true || value === 'true';
    else if(pin.type === 'vector3') node.data[pin.name] = Array.isArray(value) ? value.map(v => Number(v) || 0) : [0,0,0];
    else node.data[pin.name] = value;
  }

  function isDataInputConnected(graph, node, pinName){
    return graph.edges.some(edge => edge.to.node === node.id && edge.to.pin === pinName);
  }

  function pinMeta(reg, graph, nodeIdValue, pinName, direction){
    const node = graph.nodes.find(item => item.id === nodeIdValue);
    const def = node && reg && reg.get(node.type);
    const pins = def ? pinList(def, direction, graph, node) : [];
    return pins.find(pin => pin.name === pinName) || null;
  }

  function canConnect(reg, graph, from, to){
    if(!from || !to || from.node === to.node) return false;
    const fromPin = pinMeta(reg, graph, from.node, from.pin, 'output');
    const toPin = pinMeta(reg, graph, to.node, to.pin, 'input');
    if(!fromPin || !toPin || fromPin.kind !== toPin.kind) return false;
    if(fromPin.kind === 'data' && graph.edges.some(edge => edge.to.node === to.node && edge.to.pin === to.pin)) return false;
    if(fromPin.kind === 'data' && fromPin.type !== 'any' && toPin.type !== 'any' && fromPin.type !== toPin.type){
      const a = String(fromPin.type || '').toLowerCase();
      const b = String(toPin.type || '').toLowerCase();
      if(!((a === 'string' && b === 'assetref') || (a === 'assetref' && b === 'string'))) return false;
    }
    return true;
  }

  function pinColor(pin){
    if(!pin) return '#75c7ff';
    if(pin.kind === 'exec') return '#ff7ac8';
    const type = String(pin.type || 'any').toLowerCase();
    if(type === 'number') return '#facc15';
    if(type === 'boolean') return '#4ade80';
    if(type === 'string') return '#38bdf8';
    if(type === 'assetref') return '#22d3ee';
    if(type === 'vector3') return '#a78bfa';
    if(type === 'object3d' || type === 'physicsbody' || type === 'material' || type === 'texture') return '#fb923c';
    if(type === 'array') return '#2dd4bf';
    return '#75c7ff';
  }

  function pinAcceptsMultiple(pin){
    return !!(pin && pin.kind === 'data' && String(pin.type || 'any').toLowerCase() === 'any');
  }

  function wirePath(a, b){
    const dx = Math.max(60, Math.abs(b.x - a.x) * .45);
    return 'M ' + a.x + ' ' + a.y + ' C ' + (a.x + dx) + ' ' + a.y + ', ' + (b.x - dx) + ' ' + b.y + ', ' + b.x + ' ' + b.y;
  }

  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;',
    })[ch]);
  }

  function buildVisualGraphEditor(box, opts){
    const reg = registry();
    const rootGraph = opts.graph;
    let graph = rootGraph;
    let activeGraphKey = 'main';
    let selectedOut = null;
    let runtime = null;
    let raf = 0;
    let last = 0;
    let activeTab = 'graph';
    let viewportTool = 'move';
    let viewportSpace = 'world';
    let viewportSnap = false;
    let selection = {kind:'graph'};
    let graphClipboard = null;
    let suppressPinClick = false;
    let lastGraphSnapshot = null;
    const undoStack = [];
    const redoStack = [];
    const root = document.createElement('div');
    root.className = 'lk-logic-graph-ui lk-le-editor';
    root.innerHTML =
      '<div class="lk-lg-top">' +
        '<div class="lk-lg-brand"><span>◇</span><b>Logic Element</b></div>' +
        '<div class="lk-le-tabs"><button class="on" type="button" data-tab="graph">Graph</button><button type="button" data-tab="viewport">Viewport</button></div>' +
        '<select class="lk-lg-graph-select"><option>Main Graph</option></select>' +
        '<div class="lk-lg-viewtools"><button class="lk-lg-zoom-out" type="button" title="Zoom out">-</button><button class="lk-lg-zoom-label" type="button" title="Reset zoom">100%</button><button class="lk-lg-zoom-in" type="button" title="Zoom in">+</button><button class="lk-lg-fit" type="button" title="Fit graph">Fit</button><button class="lk-lg-add-comment" type="button" title="Add comment box">Comment</button></div>' +
        '<button class="lk-lg-run" type="button">▶ Run</button>' +
        '<button class="lk-lg-stop" type="button">■ Stop</button>' +
        '<span class="lk-lg-status"></span>' +
      '</div>' +
      '<div class="lk-le-main">' +
        '<aside class="lk-le-left">' +
          '<div class="lk-le-block lk-le-hierarchy-block"><div class="lk-le-block-head"><b>Hierarchy</b><button class="lk-le-add-element" type="button" title="Add element">+</button></div><div class="lk-le-components-list"></div></div>' +
          '<div class="lk-le-block lk-le-subgraphs-block"><div class="lk-le-block-head"><b>Functions</b><button class="lk-lg-add-subgraph" type="button" title="Add function">+</button></div><div class="lk-lg-subgraphs-list"></div></div>' +
          '<div class="lk-le-block lk-le-palette-block"><div class="lk-le-block-head"><b>Nodes</b></div><input class="lk-lg-search" type="search" placeholder="Search nodes..."><div class="lk-lg-palette-list"></div></div>' +
          '<div class="lk-le-block lk-le-vars-block"><div class="lk-le-block-head"><b>Variables</b><button class="lk-lg-add-var" type="button">+</button></div><div class="lk-lg-vars-list"></div></div>' +
        '</aside>' +
        '<section class="lk-le-stage">' +
          '<div class="lk-le-panel on" data-panel="graph"><div class="lk-lg-canvas-wrap"><svg class="lk-lg-wires"></svg><div class="lk-lg-canvas"></div><div class="lk-lg-selection-box"></div><div class="lk-lg-context-menu"></div><div class="lk-lg-minimap"></div></div></div>' +
          '<div class="lk-le-panel" data-panel="viewport"><div class="lk-le-viewport"><div class="lk-le-viewport-mount"></div><div class="lk-le-viewport-tools"><button class="on" type="button" data-viewport-tool="move" title="Move (W)">↔</button><button type="button" data-viewport-tool="rotate" title="Rotate (E)">⟳</button><button type="button" data-viewport-tool="scale" title="Scale (R)">□</button><span class="lk-le-viewport-tool-divider"></span><button type="button" data-viewport-space title="Transform space: World">W</button><button type="button" data-viewport-snap title="Toggle transform snap">◎</button><button type="button" data-viewport-focus title="Frame selected">⌖</button></div><div class="lk-le-viewport-card"><b>Viewport</b><span>Select an element in the hierarchy.</span></div></div></div>' +
        '</section>' +
        '<aside class="lk-le-right"><div class="lk-le-inspector"></div></aside>' +
      '</div>';
    box.appendChild(root);
    const palette = root.querySelector('.lk-lg-palette-list');
    const search = root.querySelector('.lk-lg-search');
    const canvas = root.querySelector('.lk-lg-canvas');
    const wires = root.querySelector('.lk-lg-wires');
    const canvasWrap = root.querySelector('.lk-lg-canvas-wrap');
    const selectionBox = root.querySelector('.lk-lg-selection-box');
    const contextMenu = root.querySelector('.lk-lg-context-menu');
    const miniMap = root.querySelector('.lk-lg-minimap');
    const zoomLabel = root.querySelector('.lk-lg-zoom-label');
    const graphSelect = root.querySelector('.lk-lg-graph-select');
    const statusEl = root.querySelector('.lk-lg-status');
    const varsList = root.querySelector('.lk-lg-vars-list');
    const subgraphsList = root.querySelector('.lk-lg-subgraphs-list');
    const componentsList = root.querySelector('.lk-le-components-list');
    const inspector = root.querySelector('.lk-le-inspector');
    const viewportCard = root.querySelector('.lk-le-viewport-card');
    const viewportMount = root.querySelector('.lk-le-viewport-mount');
    const viewportToolButtons = Array.from(root.querySelectorAll('[data-viewport-tool]'));
    const viewportSpaceButton = root.querySelector('[data-viewport-space]');
    const viewportSnapButton = root.querySelector('[data-viewport-snap]');
    let viewport = null;
    let spaceDown = false;
    const graphView = {x:80, y:60, zoom:1};
    canvasWrap.tabIndex = 0;
    if(!Array.isArray(graph.comments)) graph.comments = [];
    lastGraphSnapshot = graphSnapshot();

    function syncStatus(saved){
      const checked = validate(graph);
      const warningCount = (checked.warnings || []).length;
      statusEl.textContent = checked.ok
        ? ((saved ? 'Saved' : 'Ready') + ' · valid' + (warningCount ? ' · ' + warningCount + ' warnings' : ''))
        : ('Errors: ' + checked.errors.length + (warningCount ? ' · warnings: ' + warningCount : ''));
      statusEl.classList.toggle('bad', !checked.ok);
      statusEl.classList.toggle('warn', checked.ok && warningCount > 0);
      refreshNodeDiagnostics(checked);
    }

    function graphSnapshot(){
      return window.LK_LOGIC_GRAPH.clone(graph);
    }

    function snapshotKey(value){
      try { return JSON.stringify(value || {}); }
      catch(err){ return ''; }
    }

    function restoreGraph(snapshot){
      Object.keys(graph).forEach(key => { delete graph[key]; });
      Object.assign(graph, window.LK_LOGIC_GRAPH.clone(snapshot));
      if(!Array.isArray(graph.comments)) graph.comments = [];
    }

    function persist(options){
      options = options || {};
      const currentSnapshot = graphSnapshot();
      if(options.history !== false && lastGraphSnapshot && snapshotKey(lastGraphSnapshot) !== snapshotKey(currentSnapshot)){
        undoStack.push(lastGraphSnapshot);
        if(undoStack.length > 80) undoStack.shift();
        redoStack.length = 0;
      }
      lastGraphSnapshot = graphSnapshot();
      opts.saveGraph(rootGraph);
      syncScenePreviewObject();
      drawEdges();
      syncStatus(true);
    }

    function refreshGraphEditorAfterRestore(){
      renderGraphSelect();
      renderComponents();
      renderSubgraphs();
      renderVariables();
      renderNodes();
      renderInspector();
      syncScenePreviewObject();
      drawEdges();
      syncStatus(true);
    }

    function activeSubgraph(){
      if(activeGraphKey.indexOf('subgraph:') !== 0) return null;
      return subgraphById(activeGraphKey.slice('subgraph:'.length));
    }

    function graphDisplayName(){
      const sg = activeSubgraph();
      return sg ? ('Function: ' + (sg.name || sg.id)) : 'Main Graph';
    }

    function renderGraphSelect(){
      if(!graphSelect) return;
      const previous = activeGraphKey;
      graphSelect.innerHTML = '';
      const main = document.createElement('option');
      main.value = 'main';
      main.textContent = 'Main Graph';
      graphSelect.appendChild(main);
      ensureSubgraphs().forEach(sg => {
        const opt = document.createElement('option');
        opt.value = 'subgraph:' + sg.id;
        opt.textContent = (sg.macro === true ? 'Macro · ' : 'Function · ') + (sg.name || sg.id);
        graphSelect.appendChild(opt);
      });
      graphSelect.value = previous;
      if(graphSelect.value !== previous) graphSelect.value = 'main';
    }

    function setActiveGraph(key){
      const nextKey = key && key !== 'main' ? String(key) : 'main';
      let nextGraph = rootGraph;
      if(nextKey.indexOf('subgraph:') === 0){
        const sg = subgraphById(nextKey.slice('subgraph:'.length));
        if(!sg) return setActiveGraph('main');
        nextGraph = sg;
      }
      if(runtime) stopRuntime();
      activeGraphKey = nextKey;
      graph = nextGraph;
      if(!Array.isArray(graph.nodes)) graph.nodes = [];
      if(!Array.isArray(graph.edges)) graph.edges = [];
      if(!Array.isArray(graph.comments)) graph.comments = [];
      selectedOut = null;
      graphClipboard = null;
      undoStack.length = 0;
      redoStack.length = 0;
      lastGraphSnapshot = graphSnapshot();
      renderGraphSelect();
      renderVariables();
      renderSubgraphs();
      setSelection({kind:'graph'});
      renderNodes();
      applyGraphView();
      syncStatus(false);
    }

    function undoGraph(){
      if(!undoStack.length) return;
      redoStack.push(graphSnapshot());
      const previous = undoStack.pop();
      restoreGraph(previous);
      lastGraphSnapshot = graphSnapshot();
      opts.saveGraph(rootGraph);
      setSelection({kind:'graph'});
      refreshGraphEditorAfterRestore();
      statusEl.textContent = 'Undo';
      statusEl.classList.remove('bad');
    }

    function redoGraph(){
      if(!redoStack.length) return;
      undoStack.push(graphSnapshot());
      const next = redoStack.pop();
      restoreGraph(next);
      lastGraphSnapshot = graphSnapshot();
      opts.saveGraph(rootGraph);
      setSelection({kind:'graph'});
      refreshGraphEditorAfterRestore();
      statusEl.textContent = 'Redo';
      statusEl.classList.remove('bad');
    }

    function isFormTarget(target){
      return !!(target && target.closest && target.closest('input, textarea, select, button'));
    }

    function clampZoom(value){
      return Math.max(.35, Math.min(2, Number(value) || 1));
    }

    function applyGraphView(){
      graphView.zoom = clampZoom(graphView.zoom);
      const transform = 'translate(' + graphView.x + 'px,' + graphView.y + 'px) scale(' + graphView.zoom + ')';
      canvas.style.transformOrigin = '0 0';
      wires.style.transformOrigin = '0 0';
      canvas.style.transform = transform;
      wires.style.transform = transform;
      canvasWrap.style.backgroundSize = Math.max(6, 20 * graphView.zoom) + 'px ' + Math.max(6, 20 * graphView.zoom) + 'px';
      canvasWrap.style.backgroundPosition = graphView.x + 'px ' + graphView.y + 'px';
      if(zoomLabel) zoomLabel.textContent = Math.round(graphView.zoom * 100) + '%';
      drawEdges();
      renderMiniMap();
    }

    function screenToGraph(clientX, clientY){
      const rect = canvasWrap.getBoundingClientRect();
      return {
        x:(clientX - rect.left - graphView.x) / graphView.zoom,
        y:(clientY - rect.top - graphView.y) / graphView.zoom,
      };
    }

    function graphCenter(){
      const rect = canvasWrap.getBoundingClientRect();
      return screenToGraph(rect.left + rect.width * .45, rect.top + rect.height * .36);
    }

    function setGraphZoom(nextZoom, origin){
      const before = origin || graphCenter();
      const rect = canvasWrap.getBoundingClientRect();
      const screenX = rect.left + graphView.x + before.x * graphView.zoom;
      const screenY = rect.top + graphView.y + before.y * graphView.zoom;
      graphView.zoom = clampZoom(nextZoom);
      graphView.x = screenX - rect.left - before.x * graphView.zoom;
      graphView.y = screenY - rect.top - before.y * graphView.zoom;
      applyGraphView();
    }

    function fitBoxes(boxes){
      if(!boxes.length){
        graphView.x = 80;
        graphView.y = 60;
        graphView.zoom = 1;
        applyGraphView();
        return;
      }
      const minX = Math.min.apply(null, boxes.map(box => box.x));
      const minY = Math.min.apply(null, boxes.map(box => box.y));
      const maxX = Math.max.apply(null, boxes.map(box => box.x + box.w));
      const maxY = Math.max.apply(null, boxes.map(box => box.y + box.h));
      const rect = canvasWrap.getBoundingClientRect();
      const padding = 80;
      graphView.zoom = clampZoom(Math.min((rect.width - padding) / Math.max(1, maxX - minX), (rect.height - padding) / Math.max(1, maxY - minY)));
      graphView.x = (rect.width - (maxX - minX) * graphView.zoom) / 2 - minX * graphView.zoom;
      graphView.y = (rect.height - (maxY - minY) * graphView.zoom) / 2 - minY * graphView.zoom;
      applyGraphView();
    }

    function fitGraph(){
      fitBoxes(graph.nodes.map(nodeRect).concat((graph.comments || []).map(commentRect)));
    }

    function graphBounds(){
      const boxes = graph.nodes.map(nodeRect).concat((graph.comments || []).map(commentRect));
      if(!boxes.length) return {x:0, y:0, w:1000, h:700};
      const minX = Math.min.apply(null, boxes.map(box => box.x)) - 160;
      const minY = Math.min.apply(null, boxes.map(box => box.y)) - 140;
      const maxX = Math.max.apply(null, boxes.map(box => box.x + box.w)) + 160;
      const maxY = Math.max.apply(null, boxes.map(box => box.y + box.h)) + 140;
      return {x:minX, y:minY, w:Math.max(1, maxX - minX), h:Math.max(1, maxY - minY)};
    }

    function renderMiniMap(){
      if(!miniMap) return;
      const bounds = graphBounds();
      const w = 164;
      const h = 104;
      const scale = Math.min(w / bounds.w, h / bounds.h);
      const ox = (w - bounds.w * scale) / 2;
      const oy = (h - bounds.h * scale) / 2;
      miniMap.innerHTML = '';
      const map = document.createElement('div');
      map.className = 'lk-lg-minimap-map';
      map.style.width = w + 'px';
      map.style.height = h + 'px';
      const place = (box, className) => {
        const item = document.createElement('div');
        item.className = className;
        item.style.left = (ox + (box.x - bounds.x) * scale) + 'px';
        item.style.top = (oy + (box.y - bounds.y) * scale) + 'px';
        item.style.width = Math.max(3, box.w * scale) + 'px';
        item.style.height = Math.max(3, box.h * scale) + 'px';
        map.appendChild(item);
      };
      (graph.comments || []).forEach(comment => place(commentRect(comment), 'lk-lg-minimap-comment'));
      graph.nodes.forEach(node => place(nodeRect(node), 'lk-lg-minimap-node'));
      const rect = canvasWrap.getBoundingClientRect();
      const view = {
        x:-graphView.x / graphView.zoom,
        y:-graphView.y / graphView.zoom,
        w:rect.width / graphView.zoom,
        h:rect.height / graphView.zoom,
      };
      place(view, 'lk-lg-minimap-view');
      miniMap.appendChild(map);
      miniMap.dataset.bounds = JSON.stringify(bounds);
    }

    function centerGraphViewOn(point){
      const rect = canvasWrap.getBoundingClientRect();
      graphView.x = rect.width / 2 - point.x * graphView.zoom;
      graphView.y = rect.height / 2 - point.y * graphView.zoom;
      applyGraphView();
    }

    function fitSelection(){
      const nodeIds = selectedNodeIdSet();
      const commentIds = selectedCommentIdSet();
      const boxes = graph.nodes.filter(node => nodeIds.has(node.id)).map(nodeRect)
        .concat((graph.comments || []).filter(comment => commentIds.has(comment.id)).map(commentRect));
      if(boxes.length) fitBoxes(boxes);
      else fitGraph();
    }

    function selectedNodeIdSet(){
      if(selection.kind === 'node') return new Set([selection.id]);
      if(selection.kind === 'nodes') return new Set(selection.ids || []);
      if(selection.kind === 'mixed') return new Set(selection.nodeIds || []);
      return new Set();
    }

    function selectedCommentIdSet(){
      if(selection.kind === 'comment') return new Set([selection.id]);
      if(selection.kind === 'comments') return new Set(selection.ids || []);
      if(selection.kind === 'mixed') return new Set(selection.commentIds || []);
      return new Set();
    }

    function isNodeSelected(node){
      return selectedNodeIdSet().has(node.id);
    }

    function isCommentSelected(comment){
      return selectedCommentIdSet().has(comment.id);
    }

    function setGraphSelection(nodeIds, commentIds){
      const cleanNodes = Array.from(new Set(nodeIds || [])).filter(id => graph.nodes.some(node => node.id === id));
      const cleanComments = Array.from(new Set(commentIds || [])).filter(id => (graph.comments || []).some(comment => comment.id === id));
      if(cleanNodes.length && cleanComments.length) return setSelection({kind:'mixed', nodeIds:cleanNodes, commentIds:cleanComments});
      if(cleanNodes.length) return setSelection(cleanNodes.length === 1 ? {kind:'node', id:cleanNodes[0]} : {kind:'nodes', ids:cleanNodes});
      if(cleanComments.length) return setSelection(cleanComments.length === 1 ? {kind:'comment', id:cleanComments[0]} : {kind:'comments', ids:cleanComments});
      return setSelection({kind:'graph'});
    }

    function setNodeSelection(ids){
      setGraphSelection(ids, []);
    }

    function toggleNodeSelection(id){
      const current = selectedNodeIdSet();
      if(current.has(id)) current.delete(id);
      else current.add(id);
      setGraphSelection(Array.from(current), Array.from(selectedCommentIdSet()));
    }

    function setCommentSelection(ids){
      setGraphSelection([], ids);
    }

    function toggleCommentSelection(id){
      const current = selectedCommentIdSet();
      if(current.has(id)) current.delete(id);
      else current.add(id);
      setGraphSelection(Array.from(selectedNodeIdSet()), Array.from(current));
    }

    function deleteGraphItemsNow(nodeIds, commentIds){
      const nodes = new Set(nodeIds || []);
      const comments = new Set(commentIds || []);
      if(!nodes.size && !comments.size) return;
      graph.nodes = graph.nodes.filter(node => !nodes.has(node.id));
      graph.edges = graph.edges.filter(edge => !nodes.has(edge.from.node) && !nodes.has(edge.to.node));
      graph.comments = (graph.comments || []).filter(comment => !comments.has(comment.id));
      persist();
      setSelection({kind:'graph'});
    }

    function deleteGraphItems(nodeIds, commentIds){
      nodeIds = nodeIds || [];
      commentIds = commentIds || [];
      const total = nodeIds.length + commentIds.length;
      if(!total) return Promise.resolve(false);
      deleteGraphItemsNow(nodeIds, commentIds);
      return Promise.resolve(true);
    }

    function deleteCurrentSelection(){
      return deleteGraphItems(Array.from(selectedNodeIdSet()), Array.from(selectedCommentIdSet()));
    }

    function selectedGraphPayload(){
      const nodeIds = selectedNodeIdSet();
      const commentIds = selectedCommentIdSet();
      const nodes = graph.nodes.filter(node => nodeIds.has(node.id)).map(node => window.LK_LOGIC_GRAPH.clone(node));
      const comments = (graph.comments || []).filter(comment => commentIds.has(comment.id)).map(comment => window.LK_LOGIC_GRAPH.clone(comment));
      const nodeIdList = new Set(nodes.map(node => node.id));
      const edges = graph.edges
        .filter(edge => nodeIdList.has(edge.from.node) && nodeIdList.has(edge.to.node))
        .map(edge => window.LK_LOGIC_GRAPH.clone(edge));
      return {nodes, comments, edges};
    }

    function hasGraphPayload(payload){
      return !!(payload && ((payload.nodes && payload.nodes.length) || (payload.comments && payload.comments.length)));
    }

    function copySelection(){
      const payload = selectedGraphPayload();
      if(!hasGraphPayload(payload)) return false;
      graphClipboard = payload;
      statusEl.textContent = 'Copied selection';
      statusEl.classList.remove('bad');
      return true;
    }

    function pasteGraphPayload(payload, offset){
      if(!hasGraphPayload(payload)) return;
      offset = offset || {x:32, y:32};
      const idMap = new Map();
      const newNodeIds = [];
      const newCommentIds = [];
      (payload.nodes || []).forEach(source => {
        const next = window.LK_LOGIC_GRAPH.clone(source);
        next.id = nodeId(next.type || 'node');
        next.x = Math.round((Number(source.x) || 0) + offset.x);
        next.y = Math.round((Number(source.y) || 0) + offset.y);
        idMap.set(source.id, next.id);
        newNodeIds.push(next.id);
        graph.nodes.push(next);
      });
      (payload.comments || []).forEach(source => {
        const next = window.LK_LOGIC_GRAPH.clone(source);
        next.id = sceneId('comment');
        next.title = source.title || 'Comment';
        next.x = Math.round((Number(source.x) || 0) + offset.x);
        next.y = Math.round((Number(source.y) || 0) + offset.y);
        newCommentIds.push(next.id);
        graph.comments.push(next);
      });
      (payload.edges || []).forEach(source => {
        if(!idMap.has(source.from.node) || !idMap.has(source.to.node)) return;
        graph.edges.push({
          id:edgeId(),
          from:{node:idMap.get(source.from.node), pin:source.from.pin},
          to:{node:idMap.get(source.to.node), pin:source.to.pin},
        });
      });
      persist();
      setGraphSelection(newNodeIds, newCommentIds);
      renderNodes();
    }

    function duplicateSelection(){
      const payload = selectedGraphPayload();
      if(!hasGraphPayload(payload)) return;
      pasteGraphPayload(payload, {x:36, y:36});
      graphClipboard = payload;
      statusEl.textContent = 'Duplicated selection';
    }

    function pasteSelection(){
      if(!hasGraphPayload(graphClipboard)) return;
      pasteGraphPayload(graphClipboard, {x:42, y:42});
      graphClipboard = selectedGraphPayload();
      statusEl.textContent = 'Pasted selection';
    }

    function setActiveTab(tab){
      activeTab = tab === 'viewport' ? 'viewport' : 'graph';
      root.querySelectorAll('.lk-le-tabs button').forEach(btn => btn.classList.toggle('on', btn.dataset.tab === activeTab));
      root.querySelectorAll('.lk-le-panel').forEach(panel => panel.classList.toggle('on', panel.dataset.panel === activeTab));
      if(activeTab === 'graph') requestAnimationFrame(drawEdges);
      if(activeTab === 'viewport') {
        initViewport3D();
        requestAnimationFrame(syncViewport3D);
      }
      renderInspector();
    }

    function setSelection(next){
      selection = next || {kind:'graph'};
      renderNodes();
      renderSubgraphs();
      renderVariables();
      renderComponents();
      renderInspector();
      if(activeTab === 'viewport') requestAnimationFrame(syncViewport3D);
    }

    function addNodeFromType(type, data, x, y){
      const def = reg && reg.get(type);
      if(!def) return null;
      const p = graphCenter();
      const node = {
        id: nodeId(def.type),
        type: def.type,
        x: x == null ? Math.round(p.x + graph.nodes.length * 24) : x,
        y: y == null ? Math.round(p.y + graph.nodes.length * 18) : y,
        data: Object.assign(defaultNodeData(def), data || {}),
      };
      graph.nodes.push(node);
      persist();
      setActiveTab('graph');
      setSelection({kind:'node', id:node.id});
      return node;
    }

    function addNode(def, x, y){
      addNodeFromType(def.type, null, x, y);
    }

    function compatibleInputForSelectedOutput(def){
      if(!selectedOut) return null;
      const outPin = pinMeta(reg, graph, selectedOut.node, selectedOut.pin, 'output');
      if(!outPin) return null;
      return pinList(def, 'input', graph, null).find(input => {
        if(input.kind !== outPin.kind) return false;
        if(input.kind === 'exec') return true;
        return outPin.type === 'any' || input.type === 'any' || outPin.type === input.type;
      }) || null;
    }

    function addNodeFromMenu(def, point){
      const node = addNodeFromType(def.type, null, Math.round(point.x), Math.round(point.y));
      const compatibleInput = node && compatibleInputForSelectedOutput(def);
      if(node && selectedOut && compatibleInput){
        const target = {node:node.id, pin:compatibleInput.name};
        graph.edges = graph.edges.filter(edge => !(compatibleInput.kind === 'data' && edge.to.node === target.node && edge.to.pin === target.pin));
        graph.edges.push({id:edgeId(), from:selectedOut, to:target});
        selectedOut = null;
        persist();
        renderNodes();
      }
      hideContextMenu();
      return node;
    }

    function defsForContextMenu(query){
      if(!reg) return [];
      const q = String(query || '').toLowerCase();
      return reg.list().filter(def => {
        if(selectedOut && !compatibleInputForSelectedOutput(def)) return false;
        return !q || def.title.toLowerCase().includes(q) || def.type.toLowerCase().includes(q) || String(def.category || '').toLowerCase().includes(q);
      });
    }

    function hideContextMenu(){
      if(!contextMenu) return;
      contextMenu.classList.remove('on');
      contextMenu.innerHTML = '';
    }

    function showContextMenu(clientX, clientY, point){
      if(!contextMenu) return;
      const wrapRect = canvasWrap.getBoundingClientRect();
      contextMenu.innerHTML = '';
      contextMenu.classList.add('on');
      contextMenu.style.left = Math.min(Math.max(8, clientX - wrapRect.left), Math.max(8, wrapRect.width - 286)) + 'px';
      contextMenu.style.top = Math.min(Math.max(8, clientY - wrapRect.top), Math.max(8, wrapRect.height - 380)) + 'px';
      const input = document.createElement('input');
      input.type = 'search';
      input.placeholder = selectedOut ? 'Search compatible nodes...' : 'Search nodes...';
      const list = document.createElement('div');
      list.className = 'lk-lg-context-list';
      const render = () => {
        list.innerHTML = '';
        const defs = defsForContextMenu(input.value);
        if(!defs.length){
          const empty = document.createElement('div');
          empty.className = 'lk-lg-context-empty';
          empty.textContent = 'No compatible nodes';
          list.appendChild(empty);
          return;
        }
        defs.slice(0, 80).forEach(def => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = categoryClass(def.category);
          btn.innerHTML = '<b></b><span></span>';
          btn.querySelector('b').textContent = def.title;
          btn.querySelector('span').textContent = (def.category || 'Node') + ' · ' + def.type;
          btn.addEventListener('click', () => addNodeFromMenu(def, point));
          list.appendChild(btn);
        });
      };
      input.addEventListener('input', render);
      input.addEventListener('keydown', e => {
        if(e.key === 'Escape'){
          hideContextMenu();
          canvasWrap.focus({preventScroll:true});
          e.preventDefault();
          return;
        }
        if(e.key === 'Enter'){
          const first = defsForContextMenu(input.value)[0];
          if(first) addNodeFromMenu(first, point);
          e.preventDefault();
        }
      });
      contextMenu.append(input, list);
      render();
      requestAnimationFrame(() => input.focus({preventScroll:true}));
    }

    function addSidebarReferenceNode(ref, point, event){
      if(!ref || !point) return;
      if(ref.kind === 'variable'){
        addNodeFromType(event && event.shiftKey ? 'variable.set' : 'variable.get', {name:ref.name}, Math.round(point.x), Math.round(point.y));
        return;
      }
      if(ref.kind === 'subgraph'){
        addNodeFromType('flow.callSubgraph', {subgraph:ref.name || ref.id}, Math.round(point.x), Math.round(point.y));
        return;
      }
      if(ref.kind === 'root'){
        addNodeFromType('scene.getOwner', {}, Math.round(point.x), Math.round(point.y));
        return;
      }
      if(ref.kind === 'element'){
        addNodeFromType('scene.getElement', {name:ref.name || ref.id}, Math.round(point.x), Math.round(point.y));
        return;
      }
      if(ref.kind === 'sceneComponent'){
        const element = sceneElementById(ref.elementId || ref.id);
        addNodeFromType('scene.getElement', {name:element ? (element.id === 'root' ? 'Root' : (element.name || element.id)) : (ref.name || ref.id)}, Math.round(point.x), Math.round(point.y));
      }
    }

    function dragPayload(e){
      try { return JSON.parse(e.dataTransfer.getData('application/x-lk-logic-ref') || 'null'); }
      catch(err){ return null; }
    }

    function addCommentBox(){
      const p = graphCenter();
      const comment = {
        id:sceneId('comment'),
        title:'Comment',
        x:Math.round(p.x - 60),
        y:Math.round(p.y - 40),
        w:360,
        h:190,
        color:'#ffd166',
      };
      graph.comments = graph.comments || [];
      graph.comments.push(comment);
      persist();
      renderNodes();
      setSelection({kind:'comment', id:comment.id});
    }

    function defaultVariableValue(type){
      if(type === 'number') return 0;
      if(type === 'boolean') return false;
      if(type === 'vector3') return [0, 0, 0];
      if(type === 'string') return '';
      return null;
    }

    function uniqueVariableName(){
      const used = new Set((graph.variables || []).map(v => v.name));
      let index = graph.variables.length + 1;
      let name = 'variable' + index;
      while(used.has(name)){
        index += 1;
        name = 'variable' + index;
      }
      return name;
    }

    function ensureSubgraphs(){
      if(!Array.isArray(rootGraph.subgraphs)) rootGraph.subgraphs = [];
      rootGraph.subgraphs = rootGraph.subgraphs.filter(item => item && typeof item === 'object');
      return rootGraph.subgraphs;
    }

    function uniqueSubgraphName(){
      const used = new Set(ensureSubgraphs().map(item => String(item.name || item.id || '').toLowerCase()));
      let index = ensureSubgraphs().length + 1;
      let name = 'Function ' + index;
      while(used.has(name.toLowerCase())){
        index += 1;
        name = 'Function ' + index;
      }
      return name;
    }

    function uniqueMacroName(){
      const used = new Set(ensureSubgraphs().map(item => String(item.name || item.id || '').toLowerCase()));
      let index = 1;
      let name = 'Macro ' + index;
      while(used.has(name.toLowerCase())){
        index += 1;
        name = 'Macro ' + index;
      }
      return name;
    }

    function subgraphById(id){
      const wanted = String(id || '');
      return ensureSubgraphs().find(item => item.id === wanted) || null;
    }

    function addSubgraph(){
      const name = uniqueSubgraphName();
      const id = sceneId('subgraph');
      const entry = window.LK_LOGIC_GRAPH.node('entry_' + id, 'event.custom', 80, 80, {eventName:'Entry'});
      const sg = window.LK_LOGIC_GRAPH.subgraph(id, name, [entry], [], []);
      sg.macro = false;
      sg.comments = [{
        id:sceneId('comment'),
        title:name + ' Entry',
        x:40,
        y:40,
        w:300,
        h:140,
        color:'#8b5cf6',
      }];
      ensureSubgraphs().push(sg);
      persist({history:false});
      renderGraphSelect();
      setActiveGraph('subgraph:' + sg.id);
    }

    function createMacroFromSelection(){
      const payload = selectedGraphPayload();
      const nodes = payload.nodes || [];
      if(!nodes.length){
        statusEl.textContent = 'Select nodes to create a macro';
        statusEl.classList.add('bad');
        return;
      }
      const name = uniqueMacroName();
      const id = sceneId('macro');
      const minX = Math.min.apply(null, nodes.map(node => Number(node.x) || 0));
      const minY = Math.min.apply(null, nodes.map(node => Number(node.y) || 0));
      const idMap = new Map();
      const macroNodes = nodes.map(source => {
        const next = window.LK_LOGIC_GRAPH.clone(source);
        next.id = 'macro_' + next.id;
        next.x = Math.round((Number(source.x) || 0) - minX + 240);
        next.y = Math.round((Number(source.y) || 0) - minY + 80);
        idMap.set(source.id, next.id);
        return next;
      });
      const macroEdges = (payload.edges || []).filter(edge => idMap.has(edge.from.node) && idMap.has(edge.to.node)).map(edge => ({
        id:edgeId(),
        from:{node:idMap.get(edge.from.node), pin:edge.from.pin},
        to:{node:idMap.get(edge.to.node), pin:edge.to.pin},
      }));
      const entry = window.LK_LOGIC_GRAPH.node('entry_' + id, 'event.custom', 40, 80, {eventName:'Entry'});
      macroNodes.unshift(entry);
      const firstExec = macroNodes.find(node => node.id !== entry.id && nodeHasExecInput(node));
      if(firstExec) macroEdges.unshift({id:edgeId(), from:{node:entry.id, pin:'then'}, to:{node:firstExec.id, pin:'exec'}});
      const macroComments = (payload.comments || []).map(comment => {
        const next = window.LK_LOGIC_GRAPH.clone(comment);
        next.id = sceneId('comment');
        next.x = Math.round((Number(comment.x) || 0) - minX + 220);
        next.y = Math.round((Number(comment.y) || 0) - minY + 60);
        return next;
      });
      if(!macroComments.length){
        macroComments.push({
          id:sceneId('comment'),
          title:name,
          x:20,
          y:40,
          w:360,
          h:180,
          color:'#22d3ee',
        });
      }
      const sg = window.LK_LOGIC_GRAPH.subgraph(id, name, macroNodes, macroEdges, []);
      sg.macro = true;
      sg.comments = macroComments;
      ensureSubgraphs().push(sg);
      const p = graphCenter();
      const callNode = addNodeFromType('flow.callSubgraph', {subgraph:name}, Math.round(p.x), Math.round(p.y));
      persist();
      renderGraphSelect();
      renderSubgraphs();
      setSelection(callNode ? {kind:'node', id:callNode.id} : {kind:'subgraph', id:sg.id});
      statusEl.textContent = 'Macro created from selection';
      statusEl.classList.remove('bad');
    }

    function pinKindForEdge(edge){
      const fromPin = pinMeta(reg, graph, edge.from.node, edge.from.pin, 'output');
      const toPin = pinMeta(reg, graph, edge.to.node, edge.to.pin, 'input');
      return fromPin && fromPin.kind || toPin && toPin.kind || '';
    }

    function createCallSubgraphNode(name, x, y){
      const def = reg && reg.get('flow.callSubgraph');
      if(!def) return null;
      const node = {
        id:nodeId(def.type),
        type:def.type,
        x:Math.round(x || 0),
        y:Math.round(y || 0),
        data:Object.assign(defaultNodeData(def), {subgraph:name}),
      };
      graph.nodes.push(node);
      return node;
    }

    function collapseSelectionToMacro(){
      const payload = selectedGraphPayload();
      const nodes = payload.nodes || [];
      if(!nodes.length){
        statusEl.textContent = 'Select nodes to collapse into a macro';
        statusEl.classList.add('bad');
        return;
      }
      const selectedIds = new Set(nodes.map(node => node.id));
      const crossing = graph.edges.filter(edge => selectedIds.has(edge.from.node) !== selectedIds.has(edge.to.node));
      const dataCrossing = crossing.filter(edge => pinKindForEdge(edge) !== 'exec');
      if(dataCrossing.length){
        statusEl.textContent = 'Collapse Macro supports exec-only external wires for now';
        statusEl.classList.add('bad');
        return;
      }
      const incomingExec = crossing.filter(edge => !selectedIds.has(edge.from.node) && selectedIds.has(edge.to.node));
      const outgoingExec = crossing.filter(edge => selectedIds.has(edge.from.node) && !selectedIds.has(edge.to.node));
      if(outgoingExec.length > 1){
        statusEl.textContent = 'Collapse Macro supports one external exec output for now';
        statusEl.classList.add('bad');
        return;
      }

      const name = uniqueMacroName();
      const id = sceneId('macro');
      const minX = Math.min.apply(null, nodes.map(node => Number(node.x) || 0));
      const minY = Math.min.apply(null, nodes.map(node => Number(node.y) || 0));
      const idMap = new Map();
      const macroNodes = nodes.map(source => {
        const next = window.LK_LOGIC_GRAPH.clone(source);
        next.id = 'macro_' + next.id;
        next.x = Math.round((Number(source.x) || 0) - minX + 240);
        next.y = Math.round((Number(source.y) || 0) - minY + 80);
        idMap.set(source.id, next.id);
        return next;
      });
      const macroEdges = (payload.edges || []).filter(edge => idMap.has(edge.from.node) && idMap.has(edge.to.node)).map(edge => ({
        id:edgeId(),
        from:{node:idMap.get(edge.from.node), pin:edge.from.pin},
        to:{node:idMap.get(edge.to.node), pin:edge.to.pin},
      }));
      const entry = window.LK_LOGIC_GRAPH.node('entry_' + id, 'event.custom', 40, 80, {eventName:'Entry'});
      macroNodes.unshift(entry);
      const preferredTarget = incomingExec.length ? idMap.get(incomingExec[0].to.node) : '';
      const firstExec = macroNodes.find(node => node.id === preferredTarget && nodeHasExecInput(node))
        || macroNodes.find(node => node.id !== entry.id && nodeHasExecInput(node));
      if(firstExec) macroEdges.unshift({id:edgeId(), from:{node:entry.id, pin:'then'}, to:{node:firstExec.id, pin:'exec'}});
      const macroComments = (payload.comments || []).map(comment => {
        const next = window.LK_LOGIC_GRAPH.clone(comment);
        next.id = sceneId('comment');
        next.x = Math.round((Number(comment.x) || 0) - minX + 220);
        next.y = Math.round((Number(comment.y) || 0) - minY + 60);
        return next;
      });
      if(!macroComments.length){
        macroComments.push({
          id:sceneId('comment'),
          title:name,
          x:20,
          y:40,
          w:360,
          h:180,
          color:'#22d3ee',
        });
      }
      const sg = window.LK_LOGIC_GRAPH.subgraph(id, name, macroNodes, macroEdges, []);
      sg.macro = true;
      sg.comments = macroComments;
      ensureSubgraphs().push(sg);

      const callNode = createCallSubgraphNode(name, minX, minY);
      const commentIds = new Set(selectedCommentIdSet());
      graph.nodes = graph.nodes.filter(node => !selectedIds.has(node.id));
      graph.comments = (graph.comments || []).filter(comment => !commentIds.has(comment.id));
      graph.edges = graph.edges.filter(edge => !selectedIds.has(edge.from.node) && !selectedIds.has(edge.to.node));
      if(callNode){
        incomingExec.forEach(edge => {
          graph.edges.push({id:edgeId(), from:{node:edge.from.node, pin:edge.from.pin}, to:{node:callNode.id, pin:'exec'}});
        });
        outgoingExec.forEach(edge => {
          graph.edges.push({id:edgeId(), from:{node:callNode.id, pin:'completed'}, to:{node:edge.to.node, pin:edge.to.pin}});
        });
      }
      persist();
      renderGraphSelect();
      renderSubgraphs();
      setSelection(callNode ? {kind:'node', id:callNode.id} : {kind:'subgraph', id:sg.id});
      statusEl.textContent = 'Collapsed selection to Macro';
      statusEl.classList.remove('bad');
    }

    function nodeHasExecInput(node){
      const def = reg && reg.get(node && node.type);
      return !!(def && (def.inputs || []).some(pin => pin && pin.kind === 'exec'));
    }

    function renameSubgraph(subgraph, value){
      const next = String(value || '').trim() || subgraph.name || 'Function';
      const used = new Set(ensureSubgraphs().filter(item => item !== subgraph).map(item => String(item.name || item.id || '').toLowerCase()));
      let name = next;
      let index = 2;
      while(used.has(name.toLowerCase())){
        name = next + ' ' + index;
        index += 1;
      }
      const oldName = subgraph.name;
      subgraph.name = name;
      rootGraph.nodes.forEach(node => {
        if(node.type === 'flow.callSubgraph' && node.data && node.data.subgraph === oldName) node.data.subgraph = name;
      });
    }

    function functionPortTypes(){
      return ['any', 'number', 'boolean', 'string', 'vector3', 'object', 'array'];
    }

    function ensureFunctionPorts(subgraph, key){
      if(!subgraph || (key !== 'outputs' && key !== 'inputs')) return [];
      if(!Array.isArray(subgraph[key])) subgraph[key] = [];
      subgraph[key] = subgraph[key].filter(item => item && typeof item === 'object').map((item, index) => ({
        id:String(item.id || sceneId(key === 'inputs' ? 'input' : 'output')),
        name:String(item.name || ((key === 'inputs' ? 'input' : 'output') + (index + 1))),
        type:String(item.type || 'any'),
      }));
      return subgraph[key];
    }

    function uniqueFunctionPortName(subgraph, key){
      const base = key === 'inputs' ? 'input' : 'output';
      const ports = ensureFunctionPorts(subgraph, key);
      const used = new Set(ports.map(item => String(item.name || '').toLowerCase()));
      let index = ports.length + 1;
      let name = base + index;
      while(used.has(name.toLowerCase())){
        index += 1;
        name = base + index;
      }
      return name;
    }

    function renameFunctionPort(subgraph, key, port, value){
      const next = String(value || '').trim() || port.name || uniqueFunctionPortName(subgraph, key);
      const used = new Set(ensureFunctionPorts(subgraph, key).filter(item => item !== port).map(item => String(item.name || '').toLowerCase()));
      let name = next;
      let index = 2;
      while(used.has(name.toLowerCase())){
        name = next + index;
        index += 1;
      }
      const oldName = port.name;
      port.name = name;
      if(key === 'inputs'){
        (subgraph.nodes || []).forEach(node => {
          if(node.type === 'function.input' && node.data && node.data.name === oldName) node.data.name = name;
        });
      }
    }

    function sceneId(prefix){
      return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5);
    }

    function ensureLogicScene(){
      if(!rootGraph.logicScene || typeof rootGraph.logicScene !== 'object') rootGraph.logicScene = {};
      const scene = rootGraph.logicScene;
      if(!scene.root) scene.root = {};
      scene.root = Object.assign({
        id:'root',
        name:'Root',
        type:'mesh',
        linked:true,
        position:[0,0,0],
        rotation:[0,0,0],
        scale:[1,1,1],
        color:'#7dd3fc',
      }, scene.root || {});
      scene.root.id = 'root';
      if(!Array.isArray(scene.elements)) scene.elements = [];
      scene.elements = scene.elements.filter(element => element && typeof element === 'object');
      scene.elements.forEach(element => {
        if(!element || typeof element !== 'object') return;
        if(!Array.isArray(element.position)) element.position = [0,0,0];
        if(!Array.isArray(element.rotation)) element.rotation = [0,0,0];
        if(!Array.isArray(element.scale)) element.scale = [1,1,1];
        if(!element.color) element.color = '#7dd3fc';
        if(!element.type) element.type = 'mesh';
        if(!element.parentId) element.parentId = 'root';
      });
      if(!Array.isArray(scene.components)) scene.components = [];
      scene.components = scene.components.filter(component => component && typeof component === 'object');
      const oldDefault = scene.elements.find(item => item && item.id === 'default_mesh');
      if(oldDefault){
        scene.root = Object.assign({}, oldDefault, scene.root, {id:'root', name:scene.root.name || 'Root'});
        scene.elements = scene.elements.filter(item => item && item.id !== 'default_mesh');
        scene.components = scene.components.filter(item => item && item.elementId !== 'default_mesh');
      }
      const hasRootTransform = scene.components.some(item => item && item.elementId === 'root' && item.type === 'transform');
      const hasRootRender = scene.components.some(item => item && item.elementId === 'root' && item.type === 'render');
      if(!hasRootTransform) scene.components.push({id:'root_transform', elementId:'root', name:'Transform', type:'transform', linked:true});
      if(!hasRootRender) scene.components.push({id:'root_render', elementId:'root', name:'Render Mesh', type:'render', linked:true});
      return scene;
    }

    function logicScene(){
      return ensureLogicScene();
    }

    function allSceneElements(){
      const scene = logicScene();
      return [scene.root].concat(scene.elements || []);
    }

    function syncScenePreviewObject(){
      if(!opts.object) return;
      const old = (opts.object.children || []).filter(child => child.userData && child.userData.logicElementScenePreview);
      old.forEach(child => {
        opts.object.remove(child);
        if(child.geometry) child.geometry.dispose();
        if(child.material) child.material.dispose();
      });
      let previewGraph = rootGraph;
      if(opts.object.userData.logicLinked && STORE && STORE.logicElementAssets){
        previewGraph = STORE.logicElementAssets.applyOverrides(rootGraph, opts.object.userData.logicVariableOverrides || {});
      }
      if(STORE && STORE.syncLogicElementSceneObject) STORE.syncLogicElementSceneObject(opts.object, previewGraph);
    }

    function ensureElementComponents(id){
      const scene = logicScene();
      const hasTransform = scene.components.some(item => item && item.elementId === id && item.type === 'transform');
      const hasRender = scene.components.some(item => item && item.elementId === id && item.type === 'render');
      if(!hasTransform) scene.components.push({id:id + '_transform', elementId:id, name:'Transform', type:'transform', linked:true});
      if(!hasRender) scene.components.push({id:id + '_render', elementId:id, name:'Render Mesh', type:'render', linked:true});
    }

    function sceneElementById(id){
      if(id === 'root') return logicScene().root;
      return logicScene().elements.find(item => item.id === id) || null;
    }

    function sceneComponentById(id){
      return logicScene().components.find(item => item.id === id) || null;
    }

    function addSceneElement(){
      const scene = logicScene();
      const id = sceneId('element');
      const parentId = selection.kind === 'element' || selection.kind === 'root' ? selection.id : 'root';
      const element = {id, name:'Element ' + (scene.elements.length + 1), type:'mesh', parentId:parentId || 'root', linked:true, position:[0,0,0], rotation:[0,0,0], scale:[1,1,1], color:'#7dd3fc'};
      scene.elements.push(element);
      ensureElementComponents(id);
      persist();
      syncViewport3D();
      setSelection({kind:'element', id});
    }

    function addElementComponent(element){
      const scene = logicScene();
      const id = sceneId('component');
      const component = {id, elementId:element.id, name:'Component ' + (scene.components.length + 1), type:'custom', linked:true};
      scene.components.push(component);
      persist();
      setSelection({kind:'sceneComponent', id});
    }

    function deleteSceneElement(element){
      if(!element || element.id === 'root') return;
      const scene = logicScene();
      scene.elements = scene.elements.filter(item => item.id !== element.id);
      scene.elements.forEach(item => {
        if(item.parentId === element.id) item.parentId = 'root';
      });
      scene.components = scene.components.filter(item => item.elementId !== element.id);
      persist();
      syncViewport3D();
      setSelection({kind:'root', id:'root'});
    }

    function deleteSceneComponent(component){
      const scene = logicScene();
      scene.components = scene.components.filter(item => item.id !== component.id);
      persist();
      setSelection({kind:component.elementId === 'root' ? 'root' : 'element', id:component.elementId});
    }

    function renameVariable(variable, nextName){
      const oldName = variable.name;
      variable.name = String(nextName || '').trim() || oldName;
      graph.nodes.forEach(node => {
        if((node.type === 'variable.get' || node.type === 'variable.set') && node.data && node.data.name === oldName) node.data.name = variable.name;
      });
    }

    function componentItems(){
      const scene = logicScene();
      const rootLabel = scene.root.name && scene.root.name !== 'Root' ? scene.root.name : 'Default Mesh';
      const items = [{id:'root', kind:'root', label:rootLabel, type:'Root · ' + (scene.root.type || 'mesh'), depth:0, element:scene.root}];
      const added = new Set(['root']);
      const appendElement = (element, depth) => {
        if(!element || added.has(element.id)) return;
        added.add(element.id);
        items.push({id:element.id, kind:'element', label:element.name, type:element.type || 'Element', depth, element});
        scene.elements.filter(child => child && child.parentId === element.id).forEach(child => appendElement(child, depth + 1));
      };
      scene.elements.filter(element => element && (!element.parentId || element.parentId === 'root' || !scene.elements.some(parent => parent && parent.id === element.parentId))).forEach(element => appendElement(element, 1));
      scene.elements.forEach(element => appendElement(element, 1));
      return items;
    }

    function componentById(id){
      return componentItems().find(item => item.id === id) || null;
    }

    function variableByName(name){
      return (graph.variables || []).find(variable => variable.name === name) || null;
    }

    function renderPalette(){
      if(!reg) return;
      const q = String(search.value || '').toLowerCase();
      palette.innerHTML = '';
      reg.categories().forEach(category => {
        const defs = reg.listByCategory(category).filter(def => !q || def.title.toLowerCase().includes(q) || def.type.toLowerCase().includes(q));
        if(!defs.length) return;
        const group = document.createElement('div');
        group.className = 'lk-lg-cat ' + categoryClass(category);
        const head = document.createElement('button');
        head.type = 'button';
        head.textContent = category;
        group.appendChild(head);
        const list = document.createElement('div');
        list.className = 'lk-lg-cat-list';
        defs.forEach(def => {
          const item = document.createElement('button');
          item.type = 'button';
          item.textContent = def.title;
          item.title = def.description || def.type;
          item.addEventListener('click', () => addNode(def, 140 + graph.nodes.length * 28, 120 + graph.nodes.length * 18));
          list.appendChild(item);
        });
        group.appendChild(list);
        palette.appendChild(group);
      });
    }

    function renderVariableValue(variable){
      const row = document.createElement('div');
      row.className = 'lk-lg-var-value';
      if(variable.type === 'boolean'){
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = variable.value === true;
        input.addEventListener('change', () => {
          variable.value = input.checked;
          persist();
        });
        row.appendChild(input);
        return row;
      }
      if(variable.type === 'vector3'){
        const wrap = document.createElement('div');
        wrap.className = 'lk-lg-vec3';
        const vec = Array.isArray(variable.value) ? variable.value : [0,0,0];
        [0,1,2].forEach(index => {
          const input = document.createElement('input');
          input.type = 'number';
          input.step = '.1';
          input.value = Number(vec[index] || 0);
          input.addEventListener('change', () => {
            variable.value = Array.from(wrap.querySelectorAll('input')).map(item => Number(item.value) || 0);
            persist();
          });
          wrap.appendChild(input);
        });
        row.appendChild(wrap);
        return row;
      }
      const input = document.createElement('input');
      input.type = variable.type === 'number' ? 'number' : 'text';
      if(variable.type === 'number') input.step = '.1';
      input.value = variable.type === 'string'
        ? String(variable.value == null ? '' : variable.value)
        : (variable.type === 'number' ? Number(variable.value || 0) : (variable.value == null ? '' : JSON.stringify(variable.value)));
      input.addEventListener('change', () => {
        variable.value = parseVariableValue(variable, input.value);
        persist();
      });
      row.appendChild(input);
      return row;
    }

    function renderVariables(){
      varsList.innerHTML = '';
      (graph.variables || []).forEach(variable => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'lk-lg-var';
        item.draggable = true;
        item.classList.toggle('selected', selection.kind === 'variable' && selection.name === variable.name);
        const name = document.createElement('span');
        name.textContent = variable.name;
        const meta = document.createElement('small');
        meta.textContent = (variable.type || 'any') + (variable.exposed ? ' · exposed' : '') + (variable.linked === false ? ' · unlinked' : '');
        item.append(name, meta);
        item.addEventListener('click', () => setSelection({kind:'variable', name:variable.name}));
        item.addEventListener('dragstart', e => {
          e.dataTransfer.effectAllowed = 'copy';
          e.dataTransfer.setData('application/x-lk-logic-ref', JSON.stringify({kind:'variable', name:variable.name}));
        });
        varsList.appendChild(item);
      });
    }

    function renderSubgraphs(){
      subgraphsList.innerHTML = '';
      const list = ensureSubgraphs();
      if(!list.length){
        const empty = document.createElement('div');
        empty.className = 'lk-le-empty-mini';
        empty.textContent = 'No functions yet';
        subgraphsList.appendChild(empty);
        return;
      }
      list.forEach(sg => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'lk-lg-subgraph';
        item.draggable = true;
        item.classList.toggle('selected', selection.kind === 'subgraph' && selection.id === sg.id);
        item.classList.toggle('is-macro', sg.macro === true);
        const name = document.createElement('span');
        name.textContent = (sg.macro === true ? '◆ ' : '') + (sg.name || sg.id || 'Function');
        const meta = document.createElement('small');
        const entry = (sg.nodes || []).some(node => node.type === 'event.custom' && String(node.data && node.data.eventName || '') === 'Entry');
        meta.textContent = (sg.macro === true ? 'Macro · ' : 'Function · ') + (sg.nodes || []).length + ' nodes · ' + (entry ? 'Entry' : 'missing Entry');
        item.append(name, meta);
        item.addEventListener('click', () => setSelection({kind:'subgraph', id:sg.id}));
        item.addEventListener('dblclick', () => addNodeFromType('flow.callSubgraph', {subgraph:sg.name || sg.id}));
        item.addEventListener('dragstart', e => {
          e.dataTransfer.effectAllowed = 'copy';
          e.dataTransfer.setData('application/x-lk-logic-ref', JSON.stringify({kind:'subgraph', id:sg.id, name:sg.name || sg.id}));
        });
        subgraphsList.appendChild(item);
      });
    }

    function renderComponents(){
      componentsList.innerHTML = '';
      let items;
      try {
        items = componentItems();
      } catch(err){
        console.warn('Logic Element hierarchy render failed', err);
        const scene = logicScene();
        const rootLabel = scene.root.name && scene.root.name !== 'Root' ? scene.root.name : 'Default Mesh';
        items = [{id:'root', kind:'root', label:rootLabel, type:'Root · ' + (scene.root.type || 'mesh'), depth:0, element:scene.root}];
      }
      if(!items.length){
        const scene = logicScene();
        const rootLabel = scene.root.name && scene.root.name !== 'Root' ? scene.root.name : 'Default Mesh';
        items = [{id:'root', kind:'root', label:rootLabel, type:'Root · ' + (scene.root.type || 'mesh'), depth:0, element:scene.root}];
      }
      items.forEach(item => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lk-le-component';
        btn.classList.toggle('is-root', item.kind === 'root');
        btn.classList.toggle('is-component', item.kind === 'sceneComponent');
        btn.classList.add('depth-' + (item.depth || 0));
        btn.classList.toggle('selected', selection.id === item.id && (selection.kind === item.kind || (selection.kind === 'root' && item.kind === 'root')));
        const label = document.createElement('span');
        label.textContent = item.label;
        const meta = document.createElement('small');
        meta.textContent = item.type;
        btn.append(label, meta);
        btn.draggable = true;
        btn.addEventListener('click', () => {
          setSelection({kind:item.kind, id:item.id});
          if(activeTab === 'viewport') renderViewport();
        });
        btn.addEventListener('dragstart', e => {
          const ref = {kind:item.kind, id:item.id, name:item.label, elementId:item.element && item.element.id};
          e.dataTransfer.effectAllowed = 'copy';
          e.dataTransfer.setData('application/x-lk-logic-ref', JSON.stringify(ref));
        });
        componentsList.appendChild(btn);
      });
    }

    function makeInspectorRow(labelText, input){
      const row = document.createElement('label');
      row.className = 'lk-le-inspector-row';
      const span = document.createElement('span');
      span.textContent = labelText;
      row.append(span, input);
      return row;
    }

    function makeInspectorButton(labelText, onClick){
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lk-le-inspector-btn';
      button.textContent = labelText;
      button.addEventListener('click', onClick);
      return button;
    }

    function diagnosticsForNode(nodeId, checked){
      const result = checked || validate(graph);
      if(window.LK_LOGIC_VALIDATOR && window.LK_LOGIC_VALIDATOR.nodeDiagnostics){
        return window.LK_LOGIC_VALIDATOR.nodeDiagnostics(result, nodeId);
      }
      return (result.diagnostics || []).filter(item => item && item.node === nodeId);
    }

    function diagnosticNote(item){
      const note = document.createElement('button');
      note.type = 'button';
      note.className = 'lk-le-inspector-note diagnostic ' + (item.severity === 'error' ? 'bad' : 'warning');
      note.textContent = (item.severity === 'error' ? 'Error: ' : 'Warning: ') + item.message;
      if(item.node){
        note.title = 'Select node';
        note.addEventListener('click', () => setSelection({kind:'node', id:item.node}));
      } else {
        note.disabled = true;
      }
      return note;
    }

    function variableValueInput(variable){
      if(variable.type === 'boolean'){
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = variable.value === true;
        input.addEventListener('change', () => {
          variable.value = input.checked;
          persist();
          renderVariables();
        });
        return input;
      }
      if(variable.type === 'vector3'){
        const wrap = document.createElement('div');
        wrap.className = 'lk-lg-vec3';
        const vec = Array.isArray(variable.value) ? variable.value : [0,0,0];
        [0,1,2].forEach(index => {
          const input = document.createElement('input');
          input.type = 'number';
          input.step = '.1';
          input.value = Number(vec[index] || 0);
          input.addEventListener('change', () => {
            variable.value = Array.from(wrap.querySelectorAll('input')).map(item => Number(item.value) || 0);
            persist();
          });
          wrap.appendChild(input);
        });
        return wrap;
      }
      const input = document.createElement('input');
      input.type = variable.type === 'number' ? 'number' : 'text';
      if(variable.type === 'number') input.step = '.1';
      input.value = variable.type === 'string'
        ? String(variable.value == null ? '' : variable.value)
        : (variable.type === 'number' ? Number(variable.value || 0) : (variable.value == null ? '' : JSON.stringify(variable.value)));
      input.addEventListener('change', () => {
        variable.value = parseVariableValue(variable, input.value);
        persist();
      });
      return input;
    }

    function renderGraphInspector(){
      const checked = validate(graph);
      inspector.innerHTML = '';
      const title = document.createElement('div');
      title.className = 'lk-le-inspector-title';
      title.textContent = graphDisplayName();
      inspector.appendChild(title);
      const meta = document.createElement('div');
      meta.className = 'lk-le-inspector-note';
      const warningCount = (checked.warnings || []).length;
      meta.textContent = (checked.ok ? 'Valid graph' : ('Errors: ' + checked.errors.length)) + (warningCount ? ' · ' + warningCount + ' warnings' : '') + ' · ' + graph.nodes.length + ' nodes · ' + graph.edges.length + ' wires';
      inspector.appendChild(meta);
      (checked.diagnostics || []).slice(0, 8).forEach(item => inspector.appendChild(diagnosticNote(item)));
      const dependencySection = renderDependencySection();
      if(dependencySection) inspector.appendChild(dependencySection);
      const actions = document.createElement('div');
      actions.className = 'lk-le-inspector-actions';
      actions.append(
        makeInspectorButton('Add comment box', addCommentBox),
        makeInspectorButton('Fit graph', fitGraph),
        makeInspectorButton('Undo', undoGraph),
        makeInspectorButton('Redo', redoGraph)
      );
      inspector.appendChild(actions);
    }

    function renderDependencySection(){
      if(!window.LK_LOGIC_GRAPH || !window.LK_LOGIC_GRAPH.collectGraphDependencies) return null;
      const deps = window.LK_LOGIC_GRAPH.collectGraphDependencies(rootGraph);
      const library = assetLibraryLoad();
      const wrap = document.createElement('div');
      wrap.className = 'lk-le-inspector-sublist lk-le-dependencies';
      const heading = document.createElement('b');
      heading.textContent = 'Dependencies';
      wrap.appendChild(heading);
      const tools = document.createElement('div');
      tools.className = 'lk-le-inspector-actions';
      tools.appendChild(makeInspectorButton('Copy report', () => copyDependencyReport(deps, library)));
      wrap.appendChild(tools);
      if(!deps.length){
        const empty = document.createElement('div');
        empty.className = 'lk-le-inspector-note';
        empty.textContent = 'No external mesh, texture or audio dependencies.';
        wrap.appendChild(empty);
        return wrap;
      }
      deps.slice(0, 12).forEach(dep => {
        const item = document.createElement('div');
        const status = dependencyStatus(dep, library);
        item.className = 'lk-le-inspector-list-item lk-le-dependency-item ' + (status.ok ? 'ok' : 'missing');
        const label = dep.name || dep.key || dep.value || dep.id || dep.dbKey || dep.type;
        const owners = Array.isArray(dep.owners) && dep.owners.length ? dep.owners.join(', ') : '-';
        item.innerHTML = '<b>' + esc(dep.type || 'asset') + '</b><span>' + esc(label || '-') + '</span><em>' + esc(status.label) + '</em><small>' + esc(owners) + '</small>';
        const relink = renderDependencyRelink(dep, library);
        if(relink) item.appendChild(relink);
        const fallback = renderDependencyFallback(dep, status);
        if(fallback) item.appendChild(fallback);
        wrap.appendChild(item);
      });
      if(deps.length > 12){
        const more = document.createElement('div');
        more.className = 'lk-le-inspector-note';
        more.textContent = '+' + (deps.length - 12) + ' more dependencies';
        wrap.appendChild(more);
      }
      return wrap;
    }

    function copyDependencyReport(deps, library){
      const lines = ['Logic Element dependency report:'];
      (deps || []).forEach(dep => {
        const status = dependencyStatus(dep, library);
        const label = dep.name || dep.key || dep.value || dep.id || dep.dbKey || dep.type || '-';
        const owners = Array.isArray(dep.owners) && dep.owners.length ? dep.owners.join(', ') : '-';
        lines.push('- ' + (dep.type || 'asset') + ' | ' + label + ' | ' + status.label + ' | owners: ' + owners);
      });
      const text = lines.join('\n');
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).catch(() => {});
      }
      statusEl.textContent = 'Dependency report copied';
      return text;
    }

  function dependencyStatus(dep, library){
      const refs = [dep.id, dep.key, dep.dbKey, dep.src, dep.value, dep.name, dep.source]
        .filter(Boolean)
        .map(value => String(value).toLowerCase());
      const wantedKind = dep.type === 'mesh' ? 'glb' : dep.type;
      const found = (library || []).some(asset => {
        if(!asset) return false;
        if(wantedKind && asset.kind && asset.kind !== wantedKind) return false;
        return [asset.id, asset.key, asset.dbKey, asset.src, asset.name, asset.source]
          .filter(Boolean)
          .some(value => refs.includes(String(value).toLowerCase()));
      });
      if(found) return {ok:true, label:'found'};
      if(dep.source && /external|manual|fallback/i.test(String(dep.source))){
        return {ok:true, label:'external fallback'};
      }
      if(dep.src || dep.value && /^(https?:|data:|\.{0,2}\/|[a-z0-9_\-./]+\.[a-z0-9]+$)/i.test(String(dep.value))){
        return {ok:true, label:'external'};
      }
      return {ok:false, label:'missing'};
    }

    function dependencyAssetKind(dep){
      const type = String(dep && dep.type || '').toLowerCase();
      if(type === 'mesh') return 'mesh';
      if(type === 'texture') return 'texture';
      if(type === 'audio') return 'audio';
      return type;
    }

    function dependencyRefs(dep){
      return [dep && dep.id, dep && dep.key, dep && dep.dbKey, dep && dep.src, dep && dep.value, dep && dep.name, dep && dep.source]
        .filter(Boolean)
        .map(value => String(value).toLowerCase());
    }

    function refMatchesDependency(dep, ref){
      const depRefs = dependencyRefs(dep);
      const refRefs = dependencyRefs(typeof ref === 'object' ? ref : {value:ref, name:ref});
      return depRefs.some(value => refRefs.includes(value));
    }

    function serializeMeshAssetRef(asset){
      return Object.assign(serializeAssetRef(asset), {
        fit:Number(asset && asset.fit) || 1,
        clips:Array.isArray(asset && asset.clips) ? asset.clips.slice() : [],
      });
    }

    function renderDependencyRelink(dep, library){
      const kind = dependencyAssetKind(dep);
      const assets = (library || []).filter(asset => assetRefMatches(asset, kind));
      if(!assets.length) return null;
      const select = document.createElement('select');
      select.className = 'lk-le-dependency-relink';
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'Relink asset...';
      select.appendChild(empty);
      assets.forEach(asset => {
        const option = document.createElement('option');
        option.value = asset.id || asset.key || asset.dbKey || asset.src || '';
        option.textContent = asset.source || asset.name || asset.key || asset.id || 'Asset';
        select.appendChild(option);
      });
      select.addEventListener('change', () => {
        const asset = assets.find(item => assetRefValue(item) === select.value || item.id === select.value || item.key === select.value || item.dbKey === select.value || item.src === select.value);
        if(!asset) return;
        if(applyDependencyRelink(dep, asset)){
          persist();
          renderInspector();
          renderNodes();
          renderViewport();
        }
      });
      return select;
    }

    function renderDependencyFallback(dep, status){
      if(!dep || status && status.ok) return null;
      const kind = dependencyAssetKind(dep);
      if(!['mesh', 'texture', 'audio'].includes(kind)) return null;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lk-le-mini-btn';
      button.textContent = 'Keep manual';
      button.title = 'Mark this reference as an intentional manual/external fallback until a project asset is relinked.';
      button.addEventListener('click', () => {
        if(applyDependencyFallback(dep)){
          persist();
          renderInspector();
          renderNodes();
          renderViewport();
        }
      });
      return button;
    }

    function fallbackRefFromDependency(dep, current){
      const currentRef = current && typeof current === 'object' ? current : {};
      return Object.assign({}, currentRef, {
        id:currentRef.id || dep.id || null,
        key:currentRef.key || dep.key || null,
        dbKey:currentRef.dbKey || dep.dbKey || null,
        src:currentRef.src || dep.src || null,
        value:currentRef.value || dep.value || dep.key || dep.id || dep.name || '',
        name:currentRef.name || dep.name || dep.value || dep.key || dep.id || 'Manual asset ref',
        source:'External/manual fallback',
      });
    }

    function applyDependencyFallback(dep){
      const kind = dependencyAssetKind(dep);
      let changed = false;
      if(kind === 'mesh'){
        const scene = logicScene();
        [scene.root].concat(scene.elements || []).filter(Boolean).forEach(element => {
          if(element.asset && refMatchesDependency(dep, element.asset)){
            element.asset = Object.assign({}, element.asset, fallbackRefFromDependency(dep, element.asset));
            changed = true;
          }
        });
        return changed;
      }
      function fallbackNodes(nodes){
        (Array.isArray(nodes) ? nodes : []).forEach(node => {
          if(kind === 'texture' && node.type === 'material.loadTexture' && refMatchesDependency(dep, node.data && node.data.textureRef)){
            node.data = Object.assign({}, node.data || {}, {textureRef:fallbackRefFromDependency(dep, node.data && node.data.textureRef)});
            changed = true;
          }
          if(kind === 'audio' && node.type === 'audio.playSound' && refMatchesDependency(dep, node.data && node.data.soundRef)){
            node.data = Object.assign({}, node.data || {}, {soundRef:fallbackRefFromDependency(dep, node.data && node.data.soundRef)});
            changed = true;
          }
        });
      }
      fallbackNodes(rootGraph.nodes);
      (rootGraph.subgraphs || []).forEach(sg => fallbackNodes(sg && sg.nodes));
      return changed;
    }

    function applyDependencyRelink(dep, asset){
      const kind = dependencyAssetKind(dep);
      let changed = false;
      if(kind === 'mesh'){
        const scene = logicScene();
        [scene.root].concat(scene.elements || []).filter(Boolean).forEach(element => {
          if(element.asset && refMatchesDependency(dep, element.asset)){
            element.asset = serializeMeshAssetRef(asset);
            changed = true;
          }
        });
        return changed;
      }
      function relinkNodes(nodes){
        (Array.isArray(nodes) ? nodes : []).forEach(node => {
          if(kind === 'texture' && node.type === 'material.loadTexture' && refMatchesDependency(dep, node.data && node.data.textureRef)){
            node.data = Object.assign({}, node.data || {}, {textureRef:serializeAssetRef(asset)});
            changed = true;
          }
          if(kind === 'audio' && node.type === 'audio.playSound' && refMatchesDependency(dep, node.data && node.data.soundRef)){
            node.data = Object.assign({}, node.data || {}, {soundRef:serializeAssetRef(asset)});
            changed = true;
          }
        });
      }
      relinkNodes(rootGraph.nodes);
      (rootGraph.subgraphs || []).forEach(sg => relinkNodes(sg && sg.nodes));
      return changed;
    }

    function assetRefKind(pin){
      if(!pin || pin.type !== 'assetRef') return '';
      return String(pin.assetKind || '').toLowerCase();
    }

    function assetRefLabel(value){
      if(value && typeof value === 'object') return value.name || value.source || value.key || value.id || value.dbKey || value.src || '';
      return value == null ? '' : String(value);
    }

    function assetRefValue(value){
      if(value && typeof value === 'object') return value.id || value.key || value.dbKey || value.src || value.source || '';
      return value == null ? '' : String(value);
    }

    function assetRefMatches(asset, kind){
      if(!asset || !kind) return false;
      if(kind === 'texture') return asset.kind === 'texture';
      if(kind === 'audio') return asset.kind === 'audio' || asset.kind === 'sound' || asset.kind === 'music';
      if(kind === 'mesh') return asset.kind === 'glb' || asset.kind === 'mesh';
      return asset.kind === kind;
    }

    function serializeAssetRef(asset){
      return {
        id:asset.id || null,
        key:asset.key || null,
        dbKey:asset.dbKey || null,
        src:asset.src || asset.url || null,
        name:asset.name || asset.source || asset.key || asset.id || 'Asset',
        source:asset.source || asset.name || 'Asset Library',
        kind:asset.kind || null,
        mime:asset.mime || null,
      };
    }

    function renderAssetRefField(node, pin, value){
      const wrap = document.createElement('div');
      wrap.className = 'lk-le-asset-ref-field';
      const kind = assetRefKind(pin);
      const assets = assetLibraryLoad().filter(asset => assetRefMatches(asset, kind));
      if(assets.length){
        const select = document.createElement('select');
        const manualOption = document.createElement('option');
        manualOption.value = '';
        manualOption.textContent = 'Manual path / URL';
        select.appendChild(manualOption);
        assets.forEach(asset => {
          const option = document.createElement('option');
          option.value = asset.id || asset.key || asset.dbKey || asset.src || asset.source || '';
          option.textContent = asset.source || asset.name || asset.key || asset.id || 'Asset';
          select.appendChild(option);
        });
        const current = assetRefValue(value);
        if(current) select.value = current;
        select.addEventListener('change', () => {
          const asset = assets.find(item => assetRefValue(item) === select.value || item.id === select.value || item.key === select.value || item.dbKey === select.value || item.src === select.value);
          if(asset) {
            setNodeData(graph, node, pin, serializeAssetRef(asset));
            persist();
            renderInspector();
            renderNodes();
          }
        });
        wrap.appendChild(select);
      }
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = kind ? (kind + ' path / URL') : 'asset path / URL';
      input.value = assetRefLabel(value);
      input.addEventListener('change', () => {
        setNodeData(graph, node, pin, input.value);
        persist();
        renderInspector();
        renderNodes();
      });
      wrap.appendChild(input);
      return wrap;
    }

    function renderMultiInspector(){
      const nodeIds = Array.from(selectedNodeIdSet());
      const commentIds = Array.from(selectedCommentIdSet());
      inspector.innerHTML = '';
      const title = document.createElement('div');
      title.className = 'lk-le-inspector-title';
      title.textContent = 'Selection';
      inspector.appendChild(title);
      const meta = document.createElement('div');
      meta.className = 'lk-le-inspector-note';
      meta.textContent = nodeIds.length + ' nodes · ' + commentIds.length + ' comments';
      inspector.appendChild(meta);
      const actions = document.createElement('div');
      actions.className = 'lk-le-inspector-actions';
      actions.append(
        makeInspectorButton('Copy', copySelection),
        makeInspectorButton('Duplicate', duplicateSelection),
        makeInspectorButton('Create macro', createMacroFromSelection),
        makeInspectorButton('Collapse to macro', collapseSelectionToMacro),
        makeInspectorButton('Fit selection', fitSelection),
        makeInspectorButton('Delete selection', deleteCurrentSelection)
      );
      inspector.appendChild(actions);
    }

    function renderCommentInspector(comment){
      if(!comment) return renderGraphInspector();
      inspector.innerHTML = '';
      const title = document.createElement('div');
      title.className = 'lk-le-inspector-title';
      title.textContent = 'Comment Box';
      inspector.appendChild(title);
      const name = document.createElement('input');
      name.type = 'text';
      name.value = comment.title || '';
      name.addEventListener('change', () => {
        comment.title = String(name.value || '').trim() || 'Comment';
        persist();
        renderNodes();
      });
      inspector.appendChild(makeInspectorRow('Title', name));
      const color = document.createElement('input');
      color.type = 'color';
      color.value = comment.color || '#ffd166';
      color.addEventListener('input', () => {
        comment.color = color.value;
        persist();
        renderNodes();
      });
      inspector.appendChild(makeInspectorRow('Color', color));
      [['X','x'], ['Y','y'], ['Width','w'], ['Height','h']].forEach(pair => {
        const input = document.createElement('input');
        input.type = 'number';
        input.step = '1';
        input.value = Number(comment[pair[1]] || 0);
        input.addEventListener('change', () => {
          const key = pair[1];
          const value = Number(input.value) || 0;
          comment[key] = key === 'w' || key === 'h' ? Math.max(90, value) : value;
          persist();
          renderNodes();
        });
        inspector.appendChild(makeInspectorRow(pair[0], input));
      });
      const actions = document.createElement('div');
      actions.className = 'lk-le-inspector-actions';
      actions.append(
        makeInspectorButton('Copy', copySelection),
        makeInspectorButton('Duplicate', duplicateSelection),
        makeInspectorButton('Fit selection', fitSelection),
        makeInspectorButton('Delete comment', () => deleteGraphItems([], [comment.id]))
      );
      inspector.appendChild(actions);
    }

    function deleteNode(node){
      if(!node) return;
      deleteGraphItems([node.id], []);
    }

    function toggleNodeBreakpoint(node){
      if(!node) return;
      node.data = node.data || {};
      node.data.breakpoint = node.data.breakpoint !== true;
      persist();
      renderNodes();
      renderInspector();
    }

    function renderNodeInspector(node){
      const def = node && reg && reg.get(node.type);
      if(!node || !def) return renderGraphInspector();
      inspector.innerHTML = '';
      const heading = document.createElement('div');
      heading.className = 'lk-le-inspector-title';
      heading.textContent = def.title;
      inspector.appendChild(heading);
      const type = document.createElement('div');
      type.className = 'lk-le-inspector-note';
      type.textContent = def.type + (def.description ? ' · ' + def.description : '');
      inspector.appendChild(type);
      const callTarget = subgraphForCallNode(rootGraph, node);
      if(callTarget){
        const target = document.createElement('div');
        target.className = 'lk-le-inspector-note';
        target.textContent = (callTarget.macro === true ? 'Macro target: ' : 'Function target: ') + (callTarget.name || callTarget.id);
        inspector.appendChild(target);
      }
      diagnosticsForNode(node.id).forEach(item => inspector.appendChild(diagnosticNote(item)));
      const breakpoint = document.createElement('input');
      breakpoint.type = 'checkbox';
      breakpoint.checked = !!(node.data && node.data.breakpoint === true);
      breakpoint.addEventListener('change', () => toggleNodeBreakpoint(node));
      inspector.appendChild(makeInspectorRow('Breakpoint', breakpoint));
      (def.inputs || []).forEach(pin => {
        if(pin.kind !== 'data' || isDataInputConnected(graph, node, pin.name)) return;
        inspector.appendChild(renderField(node, pin));
      });
      const actions = document.createElement('div');
      actions.className = 'lk-le-inspector-actions';
      const actionButtons = [
        makeInspectorButton('Copy', copySelection),
        makeInspectorButton('Duplicate', duplicateSelection),
        makeInspectorButton(node.data && node.data.breakpoint === true ? 'Disable breakpoint' : 'Enable breakpoint', () => toggleNodeBreakpoint(node)),
      ];
      if(callTarget) actionButtons.push(makeInspectorButton('Open target', () => setActiveGraph('subgraph:' + callTarget.id)));
      actionButtons.push(
        makeInspectorButton('Fit selection', fitSelection),
        makeInspectorButton('Delete node', () => deleteNode(node))
      );
      actions.append.apply(actions, actionButtons);
      inspector.appendChild(actions);
    }

    function renderVariableInspector(variable){
      if(!variable) return renderGraphInspector();
      inspector.innerHTML = '';
      const heading = document.createElement('div');
      heading.className = 'lk-le-inspector-title';
      heading.textContent = 'Variable';
      inspector.appendChild(heading);
      const name = document.createElement('input');
      name.type = 'text';
      name.value = variable.name;
      name.addEventListener('change', () => {
        const oldName = variable.name;
        renameVariable(variable, name.value);
        persist();
        selection = {kind:'variable', name:variable.name};
        renderVariables();
        renderNodes();
        if(oldName !== variable.name) renderInspector();
      });
      inspector.appendChild(makeInspectorRow('Name', name));
      const type = document.createElement('select');
      ['number', 'boolean', 'string', 'vector3', 'any'].forEach(kind => {
        const opt = document.createElement('option');
        opt.value = kind;
        opt.textContent = kind;
        type.appendChild(opt);
      });
      type.value = variable.type || 'any';
      type.addEventListener('change', () => {
        variable.type = type.value;
        variable.value = defaultVariableValue(variable.type);
        persist();
        renderVariables();
        renderInspector();
      });
      inspector.appendChild(makeInspectorRow('Type', type));
      const parent = document.createElement('select');
      const rootOpt = document.createElement('option');
      rootOpt.value = 'root';
      rootOpt.textContent = logicScene().root.name || 'Root';
      parent.appendChild(rootOpt);
      logicScene().elements.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.name;
        parent.appendChild(opt);
      });
      parent.value = variable.parentId || 'root';
      parent.addEventListener('change', () => {
        variable.parentId = parent.value || 'root';
        persist();
        renderVariables();
      });
      inspector.appendChild(makeInspectorRow('Parent', parent));
      inspector.appendChild(makeInspectorRow('Value', variableValueInput(variable)));
      const linked = document.createElement('input');
      linked.type = 'checkbox';
      linked.checked = variable.linked !== false;
      linked.addEventListener('change', () => {
        variable.linked = linked.checked;
        persist();
        renderVariables();
      });
      inspector.appendChild(makeInspectorRow('Linked', linked));
      const exposed = document.createElement('input');
      exposed.type = 'checkbox';
      exposed.checked = variable.exposed === true;
      exposed.addEventListener('change', () => {
        variable.exposed = exposed.checked;
        persist();
        renderVariables();
      });
      inspector.appendChild(makeInspectorRow('Expose', exposed));
      const actions = document.createElement('div');
      actions.className = 'lk-le-inspector-actions';
      actions.append(
        makeInspectorButton('Get node', () => addNodeFromType('variable.get', {name:variable.name})),
        makeInspectorButton('Set node', () => addNodeFromType('variable.set', {name:variable.name})),
        makeInspectorButton('Delete variable', () => {
          graph.variables = graph.variables.filter(item => item !== variable);
          persist();
          setSelection({kind:'graph'});
        })
      );
      inspector.appendChild(actions);
    }

    function renderFunctionPorts(subgraph, key, labelText){
      const wrap = document.createElement('div');
      wrap.className = 'lk-le-inspector-sublist';
      const head = document.createElement('b');
      head.textContent = labelText;
      wrap.appendChild(head);
      ensureFunctionPorts(subgraph, key).forEach(port => {
        const row = document.createElement('div');
        row.className = 'lk-le-function-port';
        const name = document.createElement('input');
        name.type = 'text';
        name.value = port.name || '';
        name.addEventListener('change', () => {
          renameFunctionPort(subgraph, key, port, name.value);
          persist();
          renderSubgraphInspector(subgraph);
          renderNodes();
        });
        const type = document.createElement('select');
        functionPortTypes().forEach(kind => {
          const opt = document.createElement('option');
          opt.value = kind;
          opt.textContent = kind;
          type.appendChild(opt);
        });
        type.value = port.type || 'any';
        type.addEventListener('change', () => {
          port.type = type.value;
          persist();
        });
        const addNodeButton = document.createElement('button');
        addNodeButton.type = 'button';
        addNodeButton.textContent = key === 'inputs' ? 'Node' : 'Return';
        addNodeButton.addEventListener('click', () => {
          setActiveGraph('subgraph:' + subgraph.id);
          if(key === 'inputs') addNodeFromType('function.input', {name:port.name});
          else addNodeFromType('function.return', {name:port.name});
        });
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '×';
        remove.addEventListener('click', () => {
          subgraph[key] = ensureFunctionPorts(subgraph, key).filter(item => item !== port);
          persist();
          renderSubgraphInspector(subgraph);
        });
        row.append(name, type, addNodeButton, remove);
        wrap.appendChild(row);
      });
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'lk-le-inspector-btn';
      add.textContent = key === 'inputs' ? 'Add input' : 'Add output';
      add.addEventListener('click', () => {
        ensureFunctionPorts(subgraph, key).push({id:sceneId(key === 'inputs' ? 'input' : 'output'), name:uniqueFunctionPortName(subgraph, key), type:'any'});
        persist();
        renderSubgraphInspector(subgraph);
      });
      wrap.appendChild(add);
      return wrap;
    }

    function renderSubgraphInspector(subgraph){
      if(!subgraph) return renderGraphInspector();
      inspector.innerHTML = '';
      const heading = document.createElement('div');
      heading.className = 'lk-le-inspector-title';
      heading.textContent = subgraph.macro === true ? 'Macro' : 'Function';
      inspector.appendChild(heading);
      const note = document.createElement('div');
      note.className = 'lk-le-inspector-note';
      const hasEntry = (subgraph.nodes || []).some(node => node.type === 'event.custom' && String(node.data && node.data.eventName || '') === 'Entry');
      note.textContent = (subgraph.enabled === false ? 'Disabled' : 'Enabled') + ' · ' + (subgraph.nodes || []).length + ' nodes · ' + (subgraph.edges || []).length + ' wires' + (hasEntry ? ' · Entry ready' : ' · missing Entry');
      inspector.appendChild(note);
      const name = document.createElement('input');
      name.type = 'text';
      name.value = subgraph.name || '';
      name.addEventListener('change', () => {
        renameSubgraph(subgraph, name.value);
        persist();
        selection = {kind:'subgraph', id:subgraph.id};
        renderGraphSelect();
        renderSubgraphs();
        renderNodes();
        renderInspector();
      });
      inspector.appendChild(makeInspectorRow('Name', name));
      const enabled = document.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = subgraph.enabled !== false;
      enabled.addEventListener('change', () => {
        subgraph.enabled = enabled.checked;
        persist();
        renderSubgraphs();
        renderInspector();
      });
      inspector.appendChild(makeInspectorRow('Enabled', enabled));
      const macro = document.createElement('input');
      macro.type = 'checkbox';
      macro.checked = subgraph.macro === true;
      macro.addEventListener('change', () => {
        subgraph.macro = macro.checked;
        persist();
        renderGraphSelect();
        renderSubgraphs();
        renderInspector();
      });
      inspector.appendChild(makeInspectorRow('Macro', macro));
      const idNote = document.createElement('div');
      idNote.className = 'lk-le-inspector-note';
      idNote.textContent = 'Call by id/name: ' + (subgraph.id || '') + ' / ' + (subgraph.name || '');
      inspector.appendChild(idNote);
      inspector.appendChild(renderFunctionPorts(subgraph, 'inputs', 'Inputs'));
      inspector.appendChild(renderFunctionPorts(subgraph, 'outputs', 'Outputs'));
      if(!hasEntry){
        const entryWarn = document.createElement('div');
        entryWarn.className = 'lk-le-inspector-note warning';
        entryWarn.textContent = 'Missing Custom Event named Entry.';
        inspector.appendChild(entryWarn);
      }
      const actions = document.createElement('div');
      actions.className = 'lk-le-inspector-actions';
      actions.append(
        makeInspectorButton('Open graph', () => setActiveGraph('subgraph:' + subgraph.id)),
        makeInspectorButton('Add Call node', () => addNodeFromType('flow.callSubgraph', {subgraph:subgraph.name || subgraph.id})),
        makeInspectorButton('Delete function', () => {
          confirmEditorAction({
            title:'Delete function',
            message:'Delete function "' + (subgraph.name || subgraph.id) + '"?',
            confirmText:'Delete',
            cancelText:'Cancel',
          }).then(ok => {
            if(!ok) return;
            rootGraph.subgraphs = ensureSubgraphs().filter(item => item !== subgraph);
            if(activeGraphKey === 'subgraph:' + subgraph.id) setActiveGraph('main');
            persist();
            setSelection({kind:'graph'});
          });
        })
      );
      inspector.appendChild(actions);
    }

    function renderRootInspector(){
      return renderElementInspector(logicScene().root, true);
    }

    function renderElementInspector(element, isRoot){
      if(!element) return renderRootInspector();
      inspector.innerHTML = '';
      const heading = document.createElement('div');
      heading.className = 'lk-le-inspector-title';
      heading.textContent = element.name || 'Element';
      inspector.appendChild(heading);
      const name = document.createElement('input');
      name.type = 'text';
      name.value = element.name || '';
      name.addEventListener('change', () => {
        element.name = String(name.value || '').trim() || 'Element';
        persist();
        renderComponents();
        renderViewport();
        renderInspector();
        syncViewport3D();
      });
      inspector.appendChild(makeInspectorRow('Name', name));
      const type = document.createElement('select');
      ['mesh', 'empty', 'light', 'camera'].forEach(kind => {
        const opt = document.createElement('option');
        opt.value = kind;
        opt.textContent = kind;
        type.appendChild(opt);
      });
      type.value = element.type || 'mesh';
      type.addEventListener('change', () => {
        element.type = type.value;
        if(element.type !== 'mesh'){
          delete element.asset;
          delete element.animation;
          removeAnimationComponent(element);
        }
        persist();
        renderComponents();
        syncViewport3D();
        renderInspector();
      });
      inspector.appendChild(makeInspectorRow('Type', type));
      if(element.type === 'mesh') renderElementAssetInspector(element);
      if(!isRoot){
        const parent = document.createElement('select');
        const rootOpt = document.createElement('option');
        rootOpt.value = 'root';
        rootOpt.textContent = logicScene().root.name || 'Root';
        parent.appendChild(rootOpt);
        logicScene().elements.filter(item => item.id !== element.id).forEach(item => {
          const opt = document.createElement('option');
          opt.value = item.id;
          opt.textContent = item.name;
          parent.appendChild(opt);
        });
        parent.value = element.parentId || 'root';
        parent.addEventListener('change', () => {
          element.parentId = parent.value || 'root';
          persist();
          renderComponents();
        });
        inspector.appendChild(makeInspectorRow('Parent', parent));
      }
      const linked = document.createElement('input');
      linked.type = 'checkbox';
      linked.checked = element.linked !== false;
      linked.addEventListener('change', () => {
        element.linked = linked.checked;
        persist();
        renderComponents();
      });
      inspector.appendChild(makeInspectorRow('Linked', linked));
      const vectorRows = [
        {label:'Position', key:'position', fallback:[0,0,0], step:'.1'},
        {label:'Rotation', key:'rotation', fallback:[0,0,0], step:'1'},
        {label:'Scale', key:'scale', fallback:[1,1,1], step:'.1', min:.01},
      ];
      vectorRows.forEach(row => {
        const vec = Array.isArray(element[row.key]) ? element[row.key] : row.fallback.slice();
        ['x','y','z'].forEach((axis, index) => {
          const input = document.createElement('input');
          input.type = 'number';
          input.step = row.step;
          if(row.min != null) input.min = row.min;
          input.value = Number(vec[index] == null ? row.fallback[index] : vec[index]).toFixed(3).replace(/\.?0+$/, '');
          input.addEventListener('change', () => {
            element[row.key] = Array.isArray(element[row.key]) ? element[row.key] : row.fallback.slice();
            const next = Number(input.value);
            element[row.key][index] = row.min != null ? Math.max(row.min, Number.isFinite(next) ? next : row.fallback[index]) : (Number.isFinite(next) ? next : row.fallback[index]);
            persist();
            syncViewport3D();
          });
          inspector.appendChild(makeInspectorRow(row.label + ' ' + axis.toUpperCase(), input));
        });
      });
      const color = document.createElement('input');
      color.type = 'color';
      color.value = element.color || '#7dd3fc';
      color.addEventListener('input', () => {
        element.color = color.value || '#7dd3fc';
        persist();
        syncViewport3D();
      });
      inspector.appendChild(makeInspectorRow('Color', color));
      renderElementColliderInspector(element);
      const componentSection = document.createElement('div');
      componentSection.className = 'lk-le-inspector-sublist';
      const componentTitle = document.createElement('b');
      componentTitle.textContent = 'Components';
      componentSection.appendChild(componentTitle);
      logicScene().components.filter(component => component && component.elementId === element.id).forEach(component => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'lk-le-inspector-list-item';
        item.textContent = (component.name || 'Component') + ' · ' + (component.type || 'custom');
        item.addEventListener('click', () => setSelection({kind:'sceneComponent', id:component.id}));
        componentSection.appendChild(item);
      });
      inspector.appendChild(componentSection);
      const actions = document.createElement('div');
      actions.className = 'lk-le-inspector-actions';
      actions.appendChild(makeInspectorButton('Add element', addSceneElement));
      actions.appendChild(makeInspectorButton('Add component', () => addElementComponent(element)));
      actions.appendChild(makeInspectorButton('Get Element node', () => addNodeFromType('scene.getElement', {name:element.id === 'root' ? 'Root' : (element.name || element.id)})));
      if(isRoot) actions.appendChild(makeInspectorButton('Get Owner node', () => addNodeFromType('scene.getOwner', {})));
      if(!isRoot) actions.appendChild(makeInspectorButton('Delete element', () => deleteSceneElement(element)));
      inspector.appendChild(actions);
    }

    function ensureElementCollider(element){
      if(!element.collider || typeof element.collider !== 'object'){
        element.collider = {enabled:false, shape:'box', size:[1,1,1], radius:.5, offset:[0,0,0]};
      }
      if(!Array.isArray(element.collider.size)) element.collider.size = [1,1,1];
      if(!Array.isArray(element.collider.offset)) element.collider.offset = [0,0,0];
      return element.collider;
    }

    function ensureColliderComponent(element){
      const scene = logicScene();
      let component = scene.components.find(item => item && item.elementId === element.id && item.type === 'collider');
      if(!component){
        component = {id:element.id + '_collider', elementId:element.id, name:'Collider', type:'collider', linked:true};
        scene.components.push(component);
      }
      return component;
    }

    function renderElementColliderInspector(element, compact){
      const collider = ensureElementCollider(element);
      const sectionEl = document.createElement('div');
      sectionEl.className = 'lk-le-inspector-sublist lk-le-collider-fields';
      const title = document.createElement('b');
      title.textContent = compact ? 'Collider Settings' : 'Collider';
      sectionEl.appendChild(title);
      const enabled = document.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = collider.enabled === true;
      enabled.addEventListener('change', () => {
        collider.enabled = enabled.checked;
        if(collider.enabled) ensureColliderComponent(element);
        persist();
        renderComponents();
        syncViewport3D();
        renderInspector();
      });
      sectionEl.appendChild(makeInspectorRow('Enabled', enabled));
      const shape = document.createElement('select');
      [['box','Box'], ['sphere','Sphere']].forEach(def => {
        const option = document.createElement('option');
        option.value = def[0];
        option.textContent = def[1];
        shape.appendChild(option);
      });
      shape.value = collider.shape === 'sphere' ? 'sphere' : 'box';
      shape.disabled = !collider.enabled;
      shape.addEventListener('change', () => {
        collider.shape = shape.value;
        persist();
        syncViewport3D();
        renderInspector();
      });
      sectionEl.appendChild(makeInspectorRow('Shape', shape));
      if(collider.shape === 'sphere'){
        const radius = document.createElement('input');
        radius.type = 'number';
        radius.min = '.01';
        radius.step = '.05';
        radius.disabled = !collider.enabled;
        radius.value = Math.max(.01, Number(collider.radius) || .5);
        radius.addEventListener('change', () => {
          collider.radius = Math.max(.01, Number(radius.value) || .5);
          persist();
          syncViewport3D();
        });
        sectionEl.appendChild(makeInspectorRow('Radius', radius));
      } else {
        ['X','Y','Z'].forEach((axis, index) => {
          const input = document.createElement('input');
          input.type = 'number';
          input.min = '.01';
          input.step = '.1';
          input.disabled = !collider.enabled;
          input.value = Math.max(.01, Number(collider.size[index]) || 1);
          input.addEventListener('change', () => {
            collider.size[index] = Math.max(.01, Number(input.value) || 1);
            persist();
            syncViewport3D();
          });
          sectionEl.appendChild(makeInspectorRow('Size ' + axis, input));
        });
      }
      ['X','Y','Z'].forEach((axis, index) => {
        const input = document.createElement('input');
        input.type = 'number';
        input.step = '.1';
        input.disabled = !collider.enabled;
        input.value = Number(collider.offset[index]) || 0;
        input.addEventListener('change', () => {
          collider.offset[index] = Number(input.value) || 0;
          persist();
          syncViewport3D();
        });
        sectionEl.appendChild(makeInspectorRow('Offset ' + axis, input));
      });
      inspector.appendChild(sectionEl);
    }

    function logicMeshAssets(){
      return assetLibraryLoad().filter(asset => asset && asset.kind === 'glb');
    }

    function elementAssetId(element){
      const asset = element && element.asset;
      return asset && (asset.id || asset.key) || '';
    }

    function renderElementAssetInspector(element){
      const select = document.createElement('select');
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Default Cube';
      select.appendChild(defaultOption);
      const assets = logicMeshAssets();
      const currentId = elementAssetId(element);
      assets.forEach(asset => {
        const option = document.createElement('option');
        option.value = asset.id || asset.key;
        option.textContent = asset.name || asset.source || asset.key;
        select.appendChild(option);
      });
      if(currentId && !assets.some(asset => (asset.id || asset.key) === currentId)){
        const projectOption = document.createElement('option');
        projectOption.value = currentId;
        projectOption.textContent = (element.asset.name || element.asset.source || 'Project Mesh') + ' (Project)';
        select.appendChild(projectOption);
      }
      select.value = currentId;
      select.addEventListener('change', () => {
        const asset = assets.find(item => (item.id || item.key) === select.value);
        if(asset){
          element.asset = {
            id:asset.id || null,
            key:asset.key || null,
            name:asset.name || asset.source || 'Mesh Asset',
            source:asset.source || 'Asset Library',
            src:asset.src || null,
            dbKey:asset.dbKey || null,
            fit:1,
          };
        } else {
          delete element.asset;
          delete element.animation;
          removeAnimationComponent(element);
        }
        persist();
        syncViewport3D();
        renderInspector();
      });
      inspector.appendChild(makeInspectorRow('Mesh Asset', select));
      if(!element.asset) return;
      const fit = document.createElement('input');
      fit.type = 'number';
      fit.min = '.05';
      fit.step = '.1';
      fit.value = Math.max(.05, Number(element.asset.fit) || 1);
      fit.addEventListener('change', () => {
        element.asset.fit = Math.max(.05, Number(fit.value) || 1);
        persist();
        syncViewport3D();
      });
      inspector.appendChild(makeInspectorRow('Asset Fit', fit));
      renderElementAnimationInspector(element);
    }

    function ensureElementAnimation(element){
      if(!element.animation || typeof element.animation !== 'object'){
        element.animation = {enabled:true, clip:'', autoplay:true, loop:'repeat', speed:1, playInEditor:true};
      }
      return element.animation;
    }

    function ensureAnimationComponent(element){
      const scene = logicScene();
      let component = scene.components.find(item => item && item.elementId === element.id && item.type === 'animation');
      if(!component){
        component = {id:element.id + '_animation', elementId:element.id, name:'Animation', type:'animation', linked:true};
        scene.components.push(component);
      }
      return component;
    }

    function removeAnimationComponent(element){
      const scene = logicScene();
      scene.components = scene.components.filter(item => !(item && item.elementId === element.id && item.type === 'animation'));
    }

    function renderElementAnimationInspector(element, compact){
      if(!element || !element.asset) return;
      const animation = ensureElementAnimation(element);
      if(animation.enabled !== false) ensureAnimationComponent(element);
      const sectionEl = document.createElement('div');
      sectionEl.className = 'lk-le-inspector-sublist lk-le-animation-fields';
      const title = document.createElement('b');
      title.textContent = compact ? 'Animation Settings' : 'Animation';
      sectionEl.appendChild(title);
      const enabled = document.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = animation.enabled !== false;
      enabled.addEventListener('change', () => {
        animation.enabled = enabled.checked;
        if(animation.enabled) ensureAnimationComponent(element);
        persist();
        renderComponents();
        syncViewport3D();
        renderInspector();
      });
      sectionEl.appendChild(makeInspectorRow('Enabled', enabled));
      const clips = Array.isArray(element.asset.clips) ? element.asset.clips : [];
      const clip = document.createElement('select');
      const first = document.createElement('option');
      first.value = '';
      first.textContent = clips.length ? 'First available clip' : 'Waiting for GLB clips';
      clip.appendChild(first);
      clips.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        clip.appendChild(option);
      });
      clip.value = animation.clip || '';
      clip.disabled = animation.enabled === false || !clips.length;
      clip.addEventListener('change', () => {
        animation.clip = clip.value;
        persist();
        syncViewport3D();
      });
      sectionEl.appendChild(makeInspectorRow('Clip', clip));
      const loop = document.createElement('select');
      [['repeat','Repeat'], ['once','Once'], ['pingpong','Ping Pong']].forEach(def => {
        const option = document.createElement('option');
        option.value = def[0];
        option.textContent = def[1];
        loop.appendChild(option);
      });
      loop.value = animation.loop || 'repeat';
      loop.disabled = animation.enabled === false;
      loop.addEventListener('change', () => {
        animation.loop = loop.value;
        persist();
        syncViewport3D();
      });
      sectionEl.appendChild(makeInspectorRow('Loop', loop));
      const speed = document.createElement('input');
      speed.type = 'number';
      speed.step = '.1';
      speed.min = '-4';
      speed.max = '4';
      speed.disabled = animation.enabled === false;
      speed.value = Number.isFinite(Number(animation.speed)) ? Number(animation.speed) : 1;
      speed.addEventListener('change', () => {
        animation.speed = Math.max(-4, Math.min(4, Number(speed.value) || 0));
        persist();
        syncViewport3D();
      });
      sectionEl.appendChild(makeInspectorRow('Speed', speed));
      [['Autoplay', 'autoplay'], ['Play in Editor', 'playInEditor']].forEach(def => {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.disabled = animation.enabled === false;
        input.checked = animation[def[1]] !== false;
        input.addEventListener('change', () => {
          animation[def[1]] = input.checked;
          persist();
          syncViewport3D();
        });
        sectionEl.appendChild(makeInspectorRow(def[0], input));
      });
      const actions = document.createElement('div');
      actions.className = 'lk-le-inspector-actions';
      actions.append(
        makeInspectorButton('Play Preview', () => playViewportElementAnimation(element.id, true)),
        makeInspectorButton('Stop', () => stopViewportElementAnimation(element.id))
      );
      sectionEl.appendChild(actions);
      inspector.appendChild(sectionEl);
    }

    function renderSceneComponentInspector(component){
      if(!component) return renderRootInspector();
      if(component.type === 'collider'){
        const ownerElement = sceneElementById(component.elementId);
        inspector.innerHTML = '';
        const colliderHeading = document.createElement('div');
        colliderHeading.className = 'lk-le-inspector-title';
        colliderHeading.textContent = (ownerElement && ownerElement.name || 'Element') + ' · Collider';
        inspector.appendChild(colliderHeading);
        if(ownerElement) renderElementColliderInspector(ownerElement, true);
        return;
      }
      if(component.type === 'animation'){
        const ownerElement = sceneElementById(component.elementId);
        inspector.innerHTML = '';
        const animationHeading = document.createElement('div');
        animationHeading.className = 'lk-le-inspector-title';
        animationHeading.textContent = (ownerElement && ownerElement.name || 'Element') + ' · Animation';
        inspector.appendChild(animationHeading);
        if(ownerElement) renderElementAnimationInspector(ownerElement, true);
        return;
      }
      inspector.innerHTML = '';
      const heading = document.createElement('div');
      heading.className = 'lk-le-inspector-title';
      heading.textContent = component.name || 'Component';
      inspector.appendChild(heading);
      const name = document.createElement('input');
      name.type = 'text';
      name.value = component.name || '';
      name.addEventListener('change', () => {
        component.name = String(name.value || '').trim() || 'Component';
        persist();
        renderComponents();
        renderInspector();
      });
      inspector.appendChild(makeInspectorRow('Name', name));
      const element = document.createElement('select');
      const rootOpt = document.createElement('option');
      rootOpt.value = 'root';
      rootOpt.textContent = logicScene().root.name || 'Root';
      element.appendChild(rootOpt);
      logicScene().elements.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.name;
        element.appendChild(opt);
      });
      element.value = component.elementId || '';
      element.addEventListener('change', () => {
        component.elementId = element.value;
        persist();
        renderComponents();
      });
      inspector.appendChild(makeInspectorRow('Element', element));
      const type = document.createElement('input');
      type.type = 'text';
      type.value = component.type || 'custom';
      type.addEventListener('change', () => {
        component.type = String(type.value || '').trim() || 'custom';
        persist();
        renderComponents();
      });
      inspector.appendChild(makeInspectorRow('Type', type));
      const linked = document.createElement('input');
      linked.type = 'checkbox';
      linked.checked = component.linked !== false;
      linked.addEventListener('change', () => {
        component.linked = linked.checked;
        persist();
        renderComponents();
      });
      inspector.appendChild(makeInspectorRow('Linked', linked));
      const actions = document.createElement('div');
      actions.className = 'lk-le-inspector-actions';
      actions.appendChild(makeInspectorButton('Delete component', () => deleteSceneComponent(component)));
      inspector.appendChild(actions);
    }

    function renderViewport(){
      const item = selection.kind === 'root'
        ? logicScene().root
        : (selection.kind === 'element'
        ? sceneElementById(selection.id)
        : (selection.kind === 'sceneComponent' ? sceneComponentById(selection.id) : null));
      viewportCard.innerHTML = '';
      const title = document.createElement('b');
      title.textContent = 'Viewport';
      const body = document.createElement('span');
      body.textContent = item ? ('Selected: ' + (item.name || item.id) + ' · ' + (item.type || 'item')) : 'Select an element in the hierarchy.';
      viewportCard.append(title, body);
    }

    function setViewportTool(tool){
      viewportTool = ['move', 'rotate', 'scale'].includes(tool) ? tool : 'move';
      viewportToolButtons.forEach(btn => btn.classList.toggle('on', btn.dataset.viewportTool === viewportTool));
      applyViewportGizmoSettings();
    }

    function toggleViewportSpace(){
      viewportSpace = viewportSpace === 'world' ? 'local' : 'world';
      applyViewportGizmoSettings();
    }

    function toggleViewportSnap(){
      viewportSnap = !viewportSnap;
      applyViewportGizmoSettings();
    }

    function applyViewportGizmoSettings(){
      if(viewportSpaceButton){
        viewportSpaceButton.textContent = viewportSpace === 'world' ? 'W' : 'L';
        viewportSpaceButton.title = 'Transform space: ' + (viewportSpace === 'world' ? 'World' : 'Local');
        viewportSpaceButton.classList.toggle('on', viewportSpace === 'local');
      }
      if(viewportSnapButton) viewportSnapButton.classList.toggle('on', viewportSnap);
      const gizmo = viewport && viewport.gizmo;
      if(!gizmo) return;
      gizmo.setMode(viewportTool === 'move' ? 'translate' : viewportTool);
      gizmo.setSpace(viewportSpace);
      gizmo.setTranslationSnap(viewportSnap ? .25 : null);
      gizmo.setRotationSnap(viewportSnap ? viewport.THREE.MathUtils.degToRad(15) : null);
      gizmo.setScaleSnap(viewportSnap ? .1 : null);
    }

    function frameSelectedViewportElement(){
      initViewport3D();
      const id = selectedSceneElementId();
      const node = id && viewport && viewport.meshes.get(id);
      if(!node) return;
      const world = node.getWorldPosition(new viewport.THREE.Vector3());
      viewport.orbit.target.copy(world);
      viewport.orbit.distance = Math.max(3, Math.min(10, viewport.orbit.distance));
      syncViewport3D();
    }

    function initViewport3D(){
      if(viewport || !window.THREE || !viewportMount) return viewport;
      const THREERef = window.THREE;
      const scene3d = new THREERef.Scene();
      scene3d.background = new THREERef.Color(0x090d14);
      const camera = new THREERef.PerspectiveCamera(55, 1, .1, 200);
      const renderer = new THREERef.WebGLRenderer({antialias:true, alpha:false});
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      viewportMount.appendChild(renderer.domElement);
      const grid = new THREERef.GridHelper(12, 24, 0x46617d, 0x223044);
      scene3d.add(grid);
      const light = new THREERef.DirectionalLight(0xffffff, .85);
      light.position.set(3, 5, 4);
      scene3d.add(light, new THREERef.AmbientLight(0xffffff, .35));
      viewport = {
        THREE:THREERef,
        scene:scene3d,
        camera,
        renderer,
        meshes:new Map(),
        ray:new THREERef.Raycaster(),
        pointer:new THREERef.Vector2(),
        orbit:{yaw:.72, pitch:.52, distance:7, target:new THREERef.Vector3(0, .25, 0)},
        gizmo:null,
        gizmoDragging:false,
        mixers:new Map(),
        animationRaf:0,
        animationLast:0,
      };
      initViewportGizmo();
      bindViewportControls();
      syncViewport3D();
      return viewport;
    }

    function initViewportGizmo(){
      if(!viewport || !viewport.THREE.TransformControls) return;
      const gizmo = new viewport.THREE.TransformControls(viewport.camera, viewport.renderer.domElement);
      viewport.gizmo = gizmo;
      viewport.scene.add(gizmo);
      applyViewportGizmoSettings();
      gizmo.addEventListener('mouseDown', () => {
        viewport.gizmoDragging = true;
        viewport.renderer.domElement.classList.add('is-transforming');
      });
      gizmo.addEventListener('objectChange', () => {
        syncElementFromViewportGizmo();
        syncScenePreviewObject();
        viewport.renderer.render(viewport.scene, viewport.camera);
      });
      gizmo.addEventListener('mouseUp', () => {
        viewport.gizmoDragging = false;
        viewport.renderer.domElement.classList.remove('is-transforming');
        syncElementFromViewportGizmo();
        persist();
        renderInspector();
        syncViewport3D();
      });
      gizmo.addEventListener('dragging-changed', event => {
        viewport.gizmoDragging = !!event.value;
      });
      gizmo.addEventListener('change', () => {
        if(viewport) viewport.renderer.render(viewport.scene, viewport.camera);
      });
    }

    function syncElementFromViewportGizmo(){
      if(!viewport || !viewport.gizmo || !viewport.gizmo.object) return;
      const node = viewport.gizmo.object;
      const id = node.userData && node.userData.logicSceneElementId;
      const element = sceneElementById(id);
      if(!element) return;
      element.position = [node.position.x, node.position.y, node.position.z];
      element.rotation = [
        viewport.THREE.MathUtils.radToDeg(node.rotation.x),
        viewport.THREE.MathUtils.radToDeg(node.rotation.y),
        viewport.THREE.MathUtils.radToDeg(node.rotation.z),
      ];
      element.scale = [
        Math.max(.01, Number(node.scale.x) || 1),
        Math.max(.01, Number(node.scale.y) || 1),
        Math.max(.01, Number(node.scale.z) || 1),
      ];
    }

    function syncViewportGizmo(){
      if(!viewport || !viewport.gizmo) return;
      applyViewportGizmoSettings();
      const id = selectedSceneElementId();
      const node = id && viewport.meshes.get(id);
      if(!node || node.visible === false){
        viewport.gizmo.detach();
        return;
      }
      if(viewport.gizmo.object !== node) viewport.gizmo.attach(node);
    }

    function selectedSceneElementId(){
      if(selection.kind === 'root') return 'root';
      if(selection.kind === 'element') return selection.id;
      if(selection.kind === 'sceneComponent'){
        const component = sceneComponentById(selection.id);
        return component && component.elementId || null;
      }
      return null;
    }

    function updateViewportCamera(){
      if(!viewport) return;
      const orbit = viewport.orbit;
      const pitch = Math.max(-1.15, Math.min(1.15, orbit.pitch));
      orbit.pitch = pitch;
      orbit.distance = Math.max(1.8, Math.min(32, orbit.distance));
      const cp = Math.cos(pitch);
      viewport.camera.position.set(
        orbit.target.x + Math.sin(orbit.yaw) * cp * orbit.distance,
        orbit.target.y + Math.sin(pitch) * orbit.distance,
        orbit.target.z + Math.cos(orbit.yaw) * cp * orbit.distance
      );
      viewport.camera.lookAt(orbit.target);
    }

    function bindViewportControls(){
      if(!viewport || !viewport.renderer) return;
      const dom = viewport.renderer.domElement;
      let drag = null;
      dom.addEventListener('pointerdown', e => {
        if(viewport.gizmo && (viewport.gizmoDragging || viewport.gizmo.axis)) return;
        const pickedId = e.button === 0 ? viewportElementIdAt(e.clientX, e.clientY) : null;
        if(pickedId){
          if(pickedId === 'root') setSelection({kind:'root', id:'root'});
          else setSelection({kind:'element', id:pickedId});
          const node = viewport.meshes.get(pickedId);
          const element = sceneElementById(pickedId);
          const world = node && node.getWorldPosition ? node.getWorldPosition(new viewport.THREE.Vector3()) : null;
          const hit = world ? viewportPlanePoint(e.clientX, e.clientY, world.y) : null;
          if(viewport.gizmo){
            drag = {mode:'select', id:pickedId, x:e.clientX, y:e.clientY, moved:false};
          } else if(element && node && world && hit && viewportTool === 'move'){
            drag = {mode:'move', id:pickedId, x:e.clientX, y:e.clientY, moved:false, planeY:world.y, offset:world.clone().sub(hit)};
          } else if(element && node && viewportTool === 'rotate'){
            drag = {mode:'rotate', id:pickedId, x:e.clientX, y:e.clientY, moved:false};
          } else if(element && node && viewportTool === 'scale'){
            const base = Array.isArray(element.scale) ? element.scale.slice() : [1,1,1];
            drag = {mode:'scale', id:pickedId, x:e.clientX, y:e.clientY, startX:e.clientX, startY:e.clientY, moved:false, baseScale:base};
          }
        }
        if(!drag) drag = {mode:'orbit', x:e.clientX, y:e.clientY, moved:false, button:e.button};
        dom.setPointerCapture(e.pointerId);
      });
      dom.addEventListener('pointermove', e => {
        if(!drag) return;
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if(Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        drag.x = e.clientX;
        drag.y = e.clientY;
        if(drag.mode === 'move'){
          const hit = viewportPlanePoint(e.clientX, e.clientY, drag.planeY);
          if(hit) moveSceneElementToWorld(drag.id, hit.add(drag.offset));
        } else if(drag.mode === 'rotate'){
          rotateSceneElementByDrag(drag.id, dx, dy);
        } else if(drag.mode === 'scale'){
          scaleSceneElementByDrag(drag.id, drag.baseScale, e.clientX - drag.startX, e.clientY - drag.startY);
        } else if(drag.mode === 'select'){
          return;
        } else if(drag.button === 2){
          const right = new viewport.THREE.Vector3(1, 0, 0).applyQuaternion(viewport.camera.quaternion);
          const up = new viewport.THREE.Vector3(0, 1, 0);
          viewport.orbit.target.addScaledVector(right, -dx * .015 * viewport.orbit.distance / 7);
          viewport.orbit.target.addScaledVector(up, dy * .015 * viewport.orbit.distance / 7);
        } else {
          viewport.orbit.yaw -= dx * .008;
          viewport.orbit.pitch -= dy * .008;
        }
        syncViewport3D();
      });
      dom.addEventListener('pointerup', e => {
        if(!drag) return;
        dom.releasePointerCapture(e.pointerId);
        const wasClick = !drag.moved;
        const wasTransform = drag.mode === 'move' || drag.mode === 'rotate' || drag.mode === 'scale';
        drag = null;
        if(wasClick) pickViewportElement(e.clientX, e.clientY);
        else if(wasTransform){
          persist();
          renderInspector();
        }
      });
      dom.addEventListener('wheel', e => {
        e.preventDefault();
        viewport.orbit.distance *= e.deltaY > 0 ? 1.1 : .9;
        syncViewport3D();
      }, {passive:false});
      dom.addEventListener('contextmenu', e => e.preventDefault());
    }

    function pickViewportElement(clientX, clientY){
      const id = viewportElementIdAt(clientX, clientY);
      if(id === 'root') setSelection({kind:'root', id:'root'});
      else if(id) setSelection({kind:'element', id});
    }

    function viewportElementIdAt(clientX, clientY){
      if(!viewport) return;
      const rect = viewport.renderer.domElement.getBoundingClientRect();
      viewport.pointer.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      viewport.pointer.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
      viewport.ray.setFromCamera(viewport.pointer, viewport.camera);
      const hits = viewport.ray.intersectObjects(Array.from(viewport.meshes.values()), true);
      if(!hits.length) return;
      let picked = hits[0].object;
      while(picked && !(picked.userData && picked.userData.logicSceneElementId)) picked = picked.parent;
      return picked && picked.userData && picked.userData.logicSceneElementId || null;
    }

    function viewportPlanePoint(clientX, clientY, planeY){
      if(!viewport) return null;
      const rect = viewport.renderer.domElement.getBoundingClientRect();
      viewport.pointer.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      viewport.pointer.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
      viewport.ray.setFromCamera(viewport.pointer, viewport.camera);
      const plane = new viewport.THREE.Plane(new viewport.THREE.Vector3(0, 1, 0), -(Number(planeY) || 0));
      const point = new viewport.THREE.Vector3();
      return viewport.ray.ray.intersectPlane(plane, point) ? point : null;
    }

    function moveSceneElementToWorld(id, worldPoint){
      const element = sceneElementById(id);
      const node = viewport && viewport.meshes.get(id);
      if(!element || !node || !worldPoint) return;
      const parent = node.parent && node.parent !== viewport.scene ? node.parent : null;
      const local = parent ? parent.worldToLocal(worldPoint.clone()) : worldPoint.clone();
      element.position = [local.x, local.y, local.z];
      syncScenePreviewObject();
      syncViewport3D();
    }

    function rotateSceneElementByDrag(id, dx, dy){
      const element = sceneElementById(id);
      if(!element) return;
      const rot = Array.isArray(element.rotation) ? element.rotation.slice() : [0,0,0];
      rot[0] = (Number(rot[0]) || 0) + dy * .35;
      rot[1] = (Number(rot[1]) || 0) + dx * .35;
      element.rotation = rot;
      syncScenePreviewObject();
      syncViewport3D();
    }

    function scaleSceneElementByDrag(id, baseScale, dx, dy){
      const element = sceneElementById(id);
      if(!element) return;
      const factor = Math.max(.05, 1 + (dx - dy) * .01);
      const base = Array.isArray(baseScale) ? baseScale : [1,1,1];
      element.scale = base.map(value => Math.max(.01, (Number(value) || 1) * factor));
      syncScenePreviewObject();
      syncViewport3D();
    }

    function resizeViewport3D(){
      if(!viewport) return;
      const rect = viewportMount.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      viewport.camera.aspect = w / h;
      viewport.camera.updateProjectionMatrix();
      viewport.renderer.setSize(w, h, false);
    }

    function disposeViewportNode(node){
      if(!node) return;
      node.traverse(child => {
        if(child.geometry && child.geometry.dispose) child.geometry.dispose();
        if(child.material){
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(mat => mat && mat.dispose && mat.dispose());
        }
      });
    }

    function viewportElementMaterial(element, opts){
      opts = opts || {};
      const THREERef = viewport.THREE;
      const color = new THREERef.Color(element && element.color || (opts.helper ? '#facc15' : '#7dd3fc'));
      if(opts.line) return new THREERef.LineBasicMaterial({color, transparent:true, opacity:opts.opacity == null ? .9 : opts.opacity, depthTest:false});
      if(opts.basic) return new THREERef.MeshBasicMaterial({color, transparent:opts.transparent === true, opacity:opts.opacity == null ? 1 : opts.opacity, depthTest:opts.depthTest !== false});
      return new THREERef.MeshStandardMaterial({color, roughness:.55, metalness:.08, transparent:opts.transparent === true, opacity:opts.opacity == null ? 1 : opts.opacity});
    }

    function createViewportElementNode(element){
      const THREERef = viewport.THREE;
      const type = String(element && element.type || 'mesh');
      let node;
      if(type === 'empty'){
        node = new THREERef.Mesh(new THREERef.SphereGeometry(.18, 16, 8), viewportElementMaterial(element, {basic:true, transparent:true, opacity:.72}));
      } else if(type === 'light'){
        const group = new THREERef.Group();
        const bulb = new THREERef.Mesh(new THREERef.SphereGeometry(.16, 16, 8), viewportElementMaterial(element, {basic:true, helper:true}));
        const glow = new THREERef.PointLight(element && element.color || '#facc15', .75, 4);
        group.add(bulb, glow);
        node = group;
      } else if(type === 'camera'){
        const group = new THREERef.Group();
        const mat = viewportElementMaterial(element, {line:true, helper:true});
        const pts = [
          new THREERef.Vector3(-.28,-.18,0), new THREERef.Vector3(.28,-.18,0),
          new THREERef.Vector3(.28,-.18,0), new THREERef.Vector3(.28,.18,0),
          new THREERef.Vector3(.28,.18,0), new THREERef.Vector3(-.28,.18,0),
          new THREERef.Vector3(-.28,.18,0), new THREERef.Vector3(-.28,-.18,0),
          new THREERef.Vector3(-.28,-.18,0), new THREERef.Vector3(-.55,-.35,-.65),
          new THREERef.Vector3(.28,-.18,0), new THREERef.Vector3(.55,-.35,-.65),
          new THREERef.Vector3(.28,.18,0), new THREERef.Vector3(.55,.35,-.65),
          new THREERef.Vector3(-.28,.18,0), new THREERef.Vector3(-.55,.35,-.65),
        ];
        group.add(new THREERef.LineSegments(new THREERef.BufferGeometry().setFromPoints(pts), mat));
        node = group;
      } else if(element && element.asset) {
        node = new THREERef.Group();
        const placeholder = new THREERef.Mesh(
          new THREERef.BoxGeometry(.8, .8, .8),
          viewportElementMaterial(element, {basic:true, transparent:true, opacity:.22})
        );
        placeholder.userData.logicElementAssetPlaceholder = true;
        node.add(placeholder);
        hydrateViewportElementAsset(node, element);
      } else {
        node = new THREERef.Mesh(new THREERef.BoxGeometry(.8, .8, .8), viewportElementMaterial(element));
      }
      node.userData.logicElementType = type;
      node.userData.logicElementAssetKey = logicElementAssetKey(element);
      node.userData.logicSceneElementId = element.id;
      node.traverse(child => {
        child.userData.logicElementType = type;
        child.userData.logicSceneElementId = element.id;
      });
      return node;
    }

    function logicElementAssetKey(element){
      const asset = element && element.asset;
      if(!asset) return '';
      return [asset.id || '', asset.key || '', asset.dbKey || '', asset.src || '', Number(asset.fit) || 1].join(':');
    }

    function hydrateViewportElementAsset(node, element){
      if(!STORE || !STORE.loadLogicElementAsset || !element || !element.asset) return;
      const assetKey = logicElementAssetKey(element);
      STORE.loadLogicElementAsset(element.asset).then(model => {
        if(!viewport || viewport.meshes.get(element.id) !== node || node.userData.logicElementAssetKey !== assetKey){
          disposeViewportNode(model);
          return;
        }
        Array.from(node.children).filter(child => child.userData && (child.userData.logicElementAssetPlaceholder || child.userData.logicElementAssetVisual)).forEach(child => {
          node.remove(child);
          disposeViewportNode(child);
        });
        model.traverse(child => {
          child.userData.logicElementAssetVisual = true;
          child.userData.logicElementType = element.type || 'mesh';
          child.userData.logicSceneElementId = element.id;
        });
        node.add(model);
        node.userData.logicElementAssetModel = model;
        const clipNames = (model.animations || []).map(clip => clip && clip.name || 'Animation');
        if(element.asset && JSON.stringify(element.asset.clips || []) !== JSON.stringify(clipNames)){
          element.asset.clips = clipNames;
          if(selectedSceneElementId() === element.id) requestAnimationFrame(renderInspector);
        }
        syncViewportElementAnimation(element, node, true);
        syncViewport3D();
      }).catch(err => {
        status('Logic Element asset failed: ' + (err && err.message ? err.message : err));
      });
    }

    function updateViewportElementColor(node, element, selected){
      node.traverse(child => {
        if(child.userData && child.userData.helperOnly) return;
        if(child.userData && child.userData.logicElementAssetVisual) return;
        if(child.isLight && child.color) child.color.set(selected ? '#ffd166' : (element.color || '#facc15'));
        const mats = child.material ? (Array.isArray(child.material) ? child.material : [child.material]) : [];
        mats.forEach(mat => {
          if(mat.color) mat.color.set(selected ? '#ffd166' : (element.color || '#7dd3fc'));
          if(mat.emissive) mat.emissive.set(selected ? '#3b2a00' : '#000000');
        });
      });
    }

    function syncViewportColliderHelper(element, node){
      if(!viewport || !node) return;
      const old = node.children.find(child => child.userData && child.userData.logicElementColliderHelper);
      const collider = element && element.collider;
      const signature = collider && collider.enabled === true ? JSON.stringify(collider) : '';
      if(old && node.userData.logicElementColliderSignature === signature) return;
      if(old){
        node.remove(old);
        disposeViewportNode(old);
      }
      node.userData.logicElementColliderSignature = signature;
      if(!collider || collider.enabled !== true) return;
      const THREERef = viewport.THREE;
      let geometry;
      if(collider.shape === 'sphere'){
        geometry = new THREERef.WireframeGeometry(new THREERef.SphereGeometry(Math.max(.01, Number(collider.radius) || .5), 18, 12));
      } else {
        const size = Array.isArray(collider.size) ? collider.size : [1,1,1];
        geometry = new THREERef.EdgesGeometry(new THREERef.BoxGeometry(
          Math.max(.01, Number(size[0]) || 1),
          Math.max(.01, Number(size[1]) || 1),
          Math.max(.01, Number(size[2]) || 1)
        ));
      }
      const material = new THREERef.LineBasicMaterial({color:0x4be3a0, transparent:true, opacity:.78, depthTest:false});
      const helper = new THREERef.LineSegments(geometry, material);
      const offset = Array.isArray(collider.offset) ? collider.offset : [0,0,0];
      helper.position.set(Number(offset[0]) || 0, Number(offset[1]) || 0, Number(offset[2]) || 0);
      helper.renderOrder = 998;
      helper.userData.logicElementColliderHelper = true;
      helper.userData.helperOnly = true;
      helper.userData.editorOnly = true;
      helper.userData.nonExportable = true;
      helper.userData.logicSceneElementId = element.id;
      node.add(helper);
    }

    function animationLoopValue(value){
      if(!viewport) return null;
      const key = String(value || 'repeat').toLowerCase();
      return key === 'once' ? viewport.THREE.LoopOnce : (key === 'pingpong' ? viewport.THREE.LoopPingPong : viewport.THREE.LoopRepeat);
    }

    function disposeViewportElementAnimation(id){
      if(!viewport || !viewport.mixers) return;
      const entry = viewport.mixers.get(id);
      if(entry && entry.mixer) entry.mixer.stopAllAction();
      viewport.mixers.delete(id);
    }

    function playViewportElementAnimation(id, force){
      if(!viewport) initViewport3D();
      const element = sceneElementById(id);
      const node = viewport && viewport.meshes.get(id);
      if(!element || !node || !node.userData.logicElementAssetModel) return false;
      const animation = ensureElementAnimation(element);
      if(animation.enabled === false && !force) return false;
      let entry = viewport.mixers.get(id);
      if(!entry){
        syncViewportElementAnimation(element, node, true);
        entry = viewport.mixers.get(id);
      }
      if(!entry || !entry.clips.length) return false;
      if(entry.action) entry.action.stop();
      const selectedClip = entry.clips.find(clip => clip && clip.name === animation.clip) || entry.clips[0];
      const action = entry.mixer.clipAction(selectedClip);
      action.clampWhenFinished = animation.loop === 'once';
      action.setLoop(animationLoopValue(animation.loop), animation.loop === 'once' ? 1 : Infinity);
      action.setEffectiveTimeScale(Number.isFinite(Number(animation.speed)) ? Number(animation.speed) : 1);
      action.reset().play();
      entry.action = action;
      entry.signature = JSON.stringify(animation);
      ensureViewportAnimationLoop();
      return true;
    }

    function stopViewportElementAnimation(id){
      if(!viewport) return false;
      const entry = viewport.mixers.get(id);
      if(!entry) return false;
      entry.mixer.stopAllAction();
      entry.action = null;
      return true;
    }

    function syncViewportElementAnimation(element, node, force){
      if(!viewport || !element || !node) return;
      const model = node.userData.logicElementAssetModel;
      const clips = model && Array.isArray(model.animations) ? model.animations.filter(Boolean) : [];
      if(!model || !clips.length){
        disposeViewportElementAnimation(element.id);
        return;
      }
      const animation = ensureElementAnimation(element);
      const signature = JSON.stringify(animation);
      const current = viewport.mixers.get(element.id);
      if(!force && current && current.model === model && current.signature === signature) return;
      disposeViewportElementAnimation(element.id);
      const entry = {model, clips, mixer:new viewport.THREE.AnimationMixer(model), action:null, signature};
      viewport.mixers.set(element.id, entry);
      if(animation.enabled !== false && animation.autoplay !== false && animation.playInEditor !== false){
        playViewportElementAnimation(element.id, false);
      }
      ensureViewportAnimationLoop();
    }

    function ensureViewportAnimationLoop(){
      if(!viewport || viewport.animationRaf) return;
      viewport.animationLast = performance.now();
      const tick = now => {
        if(!viewport){ return; }
        const dt = Math.min(.1, Math.max(0, (now - viewport.animationLast) / 1000));
        viewport.animationLast = now;
        let active = false;
        viewport.mixers.forEach(entry => {
          if(!entry || !entry.mixer || !entry.action || !entry.action.isRunning()) return;
          entry.mixer.update(dt);
          active = true;
        });
        if(active && activeTab === 'viewport') viewport.renderer.render(viewport.scene, viewport.camera);
        if(active) viewport.animationRaf = requestAnimationFrame(tick);
        else viewport.animationRaf = 0;
      };
      viewport.animationRaf = requestAnimationFrame(tick);
    }

    function syncViewport3D(){
      if(!viewport) return;
      const THREERef = viewport.THREE;
      const live = new Set();
      allSceneElements().forEach((element, index) => {
        live.add(element.id);
        let mesh = viewport.meshes.get(element.id);
        if(mesh && mesh.userData && (mesh.userData.logicElementType !== element.type || mesh.userData.logicElementAssetKey !== logicElementAssetKey(element))){
          disposeViewportElementAnimation(element.id);
          viewport.scene.remove(mesh);
          disposeViewportNode(mesh);
          viewport.meshes.delete(element.id);
          mesh = null;
        }
        if(!mesh){
          mesh = createViewportElementNode(element);
          viewport.meshes.set(element.id, mesh);
          viewport.scene.add(mesh);
        }
        const pos = Array.isArray(element.position) ? element.position : [index * 1.25, 0, 0];
        mesh.position.set(Number(pos[0]) || 0, Number.isFinite(Number(pos[1])) ? Number(pos[1]) : 0, Number(pos[2]) || 0);
        const rot = Array.isArray(element.rotation) ? element.rotation : [0,0,0];
        mesh.rotation.set(THREERef.MathUtils.degToRad(Number(rot[0]) || 0), THREERef.MathUtils.degToRad(Number(rot[1]) || 0), THREERef.MathUtils.degToRad(Number(rot[2]) || 0));
        const scale = Array.isArray(element.scale) ? element.scale : [1,1,1];
        mesh.name = element.name || element.id;
        mesh.visible = element.linked !== false;
        const selected = selectedSceneElementId() === element.id;
        mesh.scale.set(
          Number.isFinite(Number(scale[0])) ? Number(scale[0]) : 1,
          Number.isFinite(Number(scale[1])) ? Number(scale[1]) : 1,
          Number.isFinite(Number(scale[2])) ? Number(scale[2]) : 1
        );
        updateViewportElementColor(mesh, element, selected);
        syncViewportColliderHelper(element, mesh);
        syncViewportElementAnimation(element, mesh, false);
      });
      Array.from(viewport.meshes.keys()).forEach(id => {
        if(live.has(id)) return;
        const mesh = viewport.meshes.get(id);
        disposeViewportElementAnimation(id);
        viewport.scene.remove(mesh);
        disposeViewportNode(mesh);
        viewport.meshes.delete(id);
      });
      allSceneElements().forEach(element => {
        const mesh = element && viewport.meshes.get(element.id);
        if(!mesh || mesh.visible === false) return;
        const parentId = element.id === 'root' ? null : (element.parentId || 'root');
        const parent = parentId && viewport.meshes.get(parentId) ? viewport.meshes.get(parentId) : viewport.scene;
        parent.add(mesh);
      });
      syncViewportGizmo();
      resizeViewport3D();
      updateViewportCamera();
      viewport.renderer.render(viewport.scene, viewport.camera);
    }

    function disposeViewport3D(){
      if(!viewport) return;
      if(viewport.animationRaf) cancelAnimationFrame(viewport.animationRaf);
      viewport.animationRaf = 0;
      viewport.mixers.forEach(entry => entry && entry.mixer && entry.mixer.stopAllAction());
      viewport.mixers.clear();
      if(viewport.gizmo){
        viewport.gizmo.detach();
        viewport.scene.remove(viewport.gizmo);
        if(viewport.gizmo.dispose) viewport.gizmo.dispose();
      }
      viewport.meshes.forEach(mesh => {
        viewport.scene.remove(mesh);
        disposeViewportNode(mesh);
      });
      viewport.meshes.clear();
      if(viewport.renderer){
        viewport.renderer.dispose();
        if(viewport.renderer.domElement && viewport.renderer.domElement.parentNode) viewport.renderer.domElement.parentNode.removeChild(viewport.renderer.domElement);
      }
      viewport = null;
    }

    function renderInspector(){
      if(selection.kind === 'node') return renderNodeInspector(graph.nodes.find(node => node.id === selection.id));
      if(selection.kind === 'nodes' || selection.kind === 'comments' || selection.kind === 'mixed') return renderMultiInspector();
      if(selection.kind === 'comment') return renderCommentInspector((graph.comments || []).find(comment => comment.id === selection.id));
      if(selection.kind === 'variable') return renderVariableInspector(variableByName(selection.name));
      if(selection.kind === 'subgraph') return renderSubgraphInspector(subgraphById(selection.id));
      if(selection.kind === 'root') return renderRootInspector();
      if(selection.kind === 'element') {
        renderViewport();
        return renderElementInspector(sceneElementById(selection.id));
      }
      if(selection.kind === 'sceneComponent') {
        renderViewport();
        return renderSceneComponentInspector(sceneComponentById(selection.id));
      }
      renderGraphInspector();
      renderViewport();
    }

    function renderField(node, pin){
      const row = document.createElement('div');
      row.className = 'lk-lg-field';
      const label = document.createElement('label');
      label.textContent = pin.name;
      row.appendChild(label);
      const value = dataInputValue(node, pin);
      if(pin.type === 'assetRef'){
        row.appendChild(renderAssetRefField(node, pin, value));
      } else if(pin.type === 'boolean'){
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = value === true;
        input.addEventListener('change', () => { setNodeData(graph, node, pin, input.checked); persist(); });
        row.appendChild(input);
      } else if(pin.type === 'number'){
        const input = document.createElement('input');
        input.type = 'number';
        input.step = pin.name === 'duration' ? '.25' : '.1';
        input.value = Number(value == null ? 0 : value);
        input.addEventListener('change', () => { setNodeData(graph, node, pin, input.value); persist(); });
        row.appendChild(input);
      } else if(pin.type === 'vector3'){
        const vec = Array.isArray(value) ? value : [0,0,0];
        const wrap = document.createElement('div');
        wrap.className = 'lk-lg-vec3';
        [0,1,2].forEach(index => {
          const input = document.createElement('input');
          input.type = 'number';
          input.step = '.1';
          input.value = Number(vec[index] || 0);
          input.addEventListener('change', () => {
            setNodeData(graph, node, pin, Array.from(wrap.querySelectorAll('input')).map(item => Number(item.value) || 0));
            persist();
          });
          wrap.appendChild(input);
        });
        row.appendChild(wrap);
      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = value == null ? '' : String(value);
        input.addEventListener('change', () => { setNodeData(graph, node, pin, input.value); persist(); });
        row.appendChild(input);
      }
      return row;
    }

    function connectedPinEdge(node, pin, direction){
      if(direction === 'input') return graph.edges.find(edge => edge.to.node === node.id && edge.to.pin === pin.name) || null;
      return graph.edges.find(edge => edge.from.node === node.id && edge.from.pin === pin.name) || null;
    }

    function edgeDisplayColor(edge){
      if(!edge) return '#75c7ff';
      const sourcePin = pinMeta(reg, graph, edge.from.node, edge.from.pin, 'output');
      const targetPin = pinMeta(reg, graph, edge.to.node, edge.to.pin, 'input');
      if(pinAcceptsMultiple(sourcePin) && targetPin && !pinAcceptsMultiple(targetPin)) return pinColor(targetPin);
      return pinColor(sourcePin);
    }

    function pinEl(node, pin, direction){
      const connectedEdge = connectedPinEdge(node, pin, direction);
      const item = document.createElement('div');
      item.className = 'lk-lg-pin-row ' + direction + ' ' + pin.kind;
      item.style.setProperty('--pin-color', pinColor(pin));
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'lk-lg-pin ' + pin.kind;
      dot.classList.toggle('any', pinAcceptsMultiple(pin));
      dot.classList.toggle('connected', !!connectedEdge);
      dot.style.setProperty('--pin-color', pinColor(pin));
      if(connectedEdge) dot.style.setProperty('--connected-color', edgeDisplayColor(connectedEdge));
      dot.dataset.node = node.id;
      dot.dataset.pin = pin.name;
      dot.dataset.dir = direction;
      dot.dataset.kind = pin.kind;
      dot.dataset.type = pin.type || '';
      dot.title = pin.name + ' · ' + pin.kind + (pin.type ? ' · ' + pin.type : '');
      dot.addEventListener('pointerdown', e => {
        e.stopPropagation();
        if(direction !== 'output') return;
        const source = {node:node.id, pin:pin.name};
        const sourcePin = pinMeta(reg, graph, source.node, source.pin, 'output');
        const start = pinCenter(source.node, source.pin, 'output');
        if(!start) return;
        selectedOut = source;
        canvas.querySelectorAll('.lk-lg-pin.selected').forEach(p => p.classList.remove('selected'));
        dot.classList.add('selected');
        const preview = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        preview.setAttribute('class', 'lk-lg-wire preview');
        preview.style.setProperty('--wire-color', pinColor(sourcePin));
        wires.appendChild(preview);
        let moved = false;
        let hoveredInput = null;
        const clearHover = () => {
          if(!hoveredInput) return;
          hoveredInput.classList.remove('compatible', 'incompatible');
          hoveredInput = null;
        };
        const inputPinAt = (clientX, clientY) => {
          const stack = document.elementsFromPoint ? document.elementsFromPoint(clientX, clientY) : [document.elementFromPoint(clientX, clientY)];
          for(const target of stack){
            const input = target && target.closest && target.closest('.lk-lg-pin[data-dir="input"]');
            if(input) return input;
          }
          return null;
        };
        dot.setPointerCapture(e.pointerId);
        const drawPreview = ev => {
          moved = true;
          const inputPin = inputPinAt(ev.clientX, ev.clientY);
          if(inputPin !== hoveredInput) clearHover();
          let end = screenToGraph(ev.clientX, ev.clientY);
          let compatible = false;
          if(inputPin){
            const target = {node:inputPin.dataset.node, pin:inputPin.dataset.pin};
            const targetPin = pinMeta(reg, graph, target.node, target.pin, 'input');
            compatible = canConnect(reg, graph, source, target);
            hoveredInput = inputPin;
            inputPin.classList.toggle('compatible', compatible);
            inputPin.classList.toggle('incompatible', !compatible);
            if(compatible){
              const previewColor = pinAcceptsMultiple(sourcePin) && targetPin && !pinAcceptsMultiple(targetPin) ? pinColor(targetPin) : pinColor(sourcePin);
              preview.style.setProperty('--wire-color', previewColor);
              const snap = pinCenter(target.node, target.pin, 'input');
              if(snap) end = snap;
            }
          } else {
            preview.style.setProperty('--wire-color', pinColor(sourcePin));
          }
          preview.classList.toggle('compatible', compatible);
          preview.classList.toggle('incompatible', !!inputPin && !compatible);
          preview.setAttribute('d', wirePath(start, end));
        };
        const finish = ev => {
          dot.releasePointerCapture(ev.pointerId);
          dot.removeEventListener('pointermove', drawPreview);
          dot.removeEventListener('pointerup', finish);
          clearHover();
          if(preview.parentNode) preview.parentNode.removeChild(preview);
          if(moved) suppressPinClick = true;
          const inputPin = inputPinAt(ev.clientX, ev.clientY);
          if(inputPin){
            const target = {node:inputPin.dataset.node, pin:inputPin.dataset.pin};
            if(canConnect(reg, graph, source, target)){
              const targetMeta = pinMeta(reg, graph, target.node, target.pin, 'input');
              graph.edges = graph.edges.filter(edge => !(targetMeta && targetMeta.kind === 'data' && edge.to.node === target.node && edge.to.pin === target.pin));
              graph.edges.push({id:edgeId(), from:source, to:target});
              selectedOut = null;
              canvas.querySelectorAll('.lk-lg-pin.selected').forEach(p => p.classList.remove('selected'));
              persist();
              renderNodes();
              return;
            }
            statusEl.textContent = 'Pins are not compatible';
            statusEl.classList.add('bad');
            return;
          }
          selectedOut = source;
          showContextMenu(ev.clientX, ev.clientY, screenToGraph(ev.clientX, ev.clientY));
          setTimeout(() => { suppressPinClick = false; }, 0);
        };
        dot.addEventListener('pointermove', drawPreview);
        dot.addEventListener('pointerup', finish);
      });
      dot.addEventListener('click', e => {
        e.stopPropagation();
        if(suppressPinClick){
          suppressPinClick = false;
          return;
        }
        if(direction === 'output'){
          selectedOut = {node:node.id, pin:pin.name};
          canvas.querySelectorAll('.lk-lg-pin.selected').forEach(p => p.classList.remove('selected'));
          dot.classList.add('selected');
          statusEl.textContent = 'Select an input pin';
          return;
        }
        if(!selectedOut) return;
        const target = {node:node.id, pin:pin.name};
        if(!canConnect(reg, graph, selectedOut, target)){
          statusEl.textContent = 'Pins are not compatible';
          statusEl.classList.add('bad');
          return;
        }
        graph.edges = graph.edges.filter(edge => !(pin.kind === 'data' && edge.to.node === target.node && edge.to.pin === target.pin));
        graph.edges.push({id:edgeId(), from:selectedOut, to:target});
        selectedOut = null;
        canvas.querySelectorAll('.lk-lg-pin.selected').forEach(p => p.classList.remove('selected'));
        persist();
        renderNodes();
      });
      if(direction === 'input') item.appendChild(dot);
      const label = document.createElement('span');
      label.textContent = pin.name;
      item.appendChild(label);
      if(direction === 'output') item.appendChild(dot);
      return item;
    }

    function renderComments(){
      (graph.comments || []).forEach(comment => {
        const boxEl = document.createElement('div');
        boxEl.className = 'lk-lg-comment';
        boxEl.classList.toggle('selected', isCommentSelected(comment));
        boxEl.style.left = (Number(comment.x) || 0) + 'px';
        boxEl.style.top = (Number(comment.y) || 0) + 'px';
        boxEl.style.width = Math.max(120, Number(comment.w) || 320) + 'px';
        boxEl.style.height = Math.max(90, Number(comment.h) || 180) + 'px';
        boxEl.style.setProperty('--comment-color', comment.color || '#ffd166');
        boxEl.dataset.id = comment.id;
        const head = document.createElement('div');
        head.className = 'lk-lg-comment-head';
        head.textContent = comment.title || 'Comment';
        const resize = document.createElement('button');
        resize.type = 'button';
        resize.className = 'lk-lg-comment-resize';
        resize.title = 'Resize';
        boxEl.append(head, resize);
        boxEl.addEventListener('click', e => {
          if(e.shiftKey || e.ctrlKey){
            toggleCommentSelection(comment.id);
            return;
          }
          setSelection({kind:'comment', id:comment.id});
        });
        dragComment(boxEl, comment, head, resize);
        canvas.appendChild(boxEl);
      });
    }

    function dragComment(boxEl, comment, head, resize){
      head.addEventListener('pointerdown', e => {
        if(e.target.closest('button')) return;
        e.stopPropagation();
        const startX = e.clientX, startY = e.clientY;
        const ox = Number(comment.x) || 0, oy = Number(comment.y) || 0;
        boxEl.setPointerCapture(e.pointerId);
        const move = ev => {
          comment.x = Math.round(ox + (ev.clientX - startX) / graphView.zoom);
          comment.y = Math.round(oy + (ev.clientY - startY) / graphView.zoom);
          boxEl.style.left = comment.x + 'px';
          boxEl.style.top = comment.y + 'px';
        };
        const up = ev => {
          boxEl.releasePointerCapture(ev.pointerId);
          boxEl.removeEventListener('pointermove', move);
          boxEl.removeEventListener('pointerup', up);
          persist();
        };
        boxEl.addEventListener('pointermove', move);
        boxEl.addEventListener('pointerup', up);
      });
      resize.addEventListener('pointerdown', e => {
        e.stopPropagation();
        const startX = e.clientX, startY = e.clientY;
        const ow = Math.max(120, Number(comment.w) || 320), oh = Math.max(90, Number(comment.h) || 180);
        boxEl.setPointerCapture(e.pointerId);
        const move = ev => {
          comment.w = Math.round(Math.max(120, ow + (ev.clientX - startX) / graphView.zoom));
          comment.h = Math.round(Math.max(90, oh + (ev.clientY - startY) / graphView.zoom));
          boxEl.style.width = comment.w + 'px';
          boxEl.style.height = comment.h + 'px';
        };
        const up = ev => {
          boxEl.releasePointerCapture(ev.pointerId);
          boxEl.removeEventListener('pointermove', move);
          boxEl.removeEventListener('pointerup', up);
          persist();
          renderInspector();
        };
        boxEl.addEventListener('pointermove', move);
        boxEl.addEventListener('pointerup', up);
      });
    }

    function renderNodes(){
      canvas.innerHTML = '';
      renderComments();
      const checked = validate(graph);
      graph.nodes.forEach(node => {
        const def = reg && reg.get(node.type);
        if(!def) return;
        const callTarget = subgraphForCallNode(rootGraph, node);
        const nodeIssues = diagnosticsForNode(node.id, checked);
        const card = document.createElement('div');
        card.className = 'lk-lg-node ' + categoryClass(def.category);
        card.classList.toggle('is-macro-call', !!(callTarget && callTarget.macro === true));
        card.classList.toggle('selected', isNodeSelected(node));
        card.classList.toggle('has-error', nodeIssues.some(item => item.severity === 'error'));
        card.classList.toggle('has-warning', nodeIssues.some(item => item.severity === 'warning'));
        card.classList.toggle('has-breakpoint', node.data && node.data.breakpoint === true);
        card.style.left = (Number(node.x) || 0) + 'px';
        card.style.top = (Number(node.y) || 0) + 'px';
        card.dataset.id = node.id;
        card.addEventListener('click', e => {
          if(e.target.closest('button') || e.target.closest('input')) return;
          if(e.shiftKey || e.ctrlKey) toggleNodeSelection(node.id);
          else setSelection({kind:'node', id:node.id});
        });
        const head = document.createElement('div');
        head.className = 'lk-lg-node-head';
        const title = document.createElement('b');
        title.textContent = callTarget ? (callTarget.macro === true ? 'Call Macro' : 'Call Function') : def.title;
        if(nodeIssues.length){
          const badge = document.createElement('span');
          badge.className = 'lk-lg-node-diagnostic';
          badge.textContent = '!';
          badge.title = nodeIssues.map(item => item.message).join('\n');
          head.append(title, badge);
        } else {
          head.appendChild(title);
        }
        if(node.data && node.data.breakpoint === true){
          const bp = document.createElement('span');
          bp.className = 'lk-lg-node-breakpoint';
          bp.textContent = '●';
          bp.title = 'Breakpoint';
          head.appendChild(bp);
        }
        const del = document.createElement('button');
        del.type = 'button';
        del.textContent = '×';
        del.title = 'Delete node';
        del.addEventListener('click', e => {
          e.stopPropagation();
          deleteNode(node);
        });
        head.appendChild(del);
        card.appendChild(head);
        const body = document.createElement('div');
        body.className = 'lk-lg-node-body';
        if(callTarget){
          const target = document.createElement('div');
          target.className = 'lk-lg-node-subtitle';
          target.textContent = (callTarget.macro === true ? 'Macro' : 'Function') + ': ' + (callTarget.name || callTarget.id);
          body.appendChild(target);
        }
        pinList(def, 'input', graph, node).forEach(pin => {
          body.appendChild(pinEl(node, pin, 'input'));
          if(pin.kind === 'data' && !isDataInputConnected(graph, node, pin.name)) body.appendChild(renderField(node, pin));
        });
        pinList(def, 'output', graph, node).forEach(pin => body.appendChild(pinEl(node, pin, 'output')));
        card.appendChild(body);
        dragNode(card, node);
        canvas.appendChild(card);
      });
      requestAnimationFrame(drawEdges);
      requestAnimationFrame(renderMiniMap);
    }

    function refreshNodeDiagnostics(checked){
      if(!canvas) return;
      const result = checked || validate(graph);
      graph.nodes.forEach(node => {
        const card = canvas.querySelector('.lk-lg-node[data-id="' + node.id + '"]');
        if(!card) return;
        const issues = diagnosticsForNode(node.id, result);
        card.classList.toggle('has-error', issues.some(item => item.severity === 'error'));
        card.classList.toggle('has-warning', issues.some(item => item.severity === 'warning'));
        card.classList.toggle('has-breakpoint', node.data && node.data.breakpoint === true);
        const head = card.querySelector('.lk-lg-node-head');
        let badge = head && head.querySelector('.lk-lg-node-diagnostic');
        if(!issues.length){
          if(badge) badge.remove();
          return;
        }
        if(!badge && head){
          badge = document.createElement('span');
          badge.className = 'lk-lg-node-diagnostic';
          const removeButton = head.querySelector('button');
          head.insertBefore(badge, removeButton || null);
        }
        badge.textContent = '!';
        badge.title = issues.map(item => item.message).join('\n');
      });
    }

    function dragNode(card, node){
      const head = card.querySelector('.lk-lg-node-head');
      head.addEventListener('pointerdown', e => {
        if(e.target.closest('button')) return;
        if(!isNodeSelected(node)){
          if(e.shiftKey || e.ctrlKey) toggleNodeSelection(node.id);
          else selection = {kind:'node', id:node.id};
        }
        const startX = e.clientX, startY = e.clientY;
        const selected = selectedNodeIdSet();
        const movedIds = selected.has(node.id) ? selected : new Set([node.id]);
        const starts = new Map();
        graph.nodes.forEach(item => {
          if(movedIds.has(item.id)) starts.set(item.id, {x:Number(item.x) || 0, y:Number(item.y) || 0});
        });
        card.setPointerCapture(e.pointerId);
        const move = ev => {
          const dx = (ev.clientX - startX) / graphView.zoom;
          const dy = (ev.clientY - startY) / graphView.zoom;
          starts.forEach((start, id) => {
            const item = graph.nodes.find(candidate => candidate.id === id);
            const elNode = canvas.querySelector('.lk-lg-node[data-id="' + id + '"]');
            if(!item || !elNode) return;
            item.x = Math.round(start.x + dx);
            item.y = Math.round(start.y + dy);
            elNode.style.left = item.x + 'px';
            elNode.style.top = item.y + 'px';
          });
          drawEdges();
        };
        const up = ev => {
          card.releasePointerCapture(ev.pointerId);
          card.removeEventListener('pointermove', move);
          card.removeEventListener('pointerup', up);
          persist();
        };
        card.addEventListener('pointermove', move);
        card.addEventListener('pointerup', up);
      });
    }

    function pinCenter(nodeIdValue, pinName, dir){
      const pin = canvas.querySelector('.lk-lg-pin[data-node="' + nodeIdValue + '"][data-pin="' + pinName + '"][data-dir="' + dir + '"]');
      if(!pin) return null;
      const pr = pin.getBoundingClientRect();
      return screenToGraph(pr.left + pr.width / 2, pr.top + pr.height / 2);
    }

    function drawEdges(){
      wires.innerHTML = '';
      graph.edges.forEach(edge => {
        const a = pinCenter(edge.from.node, edge.from.pin, 'output');
        const b = pinCenter(edge.to.node, edge.to.pin, 'input');
        if(!a || !b) return;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', wirePath(a, b));
        path.setAttribute('class', 'lk-lg-wire');
        path.style.setProperty('--wire-color', edgeDisplayColor(edge));
        path.addEventListener('dblclick', () => {
          graph.edges = graph.edges.filter(item => item.id !== edge.id);
          persist();
          renderNodes();
        });
        wires.appendChild(path);
      });
    }

    function nodeRect(node){
      const nodeEl = canvas.querySelector('.lk-lg-node[data-id="' + node.id + '"]');
      return {
        x:Number(node.x) || 0,
        y:Number(node.y) || 0,
        w:nodeEl ? nodeEl.offsetWidth : 210,
        h:nodeEl ? nodeEl.offsetHeight : 150,
      };
    }

    function commentRect(comment){
      return {
        x:Number(comment.x) || 0,
        y:Number(comment.y) || 0,
        w:Math.max(120, Number(comment.w) || 320),
        h:Math.max(90, Number(comment.h) || 180),
      };
    }

    function intersects(a, b){
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function isGraphBackground(target){
      return target === canvasWrap || target === canvas || target === wires || target === selectionBox;
    }

    function handleGraphPointerDown(e){
      if(activeTab !== 'graph' || !isGraphBackground(e.target)) return;
      canvasWrap.focus({preventScroll:true});
      if(e.button === 1 || spaceDown){
        e.preventDefault();
        const startX = e.clientX, startY = e.clientY;
        const ox = graphView.x, oy = graphView.y;
        canvasWrap.classList.add('panning');
        canvasWrap.setPointerCapture(e.pointerId);
        const move = ev => {
          graphView.x = ox + ev.clientX - startX;
          graphView.y = oy + ev.clientY - startY;
          applyGraphView();
        };
        const up = ev => {
          canvasWrap.releasePointerCapture(ev.pointerId);
          canvasWrap.removeEventListener('pointermove', move);
          canvasWrap.removeEventListener('pointerup', up);
          canvasWrap.classList.remove('panning');
        };
        canvasWrap.addEventListener('pointermove', move);
        canvasWrap.addEventListener('pointerup', up);
        return;
      }
      if(e.button !== 0) return;
      const startGraph = screenToGraph(e.clientX, e.clientY);
      const wrapRect = canvasWrap.getBoundingClientRect();
      const startScreen = {x:e.clientX - wrapRect.left, y:e.clientY - wrapRect.top};
      selectionBox.style.display = 'block';
      selectionBox.style.left = startScreen.x + 'px';
      selectionBox.style.top = startScreen.y + 'px';
      selectionBox.style.width = '0px';
      selectionBox.style.height = '0px';
      canvasWrap.setPointerCapture(e.pointerId);
      const move = ev => {
        const x = ev.clientX - wrapRect.left;
        const y = ev.clientY - wrapRect.top;
        selectionBox.style.left = Math.min(startScreen.x, x) + 'px';
        selectionBox.style.top = Math.min(startScreen.y, y) + 'px';
        selectionBox.style.width = Math.abs(x - startScreen.x) + 'px';
        selectionBox.style.height = Math.abs(y - startScreen.y) + 'px';
      };
      const up = ev => {
        canvasWrap.releasePointerCapture(ev.pointerId);
        canvasWrap.removeEventListener('pointermove', move);
        canvasWrap.removeEventListener('pointerup', up);
        selectionBox.style.display = 'none';
        const endGraph = screenToGraph(ev.clientX, ev.clientY);
        const rect = {
          x:Math.min(startGraph.x, endGraph.x),
          y:Math.min(startGraph.y, endGraph.y),
          w:Math.abs(endGraph.x - startGraph.x),
          h:Math.abs(endGraph.y - startGraph.y),
        };
        if(rect.w < 4 && rect.h < 4){
          if(selectedOut){
            showContextMenu(ev.clientX, ev.clientY, endGraph);
            return;
          }
          setSelection({kind:'graph'});
          return;
        }
        const nodeIds = graph.nodes.filter(node => intersects(nodeRect(node), rect)).map(node => node.id);
        const commentIds = (graph.comments || []).filter(comment => intersects(commentRect(comment), rect)).map(comment => comment.id);
        if(e.shiftKey || e.ctrlKey){
          nodeIds.push.apply(nodeIds, Array.from(selectedNodeIdSet()));
          commentIds.push.apply(commentIds, Array.from(selectedCommentIdSet()));
        }
        setGraphSelection(nodeIds, commentIds);
      };
      canvasWrap.addEventListener('pointermove', move);
      canvasWrap.addEventListener('pointerup', up);
    }

    function handleGraphContextMenu(e){
      if(activeTab !== 'graph') return;
      if(!isGraphBackground(e.target)) return;
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, screenToGraph(e.clientX, e.clientY));
    }

    function handleGraphWheel(e){
      if(activeTab !== 'graph') return;
      e.preventDefault();
      const origin = screenToGraph(e.clientX, e.clientY);
      const factor = e.deltaY > 0 ? .9 : 1.1;
      setGraphZoom(graphView.zoom * factor, origin);
    }

    function isLogicEditorKeyEvent(e){
      const target = e && e.target;
      if(target && root.contains(target)) return true;
      const active = document.activeElement;
      return !!(active && root.contains(active));
    }

    function stopLogicEditorKey(e){
      e.preventDefault();
      e.stopPropagation();
      if(e.stopImmediatePropagation) e.stopImmediatePropagation();
    }

    function handleKeyDown(e){
      if(!isLogicEditorKeyEvent(e) || isFormTarget(e.target)) return;
      if(activeTab === 'viewport'){
        const key = String(e.key || '').toLowerCase();
        if(key === 'w') setViewportTool('move');
        else if(key === 'e') setViewportTool('rotate');
        else if(key === 'r') setViewportTool('scale');
        else if(key === 'f') frameSelectedViewportElement();
        else return;
        stopLogicEditorKey(e);
        return;
      }
      if(activeTab !== 'graph') return;
      const mod = e.ctrlKey || e.metaKey;
      if(mod && String(e.key || '').toLowerCase() === 'c'){
        if(copySelection()) stopLogicEditorKey(e);
        return;
      }
      if(mod && String(e.key || '').toLowerCase() === 'v'){
        pasteSelection();
        stopLogicEditorKey(e);
        return;
      }
      if(mod && String(e.key || '').toLowerCase() === 'd'){
        duplicateSelection();
        stopLogicEditorKey(e);
        return;
      }
      if(mod && String(e.key || '').toLowerCase() === 'z'){
        if(e.shiftKey) redoGraph();
        else undoGraph();
        stopLogicEditorKey(e);
        return;
      }
      if(mod && String(e.key || '').toLowerCase() === 'y'){
        redoGraph();
        stopLogicEditorKey(e);
        return;
      }
      if(String(e.key || '').toLowerCase() === 'f'){
        fitSelection();
        stopLogicEditorKey(e);
        return;
      }
      if(e.code === 'Space'){
        spaceDown = true;
        canvasWrap.classList.add('panning-ready');
        stopLogicEditorKey(e);
        return;
      }
      if(e.key === 'Delete' || e.key === 'Backspace'){
        deleteCurrentSelection();
        hideContextMenu();
        stopLogicEditorKey(e);
      }
    }

    function handleKeyUp(e){
      if(!isLogicEditorKeyEvent(e) || e.code !== 'Space') return;
      spaceDown = false;
      canvasWrap.classList.remove('panning-ready');
      stopLogicEditorKey(e);
    }

    function stopRuntime(){
      if(raf) cancelAnimationFrame(raf);
      raf = 0;
      if(runtime) runtime.stop();
      runtime = null;
      statusEl.textContent = 'Stopped';
    }

    function runRuntime(){
      stopRuntime();
      const checked = validate(graph);
      if(!checked.ok){
        statusEl.textContent = 'Fix graph errors before running';
        statusEl.classList.add('bad');
        return;
      }
      if(!window.LK_LOGIC_SERVICES || !window.LK_LOGIC_RUNTIME){
        statusEl.textContent = 'Logic runtime unavailable';
        statusEl.classList.add('bad');
        return;
      }
      const ctx = window.LK_LOGIC_SERVICES.createContext({GAME, STORE, THREE:window.THREE, owner:opts.object || null, scope:opts.scope, graphName:graph.name});
      runtime = window.LK_LOGIC_RUNTIME.create(graph, reg, ctx);
      if(activeSubgraph()) runtime.triggerEvent('Custom', {eventName:'Entry', payload:null});
      else runtime.start();
      last = performance.now();
      const tick = now => {
        if(!runtime) return;
        const dt = Math.min(.05, (now - last) / 1000 || .016);
        last = now;
        runtime.update(dt);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      statusEl.classList.remove('bad');
      statusEl.textContent = 'Running';
    }

    search.addEventListener('input', renderPalette);
    canvasWrap.addEventListener('pointerdown', handleGraphPointerDown);
    canvasWrap.addEventListener('contextmenu', handleGraphContextMenu);
    canvasWrap.addEventListener('wheel', handleGraphWheel, {passive:false});
    canvasWrap.addEventListener('dragover', e => {
      if(e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('application/x-lk-logic-ref')){
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    canvasWrap.addEventListener('drop', e => {
      const ref = dragPayload(e);
      if(!ref) return;
      e.preventDefault();
      addSidebarReferenceNode(ref, screenToGraph(e.clientX, e.clientY), e);
    });
    canvasWrap.addEventListener('pointerdown', e => {
      if(contextMenu && contextMenu.classList.contains('on') && !e.target.closest('.lk-lg-context-menu')) hideContextMenu();
    });
    miniMap.addEventListener('pointerdown', e => {
      e.stopPropagation();
      const map = miniMap.querySelector('.lk-lg-minimap-map');
      if(!map) return;
      const rect = map.getBoundingClientRect();
      let bounds = null;
      try { bounds = JSON.parse(miniMap.dataset.bounds || 'null'); }
      catch(err){ bounds = null; }
      if(!bounds) return;
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
      const scale = Math.min(rect.width / bounds.w, rect.height / bounds.h);
      const ox = (rect.width - bounds.w * scale) / 2;
      const oy = (rect.height - bounds.h * scale) / 2;
      centerGraphViewOn({
        x:bounds.x + (x - ox) / scale,
        y:bounds.y + (y - oy) / scale,
      });
    });
    root.querySelectorAll('.lk-le-tabs button').forEach(btn => btn.addEventListener('click', () => setActiveTab(btn.dataset.tab)));
    graphSelect.addEventListener('change', () => setActiveGraph(graphSelect.value));
    viewportToolButtons.forEach(btn => btn.addEventListener('click', () => setViewportTool(btn.dataset.viewportTool)));
    viewportSpaceButton.addEventListener('click', toggleViewportSpace);
    viewportSnapButton.addEventListener('click', toggleViewportSnap);
    root.querySelector('[data-viewport-focus]').addEventListener('click', frameSelectedViewportElement);
    root.querySelector('.lk-le-add-element').addEventListener('click', addSceneElement);
    root.querySelector('.lk-lg-zoom-out').addEventListener('click', () => setGraphZoom(graphView.zoom * .86));
    root.querySelector('.lk-lg-zoom-in').addEventListener('click', () => setGraphZoom(graphView.zoom * 1.16));
    root.querySelector('.lk-lg-zoom-label').addEventListener('click', () => {
      graphView.zoom = 1;
      applyGraphView();
    });
    root.querySelector('.lk-lg-fit').addEventListener('click', fitSelection);
    root.querySelector('.lk-lg-add-comment').addEventListener('click', addCommentBox);
    root.querySelector('.lk-lg-add-subgraph').addEventListener('click', addSubgraph);
    root.querySelector('.lk-lg-add-var').addEventListener('click', () => {
      const variable = {name:uniqueVariableName(), type:'number', value:0, parentId:'root', linked:true, exposed:false};
      graph.variables.push(variable);
      persist();
      setSelection({kind:'variable', name:variable.name});
    });
    root.querySelector('.lk-lg-run').addEventListener('click', runRuntime);
    root.querySelector('.lk-lg-stop').addEventListener('click', stopRuntime);
    window.addEventListener('resize', resizeViewport3D);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    box.addEventListener('logic-editor-close', () => {
      stopRuntime();
      window.removeEventListener('resize', resizeViewport3D);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      disposeViewport3D();
    });
    renderPalette();
    renderGraphSelect();
    renderComponents();
    renderSubgraphs();
    renderVariables();
    renderNodes();
    renderInspector();
    syncScenePreviewObject();
    applyGraphView();
    syncStatus(false);
  }

  function buildLevel(box){
    const graph = STORE.getLevelLogicGraph ? STORE.getLevelLogicGraph() : defaultGraph('Level Logic', 'level');
    buildGraphEditor(box, {scope:'level', name:'Level Logic', graph});
  }

  function saveElementGraph(object, graph){
    if(!object || !object.userData) return;
    const normalized = window.LK_LOGIC_GRAPH.normalizeGraph(graph, object.userData.editorName || 'Logic Element', 'element');
    const api = STORE.logicElementAssets;
    const assetId = object.userData.logicAssetId;
    if(object.userData.logicLinked && assetId && api){
      const current = api.get(assetId);
      const asset = api.saveAsset(current && current.name || normalized.name, normalized, {
        id:assetId,
        createdAt:current && current.createdAt,
      });
      if(asset) syncLogicAssetInstances(asset);
    } else {
      object.userData.logicGraph = normalized;
      if(object.userData.addedEntry) object.userData.addedEntry.graph = window.LK_LOGIC_GRAPH.clone(normalized);
      if(STORE.syncLogicElementSceneObject) STORE.syncLogicElementSceneObject(object, normalized);
    }
    markDirty();
  }

  function logicAssetForObject(object){
    const id = object && object.userData && object.userData.logicAssetId;
    return id && STORE.logicElementAssets ? STORE.logicElementAssets.get(id) : null;
  }

  function resolvedLinkedGraph(object, asset){
    const api = STORE.logicElementAssets;
    if(!api || !asset) return object.userData.logicGraph;
    return api.resolveGraph({
      graph:asset.graph,
      logicAssetId:asset.id,
      logicLinked:true,
      logicAsset:asset,
      variableOverrides:object.userData.logicVariableOverrides || {},
    }, object.userData.editorName || asset.name);
  }

  function syncLogicAssetInstances(asset){
    if(!asset || !GAME || !GAME.world || !Array.isArray(GAME.world.registry)) return;
    GAME.world.registry.forEach(instance => {
      if(!instance || !instance.userData || !instance.userData.logicLinked || instance.userData.logicAssetId !== asset.id) return;
      const graph = resolvedLinkedGraph(instance, asset);
      instance.userData.logicGraph = graph;
      const entry = instance.userData.addedEntry;
      if(entry){
        entry.graph = window.LK_LOGIC_GRAPH.clone(graph);
        entry.logicAssetId = asset.id;
        entry.logicLinked = true;
        entry.variableOverrides = window.LK_LOGIC_GRAPH.clone(instance.userData.logicVariableOverrides || {});
        entry.logicAsset = window.LK_LOGIC_GRAPH.clone(asset);
      }
      if(STORE.syncLogicElementSceneObject) STORE.syncLogicElementSceneObject(instance, graph);
    });
    refreshOutliner();
    refreshAssetsPanel();
  }

  async function createReusableAsset(object){
    if(!STORE.logicElementAssets) return;
    const name = await promptEditorAction({
      title:tr('Create Logic Element asset', 'Crea asset Logic Element'),
      message:tr('Reusable asset name:', 'Nome dell\'asset riutilizzabile:'),
      value:object.userData.editorName || 'Logic Element',
      okText:tr('Create', 'Crea'),
    });
    if(!name || !String(name).trim()) return;
    const asset = STORE.logicElementAssets.saveAsset(String(name).trim(), graphOf(object));
    if(!asset) return;
    object.userData.logicAssetId = asset.id;
    object.userData.logicLinked = true;
    object.userData.logicVariableOverrides = {};
    syncLogicAssetInstances(asset);
    markDirty();
    rebuildInspector();
    status(tr('Reusable Logic Element asset created', 'Asset Logic Element riutilizzabile creato'));
  }

  function makeLogicElementLocal(object){
    const graph = graphOf(object);
    object.userData.logicAssetId = null;
    object.userData.logicLinked = false;
    object.userData.logicVariableOverrides = {};
    object.userData.logicGraph = graph;
    const entry = object.userData.addedEntry;
    if(entry){
      entry.graph = window.LK_LOGIC_GRAPH.clone(graph);
      delete entry.logicAssetId;
      delete entry.logicLinked;
      delete entry.variableOverrides;
      delete entry.logicAsset;
    }
    markDirty();
    refreshOutliner();
    refreshAssetsPanel();
    rebuildInspector();
    status(tr('Logic Element converted to a local copy', 'Logic Element convertito in copia locale'));
  }

  function resetLogicElementOverrides(object){
    const asset = logicAssetForObject(object);
    if(!asset) return;
    object.userData.logicVariableOverrides = {};
    object.userData.logicGraph = resolvedLinkedGraph(object, asset);
    const entry = object.userData.addedEntry;
    if(entry){
      entry.variableOverrides = {};
      entry.graph = window.LK_LOGIC_GRAPH.clone(object.userData.logicGraph);
    }
    if(STORE.syncLogicElementSceneObject) STORE.syncLogicElementSceneObject(object, object.userData.logicGraph);
    markDirty();
    rebuildInspector();
  }

  function clampWindowRect(rect){
    const margin = 12;
    const minW = Math.min(720, Math.max(280, window.innerWidth - margin * 2));
    const minH = Math.min(460, Math.max(320, window.innerHeight - margin * 2));
    const maxW = Math.max(minW, window.innerWidth - margin * 2);
    const maxH = Math.max(minH, window.innerHeight - margin * 2);
    const w = Math.max(minW, Math.min(maxW, rect.w || 1280));
    const h = Math.max(minH, Math.min(maxH, rect.h || 760));
    const x = Math.max(margin, Math.min(window.innerWidth - w - margin, rect.x == null ? (window.innerWidth - w) / 2 : rect.x));
    const y = Math.max(margin, Math.min(window.innerHeight - h - margin, rect.y == null ? 68 : rect.y));
    return {x, y, w, h};
  }

  function applyLogicWindowRect(panel, rect, notify){
    const next = clampWindowRect(rect);
    panel.style.left = Math.round(next.x) + 'px';
    panel.style.top = Math.round(next.y) + 'px';
    panel.style.width = Math.round(next.w) + 'px';
    panel.style.height = Math.round(next.h) + 'px';
    logicWindowState = next;
    if(notify !== false) window.dispatchEvent(new Event('resize'));
  }

  function setupLogicWindow(panel, head, resizeHandle){
    applyLogicWindowRect(panel, logicWindowState || {
      w:Math.min(1480, window.innerWidth - 56),
      h:Math.min(820, window.innerHeight - 96),
      x:null,
      y:68,
    });
    let drag = null;
    head.addEventListener('pointerdown', e => {
      if(e.button !== 0 || e.target.closest('button')) return;
      const rect = panel.getBoundingClientRect();
      drag = {mode:'move', pointerId:e.pointerId, dx:e.clientX - rect.left, dy:e.clientY - rect.top, rect:{x:rect.left, y:rect.top, w:rect.width, h:rect.height}};
      head.setPointerCapture(e.pointerId);
      panel.classList.add('is-moving');
      e.preventDefault();
    });
    resizeHandle.addEventListener('pointerdown', e => {
      if(e.button !== 0) return;
      const rect = panel.getBoundingClientRect();
      drag = {mode:'resize', pointerId:e.pointerId, sx:e.clientX, sy:e.clientY, rect:{x:rect.left, y:rect.top, w:rect.width, h:rect.height}};
      resizeHandle.setPointerCapture(e.pointerId);
      panel.classList.add('is-resizing');
      e.preventDefault();
    });
    const move = e => {
      if(!drag) return;
      if(drag.mode === 'move'){
        applyLogicWindowRect(panel, {x:e.clientX - drag.dx, y:e.clientY - drag.dy, w:drag.rect.w, h:drag.rect.h});
      } else {
        applyLogicWindowRect(panel, {
          x:drag.rect.x,
          y:drag.rect.y,
          w:drag.rect.w + (e.clientX - drag.sx),
          h:drag.rect.h + (e.clientY - drag.sy),
        });
      }
    };
    const end = e => {
      if(!drag) return;
      try {
        if(drag.mode === 'move') head.releasePointerCapture(drag.pointerId);
        else resizeHandle.releasePointerCapture(drag.pointerId);
      } catch(err){}
      drag = null;
      panel.classList.remove('is-moving', 'is-resizing');
      window.dispatchEvent(new Event('resize'));
    };
    head.addEventListener('pointermove', move);
    resizeHandle.addEventListener('pointermove', move);
    head.addEventListener('pointerup', end);
    resizeHandle.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
    resizeHandle.addEventListener('pointercancel', end);
    const onWindowResize = () => {
      if(logicWindowState) applyLogicWindowRect(panel, logicWindowState, false);
    };
    window.addEventListener('resize', onWindowResize);
    return () => window.removeEventListener('resize', onWindowResize);
  }

  function openGraphWindow(object){
    if(!object) return;
    const old = document.querySelector('.lk-logic-modal');
    if(old){
      const oldBody = old.querySelector('.lk-logic-modal-body');
      if(oldBody) oldBody.dispatchEvent(new CustomEvent('logic-editor-close'));
      if(old._lkCleanupLogicWindow) old._lkCleanupLogicWindow();
      old.remove();
    }
    const overlay = document.createElement('div');
    overlay.className = 'lk-logic-modal';
    const panel = document.createElement('div');
    panel.className = 'lk-logic-modal-panel';
    const head = document.createElement('div');
    head.className = 'lk-logic-modal-head';
    const title = document.createElement('b');
    const sharedAsset = logicAssetForObject(object);
    title.textContent = (sharedAsset ? sharedAsset.name : (object.userData.editorName || 'Logic Element')) + ' · Logic Editor';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.title = 'Close';
    const resize = document.createElement('div');
    resize.className = 'lk-logic-modal-resize';
    resize.title = 'Resize';
    let cleanupLogicWindow = null;
    function closeModal(){
      body.dispatchEvent(new CustomEvent('logic-editor-close'));
      if(cleanupLogicWindow) cleanupLogicWindow();
      overlay.remove();
      rebuildInspector();
    }
    close.addEventListener('click', closeModal);
    head.append(title, close);
    const body = document.createElement('div');
    body.className = 'lk-logic-modal-body';
    panel.append(head, body, resize);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    cleanupLogicWindow = setupLogicWindow(panel, head, resize);
    overlay._lkCleanupLogicWindow = cleanupLogicWindow;
    buildGraphEditor(body, {
      scope:'element',
      name:object.userData.editorName || 'Logic Element',
      graph:sharedAsset && sharedAsset.graph || object.userData.logicGraph,
      object,
      onSave: graph => {
        saveElementGraph(object, graph);
        status('Logic graph updated');
      },
    });
  }

  function graphOf(object){
    const name = object && object.userData && object.userData.editorName || 'Logic Element';
    const graph = object && object.userData && object.userData.logicGraph || defaultGraph(name, 'element');
    return window.LK_LOGIC_GRAPH.normalizeGraph(graph, name, 'element');
  }

  function saveObjectName(object, value){
    const name = String(value || '').trim() || 'Logic Element';
    object.userData.editorName = name;
    if(object.userData.addedEntry) object.userData.addedEntry.name = name;
    if(object.userData.logicLinked){
      markDirty();
    } else {
      const graph = graphOf(object);
      graph.name = name;
      saveElementGraph(object, graph);
    }
    refreshOutliner();
  }

  function numberInput(value, step, onChange){
    const input = el('<input type="number" step="' + (step || .1) + '">');
    input.value = Number(value || 0).toFixed(3).replace(/\.?0+$/, '');
    input.addEventListener('focus', beginTransformHistory);
    input.addEventListener('change', () => {
      const next = parseFloat(input.value);
      onChange(Number.isFinite(next) ? next : 0);
      commitTransformHistory('Logic Element transform');
      markDirty();
    });
    return input;
  }

  function buildTransformSection(box, object){
    const st = section(tr('TRANSFORM', 'TRASFORMAZIONE'));
    const pos = el('<div class="lk-vec"><label>' + tr('Position', 'Posizione') + '</label></div>');
    ['x','y','z'].forEach(axis => pos.appendChild(numberInput(object.position[axis], .1, value => {
      object.position[axis] = value;
      if(STORE.syncCollider) STORE.syncCollider(object);
    })));
    st.body.appendChild(pos);
    box.appendChild(st.root);
  }

  function variableLabel(variable){
    return variable.label || variable.displayName || variable.name;
  }

  function parseVariableValue(variable, raw){
    if(variable.type === 'number') return Number(raw) || 0;
    if(variable.type === 'boolean') return !!raw;
    if(variable.type === 'vector3'){
      if(Array.isArray(raw)) return [Number(raw[0]) || 0, Number(raw[1]) || 0, Number(raw[2]) || 0];
      return [0, 0, 0];
    }
    if(variable.type === 'string') return String(raw == null ? '' : raw);
    try { return JSON.parse(raw); }
    catch(err){ return variable.value; }
  }

  function updateVariable(object, variable, value){
    const graph = graphOf(object);
    const target = graph.variables.find(v => v.name === variable.name);
    if(!target) return;
    const parsed = parseVariableValue(target, value);
    if(object.userData.logicLinked && object.userData.logicAssetId && STORE.logicElementAssets){
      object.userData.logicVariableOverrides = Object.assign({}, object.userData.logicVariableOverrides || {}, {[target.name]:parsed});
      const asset = logicAssetForObject(object);
      if(asset) object.userData.logicGraph = resolvedLinkedGraph(object, asset);
      const entry = object.userData.addedEntry;
      if(entry){
        entry.variableOverrides = window.LK_LOGIC_GRAPH.clone(object.userData.logicVariableOverrides);
        entry.graph = window.LK_LOGIC_GRAPH.clone(object.userData.logicGraph);
      }
      markDirty();
      return;
    }
    target.value = parsed;
    saveElementGraph(object, graph);
  }

  function buildVariableControl(object, variable){
    const row = el('<div class="lk-row"></div>');
    const label = document.createElement('label');
    label.textContent = variableLabel(variable);
    row.appendChild(label);
    if(variable.type === 'boolean'){
      const input = el('<input type="checkbox">');
      input.checked = variable.value === true;
      input.addEventListener('change', () => updateVariable(object, variable, input.checked));
      row.appendChild(input);
      return row;
    }
    if(variable.type === 'number'){
      const input = el('<input type="number" step="' + (variable.step || .1) + '">');
      if(variable.min != null) input.min = variable.min;
      if(variable.max != null) input.max = variable.max;
      input.value = Number(variable.value || 0);
      input.addEventListener('change', () => updateVariable(object, variable, input.value));
      row.appendChild(input);
      return row;
    }
    if(variable.type === 'vector3'){
      row.className = 'lk-vec';
      const vec = Array.isArray(variable.value) ? variable.value : [0,0,0];
      ['x','y','z'].forEach((axis, index) => {
        const input = el('<input type="number" step=".1" title="' + axis.toUpperCase() + '">');
        input.value = Number(vec[index] || 0);
        input.addEventListener('change', () => {
          const next = Array.from(row.querySelectorAll('input')).map(item => Number(item.value) || 0);
          updateVariable(object, variable, next);
        });
        row.appendChild(input);
      });
      return row;
    }
    if(variable.type === 'string'){
      const input = el('<input type="text">');
      input.value = variable.value == null ? '' : String(variable.value);
      input.addEventListener('change', () => updateVariable(object, variable, input.value));
      row.appendChild(input);
      return row;
    }
    const input = el('<textarea rows="3" spellcheck="false"></textarea>');
    input.value = variable.value == null ? '' : JSON.stringify(variable.value, null, 2);
    input.addEventListener('change', () => updateVariable(object, variable, input.value));
    row.appendChild(input);
    return row;
  }

  function buildExposedVariables(box, object){
    const graph = graphOf(object);
    const vars = graph.variables.filter(v => v.exposed === true);
    const sec = section(tr('EXPOSED VARIABLES', 'VARIABILI ESPOSTE'));
    if(!vars.length){
      sec.body.appendChild(el('<div class="lk-hint">' + tr('No exposed variables. Open the Logic Graph and expose a variable from the Variables panel.', 'Nessuna variabile esposta. Apri il Logic Graph ed esponi una variabile dal pannello Variables.') + '</div>'));
    } else {
      vars.forEach(variable => {
        sec.body.appendChild(buildVariableControl(object, variable));
        if(variable.description) sec.body.appendChild(el('<div class="lk-hint">' + variable.description + '</div>'));
      });
    }
    box.appendChild(sec.root);
  }

  function buildElement(box, object){
    const name = object && object.userData && object.userData.editorName || 'Logic Element';
    const graph = graphOf(object);
    box.appendChild(el('<div class="lk-head"><span class="lk-head-ic">◇</span><input class="lk-head-name"><span class="lk-head-id">Logic Element</span></div>'));
    const nameInput = box.querySelector('.lk-head-name');
    nameInput.value = name;
    nameInput.addEventListener('change', () => saveObjectName(object, nameInput.value));

    buildTransformSection(box, object);

    const mg = section(tr('LOGIC ELEMENT', 'LOGIC ELEMENT'));
    mg.body.appendChild(checkRow(tr('Enabled', 'Attivo'), object.userData.logicEnabled !== false, value => {
      object.userData.logicEnabled = !!value;
      if(object.userData.addedEntry) object.userData.addedEntry.enabled = !!value;
      markDirty();
    }).root);
    mg.body.appendChild(checkRow(tr('Run in editor preview', 'Esegui in preview editor'), object.userData.logicRunInEditorPreview !== false, value => {
      object.userData.logicRunInEditorPreview = !!value;
      if(object.userData.addedEntry) object.userData.addedEntry.runInEditorPreview = !!value;
      markDirty();
    }).root);
    const checked = validate(graph);
    mg.body.appendChild(el('<div class="lk-hint">' + (checked.ok
      ? ('Graph valid · ' + graph.nodes.length + ' nodes · ' + graph.edges.length + ' edges')
      : ('Graph errors: ' + checked.errors.map(e => e.message).join(' | '))) + '</div>'));
    mg.body.appendChild(btnRow([
      {label:tr('Open Logic Editor', 'Apri Logic Editor'), action:() => openGraphWindow(object)},
    ]));
    const asset = logicAssetForObject(object);
    if(asset){
      const overrideCount = Object.keys(object.userData.logicVariableOverrides || {}).length;
      mg.body.appendChild(el('<div class="lk-hint">' + tr('Linked asset: ', 'Asset collegato: ') + asset.name + ' · ' + overrideCount + tr(' instance override(s)', ' override di istanza') + '</div>'));
      mg.body.appendChild(btnRow([
        {label:tr('Reset overrides', 'Reset override'), action:() => resetLogicElementOverrides(object)},
        {label:tr('Make local', 'Rendi locale'), action:() => makeLogicElementLocal(object)},
      ]));
    } else {
      mg.body.appendChild(el('<div class="lk-hint">' + tr('Local Logic Element. Create an asset to reuse this definition across linked scene instances.', 'Logic Element locale. Crea un asset per riutilizzare questa definizione tra istanze collegate nella scena.') + '</div>'));
      mg.body.appendChild(btnRow([
        {label:tr('Create reusable asset', 'Crea asset riutilizzabile'), action:() => createReusableAsset(object)},
      ]));
    }
    box.appendChild(mg.root);

    buildExposedVariables(box, object);
  }

  return Object.freeze({buildLevel, buildElement});
}

window.LK_EDITOR_LOGIC_ELEMENTS_INSPECTOR = Object.freeze({create});
})();
