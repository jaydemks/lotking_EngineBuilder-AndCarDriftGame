/* =========================================================
   LOT KING - Mission Director template

   The editor-facing authoring surface for js/runtime/objective-system.js.
   Drop one into a level, fill in the objective list, and the mission HUD,
   scoring, timer and win/lose flow run in Play Preview, in gameplay and in the
   playable export without any code.

   Game-mode level templates ship a pre-filled copy of this same Logic Element,
   so what a mode does is authored data rather than a private script.
   ========================================================= */
(function(){
'use strict';

function clone(value){ return JSON.parse(JSON.stringify(value)); }
function node(id,type,x,y,data){ return {id,type,x:x||0,y:y||0,data:Object.assign({},data||{})}; }
function edge(id,fromNode,fromPin,toNode,toPin){ return {id,from:{node:fromNode,pin:fromPin},to:{node:toNode,pin:toPin}}; }
function variable(name,type,value,binding,label,category,extra){
  return Object.assign({name,type,value,exposed:true,binding,label,category},extra||{});
}
function numberVar(name,value,binding,label,category,min,max,step){
  return variable(name,'number',value,binding,label,category,{min,max,step});
}
function selectVar(name,value,binding,label,category,options){
  return variable(name,'string',value,binding,label,category,{ui:'select',options:options.map(function(item){ return {value:item[0],label:item[1]}; })});
}

const DEFAULT_OBJECTIVES = Object.freeze([
  Object.freeze({id:'objective_1',title:'Reach the marker',kind:'reach',points:100,optional:false,
    target:Object.freeze({tag:'',radius:4,position:Object.freeze({x:0,y:0,z:-20})})}),
]);

function missionVariables(spec){
  return [
    variable('MissionEnabled','boolean',true,'enabled','Mission Enabled','Mission'),
    variable('MissionTitle','string',spec.title,'title','Mission Title','Mission'),
    variable('MissionSubtitle','string',spec.subtitle||'','subtitle','Subtitle','Mission'),
    selectVar('MissionMode',spec.mode,'mode','Objective Flow','Mission',[
      ['sequence','One at a time (sequence)'],
      ['parallel','All at once (parallel)'],
      ['any','First one wins (any)'],
    ]),
    numberVar('MissionTimeLimit',spec.timeLimit,'timeLimit','Time Limit (s, 0 = none)','Mission',0,86400,1),
    variable('MissionFailOnTimeout','boolean',spec.failOnTimeout!==false,'failOnTimeout','Fail When Time Runs Out','Mission'),
    numberVar('MissionScoreTarget',spec.scoreTarget||0,'scoreTarget','Score Target (0 = none)','Mission',0,1000000,10),
    numberVar('MissionStartDelay',spec.startDelay||0,'startDelay','Start Delay (s)','Mission',0,60,.5),
    variable('MissionRestartOnFail','boolean',spec.restartOnFail===true,'restartOnFail','Restart On Fail','Mission'),
    // The list editor writes a plain array straight back into the graph, so a
    // mode template can ship its objectives as ordinary authored data.
    variable('MissionObjectives','objectiveList',clone(spec.objectives),'objectives','Objectives','Objectives',{ui:'objective-list'}),
    variable('HudEnabled','boolean',true,'hud.enabled','Show Mission HUD','HUD'),
    selectVar('HudPosition','top-right','hud.position','HUD Corner','HUD',[
      ['top-right','Top right'],['top-left','Top left'],['bottom-right','Bottom right'],['bottom-left','Bottom left'],
    ]),
    variable('HudShowTimer','boolean',true,'hud.showTimer','Show Timer','HUD'),
    variable('HudShowScore','boolean',true,'hud.showScore','Show Score','HUD'),
    variable('HudShowProgress','boolean',true,'hud.showProgress','Show Progress Bars','HUD'),
    variable('HudShowOptional','boolean',true,'hud.showOptional','Show Optional Objectives','HUD'),
    variable('CompleteEvent','string',spec.completeEvent||'','completeEvent','Custom Event On Complete','Events'),
    variable('FailEvent','string',spec.failEvent||'','failEvent','Custom Event On Fail','Events'),
  ];
}

function makeLogicScene(spec){
  return {
    root:{id:'root',name:spec.name+' Root',type:'empty',linked:true,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],color:spec.color},
    elements:[],
    components:[
      {id:'root_transform',elementId:'root',name:'Transform',type:'transform',linked:true},
      {id:'mission_director',elementId:'root',name:'Mission Director',type:'mission-director',linked:true},
    ],
  };
}

function makeGraph(spec){
  const graph={
    version:1,
    name:spec.templateName,
    scope:'element',
    enabled:true,
    variables:missionVariables(spec),
    nodes:[
      node('on_start','event.onStart',80,120),
      node('start_mission','objectives.startMission',330,120),
      node('on_complete','event.onMissionCompleted',80,300),
      node('complete_log','debug.print',380,300,{message:'Mission complete.',duration:4}),
      node('on_fail','event.onMissionFailed',80,440),
      node('fail_log','debug.print',380,440,{message:'Mission failed.',duration:4}),
    ],
    edges:[
      edge('e_start','on_start','then','start_mission','exec'),
      edge('e_complete','on_complete','then','complete_log','exec'),
      edge('e_fail','on_fail','then','fail_log','exec'),
    ],
    comments:[{id:'mission_info',title:'Mission Director. Objectives, HUD, timer and scoring are authored in the Inspector; the graph only starts the mission and reacts to the outcome. Report gameplay events with the Report Gameplay Event node from anywhere in the level.',x:35,y:35,w:760,h:60,color:spec.color}],
    subgraphs:[],
  };
  graph.logicScene=makeLogicScene(spec);
  graph.missionDirector={
    schemaVersion:1,
    template:true,
    enabled:true,
    id:spec.missionId,
    title:spec.title,
    subtitle:spec.subtitle||'',
    mode:spec.mode,
    timeLimit:spec.timeLimit,
    failOnTimeout:spec.failOnTimeout!==false,
    scoreTarget:spec.scoreTarget||0,
    startDelay:spec.startDelay||0,
    restartOnFail:spec.restartOnFail===true,
    hud:{enabled:true,position:'top-right',showTimer:true,showScore:true,showProgress:true,showOptional:true},
    completeEvent:spec.completeEvent||'',
    failEvent:spec.failEvent||'',
    objectives:clone(spec.objectives),
  };
  return graph;
}

const SPEC={
  name:'Mission Director',
  templateName:'Mission Director',
  missionId:'mission',
  color:'#facc15',
  title:'Mission',
  subtitle:'',
  mode:'sequence',
  timeLimit:0,
  failOnTimeout:true,
  scoreTarget:0,
  startDelay:0,
  restartOnFail:false,
  objectives:DEFAULT_OBJECTIVES,
};

/** Game-mode level templates call this to ship a pre-authored mission without
 *  duplicating the graph, HUD wiring or variable list. */
function makeMissionGraph(overrides){
  return makeGraph(Object.assign({}, SPEC, overrides || {}));
}

function makeTemplates(){
  return [{
    id:'logic-template-mission-director',
    name:'Mission Director',
    description:'Objectives, timer, score, HUD and win/lose flow for any game mode. Author the objective list in the Inspector; report gameplay events from any graph.',
    category:'Gameplay / Mission',
    graph:makeGraph(SPEC),
  }];
}

if(window.LK_LOGIC_TEMPLATES && window.LK_LOGIC_TEMPLATES.register) window.LK_LOGIC_TEMPLATES.register(makeTemplates());
window.LK_LOGIC_TEMPLATES_MISSION=Object.freeze({SPEC,makeTemplates,makeMissionGraph});
})();
