// Commander progression persistence tests.
// Run: node tests/progression-persist.js
const assert = require('assert');

const RANKS = [
  { xp: 0, name: 'Recruit' }, { xp: 300, name: 'Private' }, { xp: 800, name: 'Corporal' },
  { xp: 1600, name: 'Sergeant' }, { xp: 3000, name: 'Lieutenant' }, { xp: 5000, name: 'Captain' },
  { xp: 8000, name: 'Major' }, { xp: 12000, name: 'Colonel' }, { xp: 18000, name: 'General' },
  { xp: 26000, name: 'Validator General' }
];

function rankFor(xp) {
  var r = RANKS[0], idx = 0;
  for (var i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) { r = RANKS[i]; idx = i; }
  var next = RANKS[idx + 1] || null;
  return { idx: idx, name: r.name, floor: r.xp, next: next ? next.xp : null };
}

function defaultProfile() {
  return { schemaVersion: 1, xp: 0, best: 0, side: 'bull', seenIntro: false, bestStreak: 0, promotions: [], lastSavedAt: null };
}

function migratePlayerProgress(save) {
  if (!save || typeof save !== 'object') return null;
  var out = defaultProfile();
  var xp = Number(save.xp);
  if (isFinite(xp) && xp >= 0) out.xp = Math.floor(xp);
  else return null;
  var best = Number(save.best);
  if (isFinite(best) && best >= 0) out.best = Math.floor(best);
  if (save.side === 'bull' || save.side === 'bear') out.side = save.side;
  if (typeof save.seenIntro === 'boolean') out.seenIntro = save.seenIntro;
  var streak = Number(save.bestStreak);
  if (isFinite(streak) && streak >= 0) out.bestStreak = Math.floor(streak);
  if (Array.isArray(save.promotions)) {
    out.promotions = save.promotions.filter(function (x) { return typeof x === 'string'; }).slice(0, 20);
  }
  out.schemaVersion = 1;
  out.lastSavedAt = (typeof save.lastSavedAt === 'string') ? save.lastSavedAt : null;
  return out;
}

// In-memory store simulating localStorage
var store = {};
function getItem(k) { return store[k] || null; }
function setItem(k, v) { store[k] = v; }
function removeItem(k) { delete store[k]; }

const STORE = 'luncBattlefield.playerProgress';
const BACKUP = 'luncBattlefield.playerProgress.backup';

function saveProfile(profile) {
  var prev = getItem(STORE);
  if (prev) setItem(BACKUP, prev);
  setItem(STORE, JSON.stringify(profile));
}

function loadProfile() {
  var raw = getItem(STORE);
  if (!raw) return defaultProfile();
  try {
    var parsed = JSON.parse(raw);
    return migratePlayerProgress(parsed) || defaultProfile();
  } catch (_) { return defaultProfile(); }
}

let failed = 0;
function check(name, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name);
  if (!ok) failed++;
}

// TEST 1 — NORMAL SAVE
store = {};
var p = defaultProfile();
p.xp = 300;
p.rank = rankFor(p.xp).idx;
saveProfile(p);
var loaded = loadProfile();
check('TEST 1 normal save rank 2', loaded.xp === 300 && rankFor(loaded.xp).name === 'Private');

// TEST 2 — MULTIPLE RANKS
store = {};
p = defaultProfile();
p.xp = 5200;
saveProfile(p);
loaded = loadProfile();
check('TEST 2 multi rank exact xp', loaded.xp === 5200 && rankFor(loaded.xp).name === 'Captain');

// TEST 3 — PAGE REFRESH
store = {};
p = defaultProfile();
p.xp = 900;
saveProfile(p);
loaded = loadProfile();
check('TEST 3 refresh keeps xp', loaded.xp === 900 && rankFor(loaded.xp).name === 'Corporal');

// TEST 4 — NEW SESSION
store = {};
p = defaultProfile();
p.xp = 1600;
saveProfile(p);
// simulate close/reopen: new empty runtime, load from store
loaded = loadProfile();
check('TEST 4 new session restores', loaded.xp === 1600 && rankFor(loaded.xp).name === 'Sergeant');

// TEST 5 — RANK-UP THEN IMMEDIATE REFRESH
store = {};
p = defaultProfile();
p.xp = 2900;
var before = rankFor(p.xp);
p.xp += 200;
var after = rankFor(p.xp);
if (after.idx > before.idx) p.promotions.push(after.name);
saveProfile(p);
loaded = loadProfile();
check('TEST 5 rank-up then refresh', loaded.xp === 3100 && rankFor(loaded.xp).name === 'Lieutenant');

// TEST 6 — BUILD UPDATE
store = {};
p = defaultProfile();
p.xp = 5000;
p.buildVersion = 'v12.0.62';
saveProfile(p);
// change build metadata — save should still load
loaded = loadProfile();
check('TEST 6 build update keeps progress', loaded.xp === 5000 && rankFor(loaded.xp).name === 'Captain');

// TEST 7 — CORRUPTED OPTIONAL FIELD
store = {};
var bad = { xp: 800, best: 'not-a-number', side: 'bull', promotions: 'nope', lastSavedAt: 123 };
var recovered = migratePlayerProgress(bad);
check('TEST 7 corrupt optional recovered', recovered && recovered.xp === 800 && rankFor(recovered.xp).name === 'Corporal' && Array.isArray(recovered.promotions));

// TEST 8 — INVALID XP
check('TEST 8 negative rejected', migratePlayerProgress({ xp: -10 }) === null);
check('TEST 8 NaN rejected', migratePlayerProgress({ xp: NaN }) === null);
check('TEST 8 Infinity rejected', migratePlayerProgress({ xp: Infinity }) === null);
check('TEST 8 string injection rejected', migratePlayerProgress({ xp: '<script>alert(1)</script>' }) === null);

// TEST 9 — EMPTY STORAGE
store = {};
loaded = loadProfile();
check('TEST 9 empty starts at default', loaded.xp === 0 && rankFor(loaded.xp).name === 'Recruit');

// TEST 10 — RESET
store = {};
p = defaultProfile();
p.xp = 1600;
saveProfile(p);
// cancel
var cancelled = false;
function resetProgress(confirmFn) {
  if (!confirmFn()) return false;
  p = defaultProfile();
  saveProfile(p);
  return true;
}
check('TEST 10 cancel keeps progress', resetProgress(function () { return false; }) === false && loadProfile().xp === 1600);
check('TEST 10 confirm resets', resetProgress(function () { return true; }) === true && loadProfile().xp === 0);

// Backup exists after second save
store = {};
saveProfile({ schemaVersion: 1, xp: 100, best: 0, side: 'bull', seenIntro: false, bestStreak: 0, promotions: [], lastSavedAt: null });
saveProfile({ schemaVersion: 1, xp: 400, best: 0, side: 'bull', seenIntro: false, bestStreak: 0, promotions: [], lastSavedAt: null });
check('backup written', !!getItem(BACKUP) && JSON.parse(getItem(BACKUP)).xp === 100);

console.log('');
console.log(failed ? ('FAILED ' + failed) : 'ALL PASS');
process.exit(failed ? 1 : 0);
