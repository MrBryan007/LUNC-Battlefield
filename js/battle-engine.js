(() => {
    'use strict';

    // =====================================================
    // LUNC ECOSYSTEM BATTLEFIELD v7 — CLASSIC RTS REBUILD
    // Original procedural art only. No third-party game assets.
    // =====================================================

    const tokens = {
      LUNC:  { name: 'LUNC/USDT', base: 0.00005346, color: 0x49d39a, hasBurns: true,  decimals: 8, symbol: 'luncusdt', futures: '1000luncusdt', gecko: 'terra-luna' },
      USTC:  { name: 'USTC/USDT', base: 0.005579,   color: 0x56b9d1, hasBurns: false, decimals: 5, symbol: 'ustcusdt', futures: 'ustcusdt', gecko: 'terrausd' },
      JURIS: { name: 'JURIS',     base: 0.00000245, color: 0xa791dc, hasBurns: false, decimals: 8, symbol: null, futures: null, gecko: 'juris-protocol' }
    };

    const SRC = { GECKO: 'coingecko', BINANCE: 'binance', LLAMA: 'llama', SIM: 'sim', BRIDGE: 'bridge' };
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
    let depthSource = SRC.SIM;
    let lastPriceTs = Date.now();
    let lastDepthTs = 0;
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
    scene.background = new THREE.Color(0x07100b);
    scene.fog = new THREE.Fog(0x0a130d, 52, 125);

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

    scene.add(new THREE.HemisphereLight(0xcbd7bf, 0x10150f, .62));
    const sun = new THREE.DirectionalLight(0xffe8bd, 1.35);
    sun.position.set(-28, 48, 24);
    sun.castShadow = true;
    sun.shadow.mapSize.set(innerWidth < 760 ? 1024 : 2048, innerWidth < 760 ? 1024 : 2048);
    sun.shadow.camera.left = -62; sun.shadow.camera.right = 62; sun.shadow.camera.top = 44; sun.shadow.camera.bottom = -44;
    sun.shadow.camera.near = 8; sun.shadow.camera.far = 120; sun.shadow.bias = -.0003;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x7aa5b0,.22); fill.position.set(35,18,-28); scene.add(fill);

    const bullLight = new THREE.PointLight(tokens[current].color, 1.3, 45); bullLight.position.set(-34, 7, 0); scene.add(bullLight);
    const bearLight = new THREE.PointLight(0xe4675f, 1.15, 45); bearLight.position.set(34, 7, 0); scene.add(bearLight);

    function terrainHeight(x,z) {
      const rolling = Math.sin(x*.075)*.55 + Math.cos(z*.105)*.42 + Math.sin((x+z)*.052)*.34;
      const edge = Math.max(0, (Math.abs(z)-24)/14) * .8;
      const centerFlatten = 1 - Math.exp(-(x*x)/(2*14*14));
      return rolling * (.35 + .65*centerFlatten) + edge;
    }

    const terrainGeo = new THREE.PlaneGeometry(138, 82, 92, 58);
    terrainGeo.rotateX(-Math.PI/2);
    const p = terrainGeo.attributes.position;
    const colors = [];
    const cLow = new THREE.Color(0x263526), cMid = new THREE.Color(0x354632), cHi = new THREE.Color(0x4a5436);
    for (let i=0;i<p.count;i++) {
      const x=p.getX(i), z=p.getZ(i), h=terrainHeight(x,z);
      p.setY(i,h);
      const t = THREE.MathUtils.clamp((h+1)/3,0,1);
      const c = (t<.55 ? cLow.clone().lerp(cMid,t/.55) : cMid.clone().lerp(cHi,(t-.55)/.45));
      const sideTint = x < 0 ? new THREE.Color(0x0b2a1e) : new THREE.Color(0x2b1614);
      c.lerp(sideTint, .045 + Math.min(.05,Math.abs(x)/1000));
      colors.push(c.r,c.g,c.b);
    }
    terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
    terrainGeo.computeVertexNormals();
    const ground = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({ vertexColors:true, roughness:.98, metalness:0 }));
    ground.receiveShadow = true; scene.add(ground);

    // Worn central road / no-man's-land. No visible grid.
    const road = new THREE.Mesh(new THREE.PlaneGeometry(14,72), new THREE.MeshStandardMaterial({ color:0x3c3529, roughness:1, transparent:true, opacity:.72 }));
    road.rotation.x = -Math.PI/2; road.position.set(0,.035,0); road.receiveShadow=true; scene.add(road);
    const roadEdgeMat = new THREE.MeshBasicMaterial({ color:0x7e6a43, transparent:true, opacity:.16 });
    [-7,7].forEach(x=>{ const e=new THREE.Mesh(new THREE.PlaneGeometry(.16,70),roadEdgeMat); e.rotation.x=-Math.PI/2; e.position.set(x,.045,0); scene.add(e); });

    const rockMat = new THREE.MeshStandardMaterial({ color:0x4a4b3d, roughness:.95 });
    const shrubMat = new THREE.MeshStandardMaterial({ color:0x243b24, roughness:1 });
    const trunkMat = new THREE.MeshStandardMaterial({ color:0x4b3827, roughness:1 });
    function rand(seed) { const x=Math.sin(seed*999.1)*43758.5453; return x-Math.floor(x); }
    for (let i=0;i<52;i++) {
      const x=(rand(i+4)-.5)*124, z=(rand(i+80)-.5)*72;
      if (Math.abs(x)<11 || (Math.abs(x)>44 && Math.abs(z)<19)) continue;
      if (rand(i+160)>.47) {
        const s=.28+rand(i+250)*.7;
        const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(s,0),rockMat);
        rock.scale.set(1.35,.7+rand(i+340)*.45,1); rock.rotation.y=rand(i+400)*Math.PI;
        rock.position.set(x,terrainHeight(x,z)+s*.38,z); rock.castShadow=true; rock.receiveShadow=true; scene.add(rock);
      } else {
        const tree=new THREE.Group();
        const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.09,.13,.7,6),trunkMat); trunk.position.y=.35;
        const crown=new THREE.Mesh(new THREE.ConeGeometry(.42,.95,7),shrubMat); crown.position.y=.95;
        tree.add(trunk,crown); tree.position.set(x,terrainHeight(x,z),z); tree.scale.setScalar(.72+rand(i+510)*.65); tree.rotation.y=rand(i+610)*Math.PI;
        trunk.castShadow=crown.castShadow=true; scene.add(tree);
      }
    }

    function mat(color, rough=.72, metal=.08, emissive=0x000000, intensity=0) {
      return new THREE.MeshStandardMaterial({ color, roughness:rough, metalness:metal, emissive, emissiveIntensity:intensity });
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
      g.userData={side,color}; scene.add(g); return g;
    }
    const bullBase=createBase(-1,tokens[current].color), bearBase=createBase(1,0xe4675f);

    // Soft frontier markers instead of a solid glowing wall.
    const frontGroup=new THREE.Group(); scene.add(frontGroup);
    const frontPosts=[];
    const ropeMat=new THREE.LineBasicMaterial({color:0xc6a75f,transparent:true,opacity:.34});
    for (let z=-28;z<=28;z+=7) {
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.07,.1,1.6,7),woodMat); pole.position.set(0,.8,z); pole.castShadow=true; frontGroup.add(pole); frontPosts.push(pole);
      const flag=new THREE.Mesh(new THREE.PlaneGeometry(.8,.46),new THREE.MeshBasicMaterial({color:0xd4b46d,side:THREE.DoubleSide,transparent:true,opacity:.68})); flag.position.set(.38,1.35,z); flag.rotation.y=Math.PI/2; frontGroup.add(flag);
    }
    const ropePts=[]; for(let z=-28;z<=28;z+=1) ropePts.push(new THREE.Vector3(0,.26,z));
    const rope=new THREE.Line(new THREE.BufferGeometry().setFromPoints(ropePts),ropeMat); frontGroup.add(rope);

    // -------------------- Units --------------------
    const bulls=[], bears=[];
    const projectilePool=[], particlePool=[];

    function setShadow(mesh, cast=true) { mesh.castShadow=cast; mesh.receiveShadow=true; return mesh; }
    function cylinderBetween(radius,length,colorMat,axis='z') {
      const m=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,7),colorMat);
      if(axis==='z') m.rotation.x=Math.PI/2; else if(axis==='x') m.rotation.z=Math.PI/2;
      return m;
    }

    function createInfantry(color, side) {
      const g=new THREE.Group();
      const armor=mat(color,.58,.16,color,.08), cloth=mat(0x202922,.9,.02), skin=mat(0xcda77e,.9,0), steel=mat(0x343e38,.42,.38);
      const torso=setShadow(new THREE.Mesh(new THREE.CylinderGeometry(.22,.31,.65,7),armor)); torso.position.y=.78;
      const head=setShadow(new THREE.Mesh(new THREE.SphereGeometry(.17,8,6),skin)); head.position.y=1.23;
      const helm=setShadow(new THREE.Mesh(new THREE.SphereGeometry(.19,8,5,0,Math.PI*2,0,Math.PI/2),steel)); helm.position.y=1.27;
      const leg1=setShadow(cylinderBetween(.075,.52,cloth,'y')); leg1.position.set(-.12,.32,0);
      const leg2=leg1.clone(); leg2.position.x=.12;
      const arm1=setShadow(cylinderBetween(.065,.48,armor,'y')); arm1.position.set(-.30,.76,0); arm1.rotation.z=-.26;
      const arm2=arm1.clone(); arm2.position.x=.30; arm2.rotation.z=.26;
      const rifle=setShadow(cylinderBetween(.045,.72,steel,'z')); rifle.position.set(side*.34,.76,side*.16); rifle.rotation.y=Math.PI/2;
      g.add(torso,head,helm,leg1,leg2,arm1,arm2,rifle);
      g.scale.setScalar(.92); g.userData={type:0,side,phase:Math.random()*Math.PI*2,weapon:rifle,shot:Math.random()*3}; return g;
    }

    function createArmor(color,side) {
      const g=new THREE.Group();
      const armor=mat(color,.52,.26,color,.08), steel=mat(0x222b27,.5,.42), track=mat(0x111713,.78,.16);
      const hull=setShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(.7,0),armor)); hull.scale.set(1.35,.48,.9); hull.position.y=.58;
      const turret=setShadow(new THREE.Mesh(new THREE.CylinderGeometry(.34,.46,.38,8),armor)); turret.position.y=.94;
      const barrel=setShadow(cylinderBetween(.065,1.2,steel,'x')); barrel.position.set(side*.68,1.02,0);
      const wheelMat=track;
      [-.45,0,.45].forEach(dx=>[-.45,.45].forEach(z=>{ const w=setShadow(new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,.12,8),wheelMat)); w.rotation.x=Math.PI/2; w.position.set(dx,.28,z); g.add(w); }));
      g.add(hull,turret,barrel); g.userData={type:1,side,phase:Math.random()*Math.PI*2,weapon:barrel,shot:Math.random()*4}; return g;
    }

    function createArtillery(color,side) {
      const g=new THREE.Group();
      const armor=mat(color,.6,.19,color,.06), steel=mat(0x2d3731,.46,.38), base=mat(0x171e19,.8,.12);
      const platform=setShadow(new THREE.Mesh(new THREE.CylinderGeometry(.55,.7,.28,8),base)); platform.position.y=.28;
      const housing=setShadow(new THREE.Mesh(new THREE.CylinderGeometry(.32,.43,.64,7),armor)); housing.position.y=.67;
      const barrel=setShadow(cylinderBetween(.095,1.55,steel,'x')); barrel.position.set(side*.78,1.0,0); barrel.rotation.z=-side*.16;
      const stabilizer1=setShadow(cylinderBetween(.07,.9,base,'z')); stabilizer1.position.set(-.28,.16,.35);
      const stabilizer2=stabilizer1.clone(); stabilizer2.position.z=-.35;
      g.add(platform,housing,barrel,stabilizer1,stabilizer2); g.userData={type:2,side,phase:Math.random()*Math.PI*2,weapon:barrel,shot:Math.random()*5}; return g;
    }

    function createUnit(color, side, type) {
      const g=type===0?createInfantry(color,side):type===1?createArmor(color,side):createArtillery(color,side);
      const shadow=new THREE.Mesh(new THREE.CircleGeometry(type===1?.62:.38,14),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.18,depthWrite:false}));
      shadow.rotation.x=-Math.PI/2; shadow.position.y=.025; g.add(shadow);
      g.rotation.y = side<0 ? Math.PI/2 : -Math.PI/2;
      scene.add(g); return g;
    }

    function formationSlots(count,side,type) {
      const slots=[];
      const cols=type===0?8:5;
      const spacingZ=type===0?2.1:3.35;
      const spacingX=type===0?1.8:3.2;
      const back=type===0?8.6:type===1?15:21;
      for(let i=0;i<count;i++) {
        const row=Math.floor(i/cols), col=i%cols;
        const z=(col-(cols-1)/2)*spacingZ + (row%2?spacingZ*.5:0);
        const x=side*(back+row*spacingX);
        slots.push({x,z});
      }
      return slots;
    }

    function disposeArmy(arr) { arr.forEach(u=>scene.remove(u)); arr.length=0; }
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
      function spawn(side,color,c,list) {
        [[0,c.inf],[1,c.armor],[2,c.art]].forEach(([type,n])=>{
          const slots=formationSlots(n,side,type);
          slots.forEach((s,i)=>{ const u=createUnit(color,side,type); u.position.set(s.x,terrainHeight(s.x,s.z),s.z); u.userData.home=s; u.userData.index=i; list.push(u); });
        });
      }
      spawn(-1,tokens[current].color,bc,bulls); spawn(1,0xe4675f,rc,bears);
      lastRebuild=Date.now();
    }
    rebuildUnits();

    function launchStrike(fromX,toX,z,color,power=1) {
      const matGlow=new THREE.MeshBasicMaterial({color});
      const bolt=new THREE.Mesh(new THREE.SphereGeometry(.11+.04*Math.min(power,2),7,6),matGlow);
      bolt.position.set(fromX,1.1+Math.random()*1.2,z);
      bolt.userData={tx:toX,speed:13+power*5,life:2.2,color,power,prev:bolt.position.clone()};
      scene.add(bolt); projectilePool.push(bolt);
    }

    function createExplosion(x,z,color,power=1,isBurn=false) {
      const count=Math.floor((isBurn?24:14)*Math.min(2.2,power));
      const palette=isBurn?[0xffdc72,0xf59e0b,0xe66526]:[color,0xf2c66d,0xd96f42];
      for(let i=0;i<count;i++) {
        const sphere=new THREE.Mesh(new THREE.SphereGeometry(.12+Math.random()*.18*power,6,5),new THREE.MeshBasicMaterial({color:palette[i%palette.length],transparent:true,opacity:.9}));
        sphere.position.set(x+(Math.random()-.5)*1.2,terrainHeight(x,z)+.25+Math.random()*.55,z+(Math.random()-.5)*1.2);
        sphere.userData={vx:(Math.random()-.5)*3.2*power,vy:1.3+Math.random()*3.4*power,vz:(Math.random()-.5)*3.2*power,life:.45+Math.random()*.55,smoke:false};
        scene.add(sphere); particlePool.push(sphere);
      }
      for(let i=0;i<Math.max(2,Math.round(power*3));i++) {
        const smoke=new THREE.Mesh(new THREE.SphereGeometry(.26+Math.random()*.25,7,6),new THREE.MeshBasicMaterial({color:0x3b4039,transparent:true,opacity:.3,depthWrite:false}));
        smoke.position.set(x+(Math.random()-.5)*.7,terrainHeight(x,z)+.6,z+(Math.random()-.5)*.7);
        smoke.userData={vx:(Math.random()-.5)*.35,vy:.45+Math.random()*.55,vz:(Math.random()-.5)*.35,life:1.4+Math.random()*.7,smoke:true};
        scene.add(smoke); particlePool.push(smoke);
      }
      const light=new THREE.PointLight(isBurn?0xffc247:color,isBurn?4.8:3.2,18); light.position.set(x,3.2,z); scene.add(light); setTimeout(()=>scene.remove(light),180);
      cameraShake=Math.min(1.1,cameraShake+(isBurn?.35:.2)*power);
    }

    function showVictory(bull) {
      const el=$('victoryFlash'); el.className=bull?'show':'show bear'; setTimeout(()=>el.className='',430); playVictory(bull);
    }

    // -------------------- UI / token switching --------------------
    function updateWallLabels() {
      const liveDepth = depthSource===SRC.BINANCE;
      const mark = liveDepth
        ? '<span class="qual live">(live)</span>'
        : '<span class="qual est">(est.)</span>';
      const buyL = $('buyWallLabel');
      const sellL = $('sellWallLabel');
      if (buyL) buyL.innerHTML = 'Buy wall ' + mark;
      if (sellL) sellL.innerHTML = 'Sell wall ' + mark;
    }

    function updateStatusUI() {
      const priceLabel = priceSource===SRC.GECKO?'CoinGecko':priceSource===SRC.BINANCE?'Binance':priceSource===SRC.LLAMA?'DefiLlama':priceSource===SRC.BRIDGE?'Bridge':'Simulation';
      const depthLabel = depthSource===SRC.BINANCE?'Binance depth (LIVE)':'Estimated walls (NOT live order book)';
      const live = priceSource!==SRC.SIM;
      $('dataMode').textContent=live?('LIVE · '+priceLabel.toUpperCase()):'SIMULATION — price not live';
      $('dataMode').className=live?'live':'error';
      $('agentStatus').textContent='Depth: '+depthLabel+' · build v7';
      $('pair').textContent=tokens[current].name+' · '+priceLabel;
      updateWallLabels();
    }

    function applySpot(next,source) {
      if(!(next>0)) return;
      lastPrice=price; price=next; lastPriceTs=Date.now();
      priceHistory.push(price); if(priceHistory.length>48) priceHistory.shift();
      if(priceSource!==SRC.BINANCE || source===SRC.BINANCE) priceSource=source;
      isLive=true;
    }

    function setToken(sym) {
      current=sym; const t=tokens[sym];
      price=t.base; lastPrice=price; rangeLow=price*.92; rangeHigh=price*1.08; priceHistory=[]; momentum=0;
      bullLight.color.setHex(t.color);
      document.querySelectorAll('.token-btn').forEach(b=>b.classList.toggle('active',b.dataset.token===sym));
      rebuildUnits(); pushFeed('Command switched to '+sym,'win');
      if(t.symbol) connectBinance(t.symbol,t.futures); else closeExchangeSockets();
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
      depthSource=SRC.SIM;
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
        if(depthSource!==SRC.BINANCE) {
          const vol=coin.usd_24h_vol||5e6, base=Math.max(.7,Math.min(5,vol/3.5e6));
          buyWall=base*(.92+Math.random()*.18); sellWall=base*(.90+Math.random()*.2);
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

    function calcWalls() {
      let bid=0, ask=0;
      Object.keys(localBids).map(Number).sort((a,b)=>b-a).slice(0,12).forEach(p=>bid+=p*(localBids[p]||0));
      Object.keys(localAsks).map(Number).sort((a,b)=>a-b).slice(0,12).forEach(p=>ask+=p*(localAsks[p]||0));
      return {buy:bid/1e6,sell:ask/1e6};
    }

    function connectBinance(symbol,futuresSymbol=null) {
      if(!symbol) return; closeExchangeSockets(); localBids={}; localAsks={};
      const streams=symbol+'@bookTicker/'+symbol+'@depth20@100ms';
      try {
        spotWs=new WebSocket('wss://stream.binance.com:9443/stream?streams='+streams);
        spotWs.onopen=()=>{ reconnectAttempts=0; depthSource=SRC.BINANCE; updateStatusUI(); pushFeed('Binance order book connected','win'); };
        spotWs.onmessage=evt=>{
          try {
            const raw=JSON.parse(evt.data), msg=raw.data||raw;
            if(msg.b!=null&&msg.a!=null&&!Array.isArray(msg.b)) {
              const bid=+msg.b,ask=+msg.a; if(bid>0&&ask>0) applySpot((bid+ask)/2,SRC.BINANCE);
            }
            if(Array.isArray(msg.bids)&&Array.isArray(msg.asks)) {
              localBids={}; localAsks={};
              msg.bids.forEach(l=>{const p=+l[0],q=+l[1];if(q>0)localBids[p]=q;});
              msg.asks.forEach(l=>{const p=+l[0],q=+l[1];if(q>0)localAsks[p]=q;});
              const w=calcWalls(); if(w.buy>.01)buyWall=w.buy;if(w.sell>.01)sellWall=w.sell;
              lastDepthTs=Date.now(); depthSource=SRC.BINANCE;
            }
            updateStatusUI();
          } catch(_) {}
        };
        spotWs.onclose=()=>{ depthSource=SRC.SIM; if(priceSource===SRC.BINANCE)priceSource=SRC.GECKO; updateStatusUI(); scheduleReconnect(symbol,futuresSymbol); };
        spotWs.onerror=()=>{};
      } catch(_) { scheduleReconnect(symbol,futuresSymbol); }

      // USD-M public liquidation stream. Failure is non-fatal; the battlefield keeps running.
      try {
        if(!futuresSymbol) return;
        futWs=new WebSocket('wss://fstream.binance.com/ws/'+futuresSymbol+'@forceOrder');
        futWs.onmessage=evt=>{
          try {
            const raw=JSON.parse(evt.data),o=(raw.data||raw).o||raw; if(!o||o.q==null) return;
            const usd=parseFloat(o.q)*parseFloat(o.p||o.ap||0); if(!(usd>=800)) return;
            const side=(o.S||'').toUpperCase(), power=Math.min(2.5,.7+usd/500000), zz=(Math.random()-.5)*14;
            if(side==='SELL') {
              pushFeed('Long liquidation · '+fmtUsd(usd)+' · Bulls hit','loss'); launchStrike(targetX+12,targetX-6,zz,0xe4675f,power); createExplosion(targetX-6.5,zz,0xe4675f,power); buyWall=Math.max(.25,buyWall*.93);
            } else {
              pushFeed('Short liquidation · '+fmtUsd(usd)+' · Bears hit','liq'); launchStrike(targetX-12,targetX+6,zz,tokens[current].color,power); createExplosion(targetX+6.5,zz,tokens[current].color,power); sellWall=Math.max(.25,sellWall*.93);
            }
            playLiq();
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
      fetchLlama(); fetchGecko();
      geckoTimer=setInterval(()=>{fetchLlama();fetchGecko();},22000);
      if(tokens[current].symbol) connectBinance(tokens[current].symbol,tokens[current].futures);
    }

    // Local bridge is intentionally disabled on public GitHub Pages. Enable only on localhost,
    // or pass ?bridge=https://your-bridge.example/snapshot if a HTTPS bridge is deployed.
    let bridgeTimer=null;
    function bridgeUrl() {
      const q=new URLSearchParams(location.search).get('bridge');
      if(q && /^https:\/\//i.test(q)) return q;
      if(location.hostname==='localhost'||location.hostname==='127.0.0.1') return 'http://127.0.0.1:8787/snapshot';
      return null;
    }
    async function pollBridge(url) {
      try {
        const r=await fetch(url,{cache:'no-store'}); if(!r.ok)throw new Error('HTTP '+r.status);
        const s=await r.json(); if(!s||!s.market)throw new Error('Bad snapshot');
        if(s.market.price>0){applySpot(s.market.price,SRC.BRIDGE);priceSource=SRC.BRIDGE;}
        if(s.walls){if(s.walls.buyM>0)buyWall=s.walls.buyM;if(s.walls.sellM>0)sellWall=s.walls.sellM;if(s.walls.quality==='live')depthSource=SRC.BINANCE;}
        if(s.ecosystem){if(s.ecosystem.chainTvlUsd)$('tvlValue').textContent=fmtUsd(s.ecosystem.chainTvlUsd);const pr=s.ecosystem.protocols||{};if(pr.terraport)$('tvlTerraport').textContent=fmtUsd(pr.terraport.tvlUsd);if(pr.garuda)$('tvlGaruda').textContent=fmtUsd(pr.garuda.tvlUsd);if(pr.juris)$('tvlJuris').textContent=fmtUsd(pr.juris.tvlUsd);}
        updateStatusUI();
      } catch(_) {}
    }
    function startBridgePoll() { const u=bridgeUrl(); if(!u||bridgeTimer)return; pollBridge(u); bridgeTimer=setInterval(()=>pollBridge(u),3000); }

    setInterval(()=>{
      if(Date.now()-lastPriceTs>50000&&priceSource!==SRC.SIM){priceSource=SRC.SIM;isLive=false;updateStatusUI();}
      if(depthSource===SRC.BINANCE&&Date.now()-lastDepthTs>25000){depthSource=SRC.SIM;updateStatusUI();}
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
      if(u.userData.shot>0) return;
      const front=Math.abs(u.position.x-targetX);
      const base=u.userData.type===2?3.7:u.userData.type===1?2.5:1.7;
      u.userData.shot=base+Math.random()*base*1.8;
      if(front<24 && Math.random()<.42) {
        const side=u.userData.side, to=targetX+side*(Math.random()*5-2.5), z=u.position.z+(Math.random()-.5)*4;
        launchStrike(u.position.x+side*-1.0,to,z,side<0?tokens[current].color:0xe4675f,u.userData.type===2?1.1:.55);
      }
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
        arr.forEach(u=>{
          const type=u.userData.type, rank=type===0?0:type===1?1:2;
          const desired=targetX+side*(7.8+rank*6.2+Math.floor((u.userData.index||0)/(type===0?8:5))*1.6);
          const dx=desired-u.position.x; u.position.x+=dx*Math.min(1,dt*(type===0?1.45:.85));
          const baseY=terrainHeight(u.position.x,u.position.z);
          u.position.y=baseY+(type===0?Math.abs(Math.sin(now*3.1+u.userData.phase))*.035:0);
          if(type===0) u.rotation.z=Math.sin(now*3.3+u.userData.phase)*.025;
          maybeFire(u,side<0?0xe4675f:tokens[current].color,dt);
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
      renderer.render(scene,camera);
    }

    addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio||1,innerWidth<760?1.35:1.8));});

    startPriceFeeds(); startContextFeeds(); startBridgePoll(); updateStatusUI();
    pushFeed('LUNC Battlefield v7 · classic RTS rebuild','win');
    pushFeed('Market pressure moves formations and the contested front','info');
    pushFeed('Public build uses HTTPS-safe data feeds','info');

    setInterval(function(){ if(window.LUNCBattle&&LUNCBattle.ui){ LUNCBattle.ui.lastMomentum=Math.max(-1,Math.min(1,momentum)); LUNCBattle.ui.lastMomentumTruth=(priceSource!==SRC.SIM)?LUNCBattle.DataTruth.LIVE:LUNCBattle.DataTruth.SIMULATED; LUNCBattle.ui.lastBookTruth=(depthSource===SRC.BINANCE)?LUNCBattle.DataTruth.LIVE:LUNCBattle.DataTruth.ESTIMATED; LUNCBattle.ui.lastBookImbalance=(buyWall+sellWall)>0?(buyWall-sellWall)/(buyWall+sellWall):0; } }, 2000);
    animate();
  })();
