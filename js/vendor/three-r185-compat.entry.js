/*
 * Lot King Three.js compatibility bundle source.
 *
 * The application still consists of ordered classic IIFE modules. This entry
 * bundles the official ESM core/addons from one pinned npm package and exposes
 * a mutable global namespace until the application modules are migrated to ESM.
 */
import * as ThreeCore from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import {FontLoader, Font} from 'three/addons/loaders/FontLoader.js';
import {TextGeometry} from 'three/addons/geometries/TextGeometry.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {Lensflare, LensflareElement} from 'three/addons/objects/Lensflare.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';
import {SimplexNoise} from 'three/addons/math/SimplexNoise.js';
import {SSRShader, SSRDepthShader, SSRBlurShader} from 'three/addons/shaders/SSRShader.js';
import {SSRPass} from 'three/addons/postprocessing/SSRPass.js';
import {BokehShader} from 'three/addons/shaders/BokehShader.js';
import {BokehPass} from 'three/addons/postprocessing/BokehPass.js';
import {OutlineEffect} from 'three/addons/effects/OutlineEffect.js';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';

const EXPECTED_REVISION = '185';
if(String(ThreeCore.REVISION) !== EXPECTED_REVISION){
  throw new Error(`Lot King requires Three.js r${EXPECTED_REVISION}; loaded r${ThreeCore.REVISION}`);
}

const ThreeCompat = Object.assign({}, ThreeCore, {
  GLTFLoader,
  SkeletonUtils,
  FontLoader,
  Font,
  TextGeometry,
  OrbitControls,
  TransformControls,
  Lensflare,
  LensflareElement,
  EffectComposer,
  RenderPass,
  ShaderPass,
  OutputPass,
  FXAAShader,
  SimplexNoise,
  SSRShader,
  SSRDepthShader,
  SSRBlurShader,
  SSRPass,
  BokehShader,
  BokehPass,
  OutlineEffect,
  RectAreaLightUniformsLib,
});

// WebGLRenderer needs the LTC lookup textures before the first rectangular
// light is compiled. Initialising them here keeps every editor/runtime path in
// sync and avoids a first-use shader hitch when vehicle neon is enabled.
RectAreaLightUniformsLib.init();

Object.defineProperty(ThreeCompat, '__LOT_KING_BUNDLE__', {
  value:Object.freeze({version:'0.185.1', revision:EXPECTED_REVISION, format:'iife-compat-v1'}),
  enumerable:false,
});

globalThis.THREE = ThreeCompat;
globalThis.dispatchEvent(new CustomEvent('lotking:three-ready', {detail:ThreeCompat.__LOT_KING_BUNDLE__}));
