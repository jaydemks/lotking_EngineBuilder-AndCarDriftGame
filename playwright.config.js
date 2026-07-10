'use strict';

const {defineConfig, devices} = require('@playwright/test');

module.exports = defineConfig({
  testDir:'./tests/browser',
  outputDir:'./test-results',
  timeout:90000,
  expect:{timeout:10000},
  fullyParallel:false,
  workers:1,
  reporter:'list',
  use:{
    baseURL:'http://127.0.0.1:4173',
    headless:true,
    screenshot:'only-on-failure',
    trace:'retain-on-failure',
    video:'retain-on-failure',
    launchOptions:{args:['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader']},
  },
  projects:[
    {name:'desktop-chromium', use:{...devices['Desktop Chrome'], viewport:{width:1440, height:900}}},
    {name:'mobile-chromium', use:{...devices['Pixel 7']}},
  ],
  webServer:{
    command:'node tests/static-server.js',
    url:'http://127.0.0.1:4173/engine_editor.html',
    reuseExistingServer:true,
    timeout:15000,
  },
});
