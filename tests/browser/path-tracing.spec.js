'use strict';

const {test,expect}=require('@playwright/test');

test('optional path-tracing bundle renders a sample with the pinned scene types',async({page})=>{
  await page.goto('/test-editor.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.THREE&&THREE.REVISION==='185');
  const result=await page.evaluate(async()=>{
    const renderer=new THREE.WebGLRenderer({antialias:false});
    renderer.setSize(96,64,false);
    const gl=renderer.getContext();
    if(!(renderer.capabilities&&renderer.capabilities.isWebGL2)&&!(typeof WebGL2RenderingContext!=='undefined'&&gl instanceof WebGL2RenderingContext)){
      renderer.dispose();
      return {webgl2:false,vendor:!!window.LK_PATH_TRACING_VENDOR,shared:window.LK_PATH_TRACING_VENDOR&&window.LK_PATH_TRACING_VENDOR.sharedThreeRevision};
    }
    const scene=new THREE.Scene();
    scene.background=new THREE.Color(0x101820);
    const mesh=new THREE.Mesh(
      new THREE.BoxGeometry(1,1,1),
      new THREE.MeshStandardMaterial({color:0xd8dde5,roughness:.45,metalness:.1})
    );
    scene.add(mesh);
    const light=new THREE.PointLight(0xffffff,20,10,2);
    light.position.set(2,3,2);
    scene.add(light);
    const camera=new THREE.PerspectiveCamera(50,1.5,.1,20);
    camera.position.set(2,1.5,3);
    camera.lookAt(0,0,0);
    const tracer=new window.LK_PATH_TRACING_VENDOR.WebGLPathTracer(renderer);
    tracer.renderDelay=0;
    tracer.minSamples=1;
    tracer.fadeDuration=0;
    tracer.rasterizeScene=false;
    tracer.renderScale=.25;
    tracer.textureSize.set(128,128);
    tracer.tiles.set(1,1);
    tracer.setScene(scene,camera);
    for(let frame=0;frame<120&&tracer.samples<1;frame++){
      tracer.renderSample();
      await new Promise(resolve=>requestAnimationFrame(resolve));
    }
    const samples=tracer.samples;
    tracer.dispose();
    const runtime=window.LK_RUNTIME_PATH_TRACING.create({
      THREERef:THREE,renderer,scene,camera,dynamicRoots:()=>[],
    });
    const prepared=await runtime.prepare({quality:'low'},camera);
    runtime.render(camera,{quality:'low'},{width:96,height:64});
    const runtimeStatus=runtime.status();
    runtime.dispose();
    renderer.dispose();
    mesh.geometry.dispose();
    mesh.material.dispose();
    return {webgl2:true,vendor:true,shared:window.LK_PATH_TRACING_VENDOR.sharedThreeRevision,samples,prepared,runtimeStatus};
  });
  expect(result.vendor).toBe(true);
  expect(result.shared).toBe('185');
  if(result.webgl2){
    expect(result.samples).toBeGreaterThan(0);
    expect(result.prepared).toBe(true);
    expect(result.runtimeStatus.ready).toBe(true);
    expect(result.runtimeStatus.samples).toBeGreaterThan(0);
  }
});
