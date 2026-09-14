#!/usr/bin/env node
/**
 * LUNC Battlefield v9.3 — original tiny GLB writer (no third-party models).
 * Emits simple box meshes as binary glTF 2.0 for pipeline smoke tests.
 * Author: MrBryan007 — original procedural geometry only.
 */
'use strict';
const fs = require('fs');
const path = require('path');

function align4(n) { return (n + 3) & ~3; }

function encodeGLB(jsonObj, binBuffer) {
  const jsonStr = JSON.stringify(jsonObj);
  const jsonPad = align4(jsonStr.length) - jsonStr.length;
  const jsonBuf = Buffer.alloc(jsonStr.length + jsonPad, 0x20);
  jsonBuf.write(jsonStr, 0, 'utf8');

  const binPad = align4(binBuffer.length) - binBuffer.length;
  const binChunk = Buffer.concat([binBuffer, Buffer.alloc(binPad, 0)]);

  const totalLength = 12 + 8 + jsonBuf.length + 8 + binChunk.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546C67, 0); // glTF
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonHeader.writeUInt32LE(0x4E4F534A, 4); // JSON

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0);
  binHeader.writeUInt32LE(0x004E4942, 4); // BIN\0

  return Buffer.concat([header, jsonHeader, jsonBuf, binHeader, binChunk]);
}

/** Unit cube centered, y from 0..1 (standing on ground). */
function boxMesh(sx, sy, sz, colorRGB) {
  const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
  // 8 corners, y shifted so bottom sits at 0
  const y0 = 0, y1 = sy;
  const positions = new Float32Array([
    -hx, y0, -hz,  hx, y0, -hz,  hx, y0,  hz, -hx, y0,  hz,
    -hx, y1, -hz,  hx, y1, -hz,  hx, y1,  hz, -hx, y1,  hz
  ]);
  // flat normals approx via per-vertex (simple)
  const normals = new Float32Array([
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0
  ]);
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, // bottom
    4, 6, 5, 4, 7, 6, // top
    0, 4, 5, 0, 5, 1, // -z
    1, 5, 6, 1, 6, 2, // +x
    2, 6, 7, 2, 7, 3, // +z
    3, 7, 4, 3, 4, 0  // -x
  ]);

  const posBytes = Buffer.from(positions.buffer);
  const nrmBytes = Buffer.from(normals.buffer);
  const idxBytes = Buffer.from(indices.buffer);
  // pack: positions, normals, indices (aligned)
  let offset = 0;
  const posOff = offset; offset += align4(posBytes.length);
  const nrmOff = offset; offset += align4(nrmBytes.length);
  const idxOff = offset; offset += align4(idxBytes.length);
  const bin = Buffer.alloc(offset);
  posBytes.copy(bin, posOff);
  nrmBytes.copy(bin, nrmOff);
  idxBytes.copy(bin, idxOff);

  const r = colorRGB[0], g = colorRGB[1], b = colorRGB[2];
  const json = {
    asset: { version: '2.0', generator: 'LUNC-Battlefield-v9.3-original' },
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [{ mesh: 0, name: 'root' }],
    meshes: [{
      name: 'box',
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1 },
        indices: 2,
        material: 0
      }]
    }],
    materials: [{
      name: 'mat',
      pbrMetallicRoughness: {
        baseColorFactor: [r, g, b, 1],
        metallicFactor: 0.15,
        roughnessFactor: 0.7
      },
      emissiveFactor: [r * 0.08, g * 0.08, b * 0.08]
    }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3',
        max: [hx, y1, hz], min: [-hx, y0, -hz] },
      { bufferView: 1, componentType: 5126, count: 8, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: 36, type: 'SCALAR' }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: posOff, byteLength: posBytes.length, target: 34962 },
      { buffer: 0, byteOffset: nrmOff, byteLength: nrmBytes.length, target: 34962 },
      { buffer: 0, byteOffset: idxOff, byteLength: idxBytes.length, target: 34963 }
    ],
    buffers: [{ byteLength: bin.length }]
  };
  return encodeGLB(json, bin);
}

const ROOT = path.join(__dirname, '..', 'assets', 'models');
const specs = [
  // Tiny original smoke-test meshes only (not production art)
  { rel: 'units/unit_bull_infantry.glb', sx: 0.55, sy: 1.05, sz: 0.4, rgb: [0.28, 0.83, 0.60] },
  { rel: 'units/unit_bear_infantry.glb', sx: 0.55, sy: 1.05, sz: 0.4, rgb: [0.89, 0.40, 0.37] },
  { rel: 'vehicles/unit_bull_armor.glb', sx: 1.4, sy: 0.75, sz: 1.0, rgb: [0.28, 0.75, 0.55] },
  { rel: 'vehicles/unit_bear_armor.glb', sx: 1.4, sy: 0.75, sz: 1.0, rgb: [0.85, 0.35, 0.32] },
  { rel: 'artillery/unit_bull_artillery.glb', sx: 0.9, sy: 0.55, sz: 1.2, rgb: [0.30, 0.70, 0.50] },
  { rel: 'artillery/unit_bear_artillery.glb', sx: 0.9, sy: 0.55, sz: 1.2, rgb: [0.80, 0.32, 0.30] },
  { rel: 'structures/structure_bull_hq.glb', sx: 3.2, sy: 2.8, sz: 3.4, rgb: [0.35, 0.72, 0.55] },
  { rel: 'structures/structure_bear_hq.glb', sx: 3.5, sy: 2.6, sz: 2.5, rgb: [0.75, 0.38, 0.35] },
  { rel: 'props/prop_crate.glb', sx: 0.6, sy: 0.55, sz: 0.6, rgb: [0.45, 0.32, 0.20] },
  { rel: 'props/prop_barrel.glb', sx: 0.35, sy: 0.7, sz: 0.35, rgb: [0.25, 0.28, 0.22] },
  { rel: 'props/prop_rock.glb', sx: 0.8, sy: 0.45, sz: 0.7, rgb: [0.40, 0.40, 0.36] }
];

let total = 0;
specs.forEach(function (s) {
  const out = path.join(ROOT, s.rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const buf = boxMesh(s.sx, s.sy, s.sz, s.rgb);
  fs.writeFileSync(out, buf);
  total += buf.length;
  console.log(s.rel, buf.length + 'B');
});
console.log('Wrote', specs.length, 'original GLBs, total', total, 'bytes');
