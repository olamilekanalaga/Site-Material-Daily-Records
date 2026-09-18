import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const expected = [
 ['2026-09-17','Thursday','—','6F5 crushed concrete',7,'LIME LOGISTICS','Second Gate'],
 ['2026-09-17','Thursday','—','Type 1 / recycled Type 1',4,'LIME LOGISTICS','Second Gate'],
 ['2026-09-18','Friday','—','6F5 crushed concrete',17,'LIME LOGISTICS','Second Gate'],
 ['2026-09-18','Friday','—','Type 1',4,'LIME LOGISTICS','Second Gate']
];
function verify(data) {
 const rows=data.queries.material_deliveries.rows;
 assert.deepEqual(rows.map(r=>[r.date,r.day,r.time,r.material,r.deliveries,r.deliveryCompany,r.gate]),expected);
 const sum=rs=>rs.reduce((n,r)=>n+r.deliveries,0);
 assert.equal(sum(rows.filter(r=>r.date==='2026-09-17')),11);
 assert.equal(sum(rows.filter(r=>r.date==='2026-09-18')),21);
 assert.equal(sum(rows),32);
 assert.equal(sum(rows.filter(r=>r.materialGroup==='6F5 crushed concrete')),24);
 assert.equal(sum(rows.filter(r=>r.materialGroup==='Type 1 / recycled Type 1')),8);
 assert.equal(new Set(rows.map(r=>r.materialGroup)).size,2);
 assert(rows.every(r=>!Object.keys(r).some(k=>/tonnes|tonnage|weight/i.test(k))));
 assert.equal(data.queries.delivery_notes,undefined);
 assert.deepEqual(Object.keys(data.queries).sort(),['day_register','material_deliveries']);
 assert.deepEqual(data.queries.day_register.rows.map(r=>[r.date,r.status]),[['2026-09-17','Recorded'],['2026-09-18','Recorded']]);
 assert.equal(data.buildStatus,'complete');
}
const source=JSON.parse(readFileSync('source/src/data.json','utf8'));
const html=readFileSync('public/index.html','utf8');
const match=html.match(/<script[^>]*id="data-app-reviewed-snapshot"[^>]*>([\s\S]*?)<\/script>/);
assert(match,'Compiled export must contain the reviewed snapshot');
const embedded=JSON.parse(match[1]);
verify(source); verify(embedded);
assert.deepEqual(embedded,source,'Export must exactly match the reviewed source data');
const compiledText = html + [...html.matchAll(/data:text\/javascript;charset=utf-8;base64,([A-Za-z0-9+/=]+)/g)].map(m=>Buffer.from(m[1],'base64').toString('utf8')).join('\n');
for(const oldNote of ['10:29am','10:38am','11:01am','12:56pm','Friday is pending.','Friday pending','Recorded time notes']) assert(!compiledText.includes(oldNote),`Stale content: ${oldNote}`);
assert(compiledText.includes('Number of deliveries'));
console.log('Verified source + compiled export: Thursday 11, Friday 21, total 32; material totals 24 + 8; four exact tally rows; no old time notes or weight fields.');
