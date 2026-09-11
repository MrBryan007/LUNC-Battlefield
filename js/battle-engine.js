(() => {
    'use strict';

    // =====================================================
    // LUNC ECOSYSTEM BATTLEFIELD v8 — RTS GRAPHICS OVERHAUL
    // v8.1 terrain + environment · v8.2 articulated units + anim
    // Original procedural art only. No third-party game assets.
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

    function pushFeed(text, type = '') {
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

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth < 760 ? 1.35 : 1.8));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
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
    addEventListener('keydown', e => keys[e.code] = true);
    addEventListener('keyup', e => keys[e.code] = false);
    function updateWASD(dt) {
      const speed = (keys.ShiftLeft || keys.ShiftRight ? 24 : 12) * dt;
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();
      if (keys.KeyW) { camera.position.addScaledVector(forward, speed); controls.target.addScaledVector(forward, speed); }
      if (keys.KeyS) { camera.position.addScaledVector(forward,-speed); controls.target.addScaledVector(forward,-speed); }
      if (keys.KeyA) { camera.position.addScaledVector(right,-speed); controls.target.addScaledVector(right,-speed); }
      if (keys.KeyD) { camera.position.addScaledVector(right, speed); controls.target.addScaledVector(right, speed); }
    }

    scene.add(new THREE.HemisphereLight(0xd2dcc8, 0x1a1e14, .68));
    const sun = new THREE.DirectionalLight(0xffe6c4, 1.28);
    sun.position.set(-26, 50, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.set(innerWidth < 760 ? 1024 : 2048, innerWidth < 760 ? 1024 : 2048);
    sun.shadow.camera.left = -62; sun.shadow.camera.right = 62; sun.shadow.camera.top = 44; sun.shadow.camera.bottom = -44;
    sun.shadow.camera.near = 8; sun.shadow.camera.far = 120; sun.shadow.bias = -.0003;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x7aa5b0,.22); fill.position.set(35,18,-28); scene.add(fill);

    const bullLight = new THREE.PointLight(tokens[current].color, 1.3, 45); bullLight.position.set(-34, 7, 0); scene.add(bullLight);
    const bearLight = new THREE.PointLight(0xe4675f, 1.15, 45); bearLight.position.set(34, 7, 0); scene.add(bearLight);

    function mat(color, rough=.72, metal=.08, emissive=0x000000, intensity=0) {
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
      ? LUNCBattle.environment.createEnvironment({ THREE, scene, terrainHeight, mobile: mobileGfx, mat })
      : null;
    if (!envApi) console.error('[LUNCBattle] environment.js failed to load');
    if (envApi && envApi.fog) {
      scene.background = new THREE.Color(envApi.fog.background != null ? envApi.fog.background : 0x0c140e);
      scene.fog = new THREE.Fog(envApi.fog.fogColor, envApi.fog.fogNear, envApi.fog.fogFar);
    }
    const stoneMat=mat(0x4e5446,.92,.02), darkMat=mat(0x18211a,.72,.18), woodMat=mat(0x493625,.9,.01), goldMat=mat(0xc8a85f,.5,.24);

    function addWall(group,x,z,w,d,sideMat) {
      const wall=new THREE.Mesh(new THREE.BoxGeometry(w,1.05,d),sideMat); wall.position.set(x,.56,z); wall.castShadow=wall.receiveShadow=true; group.add(wall);
      for (let i=-1;i<=1;i+=2) { const cap=new THREE.Mesh(new THREE.CylinderGeometry(.32,.38,1.4,8),stoneMat); cap.position.set(x+i*w*.47,.7,z); cap.castShadow=true; group.add(cap); }
    }

    function createBase(side,color) {
      const g=new THREE.Group();
      const accent=mat(color,.48,.22,color,.12);
      const x=side*48;
      const keep=new THREE.Mesh(new THREE.CylinderGeometry(3.1,3.75,3.8,8),stoneMat); keep.position.set(x,1.9,0); keep.castShadow=keep.receiveShadow=true; g.add(keep);
      const roof=new THREE.Mesh(new THREE.ConeGeometry(3.45,2.1,8),darkMat); roof.position.set(x,4.75,0); roof.castShadow=true; g.add(roof);
      const core=new THREE.Mesh(new THREE.CylinderGeometry(.72,.95,2.1,10),accent); core.position.set(x,4.0,0); core.castShadow=true; g.add(core);
      const banner=new THREE.Mesh(new THREE.PlaneGeometry(1.6,2.2),new THREE.MeshStandardMaterial({color,roughness:.8,side:THREE.DoubleSide})); banner.position.set(x-side*3.82,3.15,0); banner.rotation.y=side<0?Math.PI/2:-Math.PI/2; g.add(banner);
      addWall(g,x-side*1.4,-7,8,.65,stoneMat); addWall(g,x-side*1.4,7,8,.65,stoneMat);
      const towerZ=[-11,11];
      towerZ.forEach(z=>{
        const t=new THREE.Mesh(new THREE.CylinderGeometry(1.0,1.25,3.5,8),stoneMat); t.position.set(x-side*1.2,1.75,z); t.castShadow=t.receiveShadow=true; g.add(t);
        const top=new THREE.Mesh(new THREE.ConeGeometry(1.35,1.25,8),darkMat); top.position.set(x-side*1.2,4.1,z); top.castShadow=true; g.add(top);
        const lamp=new THREE.PointLight(color,.65,12); lamp.position.set(x-side*1.2,4.7,z); g.add(lamp);
      });
      g.userData={side,color};
      // Settle keep onto terrain height at gate x
      g.position.y = terrainHeight(x, 0);
      scene.add(g); return g;
    }
    const bullBase=createBase(-1,tokens[current].color), bearBase=createBase(1,0xe4675f);

    // Soft frontier markers instead of a solid glowing wall.
    const frontGroup=new THREE.Group(); scene.add(frontGroup);
    const frontPosts=[];
    const ropeMat=new THREE.LineBasicMaterial({color:0xc6a75f,transparent:true,opacity:.34});
    for (let z=-28;z<=28;z+=7) {
      const ty = terrainHeight(0, z);
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.07,.1,1.6,7),woodMat); pole.position.set(0,ty+.8,z); pole.castShadow=true; frontGroup.add(pole); frontPosts.push(pole);
      const flag=new THREE.Mesh(new THREE.PlaneGeometry(.8,.46),new THREE.MeshBasicMaterial({color:0xd4b46d,side:THREE.DoubleSide,transparent:true,opacity:.68})); flag.position.set(.38,ty+1.35,z); flag.rotation.y=Math.PI/2; frontGroup.add(flag);
    }
    const ropePts=[]; for(let z=-28;z<=28;z+=1) ropePts.push(new THREE.Vector3(0,terrainHeight(0,z)+.26,z));
    const rope=new THREE.Line(new THREE.BufferGeometry().setFromPoints(ropePts),ropeMat); frontGroup.add(rope);

    // -------------------- Units / effects (extracted modules) --------------------
    const bulls=[], bears=[];
    const projectilePool=[], particlePool=[];

    const unitsApi = (window.LUNCBattle && LUNCBattle.units)
      ? LUNCBattle.units.createApi({ THREE, scene, terrainHeight, mat })
      : null;
    const effectsApi = (window.LUNCBattle && LUNCBattle.effects)
      ? LUNCBattle.effects.createApi({
          THREE, scene, terrainHeight, projectilePool, particlePool,
          onShake: (amp, power) => { cameraShake = Math.min(1.1, cameraShake + amp * power); }
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

    function rebuildUnits() {
      disposeArmy(bulls); disposeArmy(bears);
      const mobile=innerWidth<760;
      const maxInf=mobile?22:30, maxArmor=mobile?7:10, maxArt=mobile?4:6;
      const counts = wall => ({
        inf: Math.min(maxInf, Math.max(10,Math.round(10+wall*4.4))),
        armor: Math.min(maxArmor,Math.max(3,Math.round(2+wall*1.45))),
        art: Math.min(maxArt,Math.max(2,Math.round(1+wall*.72)))
      });
      const bc=counts(buyWall), rc=counts(sellWall);
      unitsApi.spawnFormation(-1, tokens[current].color, bc, bulls);
      unitsApi.spawnFormation(1, 0xe4675f, rc, bears);
      lastRebuild=Date.now();
    }
    rebuildUnits();

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
      $('dataMode').textContent=live?('LIVE · '+priceLabel.toUpperCase()):'SIMULATION — price not live';
      $('dataMode').className=live?'live':'error';
      $('agentStatus').textContent='Depth: '+depthLabel+' · build v7';
      $('pair').textContent=tokens[current].name+' · '+priceLabel;
      if (window.LUNCBattle && LUNCBattle.ui) LUNCBattle.ui.lastDepthSourceLabel = depthLabel;
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
    }


    async function fetchBinanceRestPrice(symbol) {
      if (!symbol || !window.LUNCBattle || !LUNCBattle.market || !LUNCBattle.market.fetchBinanceSpotPrice) {
        return false;
      }
      try {
        const spot = await LUNCBattle.market.fetchBinanceSpotPrice(symbol);
        if (!spot || spot.truth !== LUNCBattle.DataTruth.LIVE || !(spot.mid > 0)) {
          if (spot && spot.reason) console.warn('[Binance REST price]', spot.reason);
          return false;
        }
        applySpot(spot.mid, SRC.BINANCE);
        updateStatusUI();
        return true;
      } catch (e) {
        console.warn('[Binance REST price]', e.message || e);
        return false;
      }
    }

    function setToken(sym) {
      current=sym; const t=tokens[sym];
      price=t.base; lastPrice=price; rangeLow=price*.92; rangeHigh=price*1.08; priceHistory=[]; momentum=0;
      priceSource=SRC.SIM; isLive=false; lastPriceTs=Date.now();
      depthSource=SRC.SIM; depthVendorLabel='Unavailable';
      bullLight.color.setHex(t.color);
      document.querySelectorAll('.token-btn').forEach(b=>b.classList.toggle('active',b.dataset.token===sym));
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
        applySpot(coin.price,SRC.LLAMA); updateStatusUI(); return true;
      } catch(e){ console.warn('[DefiLlama price]',e.message||e); return false; }
    }

    async function fetchGecko() {
      const t=tokens[current]; if(!t.gecko) return false;
      try {
        const u='https://api.coingecko.com/api/v3/simple/price?ids='+encodeURIComponent(t.gecko)+'&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true&include_market_cap=true';
        const r=await fetch(u,{cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status);
        const d=await r.json(), coin=d[t.gecko]; if(!coin||!(coin.usd>0)) throw new Error('No price');
        applySpot(coin.usd,SRC.GECKO);
        if(coin.usd_market_cap>0) $('marketCap').textContent=fmtUsd(coin.usd_market_cap);
        if (coin.usd_24h_vol > 0 && window.LUNCBattle && LUNCBattle.market) {
          LUNCBattle.market.setVolume24h(coin.usd_24h_vol, LUNCBattle.DataTruth.LIVE);
          if (LUNCBattle.ui) {
            LUNCBattle.ui.lastVolumeUsd = coin.usd_24h_vol;
            LUNCBattle.ui.lastVolumeTruth = LUNCBattle.DataTruth.LIVE;
          }
        }
        // Estimated walls only when no live book — clearly ESTIMATED, never labeled Binance
        if(depthSource!==SRC.BINANCE && depthSource!==SRC.API) {
          const vol=coin.usd_24h_vol||5e6, base=Math.max(.7,Math.min(5,vol/3.5e6));
          buyWall=base*(.92+Math.random()*.18); sellWall=base*(.90+Math.random()*.2);
          depthVendorLabel = 'Estimated (CoinGecko vol proxy)';
        }
        updateStatusUI(); return true;
      } catch(e){ console.warn('[CoinGecko]',e.message||e); return false; }
    }

    async function fetchMarketContext() {
      const t=tokens[current]; if(!t.gecko) return;
      try {
        const r=await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids='+encodeURIComponent(t.gecko),{cache:'no-store'});
        if(!r.ok) throw new Error('HTTP '+r.status);
        const rows=await r.json(), coin=Array.isArray(rows)?rows[0]:null; if(!coin) return;
        if(coin.market_cap>0) $('marketCap').textContent=fmtUsd(coin.market_cap);
        $('marketRank').textContent=coin.market_cap_rank?('#'+coin.market_cap_rank):'—';
      } catch(e){ console.warn('[Market context]',e.message||e); }
    }

    async function fetchChainTvl() {
      try {
        const r=await fetch('https://api.llama.fi/v2/chains',{cache:'no-store'}), rows=await r.json();
        const terra=rows.find(c=>c.name==='Terra Classic'); if(terra) $('tvlValue').textContent=fmtUsd(terra.tvl);
      } catch(e){ console.warn('[DefiLlama chain]',e.message||e); }
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
      renderLiquidityHud(st.zones, sourceLabel);
    }

    function renderLiquidityHud(zones, sourceLabel) {
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
        spotWs.onopen=()=>{ reconnectAttempts=0; depthSource=SRC.BINANCE; depthVendorLabel='Binance'; updateStatusUI(); pushFeed('Binance order book connected','win'); };
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
          updateStatusUI(); scheduleReconnect(symbol,futuresSymbol);
        };
        spotWs.onerror=()=>{};
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
            const power=Math.min(2.5,.7+usd/500000), zz=(Math.random()-.5)*14;
            const entry = (window.LUNCBattle && LUNCBattle.ui && LUNCBattle.ui.recordLiquidation)
              ? LUNCBattle.ui.recordLiquidation({
                  symbol: sym, side, amount, usd, timestamp: ts,
                  source: 'Binance Futures'
                })
              : { classification: side==='SELL'?'LONG_LIQ':'SHORT_LIQ' };
            const when = new Date(ts).toISOString().slice(11,19) + 'Z';
            if(side==='SELL') {
              // Longs liquidated → forced sells → bearish pressure on bulls
              pushFeed('LIVE LIQ · '+sym+' · LONG · qty '+amount+' · ~'+fmtUsd(usd)+' · '+when+' · Binance Futures','loss');
              launchStrike(targetX+12,targetX-6,zz,0xe4675f,power);
              createExplosion(targetX-6.5,zz,0xe4675f,power);
              buyWall=Math.max(.25,buyWall*.93);
            } else {
              // Shorts liquidated → forced buys → bullish pressure on bears
              pushFeed('LIVE LIQ · '+sym+' · SHORT · qty '+amount+' · ~'+fmtUsd(usd)+' · '+when+' · Binance Futures','liq');
              launchStrike(targetX-12,targetX+6,zz,tokens[current].color,power);
              createExplosion(targetX+6.5,zz,tokens[current].color,power);
              sellWall=Math.max(.25,sellWall*.93);
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
      if (snap.truth !== LUNCBattle.DataTruth.LIVE || !snap.data) return;
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

      if(price>rangeHigh) {
        pushFeed('BULLS CAPTURE THE RANGE','win'); showVictory(true); const span=(rangeHigh-rangeLow)*.5; rangeLow=price-span; rangeHigh=price+span; createExplosion(targetX,0,tokens[current].color,1.7); buyWall=Math.min(6,buyWall+.28);
      } else if(price<rangeLow) {
        pushFeed('BEARS CAPTURE THE RANGE','loss'); showVictory(false); const span=(rangeHigh-rangeLow)*.5; rangeLow=price-span; rangeHigh=price+span; createExplosion(targetX,0,0xe4675f,1.7); sellWall=Math.min(6,sellWall+.28);
      }

      const t=tokens[current];
      $('battleRange').textContent='BATTLE '+rangeLow.toFixed(t.decimals)+' – '+rangeHigh.toFixed(t.decimals)+' · BEARS '+rangeLow.toFixed(t.decimals)+' · BULLS '+rangeHigh.toFixed(t.decimals);
      $('price').textContent='$'+price.toFixed(t.decimals);
      const tickVal=(momentum*55).toFixed(2), tick=$('tick'); tick.textContent=(momentum>=0?'+':'')+tickVal+'%'; tick.style.color=momentum>=0?'var(--bull)':'var(--bear)';
      const press=$('pressure'); if(momentum>.07){press.textContent='Buyers advancing';press.className='pressure buyers';}else if(momentum<-.07){press.textContent='Sellers advancing';press.className='pressure sellers';}else{press.textContent='Contested';press.className='pressure contested';}
      $('buyWall').textContent='$'+buyWall.toFixed(2)+'M'; $('sellWall').textContent='$'+sellWall.toFixed(2)+'M';

      if(Date.now()-lastRebuild>7000 && Math.random()<.17) rebuildUnits();
      if(!isLive&&t.hasBurns&&Math.random()<.055){pushFeed('Simulated burn flare · not a chain event','burn');createExplosion(targetX+(Math.random()-.5)*8,(Math.random()-.5)*14,0xffbf47,1.2,true);playBurn();}
    }
    setInterval(updateBattleLogic,760);

    function maybeFire(u,enemyColor,dt) {
      u.userData.shot-=dt;
      if(u.userData.shot>0) return false;
      const front=Math.abs(u.position.x-targetX);
      const base=u.userData.type===2?3.7:u.userData.type===1?2.5:1.7;
      u.userData.shot=base+Math.random()*base*1.8;
      if(front<24 && Math.random()<.42) {
        const side=u.userData.side, to=targetX+side*(Math.random()*5-2.5), z=u.position.z+(Math.random()-.5)*4;
        launchStrike(u.position.x+side*-1.0,to,z,side<0?tokens[current].color:0xe4675f,u.userData.type===2?1.1:.55);
        if (unitsApi && unitsApi.setAnimState) {
          unitsApi.setAnimState(u, (window.LUNCBattle && LUNCBattle.animations && LUNCBattle.animations.STATES.FIRE) || 'FIRE', performance.now()*.001);
        } else {
          u.userData.animState = 'FIRE';
          u.userData.fireUntil = performance.now()*.001 + (u.userData.type===2?0.28:0.18);
          u.userData.reloadUntil = u.userData.fireUntil + (u.userData.type===2?1.6:0.7);
          u.userData.recoil = 1;
        }
        return true;
      }
      return false;
    }

    // -------------------- Animation --------------------
    const clock=new THREE.Clock();
    function animate() {
      requestAnimationFrame(animate);
      const dt=Math.min(.04,clock.getDelta()); updateWASD(dt); controls.update();
      const mid=(rangeLow+rangeHigh)/2, span=Math.max(rangeHigh-rangeLow,1e-12); targetX=THREE.MathUtils.clamp(((price-mid)/span)*28,-25,25);
      frontGroup.position.x+=(targetX-frontGroup.position.x)*.07;

      const now=performance.now()*.001;
      function moveArmy(arr,side) {
        const momAbs = Math.abs(momentum);
        const contested = momAbs < 0.055;
        const urgent = momAbs > 0.12;
        arr.forEach(u=>{
          const type=u.userData.type, rank=type===0?0:type===1?1:2;
          const desired=targetX+side*(7.8+rank*6.2+Math.floor((u.userData.index||0)/(type===0?8:5))*1.6);
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
          // Feet on ground; infantry may add tiny root bob from limb anim
          const baseY = terrainHeight(u.position.x, u.position.z);
          u.position.y = baseY + (u.userData.rootBob || 0);
          // Orient toward enemy frontline (±x)
          u.userData.facing = side < 0 ? Math.PI / 2 : -Math.PI / 2;
          maybeFire(u, side<0?0xe4675f:tokens[current].color, dt);
          if (unitsApi && unitsApi.tickUnit) {
            unitsApi.tickUnit(u, dt, now, { momentum: momentum, targetX: targetX, mobile: mobileGfx });
          }
        });
      }
      moveArmy(bulls,-1); moveArmy(bears,1);

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
      if(cameraShake>.01){camera.position.x+=(Math.random()-.5)*cameraShake*.14;camera.position.y+=(Math.random()-.5)*cameraShake*.08;cameraShake*=.9;}
      bullLight.intensity=1.1+Math.sin(now*1.3)*.16; bearLight.intensity=1.05+Math.cos(now*1.25)*.14;
      if (envApi && typeof envApi.update === 'function') envApi.update(dt, now);
      renderer.render(scene,camera);
    }

    addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio||1,innerWidth<760?1.35:1.8));});

    updateStatusUI();
    pushFeed('Battlefield v8.2 · articulated units','win');
    pushFeed('Market pressure moves formations and the contested front','info');
    pushFeed('Public build uses HTTPS-safe data feeds','info');
    animate();
    // Feeds after first frame so a price-helper fault cannot blank the RTS scene
    try { startPriceFeeds(); } catch (e) { console.warn('[startPriceFeeds]', e); }
    try { startContextFeeds(); } catch (e) { console.warn('[startContextFeeds]', e); }
    try { startApiPoll(); } catch (e) { console.warn('[startApiPoll]', e); }

    setInterval(function(){ if(window.LUNCBattle&&LUNCBattle.ui){ LUNCBattle.ui.lastMomentum=Math.max(-1,Math.min(1,momentum)); LUNCBattle.ui.lastMomentumTruth=(priceSource!==SRC.SIM)?LUNCBattle.DataTruth.LIVE:LUNCBattle.DataTruth.SIMULATED; if(depthSource!==SRC.BINANCE && depthSource!==SRC.API){ LUNCBattle.ui.lastBookTruth=LUNCBattle.DataTruth.ESTIMATED; LUNCBattle.ui.lastBookImbalance=(buyWall+sellWall)>0?(buyWall-sellWall)/(buyWall+sellWall):0; } if(typeof LUNCBattle.ui.tickStrength==='function') LUNCBattle.ui.tickStrength(); } }, 2000);
  })();
