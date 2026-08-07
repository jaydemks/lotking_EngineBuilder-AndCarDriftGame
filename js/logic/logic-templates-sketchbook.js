/* =========================================================
   LOT KING - DollBody editable pawn templates

   DollBody is this engine's character/vehicle traversal kit. Its architecture
   derives from the MIT-licensed Sketchbook by Jan Blaha (swift502); that credit
   lives in the SOURCE block and docs/, and the name is not used as a product
   or identifier label anywhere in the editor.
   Source: https://github.com/swift502/Sketchbook (MIT)
   Snapshot: 62f4b7986fd1ce1e4f91daba89ef032c20a6ce55
   ========================================================= */
(function(){
'use strict';

const SOURCE = Object.freeze({
  repository:'https://github.com/swift502/Sketchbook',
  commit:'62f4b7986fd1ce1e4f91daba89ef032c20a6ce55',
  license:'MIT',
  author:'Jan Bláha (swift502)',
  attribution:'Sketchbook by Jan Bláha (swift502)',
});

// Rendered longest-axis size of each bundled GLB as authored. `fit` normalizes a
// model to a target longest axis, so a `fit` equal to one of these numbers means
// "leave this model at its source scale".
const SOURCE_SIZE = Object.freeze({
  world:2847.2265625,
  car:2.4926951,
  airplane:3.5621045,
  helicopter:3.9225264,
});
// The mannequin is normalized to a 1.8 m LOT KING character, but the vehicles
// shipped at source scale: a 2.49 m car beside a 1.8 m person reads as a toy,
// and the character could not physically fit through its door. Every vehicle is
// scaled by ONE factor, chosen so the car lands on a real 4.4 m hatchback. That
// keeps the set's own internal proportions - the plane stays 1.43 car-lengths
// across, the helicopter 1.57 - and scaling the model is also what scales its
// physics, because the bundled colliders, wheel mounts and seats are all
// scanned off the loaded GLB rather than authored in metres.
const CHARACTER_HEIGHT_M = 1.8;
const CAR_LENGTH_M = 4.4;
const VEHICLE_SCALE = CAR_LENGTH_M / SOURCE_SIZE.car;
function metreFit(kind){ return Number((SOURCE_SIZE[kind] * VEHICLE_SCALE).toFixed(6)); }

const ASSETS = Object.freeze({
  // The world is the frame every other size is read against, so it is the one
  // model that stays exactly as authored.
  world:Object.freeze({id:'sketchbook-world',key:'builtin:sketchbook/world',src:'models/sketchbook/world.glb',name:'DollBody Open World',source:SOURCE.repository,kind:'glb',fit:SOURCE_SIZE.world,metadataMode:'gltf-extras',physicsBackend:'sketchbook-metadata'}),
  character:Object.freeze({id:'sketchbook-boxman',key:'builtin:sketchbook/boxman',src:'models/sketchbook/boxman.glb',name:'DollBody Mannequin',source:SOURCE.repository,kind:'glb',fit:CHARACTER_HEIGHT_M}),
  car:Object.freeze({id:'sketchbook-car',key:'builtin:sketchbook/car',src:'models/sketchbook/car.glb',name:'DollBody Car',source:SOURCE.repository,kind:'glb',fit:metreFit('car'),sourceFit:SOURCE_SIZE.car}),
  airplane:Object.freeze({id:'sketchbook-airplane',key:'builtin:sketchbook/airplane',src:'models/sketchbook/airplane.glb',name:'DollBody Airplane',source:SOURCE.repository,kind:'glb',fit:metreFit('airplane'),sourceFit:SOURCE_SIZE.airplane}),
  helicopter:Object.freeze({id:'sketchbook-helicopter',key:'builtin:sketchbook/helicopter',src:'models/sketchbook/heli.glb',name:'DollBody Helicopter',source:SOURCE.repository,kind:'glb',fit:metreFit('helicopter'),sourceFit:SOURCE_SIZE.helicopter}),
});

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
function vehicleDamageDefaults(type){
  const values=type==='helicopter'?{energy:1150,tank:[-.65,.72,-.35],engine:[0,1.05,.2],exhaust:[0,.92,-1.35],radius:.48,blast:8}:type==='airplane'?{energy:1400,tank:[0,.42,-.2],engine:[0,.52,1.15],exhaust:[0,.45,-1.65],radius:.5,blast:9}:{energy:850,tank:[-.72,.48,-1.18],engine:[0,.72,.82],exhaust:[0,.42,-1.72],radius:.42,blast:7};
  return {enabled:true,maxEnergy:values.energy,fuelTank:{enabled:true,position:values.tank,radius:values.radius,damageMultiplier:2.5,dummyVisible:false},engineSmoke:{position:values.engine,dummyVisible:true},exhaust:{position:values.exhaust,dummyVisible:true},smokeThreshold:.62,fireThreshold:.28,smokeRate:8,fireRate:14,explosion:{delay:.75,radius:values.blast,force:120,detachWheels:true,blacken:true}};
}
function vehicleDamageVariables(type){const cfg=vehicleDamageDefaults(type);return [
  variable('VehicleDamageEnabled','boolean',true,'damage.enabled','Vehicle Damage Enabled','Vehicle / Damage'),
  numberVar('VehicleEnergy',cfg.maxEnergy,'damage.maxEnergy','Maximum Energy','Vehicle / Damage',1,100000,10),
  variable('FuelTankPosition','vector3',cfg.fuelTank.position,'damage.fuelTank.position','Fuel Tank Dummy','Vehicle / Damage'),
  numberVar('FuelTankRadius',cfg.fuelTank.radius,'damage.fuelTank.radius','Fuel Tank Radius','Vehicle / Damage',.08,5,.01),
  numberVar('FuelTankDamageMultiplier',2.5,'damage.fuelTank.damageMultiplier','Fuel Tank Damage Multiplier','Vehicle / Damage',1,20,.1),
  variable('ShowFuelTankDummy','boolean',false,'damage.fuelTank.dummyVisible','Show Fuel Tank Dummy','Vehicle / Damage'),
  variable('EngineSmokePosition','vector3',cfg.engineSmoke.position,'damage.engineSmoke.position','Engine Smoke Dummy','Vehicle / Damage'),
  variable('ExhaustPosition','vector3',cfg.exhaust.position,'damage.exhaust.position','Exhaust / Muffler Dummy','Vehicle / Damage'),
  numberVar('VehicleSmokeThreshold',.62,'damage.smokeThreshold','Smoke Threshold','Vehicle / Damage',0,1,.01),
  numberVar('VehicleFireThreshold',.28,'damage.fireThreshold','Fire Threshold','Vehicle / Damage',0,1,.01),
  numberVar('VehicleExplosionDelay',.75,'damage.explosion.delay','Explosion Delay','Vehicle / Damage',0,10,.05),
  numberVar('VehicleExplosionRadius',cfg.explosion.radius,'damage.explosion.radius','Explosion Radius','Vehicle / Damage',.5,40,.1),
  variable('DetachWheelsOnExplosion','boolean',true,'damage.explosion.detachWheels','Detach Wheels','Vehicle / Damage'),
  variable('BlackenOnExplosion','boolean',true,'damage.explosion.blacken','Blacken Destroyed Body','Vehicle / Damage'),
];}

function commonVariables(spec){
  return [
    variable('PawnEnabled','boolean',true,'enabled','Pawn Enabled','Pawn'),
    variable('Hidden','boolean',false,'hidden','Hidden','Pawn'),
    variable('ModelAsset','asset',clone(spec.asset),'modelAsset','Model / Rigged GLB','Pawn',{ui:'sketchbook-model-asset'}),
    numberVar('ModelFit',spec.asset.fit,'modelAsset.fit','Model Height / Fit','Pawn',.01,10000,.01),
    variable('ControllerPlayerId','number',spec.playerId,'playerId','Controller Player ID (-1 = none)','Player',{ui:'player-id',min:-1,max:4,step:1}),
    variable('StartPossessed','boolean',spec.possessed,'possessed','Start Possessed','Player'),
    numberVar('SpawnX',spec.spawn.x,'spawn.x','Spawn X','Spawn',-10000,10000,.1),
    numberVar('SpawnY',spec.spawn.y,'spawn.y','Spawn Y','Spawn',-1000,10000,.1),
    numberVar('SpawnZ',spec.spawn.z,'spawn.z','Spawn Z','Spawn',-10000,10000,.1),
    numberVar('SpawnHeading',spec.spawn.heading,'spawn.heading','Spawn Heading (rad)','Spawn',-6.283,6.283,.01),
    // `interior` is a VEHICLE camera - the driver's seat. Offering it on a character
    // was simply wrong: a character's equivalent is first person, the eye. The
    // options are built per Pawn kind so neither one lists the other's.
    selectVar('CameraMode',spec.camera.mode,'camera.mode','Camera Mode','Camera',
      spec.kind === 'advanced-character'
        ? [["free","Free"],["first","First person (eye height)"],["arcade","Arcade follow"],["cinematic","Cinematic"]]
        : [["free","Free"],["interior","Interior (driver seat)"],["arcade","Arcade follow"],["cinematic","Cinematic"]]),
    numberVar('CameraDistance',spec.camera.distance,'camera.distance','Distance','Camera',.2,80,.1),
    numberVar('CameraHeight',spec.camera.height,'camera.height','Height','Camera',0,40,.1),
    numberVar('CameraLag',spec.camera.lag,'camera.lag','Lag','Camera',.1,30,.1),
    numberVar('CameraFov',spec.camera.fov,'camera.fov','FOV','Camera',20,130,1),
    variable('EnterExitEnabled','boolean',true,'interaction.enterExitEnabled','Enable Enter / Exit','Interaction'),
    numberVar('InteractionRadius',spec.interaction.radius,'interaction.radius','Interaction Radius','Interaction',.25,12,.05),
    numberVar('MaximumExitSpeed',3.5,'entry.maxExitSpeed','Maximum Exit Speed','Interaction',0,100,.1),
    numberVar('InteractionCooldown',.65,'entry.cooldown','Interaction Cooldown','Interaction',0,5,.05),
    numberVar('ExitOffset',1.65,'entry.exitOffset','Safe Exit Offset','Interaction',.25,12,.05),
    variable('AllowAirExit','boolean',false,'entry.allowAirExit','Allow Air Exit','Interaction'),
    variable('DriverEnterKey','string','f','interaction.driverKey','Driver / Exit Key','Interaction'),
    variable('PassengerEnterKey','string','g','interaction.passengerKey','Passenger Key','Interaction'),
    variable('SeatSwitchKey','string','x','interaction.seatSwitchKey','Switch Seat Key','Interaction'),
    variable('PassengerEntryEnabled','boolean',true,'interaction.passengerEntryEnabled','Allow Passenger Entry','Interaction'),
    variable('SeatSwitchEnabled','boolean',true,'interaction.seatSwitchEnabled','Allow Seat Switching','Interaction'),
    variable('DoorAnimations','boolean',true,'interaction.doorAnimations','Animate Linked Doors','Interaction'),
    selectVar('DoorSwingDirection','1','interaction.doorSwingDirection','Door Swing Direction','Interaction',[["1","Outward (default)"],["-1","Inward / flipped rig"]]),
    numberVar('DoorOpenAngle',1,'interaction.doorOpenAngle','Door Open Angle (rad)','Interaction / Door',0,3.14,.05),
    numberVar('DoorAnimationSpeed',5,'interaction.doorAnimationSpeed','Door Animation Speed','Interaction / Door',.1,20,.1),
    variable('InheritExitVelocity','boolean',true,'interaction.inheritExitVelocity','Inherit Exit Velocity','Interaction'),
  ];
}

function characterVariables(){
  return [
    variable('EntryChoreography','boolean',true,'entry.choreography.enabled','Walk To Door + Full-body Transition','Interaction / Choreography'),
    numberVar('ApproachSpeed',2.4,'entry.choreography.approachSpeed','Walk-to-door Speed','Interaction / Choreography',.1,12,.1),
    numberVar('ApproachStopDistance',.18,'entry.choreography.stopDistance','Door Stop Distance','Interaction / Choreography',.02,2,.01),
    numberVar('ApproachTimeout',3,'entry.choreography.approachTimeout','Approach Timeout','Interaction / Choreography',.1,15,.1),
    numberVar('EnterTransitionDuration',.85,'entry.choreography.enterDuration','Enter Duration','Interaction / Choreography',.05,5,.05),
    numberVar('ExitTransitionDuration',.8,'entry.choreography.exitDuration','Exit Duration','Interaction / Choreography',.05,5,.05),
    variable('DriverEnterClipLeft','string','sit_down_left','entry.animations.driverEnterLeft','Driver Enter Clip (Left)','Interaction / Animation'),
    variable('DriverEnterClipRight','string','sit_down_right','entry.animations.driverEnterRight','Driver Enter Clip (Right)','Interaction / Animation'),
    variable('PassengerEnterClipLeft','string','sit_down_left','entry.animations.passengerEnterLeft','Passenger Enter Clip (Left)','Interaction / Animation'),
    variable('PassengerEnterClipRight','string','sit_down_right','entry.animations.passengerEnterRight','Passenger Enter Clip (Right)','Interaction / Animation'),
    variable('AirplaneEnterClipLeft','string','enter_airplane_left','entry.animations.airplaneEnterLeft','Airplane Enter Clip (Left)','Interaction / Animation'),
    variable('AirplaneEnterClipRight','string','enter_airplane_right','entry.animations.airplaneEnterRight','Airplane Enter Clip (Right)','Interaction / Animation'),
    variable('DriverExitClipLeft','string','stand_up_left','entry.animations.driverExitLeft','Driver Exit Clip (Left)','Interaction / Animation'),
    variable('DriverExitClipRight','string','stand_up_right','entry.animations.driverExitRight','Driver Exit Clip (Right)','Interaction / Animation'),
    variable('PassengerExitClipLeft','string','stand_up_left','entry.animations.passengerExitLeft','Passenger Exit Clip (Left)','Interaction / Animation'),
    variable('PassengerExitClipRight','string','stand_up_right','entry.animations.passengerExitRight','Passenger Exit Clip (Right)','Interaction / Animation'),
    variable('DrivingClip','string','driving','entry.animations.driving','Driver Seated Clip','Interaction / Animation'),
    variable('PassengerSeatedClip','string','sitting','entry.animations.passenger','Passenger Seated Clip','Interaction / Animation'),
    variable('IdleClip','string','idle','animations.idle','Idle Clip','Character / Animation'),
    variable('WalkClip','string','run','animations.walk','Walk / Run Clip','Character / Animation'),
    variable('SprintClip','string','sprint','animations.sprint','Sprint Clip','Character / Animation'),
    variable('JumpClip','string','jump_running','animations.jump','Jump Clip','Character / Animation'),
    variable('FallClip','string','falling','animations.fall','Fall Clip','Character / Animation'),
    numberVar('BodyMass',1,'tuning.collider.mass','Body Mass','Character / Collider',.1,200,.1),
    numberVar('CapsuleRadius',.25,'tuning.collider.radius','Capsule Radius','Character / Collider',.05,2,.01),
    numberVar('CapsuleHeight',.5,'tuning.collider.height','Capsule Cylinder Height','Character / Collider',.1,4,.01),
    numberVar('GroundRayLength',.57,'tuning.groundProbe.rayLength','Ground Ray Length','Character / Ground',.1,3,.01),
    numberVar('GroundSafeOffset',.03,'tuning.groundProbe.safeOffset','Ground Safe Offset','Character / Ground',0,.5,.005),
    numberVar('MoveSpeed',4,'tuning.movement.moveSpeed','Move Speed','Character / Movement',.1,20,.1),
    numberVar('SprintMultiplier',1.4,'tuning.movement.sprintMultiplier','Sprint Multiplier','Character / Movement',1,3,.05),
    numberVar('JumpVelocity',4,'tuning.movement.jumpVelocity','Jump Velocity','Character / Movement',0,20,.1),
    numberVar('AdapterAirControl',.28,'tuning.movement.airControl','Adapter Air Control','Character / Adapter',0,1,.05),
    numberVar('AdapterAcceleration',18,'movement.acceleration','Adapter Acceleration','Character / Adapter',1,100,.5),
    numberVar('AdapterTurnRate',12,'movement.turnRate','Adapter Turn Rate','Character / Adapter',.5,50,.5),
  ];
}

function carVariables(){
  return [
    numberVar('ChassisMass',50,'tuning.chassis.mass','Chassis Mass','Car / Chassis',1,2000,1),
    numberVar('WheelRadius',.25,'tuning.wheels.radius','Wheel Radius','Car / Wheels',.05,2,.01),
    numberVar('SuspensionStiffness',20,'tuning.wheels.suspensionStiffness','Suspension Stiffness','Car / Wheels',1,500,1),
    numberVar('SuspensionRestLength',.35,'tuning.wheels.suspensionRestLength','Suspension Rest Length','Car / Wheels',.01,2,.01),
    numberVar('MaxSuspensionTravel',1,'tuning.wheels.maxSuspensionTravel','Max Suspension Travel','Car / Wheels',.01,4,.01),
    numberVar('FrictionSlip',.8,'tuning.wheels.frictionSlip','Friction Slip','Car / Grip',.01,20,.01),
    numberVar('SuspensionDamping',2,'tuning.wheels.damping','Suspension Damping','Car / Wheels',0,50,.1),
    numberVar('RollInfluence',.8,'tuning.wheels.rollInfluence','Roll Influence','Car / Grip',0,2,.01),
    numberVar('EngineForce',500,'tuning.drive.engineForce','Engine Force','Car / Drive',0,5000,10),
    numberVar('BrakeForce',14500,'tuning.brakes.brakeForce','Service Brake Force','Car / Brakes',0,2000000,100),
    numberVar('ReverseSpeed',4,'tuning.drive.reverseSpeed','Reverse Speed','Car / Drive',0,80,.5),
    numberVar('ShiftTime',.2,'tuning.drive.shiftTime','Shift Time','Car / Drive',0,3,.01),
    selectVar('DrivenWheels','awd','tuning.drive.drivenWheels','Driven Wheels','Car / Drive',[["awd","All wheel drive"],["fwd","Front wheel drive"],["rwd","Rear wheel drive"]]),
    numberVar('MaxSteerAngle',.8,'tuning.steering.maxAngle','Max Steering Angle','Car / Steering',.05,1.5,.01),
    numberVar('HandbrakeForce',1000000,'tuning.brakes.handbrakeForce','Handbrake Force','Car / Brakes',0,2000000,1000),
    variable('GearSpeedLimits','string','5,9,13,17,22','tuning.drive.gearSpeedLimits','Gear Speed Limits','Car / Drive'),
  ].concat(vehicleDamageVariables('car'));
}

function airplaneVariables(){
  return [
    numberVar('BodyMass',50,'tuning.body.mass','Initial Body Mass','Airplane / Body',.1,500,.1),
    numberVar('WheelRadius',.12,'tuning.wheels.radius','Wheel Radius','Airplane / Wheels',.02,1,.01),
    numberVar('SuspensionStiffness',150,'tuning.wheels.suspensionStiffness','Suspension Stiffness','Airplane / Wheels',1,1000,1),
    numberVar('SuspensionRestLength',.25,'tuning.wheels.suspensionRestLength','Suspension Rest Length','Airplane / Wheels',.01,2,.01),
    numberVar('SuspensionDamping',5,'tuning.wheels.damping','Suspension Damping','Airplane / Wheels',0,50,.1),
    numberVar('PitchGain',.04,'tuning.controls.pitchGain','Pitch Gain','Airplane / Controls',0,.5,.001),
    numberVar('YawGain',.02,'tuning.controls.yawGain','Yaw Gain','Airplane / Controls',0,.5,.001),
    numberVar('RollGain',.055,'tuning.controls.rollGain','Roll Gain','Airplane / Controls',0,.5,.001),
    numberVar('DragCoefficient',.003,'tuning.aero.dragCoefficient','Drag Coefficient','Airplane / Aerodynamics',0,.1,.0001),
    numberVar('LiftCoefficient',.005,'tuning.aero.liftCoefficient','Lift Coefficient','Airplane / Aerodynamics',0,.1,.0001),
    numberVar('MaximumLift',.05,'tuning.aero.maximumLift','Maximum Lift Factor','Airplane / Aerodynamics',0,1,.001),
    numberVar('ThrottleSpoolUp',.4,'tuning.engine.spoolUp','Throttle Spool Up','Airplane / Engine',0,2,.01),
    numberVar('ThrottleSpoolDown',.12,'tuning.engine.spoolDown','Throttle Spool Down','Airplane / Engine',0,2,.01),
    numberVar('WheelBrakeForce',100,'tuning.brakes.wheelBrakeForce','Wheel Brake Force','Airplane / Wheels',0,10000,10),
    variable('ThrottleKey','string','shift','interaction.throttleKey','Throttle Key','Airplane / Input'),
    variable('DecelerateKey','string','space','interaction.decelerateKey','Decelerate Key','Airplane / Input'),
    variable('ElevatorKeys','string','ws','controls.elevator','Elevator Keys','Airplane / Input'),
    variable('AileronKeys','string','ad','controls.aileron','Aileron Keys','Airplane / Input'),
    variable('RudderKeys','string','qe','controls.rudder','Rudder Keys','Airplane / Input'),
  ].concat(vehicleDamageVariables('airplane'));
}

function helicopterVariables(){
  return [
    numberVar('BodyMass',50,'tuning.body.mass','Body Mass','Helicopter / Body',.1,500,.1),
    numberVar('Thrust',.15,'tuning.flight.thrust','Vertical Thrust','Helicopter / Flight',0,2,.005),
    numberVar('GravityCompensation',.98,'tuning.flight.gravityCompensation','Gravity Compensation','Helicopter / Flight',0,2,.01),
    numberVar('VerticalDamping',.01,'tuning.flight.verticalDamping','Vertical Damping','Helicopter / Flight',0,1,.005),
    numberVar('HorizontalDamping',.995,'tuning.flight.horizontalDamping','Horizontal Damping','Helicopter / Flight',0,1,.001),
    numberVar('AutoLevel',.3,'tuning.flight.autoLevel','Auto-level Strength','Helicopter / Flight',0,1,.01),
    numberVar('RotationGain',.07,'tuning.flight.rotationGain','Rotation Gain','Helicopter / Flight',0,1,.005),
    numberVar('AngularDamping',.97,'tuning.flight.angularDamping','Angular Damping','Helicopter / Flight',0,1,.005),
    numberVar('RotorSpoolUp',.2,'tuning.rotor.spoolUp','Rotor Spool Up','Helicopter / Rotor',0,2,.01),
    numberVar('RotorSpoolDown',.06,'tuning.rotor.spoolDown','Rotor Spool Down','Helicopter / Rotor',0,2,.01),
    variable('AscendKey','string','shift','interaction.ascendKey','Ascend Key','Helicopter / Input'),
    variable('DescendKey','string','space','interaction.descendKey','Descend Key','Helicopter / Input'),
    variable('PitchKeys','string','ws','controls.pitch','Pitch Keys','Helicopter / Input'),
    variable('RollKeys','string','ad','controls.roll','Roll Keys','Helicopter / Input'),
    variable('YawKeys','string','qe','controls.yaw','Yaw Keys','Helicopter / Input'),
  ].concat(vehicleDamageVariables('helicopter'));
}

function makeLogicScene(spec){
  const modelElement={id:spec.kind+'_model',name:spec.name+' Model',type:'mesh',primitive:'box',parentId:'root',linked:true,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],color:spec.color,asset:clone(spec.asset)};
  if(spec.kind==='advanced-character')modelElement.animation={enabled:true,clip:'idle',autoplay:false,loop:'repeat',speed:1,playInEditor:false};
  const damage=spec.kind==='advanced-character'?null:vehicleDamageDefaults(spec.kind),damageElements=damage?[
    {id:'vehicle_fuel_tank',name:'Fuel Tank Damage Dummy',type:'empty',parentId:'root',linked:true,dummyVisible:false,position:damage.fuelTank.position.slice(),rotation:[0,0,0],scale:[1,1,1],color:'#ffb52e',vehicleDamageAnchor:'fuelTank'},
    {id:'vehicle_engine_smoke',name:'Engine Smoke Dummy',type:'empty',parentId:'root',linked:true,position:damage.engineSmoke.position.slice(),rotation:[0,0,0],scale:[1,1,1],color:'#667788',vehicleDamageAnchor:'engineSmoke'},
    {id:'vehicle_exhaust',name:'Exhaust / Muffler Dummy',type:'empty',parentId:'root',linked:true,position:damage.exhaust.position.slice(),rotation:[0,0,0],scale:[1,1,1],color:'#667788',vehicleDamageAnchor:'exhaust'},
  ]:[];
  return {
    root:{id:'root',name:spec.name+' Root',type:'empty',linked:true,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],color:spec.color},
    elements:[modelElement].concat(damageElements),
    components:[
      {id:'root_transform',elementId:'root',name:'Transform',type:'transform',linked:true},
      {id:'sketchbook_pawn',elementId:'root',name:'DollBody '+spec.name+' Pawn',type:'player-pawn',linked:true},
      {id:'model_render',elementId:spec.kind+'_model',name:'Imported DollBody GLB',type:'render',linked:true},
    ],
  };
}

