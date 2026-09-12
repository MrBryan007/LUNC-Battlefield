/* LUNC Battlefield v8.5/v8.6 — price territory + grounded frontline */
(function (global) {
  'use strict';

  function createApi(opts) {
    const THREE = opts.THREE;
    const scene = opts.scene;
    const terrainHeight = opts.terrainHeight || function () { return 0; };
    const mobile = !!opts.mobile;
    const pushFeed = typeof opts.pushFeed === 'function' ? opts.pushFeed : function () {};
    const DataTruth = opts.DataTruth || (global.LUNCBattle && global.LUNCBattle.DataTruth) || {
      LIVE: 'LIVE', CALCULATED: 'CALCULATED', ESTIMATED: 'ESTIMATED',
      SIMULATED: 'SIMULATED', UNAVAILABLE: 'UNAVAILABLE', PARTIAL: 'PARTIAL'
    };

    const WORLD_LO = -28;
    const WORLD_HI = 28;
    const WORLD_SPAN = WORLD_HI - WORLD_LO; // 56

    // ---- Shared mats / geos (reuse) ----
    function mat(color, rough, metal, emissive, intensity, transparent, opacity) {
      return new THREE.MeshStandardMaterial({
        color: color,
        roughness: rough == null ? 0.85 : rough,
        metalness: metal == null ? 0.08 : metal,
        emissive: emissive || 0x000000,
        emissiveIntensity: intensity || 0,
        transparent: !!transparent,
        opacity: opacity == null ? 1 : opacity
      });
    }

    const GEO = {
      pole: new THREE.CylinderGeometry(0.06, 0.085, 1.55, 6),
      plaque: new THREE.BoxGeometry(0.55, 0.28, 0.06),
      flag: new THREE.PlaneGeometry(0.55, 0.32),
      bag: new THREE.BoxGeometry(1.15, 0.38, 0.42),
      berm: new THREE.BoxGeometry(1.8, 0.42, 0.7),
      bermLong: new THREE.BoxGeometry(2.6, 0.36, 0.85),
      crater: new THREE.CylinderGeometry(0.55, 0.7, 0.12, 7),
      smoke: new THREE.SphereGeometry(0.35, 5, 4),
      tower: new THREE.CylinderGeometry(0.35, 0.48, 2.2, 6),
      bunker: new THREE.BoxGeometry(1.6, 0.85, 1.2),
      sandbagStack: new THREE.BoxGeometry(1.3, 0.55, 0.5),
      postThin: new THREE.CylinderGeometry(0.045, 0.055, 1.1, 5),
      wreck: new THREE.BoxGeometry(0.7, 0.22, 0.4)
    };

    const MAT = {
      wood: mat(0x493625, 0.9, 0.01),
      woodDark: mat(0x3a2a1c, 0.92, 0.01),
      sandbag: mat(0x6a5a3e, 0.98, 0.02),
      earth: mat(0x5a4a34, 1, 0.01),
      earthDark: mat(0x3a3024, 1, 0),
      scorch: mat(0x1c1a16, 1, 0),
      metal: mat(0x3a4038, 0.42, 0.48),
      metalDark: mat(0x222824, 0.5, 0.55),
      bullFlag: mat(0x3a8a68, 0.82, 0.04, 0x2a6a50, 0.06),
      bearFlag: mat(0xa05048, 0.82, 0.04, 0x6a3028, 0.06),
      contestedFlag: mat(0xb8a060, 0.82, 0.04, 0x6a5830, 0.05),
      smoke: new THREE.MeshStandardMaterial({
        color: 0x6a6860, roughness: 1, metalness: 0,
        transparent: true, opacity: 0.22, depthWrite: false
      }),
      defensePartial: mat(0x6a5a3e, 0.98, 0.02, 0x000000, 0, true, 0.42),
      defenseFaint: mat(0x5a5040, 0.98, 0.02, 0x000000, 0, true, 0.22),
      plaqueBull: mat(0x2a4034, 0.7, 0.1),
      plaqueBear: mat(0x402828, 0.7, 0.1),
      plaqueContested: mat(0x3a3828, 0.7, 0.1)
    };

    // ---- State ----
    let token = { symbol: 'LUNC', decimals: 8, base: 0.00005122, hasOrderBook: true };
    let currentPrice = token.base;
    let priceTruth = DataTruth.SIMULATED;
    let sourceLabel = 'sim';
    let displayedLow = token.base * 0.92;
    let displayedHigh = token.base * 1.08;
    let priceHistory = [];
    let frontlineX = 0;
    let desiredFrontlineX = 0;

    const root = new THREE.Group();
    root.name = 'priceTerritory';
    scene.add(root);

    const markersGroup = new THREE.Group();
    markersGroup.name = 'priceMarkers';
    root.add(markersGroup);

    const frontlineGroup = new THREE.Group();
    frontlineGroup.name = 'contestedFrontline';
    root.add(frontlineGroup);

    const territoryGroup = new THREE.Group();
    territoryGroup.name = 'territoryCues';
    root.add(territoryGroup);

    const defensesGroup = new THREE.Group();
    defensesGroup.name = 'liquidityDefenses';
    root.add(defensesGroup);

    const markers = []; // { price, mesh, ownership, labelSprite, lastCaptureAt }
    const captureState = Object.create(null); // priceKey -> { owner, lastFlip }
    let lastCaptureFeedAt = 0;
    let lastDefenseSig = '';
    let lastDefenseToken = '';
    const labelTextures = []; // for dispose
    const smokeWisps = [];
    const contestedFlags = [];

    // ---- Mapping helpers ----
    function niceStep(raw) {
      if (!(raw > 0) || !isFinite(raw)) return 1e-6;
      const exp = Math.floor(Math.log10(raw));
      const base = Math.pow(10, exp);
      const n = raw / base;
      let nice;
      if (n <= 1) nice = 1;
      else if (n <= 2) nice = 2;
      else if (n <= 5) nice = 5;
      else nice = 10;
      return nice * base;
    }

    function getPriceStep(tok) {
      const t = tok || token;
      const dec = t.decimals != null ? t.decimals : 8;
      const mag = Math.abs(t.base || currentPrice || 1e-6);
      const sym = String(t.symbol || '').toUpperCase();
      let step;
      if (sym === 'JURIS' || !t.hasOrderBook) {
        // Coarser for protocol tokens without book
        step = niceStep(mag * 0.04);
      } else if (mag < 1e-4) {
        // LUNC-like
        step = niceStep(Math.max(5e-7, mag * 0.012));
        if (step < 5e-7) step = 5e-7;
        if (step > 2e-6 && mag < 1e-4) step = 1e-6;
      } else if (mag < 0.05) {
        // USTC-like
        step = niceStep(Math.max(1e-5, mag * 0.01));
        if (step < 1e-5) step = 1e-5;
      } else {
        step = niceStep(mag * 0.01);
      }
      // Snap to decimal precision
      const prec = Math.pow(10, -Math.min(dec, 10));
      if (step < prec) step = prec;
      return step;
    }

    function priceToWorldX(price) {
      const lo = displayedLow;
      const hi = displayedHigh;
      const span = Math.max(hi - lo, 1e-15);
      const t = (price - lo) / span;
      // Soft clamp outside strip
      const x = WORLD_LO + t * WORLD_SPAN;
      if (x < WORLD_LO - 4) return WORLD_LO - 4;
      if (x > WORLD_HI + 4) return WORLD_HI + 4;
      return x;
    }

    function worldXToPrice(x) {
      const t = (x - WORLD_LO) / WORLD_SPAN;
      return displayedLow + t * Math.max(displayedHigh - displayedLow, 1e-15);
    }

    function formatPriceLabel(p) {
      const dec = token.decimals != null ? token.decimals : 8;
      if (p >= 1) return '$' + p.toFixed(Math.min(dec, 4));
      if (p >= 0.01) return '$' + p.toFixed(Math.min(dec, 5));
      // Trim trailing zeros for micro prices but keep readability
      let s = p.toFixed(Math.min(dec, 8));
      if (s.indexOf('.') >= 0) {
        s = s.replace(/0+$/, '').replace(/\.$/, '');
      }
      return '$' + s;
    }

    function makeLabelSprite(text, tint) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 256, 64);
      ctx.fillStyle = 'rgba(12,18,12,0.55)';
      ctx.fillRect(8, 10, 240, 44);
      ctx.strokeStyle = tint || 'rgba(200,180,120,0.55)';
      ctx.lineWidth = 2;
      ctx.strokeRect(8, 10, 240, 44);
      ctx.font = 'bold 28px monospace, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = tint || '#d8c898';
      ctx.fillText(text, 128, 34);
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      labelTextures.push(tex);
      const sprMat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0.88,
        depthWrite: false
      });
      const spr = new THREE.Sprite(sprMat);
      spr.scale.set(2.4, 0.6, 1);
      spr.userData._tex = tex;
      spr.userData._mat = sprMat;
      return spr;
    }

    function disposeObject3D(obj) {
      if (!obj) return;
      obj.traverse(function (c) {
        if (c.geometry && c.geometry.dispose && ownedGeo(c.geometry) === false) {
          // shared GEO — don't dispose
        }
        if (c.material) {
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          mats.forEach(function (m) {
            if (m && m.map && m.map.dispose && labelTextures.indexOf(m.map) >= 0) {
              // handled via labelTextures
            }
            if (m && m.userData && m.userData._owned) {
              if (m.map) m.map.dispose();
              m.dispose();
            }
          });
        }
      });
      if (obj.parent) obj.parent.remove(obj);
    }

    function ownedGeo(g) {
      for (const k in GEO) if (GEO[k] === g) return true;
      return false;
    }

    function clearGroup(g) {
      while (g.children.length) {
        const c = g.children[0];
        g.remove(c);
        c.traverse(function (n) {
          if (n.userData && n.userData._tex) {
            try { n.userData._tex.dispose(); } catch (_) {}
          }
          if (n.userData && n.userData._mat) {
            try { n.userData._mat.dispose(); } catch (_) {}
          }
        });
      }
    }

    // ---- Range hysteresis ----
    function recomputeRange(force) {
      const hist = priceHistory.length ? priceHistory : [currentPrice];
      let mn = hist[0], mx = hist[0];
      for (let i = 1; i < hist.length; i++) {
        if (hist[i] < mn) mn = hist[i];
        if (hist[i] > mx) mx = hist[i];
      }
      const mid = currentPrice > 0 ? currentPrice : token.base;
      let span = Math.max(mx - mn, mid * 0.04, getPriceStep() * 6);
      // Buffer
      span *= 1.35;
      const half = span * 0.5;
      let nextLo = mid - half;
      let nextHi = mid + half;
      if (nextLo <= 0) nextLo = Math.max(mid * 0.5, 1e-12);

      if (!force && displayedHigh > displayedLow) {
        const band = displayedHigh - displayedLow;
        const innerLo = displayedLow + band * 0.15;
        const innerHi = displayedHigh - band * 0.15;
        // Recenter only if price exits inner 70% band
        if (currentPrice >= innerLo && currentPrice <= innerHi) {
          return false;
        }
      }
      displayedLow = nextLo;
      displayedHigh = nextHi;
      return true;
    }

    function getVisiblePriceLevels() {
      const step = getPriceStep();
      const countTarget = mobile ? 5 : 9;
      const span = Math.max(displayedHigh - displayedLow, step);
      // Choose a nice step that yields ~countTarget markers
      let levelStep = niceStep(span / Math.max(3, countTarget - 1));
      if (levelStep < step) levelStep = step;
      // Cap marker count
      const maxN = mobile ? 6 : 11;
      const minN = mobile ? 4 : 7;
      while ((displayedHigh - displayedLow) / levelStep + 1 > maxN) {
        levelStep = niceStep(levelStep * 2.01);
      }
      while ((displayedHigh - displayedLow) / levelStep + 1 < minN && levelStep > step) {
        const smaller = niceStep(levelStep / 2.1);
        if (smaller >= step && (displayedHigh - displayedLow) / smaller + 1 <= maxN) {
          levelStep = smaller;
        } else break;
      }

      const levels = [];
      const start = Math.ceil(displayedLow / levelStep) * levelStep;
      for (let p = start; p <= displayedHigh + levelStep * 0.01; p += levelStep) {
        // Avoid floating drift
        const rounded = Math.round(p / levelStep) * levelStep;
        if (rounded < displayedLow - levelStep * 0.01 || rounded > displayedHigh + levelStep * 0.01) continue;
        levels.push(rounded);
        if (levels.length >= maxN) break;
      }
      return levels;
    }

    function ownershipAt(priceLevel) {
      const fx = frontlineX;
      const lx = priceToWorldX(priceLevel);
      const d = lx - fx;
      if (Math.abs(d) < 1.8) return 'contested';
      // West of frontline = Bull (price below current → west when range centered)
      // Mapping: lower price → lower X (west). Bulls defend west / low prices rising through.
      // Ownership: west of frontline = Bull, east = Bear
      return lx < fx ? 'bull' : 'bear';
    }

    function buildMarker(priceLevel) {
      const g = new THREE.Group();
      const own = ownershipAt(priceLevel);
      const pole = new THREE.Mesh(GEO.pole, MAT.wood);
      pole.castShadow = !mobile;
      pole.position.y = 0.78;
      g.add(pole);

      const plaqueMat = own === 'bull' ? MAT.plaqueBull : own === 'bear' ? MAT.plaqueBear : MAT.plaqueContested;
      const plaque = new THREE.Mesh(GEO.plaque, plaqueMat);
      plaque.position.set(0.28, 1.15, 0);
      plaque.castShadow = !mobile;
      g.add(plaque);

      const flagMat = own === 'bull' ? MAT.bullFlag : own === 'bear' ? MAT.bearFlag : MAT.contestedFlag;
      const flag = new THREE.Mesh(GEO.flag, flagMat);
      flag.position.set(0.42, 1.55, 0);
      flag.rotation.y = Math.PI / 2;
      g.add(flag);

      const label = makeLabelSprite(formatPriceLabel(priceLevel),
        own === 'bull' ? '#8fd4b0' : own === 'bear' ? '#e8a090' : '#d8c898');
      label.position.set(0, 2.05, 0);
      g.add(label);

      const x = priceToWorldX(priceLevel);
      // Spread markers slightly in z so they don't stack on the road
      const z = ((priceLevel * 1e9) % 17) / 17 * 20 - 10;
      const ty = terrainHeight(x, z);
      g.position.set(x, ty, z);
      g.userData.price = priceLevel;
      g.userData.ownership = own;
      markersGroup.add(g);
      return {
        price: priceLevel,
        mesh: g,
        ownership: own,
        labelSprite: label,
        flag: flag,
        plaque: plaque
      };
    }

    function rebuildMarkers() {
      clearGroup(markersGroup);
      markers.length = 0;
      const levels = getVisiblePriceLevels();
      for (let i = 0; i < levels.length; i++) {
        markers.push(buildMarker(levels[i]));
      }
      rebuildTerritoryCues();
    }

    function updateMarkerOwnership() {
      for (let i = 0; i < markers.length; i++) {
        const m = markers[i];
        const own = ownershipAt(m.price);
        if (own === m.ownership) continue;
        m.ownership = own;
        if (m.flag) {
          m.flag.material = own === 'bull' ? MAT.bullFlag : own === 'bear' ? MAT.bearFlag : MAT.contestedFlag;
        }
        if (m.plaque) {
          m.plaque.material = own === 'bull' ? MAT.plaqueBull : own === 'bear' ? MAT.plaqueBear : MAT.plaqueContested;
        }
      }
    }

    // ---- Capture checks ----
    function priceKey(p) {
      return String(Math.round(p / getPriceStep()) * getPriceStep());
    }

    function checkCaptures() {
      if (!(currentPrice > 0)) return;
      const step = getPriceStep();
      const thresh = step * 0.35;
      const now = Date.now();
      for (let i = 0; i < markers.length; i++) {
        const m = markers[i];
        const key = priceKey(m.price);
        let st = captureState[key];
        if (!st) {
          // Initialize from current side of price
          st = captureState[key] = {
            owner: currentPrice >= m.price ? 'bull' : 'bear',
            lastFlip: 0
          };
        }
        let next = st.owner;
        if (currentPrice > m.price + thresh) next = 'bull';
        else if (currentPrice < m.price - thresh) next = 'bear';
        if (next !== st.owner) {
          st.owner = next;
          st.lastFlip = now;
          if (now - lastCaptureFeedAt > 3000) {
            lastCaptureFeedAt = now;
            const label = formatPriceLabel(m.price);
            if (next === 'bull') {
              pushFeed('PRICE BREAKOUT · Bulls captured ' + label, 'win');
            } else {
              pushFeed('PRICE BREAKDOWN · Bears reclaimed ' + label, 'loss');
            }
          }
        }
      }
      updateMarkerOwnership();
    }

    // ---- Frontline visual ----
    // Pieces store local XZ offsets; Y is re-seated each updateFrontline via
    // terrainHeight(frontlineX + localX, z) so translating the strip never floats/sinks.
    const frontlinePieces = []; // { mesh, localX, localZ, yOff }

    function addFrontlinePiece(mesh, localX, localZ, yOff) {
      frontlineGroup.add(mesh);
      frontlinePieces.push({ mesh: mesh, localX: localX, localZ: localZ, yOff: yOff });
    }

    function seatFrontlinePieces() {
      const fx = frontlineX;
      for (let i = 0; i < frontlinePieces.length; i++) {
        const p = frontlinePieces[i];
        const wx = fx + p.localX;
        const wz = p.localZ;
        const ty = terrainHeight(wx, wz);
        p.mesh.position.set(wx, ty + p.yOff, wz);
      }
      for (let i = 0; i < smokeWisps.length; i++) {
        const s = smokeWisps[i];
        const wx = fx + s.localX;
        const wz = s.localZ;
        const ty = terrainHeight(wx, wz);
        s.baseY = ty + s.yOff;
        // Keep current bob relative to re-seated base (caller may overwrite y)
        s.mesh.position.x = wx;
        s.mesh.position.z = wz;
        s.mesh.position.y = s.baseY;
      }
    }

    function buildFrontlineVisual() {
      clearGroup(frontlineGroup);
      smokeWisps.length = 0;
      contestedFlags.length = 0;
      frontlinePieces.length = 0;
      // Group stays at origin; pieces are placed in world space each update
      frontlineGroup.position.set(0, 0, 0);

      const zMin = -26;
      const zMax = 26;
      const stepZ = mobile ? 5.5 : 4.2;

      for (let z = zMin; z <= zMax; z += stepZ) {
        // Trench berm (elongated) — local offsets only; Y grounded later
        const berm = new THREE.Mesh(GEO.bermLong, MAT.earth);
        berm.rotation.y = (z * 0.07) % 0.2;
        berm.castShadow = !mobile;
        berm.receiveShadow = true;
        addFrontlinePiece(berm, (z % 8 === 0 ? -0.35 : 0.25), z, 0.2);

        // Sandbags
        const bag = new THREE.Mesh(GEO.bag, MAT.sandbag);
        bag.rotation.y = Math.PI / 2 + (z * 0.03);
        bag.castShadow = !mobile;
        addFrontlinePiece(bag, (z % 9 > 4 ? 0.55 : -0.55), z + 0.4, 0.28);

        // Contested flag post
        if (!mobile || (Math.abs(z) % 11 < 6)) {
          const post = new THREE.Mesh(GEO.postThin, MAT.woodDark);
          addFrontlinePiece(post, 0.1, z - 0.3, 0.55);
          const fl = new THREE.Mesh(GEO.flag, MAT.contestedFlag);
          fl.rotation.y = Math.PI / 2;
          addFrontlinePiece(fl, 0.35, z - 0.3, 1.05);
          contestedFlags.push(fl);
        }

        // Shell hole
        if (Math.abs(z) % 7 < 3) {
          const hole = new THREE.Mesh(GEO.crater, MAT.scorch);
          hole.receiveShadow = true;
          addFrontlinePiece(hole, (z % 5) * 0.15 - 0.2, z + 1.1, 0.04);
        }
      }

      // Few smoke wisps
      const smokeN = mobile ? 2 : 4;
      for (let i = 0; i < smokeN; i++) {
        const sm = new THREE.Mesh(GEO.smoke, MAT.smoke.clone());
        sm.material.userData = { _owned: true };
        const z = -18 + i * (36 / Math.max(1, smokeN - 1));
        const localX = (i % 2 ? 0.4 : -0.3);
        const yOff = 0.9 + i * 0.15;
        sm.scale.setScalar(0.8 + i * 0.15);
        frontlineGroup.add(sm);
        smokeWisps.push({
          mesh: sm, phase: i * 1.7,
          localX: localX, localZ: z, yOff: yOff, baseY: yOff
        });
      }
      seatFrontlinePieces();
    }

    function rebuildTerritoryCues() {
      clearGroup(territoryGroup);
      const n = mobile ? 4 : 7;
      for (let i = 0; i < n; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const z = -20 + (i / Math.max(1, n - 1)) * 40;
        const xOff = side * (6 + (i % 3) * 3.5);
        const x = frontlineX + xOff;
        // Only place sparse flags west(bull)/east(bear)
        const ty = terrainHeight(x, z);
        const post = new THREE.Mesh(GEO.postThin, MAT.wood);
        post.position.set(x, ty + 0.55, z);
        territoryGroup.add(post);
        const fl = new THREE.Mesh(GEO.flag, side < 0 ? MAT.bullFlag : MAT.bearFlag);
        fl.position.set(x + side * 0.25, ty + 1.05, z);
        fl.rotation.y = Math.PI / 2;
        territoryGroup.add(fl);
      }
      // Contested mid-band crater/wreck accents
      const wreckN = mobile ? 3 : 5;
      for (let i = 0; i < wreckN; i++) {
        const z = -16 + i * (32 / Math.max(1, wreckN - 1));
        const x = frontlineX + ((i % 3) - 1) * 1.4;
        const ty = terrainHeight(x, z);
        const w = new THREE.Mesh(GEO.wreck, MAT.metalDark);
        w.position.set(x, ty + 0.12, z);
        w.rotation.y = i * 0.7;
        territoryGroup.add(w);
        if (i % 2 === 0) {
          const hole = new THREE.Mesh(GEO.crater, MAT.scorch);
          hole.position.set(x + 0.6, ty + 0.03, z + 0.5);
          territoryGroup.add(hole);
        }
      }
    }

    // ---- Liquidity defenses ----
    function zoneUsdTotal(zones) {
      if (!zones) return 0;
      let t = 0;
      ['bids', 'asks'].forEach(function (side) {
        (zones[side] || []).forEach(function (z) {
          if (z && z.usd != null && z.truth !== DataTruth.UNAVAILABLE) t += z.usd;
        });
      });
      return t;
    }

    function defenseTier(usd) {
      if (!(usd > 0)) return 0;
      if (usd < 25000) return 1; // sandbags
      if (usd < 150000) return 2; // bunker
      return 3; // tower
    }

    const defenseMarkers = []; // { x, z, side, strength, partial } for minimap

    function placeDefenseProp(x, z, tier, partial, uncertain) {
      const ty = terrainHeight(x, z);
      const g = new THREE.Group();
      const useMat = uncertain ? MAT.defenseFaint : (partial ? MAT.defensePartial : MAT.sandbag);
      if (tier <= 1) {
        const bag = new THREE.Mesh(GEO.sandbagStack, useMat);
        bag.position.y = 0.28;
        bag.castShadow = !mobile && !partial;
        g.add(bag);
      } else if (tier === 2) {
        const b = new THREE.Mesh(GEO.bunker, partial || uncertain ? useMat : MAT.earthDark);
        b.position.y = 0.42;
        b.castShadow = !mobile && !uncertain;
        g.add(b);
        const bag = new THREE.Mesh(GEO.bag, useMat);
        bag.position.set(0.7, 0.25, 0.4);
        g.add(bag);
      } else {
        const tw = new THREE.Mesh(GEO.tower, partial || uncertain ? useMat : MAT.metal);
        tw.position.y = 1.1;
        tw.castShadow = !mobile && !uncertain;
        g.add(tw);
        const bag = new THREE.Mesh(GEO.sandbagStack, useMat);
        bag.position.set(0.6, 0.28, 0.3);
        g.add(bag);
      }
      g.position.set(x, ty, z);
      g.scale.setScalar(uncertain ? 0.75 : (partial ? 0.85 : 1));
      defensesGroup.add(g);
      defenseMarkers.push({
        x: x, z: z,
        side: x < frontlineX ? 'bull' : 'bear',
        strength: tier,
        partial: !!partial || !!uncertain
      });
    }

    function updateLiquidityDefenses(zones, mid) {
      const midPx = mid > 0 ? mid : currentPrice;
      if (!(midPx > 0)) {
        clearGroup(defensesGroup);
        defenseMarkers.length = 0;
        lastDefenseSig = '';
        return;
      }

      const truth = zones && zones.truth;
      // Never invent fortresses for UNAVAILABLE; skip ESTIMATED-only fortress walls
      if (!zones || truth === DataTruth.UNAVAILABLE) {
        clearGroup(defensesGroup);
        defenseMarkers.length = 0;
        lastDefenseSig = 'none';
        return;
      }
      // Prefer skip for ESTIMATED-only (no live/calc/partial zones object from book)
      if (truth === DataTruth.ESTIMATED || truth === DataTruth.SIMULATED) {
        clearGroup(defensesGroup);
        defenseMarkers.length = 0;
        lastDefenseSig = 'est-skip';
        return;
      }
      if (truth !== DataTruth.LIVE && truth !== DataTruth.CALCULATED && truth !== DataTruth.PARTIAL) {
        clearGroup(defensesGroup);
        defenseMarkers.length = 0;
        lastDefenseSig = 'skip';
        return;
      }

      const total = zoneUsdTotal(zones);
      // Rebuild only when zone totals change >15% or token changes
      if (lastDefenseToken === token.symbol && lastDefenseSig) {
        const parts = lastDefenseSig.split('|');
        const prevT = (+parts[2] || 0) * 1000;
        if (parts[1] === String(truth) && prevT > 0 && Math.abs(total - prevT) / prevT < 0.15) {
          return;
        }
      }

      clearGroup(defensesGroup);
      defenseMarkers.length = 0;
      lastDefenseToken = token.symbol;
      lastDefenseSig = token.symbol + '|' + truth + '|' + Math.round(total / 1000);

      const partialOverall = truth === DataTruth.PARTIAL;
      const pctCenters = {
        immediate: 0.25,
        near: 0.75,
        major: 2.0,
        deep: 4.0
      };

      function handleSide(sideArr, isBid) {
        (sideArr || []).forEach(function (z, idx) {
          if (!z || z.truth === DataTruth.UNAVAILABLE) return;
          if (!(z.usd > 0)) return;
          const pct = pctCenters[z.id] != null ? pctCenters[z.id] : ((z.minPct + z.maxPct) * 0.5);
          // bid below mid, ask above
          const priceLevel = isBid ? midPx * (1 - pct / 100) : midPx * (1 + pct / 100);
          const x = priceToWorldX(priceLevel);
          const tier = defenseTier(z.usd);
          const partial = z.truth === DataTruth.PARTIAL || partialOverall;
          // Stagger in z
          const zPos = (isBid ? -1 : 1) * (8 + idx * 5) + ((idx % 2) ? 3 : -3);
          placeDefenseProp(x, zPos, tier, partial, false);
          // Mirror a lighter prop on other flank for strip presence
          if (!mobile && tier >= 2) {
            placeDefenseProp(x, -zPos * 0.6, Math.max(1, tier - 1), partial, false);
          }
        });
      }

      handleSide(zones.bids, true);
      handleSide(zones.asks, false);
    }

    // ---- Public API methods ----
    function setToken(info) {
      token = {
        symbol: (info && info.symbol) || 'LUNC',
        decimals: info && info.decimals != null ? info.decimals : 8,
        base: info && info.base > 0 ? info.base : 0.00005122,
        hasOrderBook: !!(info && info.hasOrderBook)
      };
      currentPrice = token.base;
      priceHistory = [];
      priceTruth = DataTruth.SIMULATED;
      sourceLabel = 'sim';
      // Clear capture / markers / defenses
      for (const k in captureState) delete captureState[k];
      lastCaptureFeedAt = 0;
      clearGroup(markersGroup);
      markers.length = 0;
      clearGroup(defensesGroup);
      defenseMarkers.length = 0;
      lastDefenseSig = '';
      lastDefenseToken = '';
      displayedLow = token.base * 0.92;
      displayedHigh = token.base * 1.08;
      recomputeRange(true);
      frontlineX = priceToWorldX(currentPrice);
      desiredFrontlineX = frontlineX;
      rebuildMarkers();
      buildFrontlineVisual();
    }

    function updateCurrentPrice(price, meta) {
      if (!(price > 0)) return;
      currentPrice = price;
      if (meta) {
        if (meta.truth) priceTruth = meta.truth;
        if (meta.sourceLabel) sourceLabel = meta.sourceLabel;
      }
      priceHistory.push(price);
      if (priceHistory.length > 48) priceHistory.shift();
      const rebuilt = recomputeRange(false);
      desiredFrontlineX = THREE.MathUtils.clamp(priceToWorldX(currentPrice), WORLD_LO, WORLD_HI);
      if (rebuilt) {
        rebuildMarkers();
      } else {
        // Reposition markers if range stable but ownership may change
        for (let i = 0; i < markers.length; i++) {
          const m = markers[i];
          const x = priceToWorldX(m.price);
          const z = m.mesh.position.z;
          m.mesh.position.x = x;
          m.mesh.position.y = terrainHeight(x, z);
        }
      }
      checkCaptures();
    }

    function updateFrontline(dt) {
      const t = Math.min(1, (dt || 0.016) * 2.8);
      frontlineX += (desiredFrontlineX - frontlineX) * t;
      // Re-seat every piece on terrain at current frontlineX + local offset
      // (fixes v8.5 float/sink from sampling terrainHeight(0,z) then translating group)
      seatFrontlinePieces();
      // Animate smoke (bob after seating)
      const now = performance.now() * 0.001;
      for (let i = 0; i < smokeWisps.length; i++) {
        const s = smokeWisps[i];
        s.mesh.position.y = s.baseY + Math.sin(now * 0.7 + s.phase) * 0.18;
        s.mesh.material.opacity = 0.16 + Math.sin(now * 0.5 + s.phase) * 0.06;
        s.mesh.scale.setScalar(0.85 + Math.sin(now * 0.4 + s.phase) * 0.12);
      }
      for (let i = 0; i < contestedFlags.length; i++) {
        const f = contestedFlags[i];
        f.rotation.z = Math.sin(now * 1.4 + i) * 0.08;
      }
      // Keep territory cues roughly aligned (lightweight: shift group)
      territoryGroup.position.x = frontlineX * 0.15;
      updateMarkerOwnership();
    }

    function getFrontlineX() {
      return frontlineX;
    }

    function getDisplayedRange() {
      return { low: displayedLow, high: displayedHigh };
    }

    function dispose() {
      clearGroup(markersGroup);
      clearGroup(frontlineGroup);
      clearGroup(territoryGroup);
      clearGroup(defensesGroup);
      defenseMarkers.length = 0;
      frontlinePieces.length = 0;
      markers.length = 0;
      smokeWisps.length = 0;
      contestedFlags.length = 0;
      labelTextures.forEach(function (t) { try { t.dispose(); } catch (_) {} });
      labelTextures.length = 0;
      if (root.parent) root.parent.remove(root);
      for (const k in MAT) {
        try {
          if (MAT[k] && MAT[k].dispose) MAT[k].dispose();
        } catch (_) {}
      }
      for (const k in GEO) {
        try {
          if (GEO[k] && GEO[k].dispose) GEO[k].dispose();
        } catch (_) {}
      }
    }

    // Initial build
    recomputeRange(true);
    buildFrontlineVisual();
    rebuildMarkers();
    frontlineX = priceToWorldX(currentPrice);
    desiredFrontlineX = frontlineX;
    seatFrontlinePieces();

    return {
      priceToWorldX: priceToWorldX,
      worldXToPrice: worldXToPrice,
      getPriceStep: getPriceStep,
      getVisiblePriceLevels: getVisiblePriceLevels,
      setToken: setToken,
      updateCurrentPrice: updateCurrentPrice,
      updateFrontline: updateFrontline,
      updateLiquidityDefenses: updateLiquidityDefenses,
      checkCaptures: checkCaptures,
      dispose: dispose,
      getFrontlineX: getFrontlineX,
      getDisplayedRange: getDisplayedRange,
      getDefenseMarkers: function () { return defenseMarkers.slice(); },
      version: 'v8.5'
    };
  }

  global.LUNCBattle = global.LUNCBattle || {};
  global.LUNCBattle.priceTerritory = { createApi: createApi };
})(window);
