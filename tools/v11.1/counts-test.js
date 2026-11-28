// old inline formula (66dd6f1 battle-engine.js L449-459) vs new armyCounts() extracted from source
const fs=require('fs');
const src=fs.readFileSync('/workspace/LUNC-Battlefield/js/battle-engine.js','utf8');
const body=src.slice(src.indexOf('function armyCounts(wall) {'), src.indexOf('let lastArmyKey'));
function oldCounts(wall, innerWidth){const mobile=innerWidth<760;const maxInf=mobile?28:52, maxArmor=mobile?9:18, maxArt=mobile?5:9;const maxHeli=mobile?2:4, maxJet=mobile?1:3;
 return {inf: Math.min(maxInf, Math.max(14,Math.round(14+wall*5.2))),armor: Math.min(maxArmor,Math.max(4,Math.round(3+wall*1.85))),art: Math.min(maxArt,Math.max(2,Math.round(2+wall*.95))),heli: Math.min(maxHeli, Math.max(mobile?1:2, Math.round((mobile?1:2)+wall*0.35))),jet: Math.min(maxJet, Math.max(mobile?1:1, Math.round((mobile?1:1)+wall*0.28)))};}
let n=0,bad=0;
for (const w of [390,759,760,1280,1920]) { const newCounts=new Function('innerWidth', body+'; return armyCounts;')(w);
 for (let wall=0; wall<=12.5; wall+=0.0137){ n++; if (JSON.stringify(oldCounts(wall,w))!==JSON.stringify(newCounts(wall))) bad++; } }
console.log('armyCounts cases', n, 'mismatches', bad);
