/* LUNC Battlefield v8.6 — classic 3/4 RTS camera (OrbitControls + WASD, no free-fly) */
(function (global) {
  'use strict';

  var DEFAULT_BOUNDS = { minX: -70, maxX: 70, minZ: -45, maxZ: 45 };
  var BULL_BASE_X = -48;
  var BEAR_BASE_X = 48;
  var DEFAULT_CAM = { x: 0, y: 38, z: 48 };
  var DEFAULT_TARGET_Y = 1.2;

  function createApi(opts) {
    var THREE = opts.THREE;
    var camera = opts.camera;
    var controls = opts.controls;
    var renderer = opts.renderer;
    var domElement = opts.domElement || (renderer && renderer.domElement);
    var getFrontlineX = typeof opts.getFrontlineX === 'function'
      ? opts.getFrontlineX
      : function () { return 0; };
    var bounds = Object.assign({}, DEFAULT_BOUNDS, opts.getWorldBounds
      ? (typeof opts.getWorldBounds === 'function' ? opts.getWorldBounds() : opts.getWorldBounds)
      : null);

    var cinematic = null; // { x, z, duration, zoom, elapsed, fromPos, fromTarget, toPos, toTarget }
    var shakeOffset = new THREE.Vector3();
    var _tmpForward = new THREE.Vector3();
    var _tmpRight = new THREE.Vector3();
    var _tmpUp = new THREE.Vector3(0, 1, 0);
    var focusLerp = null; // smooth focus helper

    function clampTarget(tx, tz) {
      return {
        x: THREE.MathUtils.clamp(tx, bounds.minX, bounds.maxX),
        z: THREE.MathUtils.clamp(tz, bounds.minZ, bounds.maxZ)
      };
    }

    function clampCameraToTarget() {
      var t = controls.target;
      var c = clampTarget(t.x, t.z);
      t.x = c.x;
      t.z = c.z;
      // Keep camera offset relative but clamp absolute position loosely
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, bounds.minX - 25, bounds.maxX + 25);
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, bounds.minZ - 25, bounds.maxZ + 35);
      // Never drop below a classic RTS height floor
      if (camera.position.y < 12) camera.position.y = 12;
    }

    function notifyUserInput() {
      if (cinematic) cinematic = null;
      if (focusLerp) focusLerp = null;
    }

    function panWASD(dt, keys) {
      if (!keys) return false;
      var moved = false;
      var speed = ((keys.ShiftLeft || keys.ShiftRight) ? 24 : 12) * dt;
      camera.getWorldDirection(_tmpForward);
      _tmpForward.y = 0;
      if (_tmpForward.lengthSq() < 1e-6) _tmpForward.set(0, 0, -1);
      else _tmpForward.normalize();
      _tmpRight.crossVectors(_tmpForward, _tmpUp).normalize();
      if (keys.KeyW) {
        camera.position.addScaledVector(_tmpForward, speed);
        controls.target.addScaledVector(_tmpForward, speed);
        moved = true;
      }
      if (keys.KeyS) {
        camera.position.addScaledVector(_tmpForward, -speed);
        controls.target.addScaledVector(_tmpForward, -speed);
        moved = true;
      }
      if (keys.KeyA) {
        camera.position.addScaledVector(_tmpRight, -speed);
        controls.target.addScaledVector(_tmpRight, -speed);
        moved = true;
      }
      if (keys.KeyD) {
        camera.position.addScaledVector(_tmpRight, speed);
        controls.target.addScaledVector(_tmpRight, speed);
        moved = true;
      }
      return moved;
    }

    function applyFocusFrame(dt) {
      if (!focusLerp) return;
      focusLerp.t += dt / Math.max(0.05, focusLerp.duration);
      var u = Math.min(1, focusLerp.t);
      var e = u * u * (3 - 2 * u); // smoothstep
      camera.position.lerpVectors(focusLerp.fromPos, focusLerp.toPos, e);
      controls.target.lerpVectors(focusLerp.fromTarget, focusLerp.toTarget, e);
      if (u >= 1) focusLerp = null;
    }

    function applyCinematic(dt) {
      if (!cinematic) return;
      cinematic.elapsed += dt;
      var u = Math.min(1, cinematic.elapsed / Math.max(0.05, cinematic.duration));
      var e = u * u * (3 - 2 * u);
      camera.position.lerpVectors(cinematic.fromPos, cinematic.toPos, e);
      controls.target.lerpVectors(cinematic.fromTarget, cinematic.toTarget, e);
      if (u >= 1) cinematic = null;
    }

    function focusWorld(x, z, smooth) {
      var c = clampTarget(x, z);
      var ox = camera.position.x - controls.target.x;
      var oy = camera.position.y - controls.target.y;
      var oz = camera.position.z - controls.target.z;
      // Preserve classic 3/4 offset if degenerate
      if (Math.abs(ox) + Math.abs(oz) < 0.5) {
        ox = 0; oy = 38; oz = 48;
      }
      var toTarget = new THREE.Vector3(c.x, DEFAULT_TARGET_Y, c.z);
      var toPos = new THREE.Vector3(c.x + ox, Math.max(16, oy), c.z + oz);
      cinematic = null;
      if (smooth === false) {
        focusLerp = null;
        controls.target.copy(toTarget);
        camera.position.copy(toPos);
        clampCameraToTarget();
        return;
      }
      focusLerp = {
        t: 0,
        duration: 0.55,
        fromPos: camera.position.clone(),
        fromTarget: controls.target.clone(),
        toPos: toPos,
        toTarget: toTarget
      };
    }

    function focusFrontline(smooth) {
      focusWorld(getFrontlineX(), 0, smooth !== false);
    }

    function focusBullBase(smooth) {
      focusWorld(BULL_BASE_X, 0, smooth !== false);
    }

    function focusBearBase(smooth) {
      focusWorld(BEAR_BASE_X, 0, smooth !== false);
    }

    function requestCinematic(spec) {
      if (!spec) return;
      var c = clampTarget(spec.x != null ? spec.x : 0, spec.z != null ? spec.z : 0);
      var duration = Math.min(2.2, Math.max(0.35, spec.duration != null ? spec.duration : 0.9));
      var zoom = spec.zoom != null ? spec.zoom : null;
      var ox = camera.position.x - controls.target.x;
      var oy = camera.position.y - controls.target.y;
      var oz = camera.position.z - controls.target.z;
      if (Math.abs(ox) + Math.abs(oz) < 0.5) { ox = 0; oy = 38; oz = 48; }
      if (zoom != null && isFinite(zoom) && zoom > 0) {
        var len = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
        var scale = zoom / len;
        ox *= scale; oy *= scale; oz *= scale;
      }
      focusLerp = null;
      cinematic = {
        x: c.x, z: c.z,
        duration: duration,
        elapsed: 0,
        fromPos: camera.position.clone(),
        fromTarget: controls.target.clone(),
        toPos: new THREE.Vector3(c.x + ox, Math.max(16, oy), c.z + oz),
        toTarget: new THREE.Vector3(c.x, DEFAULT_TARGET_Y, c.z)
      };
    }

    /**
     * Approx world XZ rectangle visible under the camera for minimap.
     * Uses target + distance and FOV rather than a full frustum unproject.
     */
    function getViewportWorldRect() {
      var dist = camera.position.distanceTo(controls.target);
      var fov = (camera.fov || 43) * Math.PI / 180;
      var halfH = Math.tan(fov * 0.5) * dist;
      var aspect = camera.aspect || (16 / 9);
      var halfW = halfH * aspect;
      // Bias toward classic RTS look — slightly wider on X
      halfW *= 1.05;
      halfH *= 0.95;
      var cx = controls.target.x;
      var cz = controls.target.z;
      return {
        minX: cx - halfW,
        maxX: cx + halfW,
        minZ: cz - halfH,
        maxZ: cz + halfH,
        cx: cx,
        cz: cz
      };
    }

    function update(dt, keys, cameraShake) {
      var shake = cameraShake || 0;
      // Remove prior frame shake before pan/orbit so controls see a clean pose
      camera.position.sub(shakeOffset);
      shakeOffset.set(0, 0, 0);

      var userMoved = panWASD(dt, keys);
      if (userMoved) notifyUserInput();

      if (cinematic) applyCinematic(dt);
      else if (focusLerp) applyFocusFrame(dt);

      clampCameraToTarget();
      if (controls && controls.update) controls.update();

      // Apply shake AFTER OrbitControls so damping does not bake it into the orbit
      if (shake > 0.01) {
        shakeOffset.set(
          (Math.random() - 0.5) * shake * 0.14,
          (Math.random() - 0.5) * shake * 0.08,
          (Math.random() - 0.5) * shake * 0.06
        );
        camera.position.add(shakeOffset);
        shake *= 0.9;
      } else {
        shake = 0;
      }
      return shake;
    }

    // Wire OrbitControls user interaction → cancel cinematic
    if (controls) {
      controls.addEventListener('start', notifyUserInput);
    }
    if (domElement) {
      domElement.addEventListener('wheel', notifyUserInput, { passive: true });
      domElement.addEventListener('pointerdown', notifyUserInput, { passive: true });
    }

    // Ensure classic polar/distance limits remain (caller may have set; reinforce)
    if (controls) {
      if (controls.maxPolarAngle == null) controls.maxPolarAngle = Math.PI / 2.35;
      if (controls.minPolarAngle == null) controls.minPolarAngle = Math.PI / 4.3;
      if (controls.minDistance == null) controls.minDistance = 23;
      if (controls.maxDistance == null) controls.maxDistance = 82;
    }

    return {
      update: update,
      focusFrontline: focusFrontline,
      focusBullBase: focusBullBase,
      focusBearBase: focusBearBase,
      focusWorld: focusWorld,
      getViewportWorldRect: getViewportWorldRect,
      requestCinematic: requestCinematic,
      notifyUserInput: notifyUserInput,
      getBounds: function () { return Object.assign({}, bounds); },
      version: 'v8.6'
    };
  }

  global.LUNCBattle = global.LUNCBattle || {};
  global.LUNCBattle.cameraCtrl = { createApi: createApi, DEFAULT_BOUNDS: DEFAULT_BOUNDS };
})(window);