function makeGraph(spec){
  const variables=commonVariables(spec).concat(spec.variables());
  const graph={
    version:1,
    name:spec.templateName,
    scope:'element',
    enabled:true,
    variables,
    nodes:[
      node('on_start','event.onStart',80,100),
      node('ready','debug.print',390,100,{message:spec.readyMessage,duration:4}),
    ],
    edges:[edge('e_ready','on_start','then','ready','exec')],
    comments:[{id:'sketchbook_info',title:'Editable DollBody pawn data. The sketchbookPawn descriptor drives dedicated physics, driver/passenger entry, atomic seat reservation and switching, walk-to-door choreography, configurable full-body transition clips with procedural fallback, and metadata-linked door animation.',x:35,y:35,w:800,h:260,color:spec.color}],
    subgraphs:[],
  };
  graph.logicScene=makeLogicScene(spec);
  graph.sketchbookPawn={
    template:true,
    cameraDefaultVersion:1,
    animationDefaultVersion:1,
    schemaVersion:1,
    id:spec.pawnId,
    kind:spec.kind,
    profile:'sketchbook-0.4.0',
    physicsBackend:'sketchbook-arcade',
    enabled:true,
    hidden:false,
    playerId:spec.playerId,
    possessed:spec.possessed,
    modelAsset:clone(spec.asset),
    spawn:clone(spec.spawn),
    camera:clone(spec.camera),
    interaction:clone(spec.interaction),
    movement:clone(spec.movement||{}),
    tuning:clone(spec.tuning),
    engineAudio:spec.kind==='advanced-character'?undefined:{enabled:true,volume:.28,pitch:1,setId:null},
    damage:spec.kind==='advanced-character'?undefined:vehicleDamageDefaults(spec.kind),
    runtimeCapabilities:{driverEntryExit:true,passengerEntry:true,seatSwitching:true,doorAnimation:true,autoApproach:true,fullBodyTransitions:true,proceduralTransitionFallback:true},
    glbMetadata:{preserveExtras:true,collision:true,wheels:!!spec.wheels,seats:!!spec.seats,controlSurfaces:!!spec.controlSurfaces},
    source:Object.assign({},SOURCE,{sourcePaths:spec.sourcePaths.slice(),baseline:clone(spec.sourceBaseline),upstreamControls:clone(spec.upstreamControls)}),
  };
  if(window.LK_LOGIC_GRAPH&&window.LK_LOGIC_GRAPH.ensurePawnCameraRigs)window.LK_LOGIC_GRAPH.ensurePawnCameraRigs(graph);
  return graph;
}

