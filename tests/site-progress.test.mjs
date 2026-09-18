import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {filterProgress,progressTotals,contributorSummary,orderProgress} from '../source/src/content/dashboard/progress-model.mjs';
const data=JSON.parse(readFileSync(new URL('../source/src/data.json',import.meta.url),'utf8'));
const rows=data.queries.site_progress.rows;
test('delivery tallies remain unchanged and Friday hours match owner confirmation',()=>{
 const before=JSON.parse(execFileSync('git',['show','HEAD:source/src/data.json'],{encoding:'utf8'}));
 assert.deepEqual(data.queries.material_deliveries,before.queries.material_deliveries);
 const expectedDays=before.queries.day_register.rows.map(r=>({...r,siteHours:'7:00am–5:30pm'}));
 assert.deepEqual(data.queries.day_register.rows,expectedDays);
});
test('reviewed source counts and album arithmetic reconcile',()=>{
 assert.deepEqual(progressTotals(rows),{updates:29,contributors:8,photos:52,withoutDescription:12,videos:5,minimum:true,unknownContributors:3});
 assert.equal(new Set(rows.map(r=>r.id)).size,29);
 assert.equal(new Set(rows.map(r=>r.sourceScreenshot)).size,23);
 assert.equal(rows.find(r=>r.id==='progress-6038').photoCount,3+10);
 assert.equal(rows.find(r=>r.id==='progress-6042').photoCount,3+6);
 assert(rows.filter(r=>r.mediaType==='video').every(r=>r.photoCount===0));
});
test('filters intersect, search ignores case, and reset restores all records',()=>{
 assert.equal(filterProgress(rows,{contributor:'James Williams'}).length,3);
 assert.equal(progressTotals(filterProgress(rows,{contributor:'James Williams'})).photos,23);
 assert.equal(filterProgress(rows,{contributor:'James Williams',description:'without'}).length,1);
 assert.equal(filterProgress(rows,{description:'with'}).length,17);
 assert.equal(filterProgress(rows,{description:'without'}).length,12);
 assert.equal(filterProgress(rows,{search:' AIR TEST '}).length,5);
 assert.equal(filterProgress(rows,{date:'2026-09-18'}).length,0);
 assert.equal(filterProgress(rows,{date:'2026-09-17'}).length,29);
 assert.equal(filterProgress(rows).length,29);
});
test('owner-confirmed dates and latest documented dates are used',()=>{
 assert(rows.every(r=>r.date==='2026-09-17'&&r.day==='Thursday'));
 assert.equal(rows.filter(r=>r.time==='—').length,1);
 const summary=contributorSummary(rows);
 assert.equal(summary.length,8);
 assert(summary.every(r=>r.latest==='17 Sep 2026'));
 assert.equal(summary.reduce((n,r)=>n+r.updates,0),26);
 assert.equal(summary.reduce((n,r)=>n+r.photos,0),47);
 assert.equal(summary.find(r=>r.name==='Dave').photosLabel,'≥ 5');
 assert.equal(orderProgress(rows)[0].time,'8:36 am');
 assert.equal(orderProgress(rows).at(-1).time,'—');
});
test('public-facing records omit phone numbers, contacts and inferred work metrics',()=>{
 assert(!/(?:\+44|\b07\d{3})[\s\d-]{7,}/.test(JSON.stringify(data)));
 for(const r of rows) assert(!Object.keys(r).some(k=>/phone|telephone|contact|productivity|tonnage|worker|completion/i.test(k)));
 assert(rows.filter(r=>!r.hasDescription).every(r=>r.caption==='Description not provided'));
});
test('same-minute but distinct messages are preserved',()=>{
 assert.equal(rows.filter(r=>r.postedBy==='ryancarnia'&&r.time==='10:20 am').length,2);
 assert.equal(rows.filter(r=>r.postedBy==='DHAN BABA DEEP SINGH JI'&&r.time==='4:56 pm').length,2);
});
