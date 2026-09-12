(() => {
    'use strict';

    // =====================================================
    // LUNC ECOSYSTEM BATTLEFIELD v9.4 — true LOD + production asset readiness
    // v8.1–v8.8 + v9.1–v9.3 preserved; LOD + asset diagnostics (procedural SAFE FALLBACK)
    // Original procedural art only. No third-party game assets.
    // Graphics-only: never alter market / Battle Strength / liq / burn math.
    // =====================================================

    const tokens = {
      LUNC:  { name: 'LUNC/USDT', base: 0.00005122, color: 0x49d39a, hasBurns: true,  decimals: 8, symbol: 'luncusdt', futures: '1000luncusdt', gecko: 'terra-luna' },
      USTC:  { name: 'USTC/USDT', base: 0.00514,    color: 0x56b9d1, hasBurns: false, decimals: 5, symbol: 'ustcusdt', futures: 'ustcusdt', gecko: 'terrausd' },
      JURIS: { name: 'JURIS',     base: 0.00000245, color: 0xa791dc, hasBurns: false, decimals: 8, symbol: null, futures: null, gecko: 'juris-protocol' }
    };

    const SRC = { GECKO: 'coingecko', BINANCE: 'binance', LLAMA: 'llama', SIM: 'sim', BRIDGE: 'bridge', API: 'api', UNKNOWN: 'unknown' };
    let current = 'LUNC';
    let price = tokens[current].base;
    let lastPrice = price;
    let rangeLow = price * 0.92;
    let rangeHigh = price * 1.08;
    let buyWall = 1.8;
    let sellWall = 1.6;
    let momentum = 0;
    let targetX = 0;
    let lastRebuild = 0;
    let isLive = false;
    let priceHistory = [];
    let priceSource = SRC.SIM;
    let depthSource = SRC.SIM; // SIM | BINANCE | API
    let depthVendorLabel = 'Unavailable'; // truthful UI label
    let lastPriceTs = Date.now();
    let lastDepthTs = 0;
    let restDepthTimer = null;
    let cameraShake = 0;
    let audioCtx = null;

    const $ = id => document.getElementById(id);
    const feedEl = $('feed');

    function reportQFeed(name, state, detail) {
      try {
        if (window.LUNCBattle && LUNCBattle.quality && LUNCBattle.quality.reportFeed) {
          LUNCBattle.quality.reportFeed(name, state, detail);
        }
      } catch (_) {}
    }
    function classifyFeedHttp(status, errMsg) {
      try {
        if (window.LUNCBattle && LUNCBattle.quality && LUNCBattle.quality.classifyHttp) {
          return LUNCBattle.quality.classifyHttp(status, errMsg);
        }
      } catch (_) {}
      return 'UNAVAILABLE';
    }

    function pushFeed(text, type = '') {
      if (window.LUNCBattle && LUNCBattle.warRoom && typeof LUNCBattle.warRoom.pushText === 'function') {
        LUNCBattle.warRoom.pushText(text, type);
        return;
      }
      if (!feedEl) return;
      const div = document.createElement('div');
      div.className = 'feed-item ' + type;
      div.textContent = text;
      feedEl.prepend(div);
      while (feedEl.children.length > 18) feedEl.lastChild.remove();
    }

    function fmtUsd(v) {
      if (!(v >= 0)) return '$—';
      if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
      if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
      if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
      return '$' + Math.round(v);
    }

    function initAudio() {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    function playTone(freq, dur=.12, type='sine', vol=.035) {
      if (!audioCtx) return;
      try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type; osc.frequency.value = freq; gain.gain.value = vol;
        osc.connect(gain); gain.connect(audioCtx.destination); osc.start();
        gain.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + dur);
        osc.stop(audioCtx.currentTime + dur);
      } catch (_) {}
    }
    const playBurn = () => { playTone(190,.3,'sawtooth',.035); setTimeout(()=>playTone(315,.22,'triangle',.03),75); };
    const playLiq = () => playTone(155,.12,'square',.025);
    const playVictory = bull => { playTone(bull?410:145,.16,'triangle',.045); setTimeout(()=>playTone(bull?520:108,.26,'sine',.035),110); };
    document.body.addEventListener('pointerdown', initAudio, { once: true });

    // -------------------- Scene --------------------
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c140e);
    scene.fog = new THREE.Fog(0x121a12, 48, 132);

    const camera = new THREE.PerspectiveCamera(43, innerWidth / innerHeight, .1, 250);
    camera.position.set(0, 38, 48);

    // v9.1: renderer abstraction — default WebGL (r128), optional WebGPU try/fallback
    let rendererHandle = null;
    let rendererBackend = 'webgl';
    let rendererFallbackReason = null;
    if (window.LUNCBattle && LUNCBattle.renderer && typeof LUNCBattle.renderer.create === 'function') {
      rendererHandle = LUNCBattle.renderer.create({
        THREE: THREE,
        antialias: true,
        powerPreference: 'high-performance'
      });
    } else {
      rendererHandle = {
        renderer: new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }),
        backend: 'webgl',
        webgpuAvailable: null,
        fallbackReason: 'LUNCBattle.renderer missing — direct WebGLRenderer',
        capabilities: null,
        dispose: function () {}
      };
    }
    const renderer = rendererHandle.renderer;
    rendererBackend = rendererHandle.backend || 'webgl';
    rendererFallbackReason = rendererHandle.fallbackReason || null;
    window.LUNCBattle = window.LUNCBattle || {};
    LUNCBattle.activeRendererBackend = rendererBackend;
    LUNCBattle.rendererFallbackReason = rendererFallbackReason;
    renderer.setSize(innerWidth, innerHeight);
    // v8.8/v9.1: pixel ratio + shadowMap via quality.apply (never recreate renderer)
    // Shadow / encoding / toneMapping are WebGLRenderer APIs — safe on default path
    if (renderer.shadowMap) {
      renderer.shadowMap.enabled = true;
      if (THREE.PCFSoftShadowMap) renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    if ('outputEncoding' in renderer && THREE.sRGBEncoding != null) {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }
    // v9.2: ACES retained but exposure restrained for MeshStandard PBR readability
    if ('toneMapping' in renderer && THREE.ACESFilmicToneMapping != null) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.94;
    }
    document.body.insertBefore(renderer.domElement, document.body.firstChild);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = .06;
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI / 2.35;
    controls.minPolarAngle = Math.PI / 4.3;
    controls.minDistance = 23;
    controls.maxDistance = 82;
    controls.target.set(0, 1.2, 0);

    const keys = {};
    let cameraCtrl = null;
    let minimapApi = null;
    addEventListener('keydown', e => {
      keys[e.code] = true;
      if (e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD' ||
          e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        if (cameraCtrl) cameraCtrl.notifyUserInput();
      }
    });
    addEventListener('keyup', e => keys[e.code] = false);

    // v9.2 lighting foundation — sun / hemi / fill / rim / faction accents (quality-scaled)
    const hemi = new THREE.HemisphereLight(0xc8d4bc, 0x1c2018, 0.52);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe2b8, 1.05);
    sun.position.set(-28, 52, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -62; sun.shadow.camera.right = 62; sun.shadow.camera.top = 44; sun.shadow.camera.bottom = -44;
    sun.shadow.camera.near = 8; sun.shadow.camera.far = 120; sun.shadow.bias = -.0003;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x6a90a0, 0.18);
    fill.position.set(38, 16, -30);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xb0c4a8, 0.07);
    rim.position.set(12, 28, 40);
    scene.add(rim);

    // Faction accent points — softer with PBR so bases read without blooming
    const bullLight = new THREE.PointLight(tokens[current].color, 0.85, 42);
    bullLight.position.set(-34, 7, 0);
    bullLight.userData.baseIntensity = 0.85;
    scene.add(bullLight);
    const bearLight = new THREE.PointLight(0xe4675f, 0.75, 42);
    bearLight.position.set(34, 7, 0);
    bearLight.userData.baseIntensity = 0.75;
    scene.add(bearLight);

    // v8.8/v9.2 quality bootstrap (AUTO default; localStorage preference)
    if (window.LUNCBattle && LUNCBattle.quality) {
      LUNCBattle.quality.apply(renderer, scene, sun, {
        fillLight: fill,
        hemiLight: hemi,
        rimLight: rim,
        accentLights: [bullLight, bearLight],
        immediate: true
      });
    } else {
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth < 760 ? 1.35 : 1.8));
    }

    // Shared PBR material factory → LUNCBattle.materials registry
    if (window.LUNCBattle && LUNCBattle.materials && LUNCBattle.materials.init) {
      LUNCBattle.materials.init(THREE);
      try {
        const qp = LUNCBattle.quality && LUNCBattle.quality.getEffectivePreset
          ? LUNCBattle.quality.getEffectivePreset()
          : null;
        if (qp) LUNCBattle.materials.applyQuality(qp.lightingComplexity || qp.unitDetail || 'high');
      } catch (_) {}
    }

    // v9.3: glTF/GLB asset pipeline — init early; never block first paint
    let assetMode = 'AUTO';
    if (window.LUNCBattle && LUNCBattle.assets && typeof LUNCBattle.assets.init === 'function') {
      try {
        const ainfo = LUNCBattle.assets.init(THREE);
        assetMode = (ainfo && ainfo.mode) || LUNCBattle.assets.getMode() || 'AUTO';
        LUNCBattle.assetMode = assetMode;
      } catch (e) {
        console.warn('[LUNCBattle] asset-loader init failed — procedural only', e);
        assetMode = 'PROCEDURAL';
        LUNCBattle.assetMode = assetMode;
      }
    } else {
      LUNCBattle.assetMode = 'PROCEDURAL';
    }
    function mat(color, rough=.72, metal=.08, emissive=0x000000, intensity=0) {
      if (window.LUNCBattle && LUNCBattle.materials && LUNCBattle.materials.mat) {
        return LUNCBattle.materials.mat(color, rough, metal, emissive, intensity);
      }
      return new THREE.MeshStandardMaterial({ color, roughness:rough, metalness:metal, emissive, emissiveIntensity:intensity });
    }

    // v8.1 — modular terrain + environment (procedural, no GridHelper)
    const mobileGfx = innerWidth < 760;
    const terrainApi = (window.LUNCBattle && LUNCBattle.terrain)
      ? LUNCBattle.terrain.createTerrain({ THREE, scene, mobile: mobileGfx })
      : null;
    if (!terrainApi) console.error('[LUNCBattle] terrain.js failed to load');
    const terrainHeight = terrainApi
      ? terrainApi.terrainHeight
      : function (x, z) { return Math.sin(x * .075) * .4 + Math.cos(z * .1) * .3; };
    const ground = terrainApi ? terrainApi.ground : null;

    const envApi = (window.LUNCBattle && LUNCBattle.environment)
      ? LUNCBattle.environment.createEnvironment({ THREE, scene, terrainHeight, mobile: mobileGfx, mat,
          densityScale: (LUNCBattle.quality && LUNCBattle.quality.getDensityScale) ? LUNCBattle.quality.getDensityScale().env : undefined,
          vegetationDensity: (LUNCBattle.quality && LUNCBattle.quality.getDensityScale) ? LUNCBattle.quality.getDensityScale().vegetation : undefined,
          shadowCast: (LUNCBattle.quality && LUNCBattle.quality.getEffectivePreset) ? LUNCBattle.quality.getEffectivePreset().shadowCast : undefined
        })
      : null;
    if (!envApi) console.error('[LUNCBattle] environment.js failed to load');
    if (envApi && envApi.fog) {
      scene.background = new THREE.Color(envApi.fog.background != null ? envApi.fog.background : 0x0c140e);
      scene.fog = new THREE.Fog(envApi.fog.fogColor, envApi.fog.fogNear, envApi.fog.fogFar);
    }
    // v9.2: wood/prop mats come from materials registry inside environment/structures

    // v8.3 — faction bases & structures (procedural, no GridHelper)
    const structuresApi = (window.LUNCBattle && LUNCBattle.structures)
      ? LUNCBattle.structures.createApi({ THREE, scene, terrainHeight, mat, mobile: mobileGfx,
          densityScale: (LUNCBattle.quality && LUNCBattle.quality.getDensityScale) ? LUNCBattle.quality.getDensityScale().structure : undefined,
          shadowCast: (LUNCBattle.quality && LUNCBattle.quality.getEffectivePreset) ? LUNCBattle.quality.getEffectivePreset().shadowCast : undefined
        })
      : null;
    if (!structuresApi) console.error('[LUNCBattle] structures.js failed to load');
    let bullBase = new THREE.Group();
    let bearBase = new THREE.Group();
    if (structuresApi) {
      try {
        bullBase = structuresApi.createFactionBase(-1, tokens[current].color);
        bearBase = structuresApi.createFactionBase(1, 0xe4675f);
      } catch (e) {
        console.error('[LUNCBattle] createFactionBase failed', e);
      }
    }

    // v8.5 — price territory mapping & contested frontline (replaces simple poles/rope)
    const priceTerritoryApi = (window.LUNCBattle && LUNCBattle.priceTerritory)
      ? LUNCBattle.priceTerritory.createApi({
          THREE, scene, terrainHeight, mobile: mobileGfx, pushFeed,
          DataTruth: (window.LUNCBattle && LUNCBattle.DataTruth) || null
        })
      : null;
    if (!priceTerritoryApi) console.error('[LUNCBattle] price-territory.js failed to load');
    else {
      priceTerritoryApi.setToken({
        symbol: current,
        decimals: tokens[current].decimals,
        base: tokens[current].base,
        hasOrderBook: !!tokens[current].symbol
      });
    }

    // -------------------- Units / effects (extracted modules) --------------------
    const bulls=[], bears=[];
    const projectilePool=[], particlePool=[];

    const unitsApi = (window.LUNCBattle && LUNCBattle.units)
      ? LUNCBattle.units.createApi({ THREE, scene, terrainHeight, mat })
      : null;
    const effectsApi = (window.LUNCBattle && LUNCBattle.effects)
      ? LUNCBattle.effects.createApi({
          THREE, scene, terrainHeight, projectilePool, particlePool,
          mobile: mobileGfx,
          structuresApi: structuresApi,
          qualityCaps: (LUNCBattle.quality && LUNCBattle.quality.getEffectCaps) ? LUNCBattle.quality.getEffectCaps() : null,
          onShake: (amp, power) => {
            // Tier caps: small≈0, tank≈0.15, large≈0.35, massive≈0.55
            const add = Math.min(0.55, (amp || 0) * Math.min(1.35, power || 1));
            cameraShake = Math.min(0.7, cameraShake + add);
          }
        })
      : null;
    if (!unitsApi || !effectsApi) {
      console.error('[LUNCBattle] units.js / effects.js failed to load');
    }

    function createUnit(color, side, type) { return unitsApi.createUnit(color, side, type); }
    function formationSlots(count, side, type) { return unitsApi.formationSlots(count, side, type); }
    function disposeArmy(arr) { unitsApi.disposeArmy(arr); }
    function launchStrike(fromX,toX,z,color,power=1) { effectsApi.launchStrike(fromX,toX,z,color,power); }
    function createExplosion(x,z,color,power=1,isBurn=false) { effectsApi.createExplosion(x,z,color,power,isBurn); }
    function muzzleWorld(u) {
      const off = u.userData && u.userData.muzzleOffset;
      if (off && u.localToWorld) {
        const v = off.clone();
        u.updateMatrixWorld(true);
        u.localToWorld(v);
        return v;
      }
      const side = u.userData.side || -1;
      return new THREE.Vector3(
        u.position.x + side * -1.0,
        u.position.y + 1.1,
        u.position.z
      );
    }

    function rebuildUnits() {
      disposeArmy(bulls); disposeArmy(bears);
      const mobile=innerWidth<760;
      // v9.4.4 denser armies (LOD keeps perf sane)
      const maxInf=mobile?28:52, maxArmor=mobile?9:18, maxArt=mobile?5:9;
      const maxHeli=mobile?2:4, maxJet=mobile?1:3;
      const counts = wall => ({
        inf: Math.min(maxInf, Math.max(14,Math.round(14+wall*5.2))),
        armor: Math.min(maxArmor,Math.max(4,Math.round(3+wall*1.85))),
        art: Math.min(maxArt,Math.max(2,Math.round(2+wall*.95))),
        heli: Math.min(maxHeli, Math.max(mobile?1:2, Math.round((mobile?1:2)+wall*0.35))),
        jet: Math.min(maxJet, Math.max(mobile?1:1, Math.round((mobile?1:1)+wall*0.28)))
      });
      const bc=counts(buyWall), rc=counts(sellWall);
      unitsApi.spawnFormation(-1, tokens[current].color, bc, bulls);
      unitsApi.spawnFormation(1, 0xe4675f, rc, bears);
      if (unitsApi.spawnAirWing) {
        unitsApi.spawnAirWing(-1, tokens[current].color, bc, bulls);
        unitsApi.spawnAirWing(1, 0xe4675f, rc, bears);
      }
      lastRebuild=Date.now();
    }
    rebuildUnits();

    // v9.3: progressive background preload of tiny asset set (does not block first paint).
    // Hot-swap of live units skipped — next rebuildUnits may pick up ready GLBs safely.
    if (window.LUNCBattle && LUNCBattle.assets && typeof LUNCBattle.assets.preload === 'function') {
      const preloadIds = [
        'unit.bull.infantry', 'unit.bear.infantry',
        'unit.bull.armor', 'unit.bear.armor',
        'unit.bull.artillery', 'unit.bear.artillery',
        'structure.bull.hq', 'structure.bear.hq',
        'prop.crate', 'prop.barrel', 'prop.rock',
        'unit.bull.missing_demo'
      ];
      // Defer to next macrotask so first frame paints procedural scene
      setTimeout(function () {
        try {
          LUNCBattle.assets.preload(preloadIds).then(function (res) {
            const st = LUNCBattle.assets.getStats ? LUNCBattle.assets.getStats() : {};
            pushFeed(
              'Assets ' + (st.effectiveMode || assetMode) +
              ' · loaded ' + (st.loaded || 0) +
              ' · failed ' + (st.failed || 0) +
              ' (procedural fallback forever)',
              'win'
            );
            // Hot-swap of live meshes skipped. In forced GLTF mode, one army rebuild
            // after preload exercises instantiate() without mid-frame mesh surgery.
            if (assetMode === 'GLTF') {
              try { rebuildUnits(); } catch (_) {}
            } else if (LUNCBattle.assets.tryHotSwap) {
              LUNCBattle.assets.tryHotSwap();
            }
          }).catch(function () {});
        } catch (_) {}
      }, 0);
    }

    // v8.6 — classic 3/4 RTS camera + Canvas 2D minimap (after units exist for getUnits)
    cameraCtrl = (window.LUNCBattle && LUNCBattle.cameraCtrl)
      ? LUNCBattle.cameraCtrl.createApi({
          THREE: THREE, camera: camera, controls: controls, renderer: renderer,
          domElement: renderer.domElement,
          getFrontlineX: function () {
            return priceTerritoryApi ? priceTerritoryApi.getFrontlineX() : targetX;
          },
          getWorldBounds: { minX: -70, maxX: 70, minZ: -45, maxZ: 45 }
        })
      : null;
    if (!cameraCtrl) console.error('[LUNCBattle] camera.js failed to load');

    minimapApi = (window.LUNCBattle && LUNCBattle.minimap)
      ? LUNCBattle.minimap.createApi({
          mobile: mobileGfx,
          drawHz: (LUNCBattle.quality && LUNCBattle.quality.getEffectivePreset) ? LUNCBattle.quality.getEffectivePreset().minimapHz : 10,
          worldBounds: { minX: -70, maxX: 70, minZ: -45, maxZ: 45 },
          getFrontlineX: function () {
            return priceTerritoryApi ? priceTerritoryApi.getFrontlineX() : targetX;
          },
          getViewportWorldRect: function () {
            return cameraCtrl ? cameraCtrl.getViewportWorldRect() : null;
          },
          getUnits: function () { return { bulls: bulls, bears: bears }; },
          onFocusWorld: function (x, z, smooth) {
            if (cameraCtrl) cameraCtrl.focusWorld(x, z, smooth);
          },
          onFocusFrontline: function (smooth) {
            if (cameraCtrl) cameraCtrl.focusFrontline(smooth);
          },
          onFocusBull: function (smooth) {
            if (cameraCtrl) cameraCtrl.focusBullBase(smooth);
          },
          onFocusBear: function (smooth) {
            if (cameraCtrl) cameraCtrl.focusBearBase(smooth);
          },
          notifyUserInput: function () {
            if (cameraCtrl) cameraCtrl.notifyUserInput();
          }
        })
      : null;
    if (!minimapApi) console.error('[LUNCBattle] minimap.js failed to load');

    function showVictory(bull) {
      const el=$('victoryFlash'); el.className=bull?'show':'show bear'; setTimeout(()=>el.className='',430); playVictory(bull);
    }

    // -------------------- UI / token switching --------------------
    function updateWallLabels() {
      const liveDepth = depthSource===SRC.BINANCE || depthSource===SRC.API;
      const mark = liveDepth
        ? '<span class="qual live">(live)</span>'
        : '<span class="qual est">(est.)</span>';
      const buyL = $('buyWallLabel');
      const sellL = $('sellWallLabel');
      if (buyL) buyL.innerHTML = 'Buy wall ' + mark;
      if (sellL) sellL.innerHTML = 'Sell wall ' + mark;
    }

    function updateStatusUI() {
      const priceLabel = priceSource===SRC.GECKO?'CoinGecko'
        :priceSource===SRC.BINANCE?'Binance'
        :priceSource===SRC.LLAMA?'DefiLlama'
        :priceSource===SRC.API?'Backend API'
        :priceSource===SRC.BRIDGE?'Backend API'
        :'Simulation';
      let depthLabel;
      if (depthSource===SRC.BINANCE) depthLabel = 'Binance depth (LIVE)';
      else if (depthSource===SRC.API) depthLabel = (depthVendorLabel || 'Backend API') + ' depth (LIVE)';
      else depthLabel = 'Estimated walls (NOT live order book)';
      const live = priceSource!==SRC.SIM;
      const build = (window.LUNCBattle && LUNCBattle.config && LUNCBattle.config.BUILD) || '';
      const dm = $('dataMode');
      if (dm) {
        dm.textContent = live ? ('LIVE · ' + priceLabel.toUpperCase()) : 'SIMULATION — price not live';
        dm.className = live ? 'live' : 'error';
      }
      const ag = $('agentStatus');
      if (ag) ag.textContent = 'Depth: ' + depthLabel + ' · ' + build;
      const pair = $('pair');
      if (pair) pair.textContent = tokens[current].name + ' · ' + priceLabel;
      if (window.LUNCBattle && LUNCBattle.ui) {
        LUNCBattle.ui.lastDepthSourceLabel = depthLabel;
        if (typeof LUNCBattle.ui.updateHealthInput === 'function') {
          const reconnecting = !!(reconnectAttempts > 0 && (!spotWs || spotWs.readyState !== 1)
            && tokens[current] && tokens[current].symbol);
          LUNCBattle.ui.updateHealthInput({
            priceLive: live,
            priceSource: priceLabel,
            priceAgeMs: Date.now() - lastPriceTs,
            depthLive: depthSource === SRC.BINANCE || depthSource === SRC.API,
            depthLabel: depthLabel,
            depthAgeMs: lastDepthTs ? (Date.now() - lastDepthTs) : null,
            binanceOk: depthSource === SRC.BINANCE || priceSource === SRC.BINANCE,
            geckoOk: priceSource === SRC.GECKO || priceSource === SRC.LLAMA ? true : null,
            apiOk: depthSource === SRC.API || priceSource === SRC.API || priceSource === SRC.BRIDGE,
            backendExpected: !!(LUNCBattle.config && LUNCBattle.config.apiBase),
            backendOffline: !!(LUNCBattle.config && LUNCBattle.config.apiBase && !live && depthSource === SRC.SIM),
            reconnecting: reconnecting,
            token: current
          });
        }
      }
      updateWallLabels();
    }

    function applySpot(next,source) {
      if(!(next>0)) return;
      // Prefer live exchange ticks; allow Llama/Gecko to refresh when Binance is stale or absent
      const binanceFresh = priceSource===SRC.BINANCE && (Date.now()-lastPriceTs) < 15000;
      if (binanceFresh && source!==SRC.BINANCE) return;
      lastPrice=price; price=next; lastPriceTs=Date.now();
      priceHistory.push(price); if(priceHistory.length>48) priceHistory.shift();
      priceSource=source;
      isLive = source!==SRC.SIM;
      if (priceTerritoryApi) {
        const truth = source===SRC.SIM
          ? ((window.LUNCBattle&&LUNCBattle.DataTruth&&LUNCBattle.DataTruth.SIMULATED)||'SIMULATED')
          : ((window.LUNCBattle&&LUNCBattle.DataTruth&&LUNCBattle.DataTruth.LIVE)||'LIVE');
        const label = source===SRC.GECKO?'CoinGecko':source===SRC.BINANCE?'Binance'
          :source===SRC.LLAMA?'DefiLlama':source===SRC.API?'Backend API'
          :source===SRC.BRIDGE?'Backend API':'Simulation';
        priceTerritoryApi.updateCurrentPrice(price, { truth: truth, sourceLabel: label });
        if (priceTerritoryApi.getDisplayedRange) {
          const dr = priceTerritoryApi.getDisplayedRange();
          if (dr && dr.low > 0 && dr.high > dr.low) { rangeLow = dr.low; rangeHigh = dr.high; }
        }
      }
    }


    async function fetchBinanceRestPrice(symbol) {
      if (!symbol || !window.LUNCBattle || !LUNCBattle.market || !LUNCBattle.market.fetchBinanceSpotPrice) {
        return false;
      }
      try {
        const spot = await LUNCBattle.market.fetchBinanceSpotPrice(symbol);
        if (!spot || spot.truth !== LUNCBattle.DataTruth.LIVE || !(spot.mid > 0)) {
          if (spot && spot.reason) console.warn('[Binance REST price]', spot.reason);
          const st = classifyFeedHttp(spot && spot.status, spot && spot.reason);
          reportQFeed('binanceVision', st, (spot && spot.reason) || 'no price');
          return false;
        }
        reportQFeed('binanceVision', 'LIVE', 'spot');
        applySpot(spot.mid, SRC.BINANCE);
        updateStatusUI();
        return true;
      } catch (e) {
        console.warn('[Binance REST price]', e.message || e);
        reportQFeed('binanceVision', classifyFeedHttp(0, e.message || e), String(e.message || e));
        return false;
      }
    }

    function setToken(sym) {
      current=sym; const t=tokens[sym];
      price=t.base; lastPrice=price; rangeLow=price*.92; rangeHigh=price*1.08; priceHistory=[]; momentum=0;
      priceSource=SRC.SIM; isLive=false; lastPriceTs=Date.now();
      depthSource=SRC.SIM; depthVendorLabel='Unavailable';
      bullLight.color.setHex(t.color);
      if (structuresApi && structuresApi.setAccentColor) structuresApi.setAccentColor(-1, t.color);
      if (priceTerritoryApi) {
        priceTerritoryApi.setToken({
          symbol: sym,
          decimals: t.decimals,
          base: t.base,
          hasOrderBook: !!t.symbol
        });
        if (priceTerritoryApi.getDisplayedRange) {
          const dr = priceTerritoryApi.getDisplayedRange();
          if (dr && dr.low > 0 && dr.high > dr.low) { rangeLow = dr.low; rangeHigh = dr.high; }
        }
      }
      document.querySelectorAll('.token-btn').forEach(b=>b.classList.toggle('active',b.dataset.token===sym));
      if (window.LUNCBattle && LUNCBattle.ui && typeof LUNCBattle.ui.clearForTokenSwitch === 'function') {
        LUNCBattle.ui.clearForTokenSwitch(sym);
      }
      rebuildUnits(); pushFeed('Command switched to '+sym,'win');
      if(t.symbol) connectBinance(t.symbol,t.futures); else closeExchangeSockets();
      // Immediate multi-source refresh so USTC/LUNC don't sit on stale base
      fetchBinanceRestPrice(t.symbol);
      fetchLlama(); fetchGecko(); fetchMarketContext(); updateStatusUI();
    }
    document.querySelectorAll('.token-btn').forEach(btn=>btn.addEventListener('click',()=>setToken(btn.dataset.token)));
    setInterval(()=>$('utc').textContent='UTC '+new Date().toISOString().slice(11,19),1000);

    // -------------------- Data layer --------------------
    let spotWs=null, futWs=null, reconnectTimer=null, reconnectAttempts=0, geckoTimer=null;
    let localBids={}, localAsks={};

    function closeExchangeSockets() {
      if(spotWs){try{spotWs.onclose=null;spotWs.close();}catch(_){} spotWs=null;}
      if(futWs){try{futWs.onclose=null;futWs.close();}catch(_){} futWs=null;}
      if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}
      depthSource=SRC.SIM; depthVendorLabel='Unavailable';
      reportQFeed('binanceWs', 'OFFLINE', 'sockets closed');
      if(restDepthTimer){clearInterval(restDepthTimer);restDepthTimer=null;}
    }

    async function fetchLlama() {
      const t=tokens[current]; if(!t.gecko) return false;
      try {
        const id='coingecko:'+t.gecko;
        const r=await fetch('https://coins.llama.fi/prices/current/'+id,{cache:'no-store'});
        if(!r.ok) throw new Error('HTTP '+r.status);
        const d=await r.json(), coin=d.coins&&d.coins[id];
        if(!coin||!(coin.price>0)) throw new Error('No price');
        reportQFeed('defillama', 'LIVE', 'price');
        applySpot(coin.price,SRC.LLAMA); updateStatusUI(); return true;
      } catch(e){
        console.warn('[DefiLlama price]',e.message||e);
        const m = String(e.message||e);
        const http = /HTTP\s+(\d+)/i.exec(m);
        reportQFeed('defillama', classifyFeedHttp(http ? http[1] : 0, m), m);
        return false;
      }
    }

    async function fetchGecko() {
      const t=tokens[current]; if(!t.gecko) return false;
      try {
        const u='https://api.coingecko.com/api/v3/simple/price?ids='+encodeURIComponent(t.gecko)+'&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true&include_market_cap=true';
        const r=await fetch(u,{cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status);
        const d=await r.json(), coin=d[t.gecko]; if(!coin||!(coin.usd>0)) throw new Error('No price');
        reportQFeed('coingecko', 'LIVE', 'simple/price');
        applySpot(coin.usd,SRC.GECKO);
        if(coin.usd_market_cap>0) $('marketCap').textContent=fmtUsd(coin.usd_market_cap);
        if (coin.usd_24h_vol > 0 && window.LUNCBattle && LUNCBattle.market) {
          LUNCBattle.market.setVolume24h(coin.usd_24h_vol, LUNCBattle.DataTruth.LIVE);
          if (LUNCBattle.ui) {
            LUNCBattle.ui.lastVolumeUsd = coin.usd_24h_vol;
            LUNCBattle.ui.lastVolumeTruth = LUNCBattle.DataTruth.LIVE;
          }
          const mv = $('marketVolume'); if (mv) mv.textContent = fmtUsd(coin.usd_24h_vol);
        }
        if (window.LUNCBattle && LUNCBattle.ui && typeof LUNCBattle.ui.setPriceChange === 'function') {
          if (coin.usd_24h_change != null && isFinite(coin.usd_24h_change)) {
            LUNCBattle.ui.setPriceChange(coin.usd_24h_change, LUNCBattle.DataTruth.LIVE);
          }
        }
        // Estimated walls only when no live book — clearly ESTIMATED, never labeled Binance
        if(depthSource!==SRC.BINANCE && depthSource!==SRC.API) {
          const vol=coin.usd_24h_vol||5e6, base=Math.max(.7,Math.min(5,vol/3.5e6));
          buyWall=base*(.92+Math.random()*.18); sellWall=base*(.90+Math.random()*.2);
          depthVendorLabel = 'Estimated (CoinGecko vol proxy)';
        }
        updateStatusUI(); return true;
      } catch(e){
        console.warn('[CoinGecko]',e.message||e);
        const m = String(e.message||e);
        const http = /HTTP\s+(\d+)/i.exec(m);
        reportQFeed('coingecko', classifyFeedHttp(http ? http[1] : 0, m), m);
        return false;
      }
    }

    async function fetchMarketContext() {
      const t=tokens[current]; if(!t.gecko) return;
      try {
        const r=await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids='+encodeURIComponent(t.gecko),{cache:'no-store'});
        if(!r.ok) throw new Error('HTTP '+r.status);
        const rows=await r.json(), coin=Array.isArray(rows)?rows[0]:null; if(!coin) return;
        if(coin.market_cap>0) $('marketCap').textContent=fmtUsd(coin.market_cap);
        $('marketRank').textContent=coin.market_cap_rank?('#'+coin.market_cap_rank):'—';
        if (coin.total_volume > 0) {
          const mv = $('marketVolume'); if (mv) mv.textContent = fmtUsd(coin.total_volume);
          if (window.LUNCBattle && LUNCBattle.market) {
            LUNCBattle.market.setVolume24h(coin.total_volume, LUNCBattle.DataTruth.LIVE);
            if (LUNCBattle.ui) {
              LUNCBattle.ui.lastVolumeUsd = coin.total_volume;
              LUNCBattle.ui.lastVolumeTruth = LUNCBattle.DataTruth.LIVE;
            }
          }
        }
        if (coin.circulating_supply > 0) {
          const ms = $('marketSupply');
          if (ms) {
            const s = coin.circulating_supply;
            ms.textContent = s >= 1e12 ? (s/1e12).toFixed(2)+'T'
              : s >= 1e9 ? (s/1e9).toFixed(2)+'B'
              : s >= 1e6 ? (s/1e6).toFixed(2)+'M'
              : String(Math.round(s));
          }
        }
        if (coin.price_change_percentage_24h != null && window.LUNCBattle && LUNCBattle.ui && LUNCBattle.ui.setPriceChange) {
          LUNCBattle.ui.setPriceChange(coin.price_change_percentage_24h, LUNCBattle.DataTruth.LIVE);
        }
      } catch(e){
        console.warn('[Market context]',e.message||e);
        const m = String(e.message||e);
        const http = /HTTP\s+(\d+)/i.exec(m);
        reportQFeed('coingecko', classifyFeedHttp(http ? http[1] : 0, m), 'markets '+m);
      }
    }

    async function fetchChainTvl() {
      try {
        const r=await fetch('https://api.llama.fi/v2/chains',{cache:'no-store'}), rows=await r.json();
        const terra=rows.find(c=>c.name==='Terra Classic');
        if(terra) {
          $('tvlValue').textContent=fmtUsd(terra.tvl);
          reportQFeed('defillama', 'LIVE', 'chains');
          reportQFeed('terra', 'LIVE', 'Terra Classic TVL');
          if (window.LUNCBattle && LUNCBattle.ui) {
            // Ecosystem bias stays neutral — TVL presence is informational LIVE, not directional
            LUNCBattle.ui.lastEcosystemTruth = LUNCBattle.DataTruth.LIVE;
            LUNCBattle.ui.lastEcosystemBias = 0;
            LUNCBattle.ui.lastEcosystemDetail = 'TVL ' + fmtUsd(terra.tvl);
          }
        }
      } catch(e){
        console.warn('[DefiLlama chain]',e.message||e);
        const m = String(e.message||e);
        reportQFeed('defillama', classifyFeedHttp(0, m), 'chains '+m);
        reportQFeed('terra', classifyFeedHttp(0, m), 'TVL '+m);
      }
    }
    async function fetchProtocolTvl(slug,id) {
      try { const r=await fetch('https://api.llama.fi/tvl/'+slug,{cache:'no-store'}); const v=await r.json(); $(id).textContent=fmtUsd(typeof v==='number'?v:null); } catch(_) {}
    }
    function startContextFeeds() {
      const tick=()=>{ fetchChainTvl(); fetchProtocolTvl('terraport','tvlTerraport'); fetchProtocolTvl('garudadefi','tvlGaruda'); fetchProtocolTvl('juris-protocol','tvlJuris'); fetchMarketContext(); };
      tick(); setInterval(tick,60000);
    }

    function applyLiveBook(mid, sourceName, sourceLabel) {
      if (!(mid > 0) || !window.LUNCBattle || !LUNCBattle.market) return;
      sourceName = sourceName || 'binance';
      sourceLabel = sourceLabel || (sourceName === 'binance' ? 'Binance' : sourceName === 'api' ? 'Backend API' : 'Unknown');
      const st = LUNCBattle.market.updateFromMaps(mid, localBids, localAsks, LUNCBattle.DataTruth.LIVE, sourceName, sourceLabel);
      if (st.buyWallM != null && st.buyWallM > 0.01) buyWall = Math.max(0.25, Math.min(12, st.buyWallM));
      if (st.sellWallM != null && st.sellWallM > 0.01) sellWall = Math.max(0.25, Math.min(12, st.sellWallM));
      if (LUNCBattle.ui) {
        LUNCBattle.ui.lastBookImbalance = st.imbalance || 0;
        LUNCBattle.ui.lastBookTruth = (st.zones && st.zones.truth === LUNCBattle.DataTruth.PARTIAL)
          ? LUNCBattle.DataTruth.PARTIAL
          : LUNCBattle.DataTruth.LIVE;
        LUNCBattle.ui.lastZones = st.zones;
      }
      if (priceTerritoryApi && st.zones) {
        priceTerritoryApi.updateLiquidityDefenses(st.zones, mid);
      }
      renderLiquidityHud(st.zones, sourceLabel);
    }

    function renderLiquidityHud(zones, sourceLabel) {
      if (window.LUNCBattle && LUNCBattle.ui && typeof LUNCBattle.ui.renderLiquidityBands === 'function') {
        LUNCBattle.ui.renderLiquidityBands(zones, sourceLabel, { noBook: !(tokens[current] && tokens[current].symbol) });
        return;
      }
      const el = document.getElementById('liquidityZones');
      if (!el) return;
      if (!zones || zones.truth === 'UNAVAILABLE') {
        el.textContent = 'UNAVAILABLE — no live order book';
        return;
      }
      const fmt = u => {
        if (u == null) return '—';
        return u >= 1e6 ? '$'+(u/1e6).toFixed(2)+'M' : '$'+(u/1e3).toFixed(0)+'K';
      };
      const cell = z => {
        const name = z.label.replace(' defense','').replace(' wall','').replace(' liquidity','');
        if (z.truth === 'UNAVAILABLE') return name + ' UNAVAILABLE';
        if (z.truth === 'PARTIAL') return name + ' ' + fmt(z.usd) + ' PARTIAL';
        return name + ' ' + fmt(z.usd);
      };
      const row = (side) => (zones[side] || []).map(cell).join(' · ');
      const cover = 'bid≤' + (zones.maxBidPct||0).toFixed(2) + '% · ask≤' + (zones.maxAskPct||0).toFixed(2) + '%';
      const src = sourceLabel || zones.sourceLabel || 'Unknown';
      const liveDepth = (typeof depthSource !== 'undefined') && (depthSource === SRC.BINANCE || depthSource === SRC.API);
      let badge;
      if (!liveDepth) {
        badge = '<span class="qual est">(ESTIMATED · not live book)</span>';
      } else if (zones.truth === 'PARTIAL') {
        badge = '<span class="qual est">(PARTIAL · ' + src + ')</span>';
      } else {
        badge = '<span class="qual live">(LIVE · ' + src + ')</span>';
      }
      el.innerHTML = '<div class="micro">' + badge + ' · coverage ' + cover + '</div>'
        + '<div class="micro">Bid: ' + row('bids') + '</div>'
        + '<div class="micro">Ask: ' + row('asks') + '</div>';
    }

    /** Merge depth20 snapshot into a deeper local book without wiping far levels. */
    function mergeDepth20IntoLocal(bids, asks) {
      if (!bids.length || !asks.length) return;
      const bidPrices = bids.map(l => +l[0]).filter(p => p > 0);
      const askPrices = asks.map(l => +l[0]).filter(p => p > 0);
      if (!bidPrices.length || !askPrices.length) return;
      const minBid = Math.min(...bidPrices);
      const maxAsk = Math.max(...askPrices);
      // Drop stale near-side levels inside the WS window, keep deeper REST levels
      Object.keys(localBids).forEach(k => { if (+k >= minBid) delete localBids[k]; });
      Object.keys(localAsks).forEach(k => { if (+k <= maxAsk) delete localAsks[k]; });
      bids.forEach(l => { const p=+l[0], q=+l[1]; if (p>0) { if (q>0) localBids[p]=q; else delete localBids[p]; } });
      asks.forEach(l => { const p=+l[0], q=+l[1]; if (p>0) { if (q>0) localAsks[p]=q; else delete localAsks[p]; } });
    }

    async function seedBinanceRestDepth(symbol) {
      if (!symbol || !window.LUNCBattle || !LUNCBattle.market) return;
      const snap = await LUNCBattle.market.fetchBinanceRestDepth(symbol, LUNCBattle.config.binanceRestDepthLimit || 1000);
      if (snap.truth !== LUNCBattle.DataTruth.LIVE) {
        console.warn('[Binance REST depth]', snap.reason || 'unavailable');
        reportQFeed('binanceVision', classifyFeedHttp(snap && snap.status, snap && snap.reason), (snap && snap.reason) || 'depth unavailable');
        return;
      }
      localBids = {}; localAsks = {};
      (snap.bids || []).forEach(l => { const p=+l[0], q=+l[1]; if (p>0 && q>0) localBids[p]=q; });
      (snap.asks || []).forEach(l => { const p=+l[0], q=+l[1]; if (p>0 && q>0) localAsks[p]=q; });
      const midPx = price > 0 ? price : 0;
      if (midPx > 0) {
        depthSource = SRC.BINANCE;
        depthVendorLabel = 'Binance';
        lastDepthTs = Date.now();
        reportQFeed('binanceVision', 'LIVE', 'REST depth');
        applyLiveBook(midPx, 'binance', 'Binance');
        updateStatusUI();
      }
    }

    function connectBinance(symbol,futuresSymbol=null) {
      if(!symbol) return; closeExchangeSockets(); localBids={}; localAsks={};
      // Seed deep book via REST, then keep near market fresh via WS depth20
      seedBinanceRestDepth(symbol);
      if (restDepthTimer) clearInterval(restDepthTimer);
      restDepthTimer = setInterval(() => {
        if (tokens[current].symbol === symbol) seedBinanceRestDepth(symbol);
      }, 20000);

      const streams=symbol+'@bookTicker/'+symbol+'@depth20@100ms';
      try {
        spotWs=new WebSocket('wss://stream.binance.com:9443/stream?streams='+streams);
        spotWs.onopen=()=>{ reconnectAttempts=0; depthSource=SRC.BINANCE; depthVendorLabel='Binance'; reportQFeed('binanceWs', 'LIVE', 'bookTicker+depth20'); if(window.LUNCBattle&&LUNCBattle.ui&&LUNCBattle.ui.updateHealthInput) LUNCBattle.ui.updateHealthInput({ reconnecting:false, binanceOk:true, depthLive:true }); updateStatusUI(); pushFeed('Binance order book connected','win'); };
        spotWs.onmessage=evt=>{
          try {
            const raw=JSON.parse(evt.data), msg=raw.data||raw;
            if(msg.b!=null&&msg.a!=null&&!Array.isArray(msg.b)) {
              const bid=+msg.b,ask=+msg.a; if(bid>0&&ask>0) applySpot((bid+ask)/2,SRC.BINANCE);
            }
            if(Array.isArray(msg.bids)&&Array.isArray(msg.asks)) {
              if (Object.keys(localBids).length === 0 && Object.keys(localAsks).length === 0) {
                // No REST seed yet — use depth20 alone (will mark deep bands PARTIAL/UNAVAILABLE)
                localBids={}; localAsks={};
                msg.bids.forEach(l=>{const p=+l[0],q=+l[1];if(q>0)localBids[p]=q;});
                msg.asks.forEach(l=>{const p=+l[0],q=+l[1];if(q>0)localAsks[p]=q;});
              } else {
                mergeDepth20IntoLocal(msg.bids, msg.asks);
              }
              const midPx = price > 0 ? price : ((Object.keys(localBids).length && Object.keys(localAsks).length) ? (Math.max(...Object.keys(localBids).map(Number))+Math.min(...Object.keys(localAsks).map(Number)))/2 : 0);
              applyLiveBook(midPx || price, 'binance', 'Binance');
              lastDepthTs=Date.now(); depthSource=SRC.BINANCE; depthVendorLabel='Binance';
            }
            updateStatusUI();
          } catch(_) {}
        };
        spotWs.onclose=()=>{
          if(depthSource===SRC.BINANCE){ depthSource=SRC.SIM; depthVendorLabel='Unavailable'; }
          if(priceSource===SRC.BINANCE) priceSource=SRC.GECKO;
          // Don't leave a stale LIVE·Binance zones badge when the book socket dies
          const zel=document.getElementById('liquidityZones');
          if(zel && depthSource===SRC.SIM) zel.textContent='UNAVAILABLE — live order book disconnected';
          if(window.LUNCBattle&&LUNCBattle.ui){ LUNCBattle.ui.lastBookTruth=LUNCBattle.DataTruth.UNAVAILABLE; LUNCBattle.ui.lastZones=null; }
          if (priceTerritoryApi) priceTerritoryApi.updateLiquidityDefenses(null, price);
          reportQFeed('binanceWs', 'RECONNECTING', 'socket closed');
          if (window.LUNCBattle && LUNCBattle.ui && LUNCBattle.ui.updateHealthInput) {
            LUNCBattle.ui.updateHealthInput({ reconnecting: true, depthLive: false });
          }
          updateStatusUI(); scheduleReconnect(symbol,futuresSymbol);
        };
        spotWs.onerror=()=>{ reportQFeed('binanceWs', 'DEGRADED', 'socket error'); };
      } catch(_) { scheduleReconnect(symbol,futuresSymbol); }

      // USD-M public liquidation stream → strength score + War Room + battlefield FX
      try {
        if(!futuresSymbol) return;
        futWs=new WebSocket('wss://fstream.binance.com/ws/'+futuresSymbol+'@forceOrder');
        futWs.onmessage=evt=>{
          try {
            const raw=JSON.parse(evt.data),o=(raw.data||raw).o||raw; if(!o||o.q==null) return;
            const amount=parseFloat(o.q);
            const px=parseFloat(o.p||o.ap||0);
            const usd=amount*px; if(!(usd>=800)) return;
            const side=(o.S||'').toUpperCase();
            const sym=(o.s||futuresSymbol||'').toUpperCase();
            const ts = o.T || Date.now();
            const zz=(Math.random()-.5)*14;
            const entry = (window.LUNCBattle && LUNCBattle.ui && LUNCBattle.ui.recordLiquidation)
              ? LUNCBattle.ui.recordLiquidation({
                  symbol: sym, side, amount, usd, timestamp: ts,
                  source: 'Binance Futures'
                })
              : { classification: side==='SELL'?'LONG_LIQ':'SHORT_LIQ' };
            // War Room card emitted by ui.recordLiquidation → warRoom.pushLiquidation
            if(side==='SELL') {
              // Longs liquidated → forced sells → bearish pressure on bulls
              buyWall=Math.max(.25,buyWall*.93);
            } else {
              // Shorts liquidated → forced buys → bullish pressure on bears
              sellWall=Math.max(.25,sellWall*.93);
            }
            if (effectsApi && effectsApi.playLiquidationFX) {
              effectsApi.playLiquidationFX({
                side: side,
                usd: usd,
                classification: entry.classification,
                targetX: targetX,
                z: zz,
                bullColor: tokens[current].color,
                bearColor: 0xe4675f
              });
              // v8.6: brief cinematic ONLY for massive tier — user input cancels
              if (effectsApi.scaleFromUsd && cameraCtrl && cameraCtrl.requestCinematic) {
                const scaled = effectsApi.scaleFromUsd(usd);
                if (scaled && scaled.tier === 'massive') {
                  const cx = targetX + (side === 'SELL' ? -4 : 4);
                  cameraCtrl.requestCinematic({ x: cx, z: zz, duration: 0.85, zoom: 42 });
                }
              }
              if (minimapApi && minimapApi.pulseEvent) {
                minimapApi.pulseEvent({ x: targetX, z: zz, kind: 'liq' });
              }
            } else if (side==='SELL') {
              launchStrike(targetX+12,targetX-6,zz,0xe4675f,Math.min(2.5,.7+usd/500000));
              createExplosion(targetX-6.5,zz,0xe4675f,Math.min(2.5,.7+usd/500000));
            } else {
              launchStrike(targetX-12,targetX+6,zz,tokens[current].color,Math.min(2.5,.7+usd/500000));
              createExplosion(targetX+6.5,zz,tokens[current].color,Math.min(2.5,.7+usd/500000));
            }
            playLiq();
            if (window.LUNCBattle && LUNCBattle.ui && typeof LUNCBattle.ui.tickStrength==='function') {
              LUNCBattle.ui.tickStrength();
            }
          } catch(_) {}
        };
      } catch(_) {}
    }

    function scheduleReconnect(symbol,futuresSymbol=null) {
      if(reconnectTimer) return;
      reconnectAttempts++;
      reportQFeed('binanceWs', 'RECONNECTING', 'attempt ' + reconnectAttempts);
      const delay=Math.min(20000,2000*Math.pow(1.5,reconnectAttempts));
      reconnectTimer=setTimeout(()=>{reconnectTimer=null; if(tokens[current].symbol===symbol)connectBinance(symbol,futuresSymbol);},delay);
    }

    function startPriceFeeds() {
      const t0 = tokens[current];
      fetchBinanceRestPrice(t0.symbol);
      fetchLlama(); fetchGecko();
      geckoTimer=setInterval(()=>{
        const t = tokens[current];
        // Poll vision REST so USTC/LUNC stay accurate when WS is 451-blocked
        fetchBinanceRestPrice(t.symbol);
        fetchLlama();
        fetchGecko();
      },8000);
      if(t0.symbol) connectBinance(t0.symbol,t0.futures);
    }

    // Primary market bridge: HTTPS ?api=…/snapshot (no localhost on Pages)
    let apiTimer = null;
    async function pollApiSnapshot() {
      if (!window.LUNCBattle || !LUNCBattle.market) return;
      const snap = await LUNCBattle.market.fetchSnapshot();
      if (snap.truth !== LUNCBattle.DataTruth.LIVE || !snap.data) {
        if (!LUNCBattle.config || !LUNCBattle.config.apiBase) {
          reportQFeed('backend', 'UNAVAILABLE', 'no ?api=');
        } else {
          reportQFeed('backend', classifyFeedHttp(0, snap && snap.reason), (snap && snap.reason) || 'snapshot unavailable');
        }
        return;
      }
      reportQFeed('backend', 'LIVE', 'snapshot');
      const s = snap.data;
      try {
        if (s.market && s.market.price > 0) {
          const pSrc = (s.market.source || s.source || '').toLowerCase();
          const pKey = pSrc.includes('binance') ? SRC.BINANCE
            : pSrc.includes('gecko') ? SRC.GECKO
            : pSrc.includes('llama') ? SRC.LLAMA
            : SRC.API;
          applySpot(s.market.price, pKey);
          priceSource = pKey;
        }
        if (s.book && s.book.bids && s.book.asks && s.market && s.market.price > 0) {
          // Preserve truthful vendor from snapshot metadata — never assume Binance
          const bookSrc = (s.book.source || s.source || 'api').toLowerCase();
          const bookLabel = s.book.sourceLabel || s.sourceLabel
            || (bookSrc.includes('binance') ? 'Binance'
              : bookSrc.includes('gecko') ? 'CoinGecko'
              : bookSrc.includes('llama') ? 'DefiLlama'
              : bookSrc.includes('terra') ? 'Terra Classic RPC/API'
              : 'Backend API');
          const srcKey = bookSrc.includes('binance') ? 'binance' : 'api';
          const st = LUNCBattle.market.updateFromBook(
            s.market.price, s.book.bids, s.book.asks,
            LUNCBattle.DataTruth.LIVE, srcKey, bookLabel
          );
          if (st.buyWallM > 0.01) buyWall = Math.max(0.25, Math.min(12, st.buyWallM));
          if (st.sellWallM > 0.01) sellWall = Math.max(0.25, Math.min(12, st.sellWallM));
          depthSource = srcKey === 'binance' ? SRC.BINANCE : SRC.API;
          depthVendorLabel = bookLabel;
          lastDepthTs = Date.now();
          if (LUNCBattle.ui) {
            LUNCBattle.ui.lastBookImbalance = st.imbalance || 0;
            LUNCBattle.ui.lastBookTruth = (st.zones && st.zones.truth === LUNCBattle.DataTruth.PARTIAL)
              ? LUNCBattle.DataTruth.PARTIAL : LUNCBattle.DataTruth.LIVE;
            LUNCBattle.ui.lastZones = st.zones;
          }
          if (priceTerritoryApi && st.zones) {
            priceTerritoryApi.updateLiquidityDefenses(st.zones, s.market.price);
          }
          renderLiquidityHud(st.zones, bookLabel);
        } else if (s.walls) {
          if (s.walls.buyM > 0) buyWall = s.walls.buyM;
          if (s.walls.sellM > 0) sellWall = s.walls.sellM;
          const wSrc = (s.walls.source || s.source || '').toLowerCase();
          const wLabel = s.walls.sourceLabel || s.sourceLabel
            || (wSrc.includes('binance') ? 'Binance' : 'Backend API');
          if (s.walls.quality === 'live') {
            depthSource = wSrc.includes('binance') ? SRC.BINANCE : SRC.API;
            depthVendorLabel = wLabel;
          }
          if (s.walls.zones) renderLiquidityHud(s.walls.zones, wLabel);
        }
        if (s.market && s.market.volume24h > 0) {
          LUNCBattle.market.setVolume24h(s.market.volume24h, LUNCBattle.DataTruth.LIVE);
          if (LUNCBattle.ui) {
            LUNCBattle.ui.lastVolumeUsd = s.market.volume24h;
            LUNCBattle.ui.lastVolumeTruth = LUNCBattle.DataTruth.LIVE;
          }
        }
        if (s.ecosystem) {
          if (s.ecosystem.chainTvlUsd) $('tvlValue').textContent = fmtUsd(s.ecosystem.chainTvlUsd);
          const pr = s.ecosystem.protocols || {};
          if (pr.terraport) $('tvlTerraport').textContent = fmtUsd(pr.terraport.tvlUsd);
          if (pr.garuda) $('tvlGaruda').textContent = fmtUsd(pr.garuda.tvlUsd);
          if (pr.juris) $('tvlJuris').textContent = fmtUsd(pr.juris.tvlUsd);
        }
        updateStatusUI();
      } catch (e) { console.warn('[api snapshot]', e.message || e); }
    }
    function startApiPoll() {
      if (!window.LUNCBattle || !LUNCBattle.config.apiBase || apiTimer) return;
      pollApiSnapshot();
      apiTimer = setInterval(pollApiSnapshot, 3000);
      pushFeed('HTTPS API bridge enabled (' + LUNCBattle.config.apiBase + ')', 'info');
    }



    setInterval(()=>{
      if(Date.now()-lastPriceTs>50000&&priceSource!==SRC.SIM){priceSource=SRC.SIM;isLive=false;updateStatusUI();}
      if((depthSource===SRC.BINANCE||depthSource===SRC.API)&&Date.now()-lastDepthTs>25000){
        depthSource=SRC.SIM; depthVendorLabel='Unavailable';
        const zel=document.getElementById('liquidityZones');
        if(zel) zel.textContent='UNAVAILABLE — order book stale';
        if(window.LUNCBattle&&LUNCBattle.ui){ LUNCBattle.ui.lastBookTruth=LUNCBattle.DataTruth.UNAVAILABLE; LUNCBattle.ui.lastZones=null; }
        if (priceTerritoryApi) priceTerritoryApi.updateLiquidityDefenses(null, price);
        updateStatusUI();
      }
    },3500);

    // -------------------- Battle simulation tied to market --------------------
    function updateBattleLogic() {
      if(priceSource!==SRC.SIM&&priceHistory.length>5) {
        const r=priceHistory.slice(-9), delta=r[r.length-1]-r[0]; momentum=momentum*.73+(delta/(price||1))*34;
      } else if(priceSource===SRC.SIM) {
        momentum+=(Math.random()-.49)*.13; momentum*=.88;
        const speed=current==='LUNC'?.00000010:current==='USTC'?.000009:.00000045;
        price+=momentum*speed;
        price=Math.max(tokens[current].base*.7,Math.min(tokens[current].base*1.4,price));
        lastPriceTs=Date.now();
        if(Math.random()<.1){buyWall=Math.max(.6,Math.min(6,buyWall+(Math.random()-.5)*.35));sellWall=Math.max(.6,Math.min(6,sellWall+(Math.random()-.5)*.35));}
      }

      if (priceTerritoryApi) {
        const truth = priceSource===SRC.SIM
          ? ((window.LUNCBattle&&LUNCBattle.DataTruth&&LUNCBattle.DataTruth.SIMULATED)||'SIMULATED')
          : ((window.LUNCBattle&&LUNCBattle.DataTruth&&LUNCBattle.DataTruth.LIVE)||'LIVE');
        priceTerritoryApi.updateCurrentPrice(price, { truth: truth, sourceLabel: priceSource });
        if (priceTerritoryApi.getDisplayedRange) {
          const dr = priceTerritoryApi.getDisplayedRange();
          if (dr && dr.low > 0 && dr.high > dr.low) { rangeLow = dr.low; rangeHigh = dr.high; }
        }
      }

      if(price>rangeHigh) {
        pushFeed('BULLS CAPTURE THE RANGE','win'); showVictory(true); const span=(rangeHigh-rangeLow)*.5; rangeLow=price-span; rangeHigh=price+span; createExplosion(targetX,0,tokens[current].color,1.7); buyWall=Math.min(6,buyWall+.28);
      } else if(price<rangeLow) {
        pushFeed('BEARS CAPTURE THE RANGE','loss'); showVictory(false); const span=(rangeHigh-rangeLow)*.5; rangeLow=price-span; rangeHigh=price+span; createExplosion(targetX,0,0xe4675f,1.7); sellWall=Math.min(6,sellWall+.28);
      }

      const t=tokens[current];
      $('battleRange').textContent='BATTLE '+rangeLow.toFixed(t.decimals)+' – '+rangeHigh.toFixed(t.decimals)+' · BEARS '+rangeLow.toFixed(t.decimals)+' · BULLS '+rangeHigh.toFixed(t.decimals);
      var _brp=document.getElementById('battleRangePanel'); if(_brp)_brp.textContent='BATTLE '+rangeLow.toFixed(t.decimals)+' – '+rangeHigh.toFixed(t.decimals);
      $('price').textContent='$'+price.toFixed(t.decimals);
      const tickVal=(momentum*55).toFixed(2), tick=$('tick'); tick.textContent=(momentum>=0?'+':'')+tickVal+'%'; tick.style.color=momentum>=0?'var(--bull)':'var(--bear)';
      const press=$('pressure'); if(momentum>.07){press.textContent='Buyers advancing';press.className='pressure buyers';}else if(momentum<-.07){press.textContent='Sellers advancing';press.className='pressure sellers';}else{press.textContent='Contested';press.className='pressure contested';}
      $('buyWall').textContent='$'+buyWall.toFixed(2)+'M'; $('sellWall').textContent='$'+sellWall.toFixed(2)+'M';
      if (window.LUNCBattle && LUNCBattle.ui && typeof LUNCBattle.ui.updateFrontlineHud === 'function') {
        let levels = [];
        if (priceTerritoryApi && typeof priceTerritoryApi.getVisiblePriceLevels === 'function') {
          try { levels = priceTerritoryApi.getVisiblePriceLevels() || []; } catch (_) {}
        }
        LUNCBattle.ui.updateFrontlineHud({
          price: price,
          rangeLow: rangeLow,
          rangeHigh: rangeHigh,
          decimals: t.decimals,
          levels: levels,
          frontlineX: priceTerritoryApi ? priceTerritoryApi.getFrontlineX() : targetX
        });
      }

      if(Date.now()-lastRebuild>7000 && Math.random()<.17) rebuildUnits();
      if(!isLive&&t.hasBurns&&Math.random()<.055){
        pushFeed('Simulated burn flare · not a chain event','burn');
        if (effectsApi && effectsApi.playBurnFX) {
          const bx = targetX+(Math.random()-.5)*8;
          const bz = (Math.random()-.5)*14;
          const burnScaled = effectsApi.playBurnFX({
            amountLunc: 1e6,
            truth: (window.LUNCBattle && LUNCBattle.DataTruth && LUNCBattle.DataTruth.SIMULATED) || 'SIMULATED',
            x: bx,
            z: bz
          });
          if (minimapApi && minimapApi.pulseEvent) minimapApi.pulseEvent({ x: bx, z: bz, kind: 'burn' });
          // Massive-tier burns only — user input cancels; sim 1e6 flare is not massive
          if (burnScaled && burnScaled.tier === 'massive' && cameraCtrl && cameraCtrl.requestCinematic) {
            cameraCtrl.requestCinematic({ x: bx, z: bz, duration: 0.9, zoom: 40 });
          }
        } else {
          createExplosion(targetX+(Math.random()-.5)*8,(Math.random()-.5)*14,0xffbf47,1.2,true);
        }
        playBurn();
      }
    }
    setInterval(updateBattleLogic,760);

    function maybeFire(u,enemyColor,dt) {
      u.userData.shot-=dt;
      if(u.userData.shot>0) return false;
      const type=u.userData.type|0;
      const isAir = type===3 || type===4 || u.userData.air;
      const front=Math.abs(u.position.x-targetX);
      const base = type===4 ? 2.2 : type===3 ? 1.35 : type===2 ? 3.7 : type===1 ? 2.5 : 1.7;
      u.userData.shot=base+Math.random()*base*(isAir?1.1:1.8);
      const rangeOk = isAir ? (front < (type===4 ? 38 : 28) && u.position.y > 4) : (front < 24);
      const chance = isAir ? (type===4 ? 0.55 : 0.48) : 0.42;
      if(rangeOk && Math.random()<chance) {
        const side=u.userData.side;
        const toX=targetX + (isAir ? (Math.random()-.5)*10 : side*(Math.random()*5-2.5));
        const z=u.position.z+(Math.random()-.5)*(isAir?8:4);
        let kind, power;
        if (type===4) { kind='rocket'; power = mobileGfx ? 1.15 : 1.45; }
        else if (type===3) { kind = Math.random() < 0.55 ? 'rocket' : 'tracer'; power = kind==='rocket' ? 0.95 : 0.6; }
        else if (type===2) { kind='arty'; power=1.1; }
        else if (type===1) { kind='shell'; power=0.85; }
        else { kind='tracer'; power=0.55; }
        const color = side<0 ? tokens[current].color : 0xe4675f;
        const muz = muzzleWorld(u);
        if (effectsApi && effectsApi.fireWeapon) {
          effectsApi.fireWeapon({
            from: { x: muz.x, y: muz.y, z: muz.z },
            to: { x: toX, y: terrainHeight(toX, z) + 0.35, z: z },
            kind: kind,
            color: color,
            power: power,
            side: side
          });
          // Jet bomb ripple — second impact near first for kinetic pass feel
          if (type===4 && !mobileGfx && Math.random() < 0.55 && effectsApi.createExplosion) {
            const bx = toX + (Math.random()-.5)*3;
            const bz = z + (Math.random()-.5)*3;
            setTimeout(function () {
              try { createExplosion(bx, bz, color, 1.05 + Math.random()*0.35); } catch (_) {}
            }, 180 + Math.random()*220);
          }
        } else {
          launchStrike(u.position.x+side*-1.0,toX,z,color,power);
        }
        if (unitsApi && unitsApi.setAnimState) {
          unitsApi.setAnimState(u, (window.LUNCBattle && LUNCBattle.animations && LUNCBattle.animations.STATES.FIRE) || 'FIRE', performance.now()*.001);
        } else {
          u.userData.animState = 'FIRE';
          u.userData.fireUntil = performance.now()*.001 + (type===2||type===4?0.28:0.18);
          u.userData.reloadUntil = u.userData.fireUntil + (type===2?1.6:type===4?0.9:0.7);
          u.userData.recoil = 1;
        }
        return true;
      }
      return false;
    }

    // -------------------- Animation --------------------
    const clock=new THREE.Clock();
    let activeExplosionApprox = 0;
    if (window.LUNCBattle && LUNCBattle.quality && LUNCBattle.quality.setCountsProvider) {
      LUNCBattle.quality.setCountsProvider(function () {
        let smokeN = 0;
        for (let i = 0; i < particlePool.length; i++) {
          if (particlePool[i].userData && particlePool[i].userData.smoke) smokeN++;
        }
        var matCount = null;
        try {
          if (window.LUNCBattle && LUNCBattle.materials && LUNCBattle.materials.getCount) {
            matCount = LUNCBattle.materials.getCount();
          }
        } catch (_) {}
        return {
          units: bulls.length + bears.length,
          projectiles: projectilePool.length,
          particles: particlePool.length,
          explosions: activeExplosionApprox,
          smoke: smokeN,
          materials: matCount ? matCount.total : null,
          materialsShared: matCount ? matCount.shared : null
        };
      });
    }
    function animate() {
      requestAnimationFrame(animate);
      const dt=Math.min(.04,clock.getDelta());
      if (window.LUNCBattle && LUNCBattle.lod && LUNCBattle.lod.beginFrame) {
        LUNCBattle.lod.beginFrame();
      }
      if (cameraCtrl) cameraShake = cameraCtrl.update(dt, keys, cameraShake);
      else controls.update();
      if (priceTerritoryApi) {
        priceTerritoryApi.updateFrontline(dt);
        targetX = priceTerritoryApi.getFrontlineX();
      } else {
        const mid=(rangeLow+rangeHigh)/2, span=Math.max(rangeHigh-rangeLow,1e-12);
        targetX=THREE.MathUtils.clamp(((price-mid)/span)*28,-25,25);
      }

      const now=performance.now()*.001;
      function tickAirCombat(u, side, dt, now) {
        const ud = u.userData;
        const type = ud.type | 0;
        const prevX = u.position.x;
        const prevZ = u.position.z;
        if (type === 3) {
          // Helicopter: orbit / strafe near frontline, fire rockets/guns
          ud.orbitAngle = (ud.orbitAngle || 0) + dt * (ud.orbitSpeed || 0.4);
          const r = ud.orbitRadius || 12;
          const cx = targetX + side * (3.5 + Math.sin(now * 0.2 + (ud.phase || 0)) * 2);
          const homeZ = ud.homeZ != null ? ud.homeZ : 0;
          const nx = cx + Math.cos(ud.orbitAngle) * r * 0.55;
          const nz = homeZ + Math.sin(ud.orbitAngle) * r * 0.85;
          u.position.x = nx;
          u.position.z = nz;
          const alt = ud.alt || 9;
          u.position.y = alt + Math.sin(now * 1.4 + (ud.phase || 0)) * 0.35;
          const vx = u.position.x - prevX;
          const vz = u.position.z - prevZ;
          ud.speed = Math.sqrt(vx * vx + vz * vz) / Math.max(dt, 1e-4);
          ud.facing = Math.atan2(vx, vz);
          // bank slightly into turn
          u.rotation.z = THREE.MathUtils.clamp(-(vx) * 0.08, -0.35, 0.35);
          maybeFire(u, side < 0 ? 0xe4675f : tokens[current].color, dt);
        } else if (type === 4) {
          // Jet: fast cross-battlefield strafe / bomb pass, exit, re-enter
          let mode = ud.airMode || 'ingress';
          const alt = ud.alt || 15;
          const cruise = mobileGfx ? 22 : 32;
          if (mode === 'reenter') {
            ud.runCooldown = (ud.runCooldown || 0) - dt;
            u.position.y = alt;
            if (ud.runCooldown <= 0) {
              ud.airMode = 'ingress';
              u.position.x = side * (58 + Math.random() * 10);
              u.position.z = (ud.homeZ != null ? ud.homeZ : 0) + (Math.random() - 0.5) * 8;
            }
          } else if (mode === 'egress') {
            const exitX = -side * 62;
            const dx = exitX - u.position.x;
            const step = Math.sign(dx) * cruise * dt;
            if (Math.abs(step) >= Math.abs(dx)) {
              u.position.x = exitX;
              ud.airMode = 'reenter';
              ud.runCooldown = mobileGfx ? (5 + Math.random() * 4) : (3.5 + Math.random() * 3);
            } else {
              u.position.x += step;
            }
            u.position.y = alt + 1.5;
            ud.facing = side < 0 ? -Math.PI / 2 : Math.PI / 2; // flying outbound
            ud.speed = cruise;
          } else {
            // ingress / strafe toward and across frontline
            const aimX = -side * 48;
            const dx = aimX - u.position.x;
            const step = Math.sign(dx || -side) * cruise * dt;
            u.position.x += step;
            u.position.z += Math.sin(now * 0.7 + (ud.phase || 0)) * dt * 1.8;
            u.position.y = alt + Math.sin(now * 2 + (ud.phase || 0)) * 0.4;
            ud.facing = Math.atan2(step, 0.001);
            ud.speed = cruise;
            ud.airMode = 'ingress';
            // Strafe window near frontline — shoot/bomb
            if (Math.abs(u.position.x - targetX) < 26) {
              maybeFire(u, side < 0 ? 0xe4675f : tokens[current].color, dt);
            }
            // Crossed far side → egress
            if ((side < 0 && u.position.x > 42) || (side > 0 && u.position.x < -42)) {
              ud.airMode = 'egress';
            }
          }
          u.rotation.z = THREE.MathUtils.clamp((u.position.z - prevZ) * -0.15, -0.4, 0.4);
        }
        ud.velX = (u.position.x - prevX) / Math.max(dt, 1e-4);
        if (unitsApi && unitsApi.tickUnit) {
          unitsApi.tickUnit(u, dt, now, {
            momentum: momentum, targetX: targetX, mobile: mobileGfx,
            cameraPos: camera.position,
            camera: camera,
            enableLodSwap: false
          });
        }
        // Keep altitude (do not snap to terrain)
        if (type === 3) u.position.y = Math.max(6.5, u.position.y);
        if (type === 4) u.position.y = Math.max(11, u.position.y);
      }

      function moveArmy(arr,side) {
        const momAbs = Math.abs(momentum);
        const contested = momAbs < 0.055;
        const urgent = momAbs > 0.12;
        arr.forEach(u=>{
          const type=u.userData.type|0;
          if (type === 3 || type === 4 || u.userData.air) {
            tickAirCombat(u, side, dt, now);
            return;
          }
          const rank=type===0?0:type===1?1:2;
          let desired=targetX+side*(7.8+rank*6.2+Math.floor((u.userData.index||0)/(type===0?8:5))*1.6);
          // Keep staging: bulls west / bears east; infantry may only slightly overrun frontline
          const maxOver = type===0 ? 2.2 : (type===1 ? 1.2 : 0.4);
          if (side < 0) desired = Math.min(desired, targetX - 0.6 + maxOver);
          else desired = Math.max(desired, targetX + 0.6 - maxOver);
          const dx=desired-u.position.x;
          // Speed from momentum urgency: stronger |momentum| → faster approach
          let rate;
          if (type === 0) rate = urgent ? 2.1 : contested ? 0.55 : 1.35;
          else if (type === 1) rate = urgent ? 0.95 : contested ? 0.35 : 0.7;
          else rate = contested ? 0.12 : 0.28; // arty mostly holds rear
          // Near desired + contested → idle more (slow crawl)
          if (contested && Math.abs(dx) < 1.2) rate *= 0.25;
          const step = dx * Math.min(1, dt * rate);
          const prevX = u.position.x;
          u.position.x += step;
          const speed = Math.abs(step) / Math.max(dt, 1e-4);
          u.userData.speed = speed;
          u.userData.velX = (u.position.x - prevX) / Math.max(dt, 1e-4);
          // Orient toward enemy frontline (±x)
          u.userData.facing = side < 0 ? Math.PI / 2 : -Math.PI / 2;
          maybeFire(u, side<0?0xe4675f:tokens[current].color, dt);
          if (unitsApi && unitsApi.tickUnit) {
            unitsApi.tickUnit(u, dt, now, {
              momentum: momentum, targetX: targetX, mobile: mobileGfx,
              cameraPos: camera.position,
              camera: camera,
              enableLodSwap: !!(window.LUNCBattle && LUNCBattle.assets && LUNCBattle.assets.getMode && LUNCBattle.assets.getMode() === 'GLTF')
            });
          }
          // v8.3: apply rootBob after tickUnit so infantry bob is same-frame
          u.position.y = terrainHeight(u.position.x, u.position.z) + (u.userData.rootBob || 0);
        });
      }
      moveArmy(bulls,-1); moveArmy(bears,1);

      if (effectsApi && typeof effectsApi.tick === 'function') {
        effectsApi.tick(dt, now, camera);
      } else {
        for(let i=projectilePool.length-1;i>=0;i--){
          const b=projectilePool[i],dx=b.userData.tx-b.position.x,step=Math.sign(dx)*b.userData.speed*dt;
          b.position.x+=Math.abs(step)>Math.abs(dx)?dx:step; b.position.y+=Math.sin(now*10+i)*.015; b.userData.life-=dt;
          if(Math.abs(dx)<.25||b.userData.life<=0){createExplosion(b.position.x,b.position.z,b.userData.color,b.userData.power*.75);scene.remove(b);projectilePool.splice(i,1);}
        }
        for(let i=particlePool.length-1;i>=0;i--){
          const q=particlePool[i]; q.userData.life-=dt; q.position.x+=q.userData.vx*dt; q.position.y+=q.userData.vy*dt; q.position.z+=q.userData.vz*dt;
          if(!q.userData.smoke) q.userData.vy-=5.1*dt; else q.scale.multiplyScalar(1+dt*.45);
          q.material.opacity=Math.max(0,q.userData.smoke?q.userData.life*.19:q.userData.life*1.2);
          if(q.userData.life<=0){scene.remove(q);particlePool.splice(i,1);}
        }
      }
      // camera shake applied inside cameraCtrl.update (no permanent target drift)
      bullLight.intensity=1.1+Math.sin(now*1.3)*.16; bearLight.intensity=1.05+Math.cos(now*1.25)*.14;
      if (envApi && typeof envApi.update === 'function') envApi.update(dt, now, camera);
      if (structuresApi && typeof structuresApi.applyStructureLods === 'function') structuresApi.applyStructureLods(camera);
      if (structuresApi && typeof structuresApi.updateStructures === 'function') structuresApi.updateStructures(dt, now);
      if (minimapApi) {
        if (priceTerritoryApi && priceTerritoryApi.getDefenseMarkers) {
          minimapApi.setDefenses(priceTerritoryApi.getDefenseMarkers());
        }
        minimapApi.draw();
      }
      // Snapshot LOD tallies AFTER units/structures/env, THEN refresh PERF overlay
      if (window.LUNCBattle && LUNCBattle.lod && LUNCBattle.lod.endFrame) {
        LUNCBattle.lod.endFrame();
      }
      if (window.LUNCBattle && LUNCBattle.quality && LUNCBattle.quality.tick) {
        LUNCBattle.quality.tick(dt, renderer);
      }
      renderer.render(scene,camera);
    }

    addEventListener('resize',()=>{
      camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
      renderer.setSize(innerWidth,innerHeight);
      if (window.LUNCBattle && LUNCBattle.quality && LUNCBattle.quality.apply) {
        LUNCBattle.quality.apply(renderer, scene, sun, { fillLight: fill, hemiLight: hemi, rimLight: rim, accentLights: [bullLight, bearLight], immediate: false });
      } else {
        renderer.setPixelRatio(Math.min(devicePixelRatio||1,innerWidth<760?1.35:1.8));
      }
    });

    updateStatusUI();
    pushFeed('Battlefield ' + ((window.LUNCBattle && LUNCBattle.config && LUNCBattle.config.BUILD) || 'v8') + ' · LOD + asset pipeline','win');
    pushFeed('Market pressure moves formations and the contested front','info');
    pushFeed('Public build uses HTTPS-safe data feeds','info');
    animate();
    // Feeds after first frame so a price-helper fault cannot blank the RTS scene
    try { startPriceFeeds(); } catch (e) { console.warn('[startPriceFeeds]', e); }
    try { startContextFeeds(); } catch (e) { console.warn('[startContextFeeds]', e); }
    try { startApiPoll(); } catch (e) { console.warn('[startApiPoll]', e); }

    setInterval(function(){ if(window.LUNCBattle&&LUNCBattle.ui){ LUNCBattle.ui.lastMomentum=Math.max(-1,Math.min(1,momentum)); LUNCBattle.ui.lastMomentumTruth=(priceSource!==SRC.SIM)?LUNCBattle.DataTruth.LIVE:LUNCBattle.DataTruth.SIMULATED; if(depthSource!==SRC.BINANCE && depthSource!==SRC.API){ LUNCBattle.ui.lastBookTruth=LUNCBattle.DataTruth.ESTIMATED; LUNCBattle.ui.lastBookImbalance=(buyWall+sellWall)>0?(buyWall-sellWall)/(buyWall+sellWall):0; } if(typeof LUNCBattle.ui.tickStrength==='function') LUNCBattle.ui.tickStrength(); } }, 2000);
  })();