const SPECS={
  character:{
    kind:'advanced-character',name:'Advanced Character',templateName:'DollBody - Advanced Character',pawnId:'sketchbook-advanced-character',asset:ASSETS.character,color:'#38bdf8',playerId:1,possessed:true,
    spawn:{x:0,y:0,z:0,heading:Math.PI},camera:{mode:'free',distance:5.5,height:2.1,lag:7,fov:65},interaction:{radius:1.75,enterExitEnabled:true,driverKey:'f',passengerKey:'g',seatSwitchKey:'x',doorAnimations:true,inheritExitVelocity:true},
    upstreamControls:{move:'WASD',sprint:'Shift',jump:'Space',use:'E',enterDriver:'F',enterPassenger:'G',switchSeat:'X'},
    sourceBaseline:{mass:1,capsule:{radius:.25,height:.5},groundProbe:{rayLength:.57,safeOffset:.03},moveSpeed:4,walkTarget:.8,sprintTarget:1.4,jumpVerticalVelocity:4,velocitySpring:{mass:50,damping:.8},rotationSpring:{mass:10,damping:.5}},
    tuning:{collider:{mass:1,radius:.25,height:.5},groundProbe:{rayLength:.57,safeOffset:.03},movement:{moveSpeed:4,sprintMultiplier:1.4,jumpVelocity:4,airControl:.28}},
    movement:{acceleration:18,turnRate:12},
    variables:characterVariables,wheels:false,seats:false,controlSurfaces:false,sourcePaths:['src/ts/characters/Character.ts','src/ts/physics/colliders/CapsuleCollider.ts','src/ts/physics/spring_simulation/VectorSpringSimulator.ts','src/ts/physics/spring_simulation/RelativeSpringSimulator.ts'],
    readyMessage:'DollBody Advanced Character ready. WASD move, Shift sprint, Space jump; F driver, G passenger, X switch seat.',
  },
  car:{
    kind:'car',name:'Arcade Car',templateName:'DollBody - Arcade Car',pawnId:'sketchbook-arcade-car',asset:ASSETS.car,color:'#f59e0b',playerId:-1,possessed:false,
    spawn:{x:0,y:0,z:0,heading:0},camera:{mode:'arcade',distance:6.8,height:2.6,lag:6,fov:68},interaction:{radius:2.4,enterExitEnabled:true,driverKey:'f',passengerKey:'g',seatSwitchKey:'x',doorAnimations:true,inheritExitVelocity:true},
    upstreamControls:{throttle:'W',reverse:'S',steer:'A/D',handbrake:'Space',exit:'F',switchSeat:'X',camera:'V'},
    sourceBaseline:{mass:50,wheels:{radius:.25,suspensionStiffness:20,suspensionRestLength:.35,maxSuspensionTravel:1,frictionSlip:.8,dampingRelaxation:2,dampingCompression:2,rollInfluence:.8},engineForce:500,shiftTime:.2,gearSpeedLimits:[5,9,13,17,22],reverseSpeed:4,maxSteerAngle:.8,handbrakeForce:1000000},
    tuning:{chassis:{mass:50},wheels:{radius:.25,suspensionStiffness:20,suspensionRestLength:.35,maxSuspensionTravel:1,frictionSlip:.8,damping:2,rollInfluence:.8},drive:{engineForce:500,reverseSpeed:4,drivenWheels:'awd',gearSpeedLimits:[5,9,13,17,22]},steering:{maxAngle:.8},brakes:{handbrakeForce:1000000}},
    variables:carVariables,wheels:true,seats:true,controlSurfaces:false,sourcePaths:['src/ts/vehicles/Car.ts','src/ts/vehicles/Vehicle.ts','src/ts/vehicles/Wheel.ts','src/ts/vehicles/VehicleSeat.ts','src/ts/vehicles/VehicleDoor.ts'],
    readyMessage:'DollBody Arcade Car ready. F/G enter, X switches seat, W/S drive, A/D steer, Space handbrake, C camera.',
  },
  airplane:{
    kind:'airplane',name:'Arcade Airplane',templateName:'DollBody - Arcade Airplane',pawnId:'sketchbook-arcade-airplane',asset:ASSETS.airplane,color:'#a78bfa',playerId:-1,possessed:false,
    spawn:{x:0,y:0,z:0,heading:0},camera:{mode:'arcade',distance:9,height:3,lag:5,fov:72},interaction:{radius:2.8,enterExitEnabled:true,driverKey:'f',passengerKey:'g',seatSwitchKey:'x',doorAnimations:true,inheritExitVelocity:true,throttleKey:'shift',decelerateKey:'space'},
    upstreamControls:{throttle:'Shift',decelerate:'Space',elevator:'W/S',aileron:'A/D',rudder:'Q/E',wheelBrake:'Vehicle mapping (K default)',exit:'F',switchSeat:'X',camera:'V'},
    sourceBaseline:{initialMass:50,dynamicMassRange:[20,50],wheels:{radius:.12,suspensionStiffness:150,suspensionRestLength:.25,dampingRelaxation:5,dampingCompression:5},pitchGain:.04,yawGain:.02,rollGain:.055,dragCoefficient:.003,liftCoefficient:.005,maximumLift:.05,spoolUp:.4,spoolDown:.12},
    tuning:{body:{mass:50},wheels:{radius:.12,suspensionStiffness:150,suspensionRestLength:.25,damping:5},controls:{pitchGain:.04,yawGain:.02,rollGain:.055},aero:{dragCoefficient:.003,liftCoefficient:.005,maximumLift:.05},engine:{spoolUp:.4,spoolDown:.12},brakes:{wheelBrakeForce:100}},
    variables:airplaneVariables,wheels:true,seats:true,controlSurfaces:true,sourcePaths:['src/ts/vehicles/Airplane.ts','src/ts/vehicles/Vehicle.ts','src/ts/vehicles/Wheel.ts','src/ts/vehicles/VehicleSeat.ts'],
    readyMessage:'DollBody Airplane ready. Shift/Space throttle, W/S pitch, A/D roll, Q/E yaw, B wheel brake, F driver/exit, C camera. The bundled model has one driver seat.',
  },
  helicopter:{
    kind:'helicopter',name:'Arcade Helicopter',templateName:'DollBody - Arcade Helicopter',pawnId:'sketchbook-arcade-helicopter',asset:ASSETS.helicopter,color:'#34d399',playerId:-1,possessed:false,
    spawn:{x:0,y:0,z:0,heading:0},camera:{mode:'arcade',distance:8,height:3,lag:5,fov:70},interaction:{radius:2.8,enterExitEnabled:true,driverKey:'f',passengerKey:'g',seatSwitchKey:'x',doorAnimations:true,inheritExitVelocity:true,ascendKey:'shift',descendKey:'space'},
    upstreamControls:{ascend:'Shift',descend:'Space',pitch:'W/S',roll:'A/D',yaw:'Q/E',exit:'F',switchSeat:'X',camera:'V'},
    sourceBaseline:{mass:50,thrust:.15,gravityCompensation:.98,verticalDamping:.01,horizontalVelocityMultiplier:.995,autoLevelQuaternionFactor:.3,rotationGain:.07,angularVelocityMultiplier:.97,spoolUp:.2,spoolDown:.06},
    tuning:{body:{mass:50},flight:{thrust:.15,gravityCompensation:.98,verticalDamping:.01,horizontalDamping:.995,autoLevel:.3,rotationGain:.07,angularDamping:.97},rotor:{spoolUp:.2,spoolDown:.06}},
    variables:helicopterVariables,wheels:false,seats:true,controlSurfaces:true,sourcePaths:['src/ts/vehicles/Helicopter.ts','src/ts/vehicles/Vehicle.ts','src/ts/vehicles/VehicleSeat.ts'],
    readyMessage:'DollBody Helicopter ready. Shift/Space altitude, W/S pitch, A/D roll, Q/E yaw, F/G seats, X switch, C camera.',
  },
};

function makeTemplates(){
  return [SPECS.character,SPECS.car,SPECS.airplane,SPECS.helicopter].map(function(spec){
    return {
      id:'logic-template-sketchbook-'+spec.kind,
      name:spec.templateName,
      description:'Editable DollBody '+spec.name+' pawn, with model, spawn, player, camera, driver/passenger seats and physics tuning exposed.',
      category:spec.kind==='advanced-character'?'Pawn / Character':'Pawn / Vehicle',
      graph:makeGraph(spec),
      source:clone(SOURCE),
    };
  });
}

if(window.LK_LOGIC_TEMPLATES && window.LK_LOGIC_TEMPLATES.register) window.LK_LOGIC_TEMPLATES.register(makeTemplates());
window.LK_LOGIC_TEMPLATES_SKETCHBOOK=Object.freeze({SOURCE,ASSETS,SOURCE_SIZE,VEHICLE_SCALE,CHARACTER_HEIGHT_M,CAR_LENGTH_M,makeTemplates});
})();
