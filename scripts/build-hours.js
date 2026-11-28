#!/usr/bin/env node
/* Regenerates build-hours.html from data/build-hours.json (real phase timestamps logged by the daily AI build).
 * Usage: node scripts/build-hours.js                     → regenerate the page
 *        node scripts/build-hours.js add <date> <activity> <startISO> <endISO> [cycle]  → append a record, then regenerate */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..'), DATA = path.join(ROOT, 'data', 'build-hours.json'), OUT = path.join(ROOT, 'build-hours.html');
var TARGET = { min: 2, max: 4 }, ACTS = ['planning', 'building', 'testing', 'deploying'];
function load() { try { return JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch (_) { return { target: TARGET, unit: 'hours', note: 'Real clock timestamps per phase (America/Los_Angeles). Never estimated.', records: [] }; } }
function save(d) { fs.mkdirSync(path.dirname(DATA), { recursive: true }); fs.writeFileSync(DATA, JSON.stringify(d, null, 2) + '\n'); }
function r2(x) { return Math.round(x * 100) / 100; }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function fmtH(h) { var m = Math.round(h * 60); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; }
function band(h) { return h < TARGET.min ? 'under' : h > TARGET.max ? 'over' : 'on'; }
var args = process.argv.slice(2), d = load();
if (args[0] === 'add') {
  var start = new Date(args[3]), end = new Date(args[4]);
  if (isNaN(start) || isNaN(end) || end < start) { console.error('bad timestamps'); process.exit(1); }
  var rec = { date: args[1] };
  if (args[5]) rec.cycle = +args[5];
  Object.assign(rec, { activity: args[2], start: args[3], end: args[4], hours: r2((end - start) / 3600000) });
  d.records.push(rec);
  save(d);
}
var byDay = {};
d.records.forEach(function (r) { var o = byDay[r.date] = byDay[r.date] || { total: 0, acts: {} }; o.total += r.hours; o.acts[r.activity] = (o.acts[r.activity] || 0) + r.hours; });
var days = Object.keys(byDay).sort().slice(-30);
var maxH = Math.max(TARGET.max + 0.5, Math.max.apply(null, days.map(function (k) { return byDay[k].total; }).concat([0])));
var COL = { planning: '#5ab4ff', building: '#d7b56d', testing: '#7cf0a8', deploying: '#ff8a80' };
var bars = days.map(function (k) {
  var o = byDay[k], segs = ACTS.map(function (a) { var h = o.acts[a] || 0; return h ? '<i style="height:' + (h / maxH * 100).toFixed(2) + '%;background:' + COL[a] + '" title="' + a + ' ' + fmtH(h) + '"></i>' : ''; }).join('');
  return '<div class="bar"><div class="stack">' + segs + '</div><span class="lbl">' + k.slice(5) + '</span><span class="tot ' + band(o.total) + '">' + r2(o.total) + 'h</span></div>';
}).join('');
var bandStyle = 'bottom:' + (TARGET.min / maxH * 100).toFixed(2) + '%;height:' + ((TARGET.max - TARGET.min) / maxH * 100).toFixed(2) + '%';
var rows = days.slice().reverse().map(function (k) {
  var o = byDay[k];
  return '<tr><td>' + k + '</td>' + ACTS.map(function (a) { return '<td>' + (o.acts[a] ? fmtH(o.acts[a]) : '—') + '</td>'; }).join('') + '<td><b>' + fmtH(o.total) + '</b></td><td class="' + band(o.total) + '">' + band(o.total).toUpperCase() + '</td></tr>';
}).join('');
var log = d.records.slice().reverse().slice(0, 60).map(function (r) { return '<tr><td>' + esc(r.date) + '</td><td>' + esc(r.activity) + '</td><td>' + esc(r.start) + '</td><td>' + esc(r.end) + '</td><td>' + r.hours + '</td></tr>'; }).join('');
var html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>LUNC Battlefield — daily build hours</title><style>' +
  'body{margin:0;background:#0b1410;color:#dfe7e1;font:14px/1.45 Inter,system-ui,sans-serif;padding:18px}h1{font:700 20px Rajdhani,Inter,sans-serif;letter-spacing:1px;color:#d7b56d;margin:0 0 4px}' +
  '.sub{color:#9aa59d;font-size:12px;margin-bottom:16px}.chart{position:relative;display:flex;align-items:flex-end;gap:6px;height:220px;padding:0 4px 34px;border-bottom:1px solid #2a3a30;overflow-x:auto}' +
  '.band{position:absolute;left:0;right:0;background:rgba(124,240,168,.08);border-top:1px dashed #3d6b52;border-bottom:1px dashed #3d6b52;pointer-events:none;margin-bottom:34px}' +
  '.bar{position:relative;flex:0 0 34px;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center}.stack{width:22px;height:100%;display:flex;flex-direction:column-reverse}.stack i{display:block;width:100%}' +
  '.lbl{position:absolute;bottom:-30px;font-size:10px;color:#9aa59d}.tot{position:absolute;bottom:-16px;font-size:10px}.under{color:#5ab4ff}.on{color:#7cf0a8}.over{color:#ff8a80}' +
  '.legend{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;margin:10px 0 18px}.legend span:before{content:"";display:inline-block;width:10px;height:10px;margin-right:5px;vertical-align:-1px;background:var(--c)}' +
  'table{border-collapse:collapse;width:100%;font-size:12px;margin-bottom:18px}th,td{text-align:left;padding:5px 6px;border-bottom:1px solid #1f2b24}th{color:#d7b56d;font-weight:600}a{color:#d7b56d}h2{font:700 14px Inter,sans-serif;color:#d7b56d;margin:18px 0 6px}' +
  '</style></head><body><h1>DAILY BUILD HOURS</h1><div class="sub">Automated daily AI build of LUNC Battlefield. Real clock timestamps per phase (Pacific time), never estimated. Target band ' + TARGET.min + '–' + TARGET.max + ' h/day. Last ' + days.length + ' of up to 30 days. <a href="./">← Back to the battlefield</a></div>' +
  '<div class="chart"><div class="band" style="' + bandStyle + '" title="2–4 h target"></div>' + (bars || '<div class="sub">No builds logged yet.</div>') + '</div>' +
  '<div class="legend">' + ACTS.map(function (a) { return '<span style="--c:' + COL[a] + '">' + a + '</span>'; }).join('') + '<span style="--c:rgba(124,240,168,.25)">2–4 h target</span></div>' +
  '<h2>Per day</h2><table><thead><tr><th>Date</th>' + ACTS.map(function (a) { return '<th>' + a + '</th>'; }).join('') + '<th>Total</th><th>vs target</th></tr></thead><tbody>' + rows + '</tbody></table>' +
  '<h2>Phase log</h2><table><thead><tr><th>Date</th><th>Activity</th><th>Start</th><th>End</th><th>Hours</th></tr></thead><tbody>' + log + '</tbody></table>' +
  '<div class="sub">Source: <a href="data/build-hours.json">data/build-hours.json</a></div></body></html>\n';
fs.writeFileSync(OUT, html);
console.log('build-hours.html: ' + days.length + ' day(s), ' + d.records.length + ' record(s)' + (days.length ? '; ' + days[days.length - 1] + ' total ' + r2(byDay[days[days.length - 1]].total) + ' h (' + band(byDay[days[days.length - 1]].total) + ')' : ''));
