/* LUNC Battlefield v10 — sky, horizon and atmosphere (procedural, original)
 * - Gradient sky dome with sun glow + drifting procedural cloud bands (one draw call)
 * - Far ground skirt so the battlefield no longer ends in a black void
 * - Low-poly distant ridge ring that fades into haze
 * - Fog tuned to the sky horizon colour (aerial perspective)
 */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};

  var SKY_VERT = [
    'varying vec3 vDir;',
    'void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '  gl_Position = p.xyww; }'
  ].join('\n');

  var SKY_FRAG = [
    'uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunDir; uniform vec3 sunColor;',
    'uniform float time; uniform float clouds; varying vec3 vDir;',
    'float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }',
    'float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += vn(p) * a; p *= 2.03; a *= 0.5; } return s; }',
    'void main(){',
    '  vec3 d = normalize(vDir); float y = d.y;',
    '  float t = clamp(y, 0.0, 1.0);',
    '  vec3 col = mix(horizon, zenith, pow(t, 0.55));',
    '  col = mix(col, ground, smoothstep(0.0, -0.12, y));',
    '  float sd = max(dot(d, normalize(sunDir)), 0.0);',
    '  col += sunColor * (pow(sd, 6.0) * 0.28 + pow(sd, 64.0) * 0.6 + pow(sd, 900.0) * 6.0);',
    '  if (clouds > 0.0 && y > 0.0) {',
    '    vec2 uv = d.xz / (y + 0.18) * 1.6 + vec2(time * 0.006, time * 0.002);',
    '    float c = smoothstep(0.48, 0.82, fbm(uv));',
    '    float lit = 0.75 + 0.25 * pow(sd, 3.0);',
    '    col = mix(col, mix(horizon * 1.05, vec3(1.0, 0.96, 0.9), 0.55) * lit, c * clouds * smoothstep(0.0, 0.25, y));',
    '  }',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function seeded(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  function create(opts) {
    var THREE = opts.THREE, scene = opts.scene, camera = opts.camera;
    var mobile = !!opts.mobile;
    var tier = opts.tier || 'HIGH';
    var group = new THREE.Group();
    group.name = 'atmosphere-v10';

    var palette = {
      zenith: new THREE.Color(0x3d6a9a),
      horizon: new THREE.Color(0xd8c7a2),
      ground: new THREE.Color(0x6d6a55),
      sun: new THREE.Color(0xffd7a0),
      fog: new THREE.Color(0xb9b294)
    };
    // Sky shader colours are written directly (linear → output via sRGB in post or renderer)
    var sunDir = new THREE.Vector3(-0.55, 0.42, 0.25).normalize();

    var skyMat = new THREE.ShaderMaterial({
      uniforms: {
        zenith: { value: palette.zenith.clone().convertSRGBToLinear() },
        horizon: { value: palette.horizon.clone().convertSRGBToLinear() },
        ground: { value: palette.ground.clone().convertSRGBToLinear() },
        sunDir: { value: sunDir },
        sunColor: { value: palette.sun.clone().convertSRGBToLinear() },
        time: { value: 0 },
        clouds: { value: tier === 'LOW' ? 0.55 : 0.85 }
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false
    });
    // r128 ShaderMaterial skips output encoding — convert in-shader when drawing straight to screen
    var directToScreen = !(LB.postfx && LB.postfx.isActive && LB.postfx.isActive());
    function patchEncoding(toScreen) {
      skyMat.fragmentShader = toScreen
        ? SKY_FRAG.replace('gl_FragColor = vec4(col, 1.0);', 'gl_FragColor = vec4(pow(max(col, 0.0), vec3(1.0/2.2)), 1.0);')
        : SKY_FRAG;
      skyMat.needsUpdate = true;
    }
    patchEncoding(directToScreen);
    var sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    sky.name = 'sky';
    group.add(sky);

    // Far ground skirt — sits just under the battlefield and dissolves into fog
    var Mats = LB.materials;
    var PT = LB.proctex;
    var skirtMat = new THREE.MeshStandardMaterial({
      color: 0x55603f, roughness: 1, metalness: 0,
      map: PT ? PT.groundDetail(THREE, 60, 60) : null
    });
    var skirt = new THREE.Mesh(new THREE.PlaneGeometry(900, 900, 1, 1), skirtMat);
    skirt.rotation.x = -Math.PI / 2;
    skirt.position.y = -0.55;
    skirt.receiveShadow = false;
    skirt.name = 'ground-skirt';
    group.add(skirt);

    // Distant ridges — 2 rings, low-poly, vertex-noise tops; fog does the haze
    function ridge(radius, height, color, seed, segs) {
      var geo = new THREE.CylinderGeometry(radius, radius * 1.02, height, segs, 1, true);
      var pos = geo.attributes.position;
      for (var i = 0; i < pos.count; i++) {
        if (pos.getY(i) > 0) {
          var a = Math.atan2(pos.getZ(i), pos.getX(i));
          var n = 0.45 + 0.35 * Math.sin(a * 3 + seed) + 0.2 * Math.sin(a * 11 + seed * 2.3) + 0.25 * seeded(i + seed * 100);
          pos.setY(i, -height / 2 + height * Math.max(0.15, n));
        }
      }
      geo.computeVertexNormals();
      var m = new THREE.MeshStandardMaterial({ color: color, roughness: 1, metalness: 0, side: THREE.BackSide, flatShading: true });
      var mesh = new THREE.Mesh(geo, m);
      mesh.position.y = height / 2 - 1.2;
      return mesh;
    }
    if (tier !== 'LOW' || !mobile) {
      group.add(ridge(230, 26, 0x4f5c48, 1.7, mobile ? 28 : 48));
    }
    group.add(ridge(320, 46, 0x5f6c70, 4.1, mobile ? 24 : 40));

    scene.add(group);

    // Fog + background matched to horizon haze
    scene.background = palette.fog.clone();
    scene.fog = new THREE.Fog(palette.fog.getHex(), mobile ? 95 : 115, mobile ? 320 : 400);
    if (camera) {
      camera.far = Math.max(camera.far, 900);
      camera.updateProjectionMatrix();
    }

    var lastScreenMode = directToScreen;
    function update(dt, now, cam) {
      skyMat.uniforms.time.value = now || 0;
      if (cam) sky.position.copy(cam.position);
      var toScreen = !(LB.postfx && LB.postfx.isActive && LB.postfx.isActive());
      if (toScreen !== lastScreenMode) { lastScreenMode = toScreen; patchEncoding(toScreen); }
    }

    return {
      group: group, sky: sky, sunDir: sunDir, palette: palette, update: update,
      fog: { fogColor: palette.fog.getHex(), background: palette.fog.getHex() }
    };
  }

  /** Small equirect canvas of the same sky (for PMREM image-based lighting) */
  function makeEquirect(THREE, atmo) {
    var W = 256, H = 128;
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d');
    var pal = atmo.palette;
    function css(col, k) { var cc = col.clone().multiplyScalar((k || 1) * 0.6); /* IBL kept subtle — sun stays the key light */ return 'rgb(' + Math.min(255, cc.r * 255 | 0) + ',' + Math.min(255, cc.g * 255 | 0) + ',' + Math.min(255, cc.b * 255 | 0) + ')'; }
    var grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, css(pal.zenith));
    grd.addColorStop(0.42, css(pal.horizon, 0.95));
    grd.addColorStop(0.5, css(pal.horizon, 0.85));
    grd.addColorStop(0.56, css(pal.ground, 0.8));
    grd.addColorStop(1, css(pal.ground, 0.45));
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // sun glow at sunDir
    var d = atmo.sunDir;
    var u = 0.5 + Math.atan2(d.z, d.x) / (2 * Math.PI);
    var v = 0.5 - Math.asin(d.y) / Math.PI;
    var sx = (1 - u) * W, sy = v * H;
    var sg = g.createRadialGradient(sx, sy, 0, sx, sy, 40);
    sg.addColorStop(0, 'rgba(255,240,210,1)');
    sg.addColorStop(0.15, 'rgba(255,220,170,0.6)');
    sg.addColorStop(1, 'rgba(255,220,170,0)');
    g.fillStyle = sg; g.fillRect(0, 0, W, H);
    var t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    if (THREE.sRGBEncoding != null) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  LB.atmosphere = { create: create, makeEquirect: makeEquirect };
})(window);
