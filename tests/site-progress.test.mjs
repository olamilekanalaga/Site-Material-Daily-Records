import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {displayTime,filterProgress,orderProgress,progressTotals} from '../source/src/content/dashboard/progress-model.mjs';
const data=JSON.parse(readFileSync(new URL('../source/src/data.json',import.meta.url),'utf8'));
const posts=data.queries.progress_posts.rows;
const activities=data.queries.activities.rows;

test('delivery tallies preserve earlier records and reconcile Monday without double-counting',()=>{
 const deliveries=data.queries.material_deliveries.rows;
 const total=rows=>rows.reduce((sum,row)=>sum+row.deliveries,0);
 assert.deepEqual(deliveries.slice(0,4).map(row=>[row.date,row.material,row.deliveries]),[
  ['2026-09-17','6F5 crushed concrete',7],
  ['2026-09-17','Type 1 / recycled Type 1',4],
  ['2026-09-18','6F5 crushed concrete',19],
  ['2026-09-18','Type 1',4]
 ]);
 const monday=deliveries.filter(row=>row.date==='2026-09-21');
 assert.equal(monday.length,12);
 assert.equal(total(monday),12);
 assert.equal(total(monday.filter(row=>row.materialGroup==='6F5 crushed concrete')),6);
 assert.equal(total(monday.filter(row=>row.materialGroup==='Type 1 / recycled Type 1')),6);
 assert.deepEqual(monday.filter(row=>row.materialGroup==='6F5 crushed concrete').map(row=>row.time),['08:45','10:40','10:58','—','—','—']);
 assert.deepEqual(monday.filter(row=>row.materialGroup==='Type 1 / recycled Type 1').map(row=>row.time),['09:30','10:40','10:42','—','—','—']);
 assert(monday.every(row=>row.deliveryCompany==='Not recorded'&&row.gate==='Second Gate'));
 assert.equal(total(deliveries),46);
 assert.equal(total(deliveries.filter(row=>row.materialGroup==='6F5 crushed concrete')),32);
 assert.equal(total(deliveries.filter(row=>row.materialGroup==='Type 1 / recycled Type 1')),14);
});

test('ambiguous material and service notes remain excluded from confirmed totals',()=>{
 const notes=data.queries.delivery_source_notes.rows;
 assert.equal(notes.length,4);
 assert(notes.every(row=>row.includedInConfirmedDeliveryTotals===false));
 assert.equal(notes.find(row=>row.id==='NOTE-2026-09-21-20MIL').wording,'20 mil single (3)');
 assert.equal(notes.find(row=>row.id==='NOTE-2026-09-21-20MIL').quantity,3);
 assert.equal(notes.find(row=>row.id==='NOTE-2026-09-21-20MIL').classificationStatus,'Awaiting confirmation');
 assert.equal(notes.find(row=>row.id==='NOTE-2026-09-21-TOILET').wording,'Toilet wash');
});
test('one row represents one WhatsApp post with normalized IDs and dates',()=>{
 assert.equal(posts.length,29);
 assert.deepEqual(posts.map(row=>row.id),Array.from({length:29},(_,index)=>`PROG-${String(index+1).padStart(3,'0')}`));
 assert(posts.every(row=>row.date==='2026-09-17'&&row.day==='Thursday'&&row.dayLabel==='Thu 17 Sep'));
 assert.equal(posts.filter(row=>row.date==='2026-09-18').length,0);
 assert(posts.every(row=>typeof row.sourceEvidenceId==='string'&&row.sourceScreenshot.startsWith('private-site-progress-evidence/')));
});

test('reviewed totals reconcile from the migrated posts',()=>{
 assert.deepEqual(progressTotals(posts),{updates:29,contributors:8,photos:52,withoutDescription:12,videos:5,minimum:true,unknownContributors:3});
 assert.equal(posts.filter(row=>row.mediaType==='video').reduce((sum,row)=>sum+row.attachmentCount,0),5);
 assert.equal(posts.filter(row=>row.descriptionStatus==='provided').length,17);
 assert.equal(posts.filter(row=>row.descriptionStatus==='not_provided').length,11);
 assert.equal(posts.filter(row=>row.descriptionStatus==='not_confirmed').length,1);
 assert.equal(posts.filter(row=>row.attachmentCountStatus==='minimum_visible').length,2);
 assert.deepEqual(Object.fromEntries(['progress_update','photo_update','query_or_clarification','video_update'].map(type=>[type,posts.filter(row=>row.recordType===type).length])),{progress_update:9,photo_update:14,query_or_clarification:1,video_update:5});
});

test('filters intersect and Friday produces a genuine empty population',()=>{
 assert.equal(filterProgress(posts,{date:'2026-09-17'}).length,29);
 assert.equal(filterProgress(posts,{date:'2026-09-18'}).length,0);
 assert.equal(filterProgress(posts,{contributor:'James Williams'}).length,3);
 assert.equal(filterProgress(posts,{recordType:'video_update'}).length,5);
 assert.equal(filterProgress(posts,{description:'with'}).length,17);
 assert.equal(filterProgress(posts,{description:'without'}).length,12);
 assert.equal(filterProgress(posts,{contributor:'James Williams',recordType:'photo_update'}).length,2);
 assert.equal(filterProgress(posts,{search:' AIR TEST '}).length,5);
 assert.equal(filterProgress(posts).length,29);
});

test('chronological order and human time formatting retain the unknown time',()=>{
 const ordered=orderProgress(posts);
 assert.equal(ordered[0].id,'PROG-001');
 assert.equal(ordered[0].time,'08:36');
 assert.equal(displayTime(ordered[0].time),'8:36 am');
 assert.equal(ordered.at(-1).id,'PROG-029');
 assert.equal(ordered.at(-1).time,'—');
 assert.equal(displayTime(ordered.at(-1).time),'—');
});

test('activities are caption-only and link to reviewed progress posts',()=>{
 assert.equal(activities.length,12);
 const postIds=new Set(posts.map(row=>row.id));
 assert(activities.every(row=>postIds.has(row.linkedPostId)));
 assert(activities.every(row=>!['Description not provided','Description not confirmed'].includes(posts.find(post=>post.id===row.linkedPostId).captionRaw)));
 assert.deepEqual(activities.find(row=>row.linkedPostId==='PROG-001'),{id:'ACT-001',linkedPostId:'PROG-001',date:'2026-09-17',dayLabel:'Thu 17 Sep',workArea:'Not stated',activity:'6F5 going in rolled and dipped',status:'Documented',evidence:'13 photos'});
});

test('public data has no phone numbers and raw evidence is not a public URL',()=>{
 assert(!/(?:\+44|\b07\d{3})[\s\d-]{7,}/.test(JSON.stringify(data)));
 assert(posts.every(row=>!/^https?:|^\//.test(row.sourceScreenshot)));
 assert(posts.every(row=>!Object.keys(row).some(key=>/phone|telephone|contact|productivity|tonnage|worker|completion/i.test(key))));
});
