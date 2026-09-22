import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const preservedDeliveries=[
 ['2026-09-17','Thursday','—','6F5 crushed concrete',7,'LIME LOGISTICS','Second Gate'],
 ['2026-09-17','Thursday','—','Type 1 / recycled Type 1',4,'LIME LOGISTICS','Second Gate'],
 ['2026-09-18','Friday','—','6F5 crushed concrete',19,'LIME LOGISTICS','Second Gate'],
 ['2026-09-18','Friday','—','Type 1',4,'LIME LOGISTICS','Second Gate']
];
function verify(data){
 const deliveries=data.queries.material_deliveries.rows;
 const values=row=>[row.date,row.day,row.time,row.material,row.deliveries,row.deliveryCompany,row.gate];
 assert.deepEqual(deliveries.slice(0,4).map(values),preservedDeliveries);
 const sum=rows=>rows.reduce((total,row)=>total+row.deliveries,0);
 assert.equal(sum(deliveries.filter(row=>row.date==='2026-09-17')),11);
 assert.equal(sum(deliveries.filter(row=>row.date==='2026-09-18')),23);
 const monday=deliveries.filter(row=>row.date==='2026-09-21');
 assert.equal(monday.length,12);
 assert.equal(sum(monday),12);
 assert.deepEqual(monday.filter(row=>row.materialGroup==='6F5 crushed concrete').map(row=>row.time),['08:45','10:40','10:58','—','—','—']);
 assert.deepEqual(monday.filter(row=>row.materialGroup==='Type 1 / recycled Type 1').map(row=>row.time),['09:30','10:40','10:42','—','—','—']);
 assert(monday.every(row=>row.deliveryCompany==='Not recorded'&&row.gate==='Second Gate'));
 assert.equal(sum(deliveries),46);
 assert.equal(sum(deliveries.filter(row=>row.materialGroup==='6F5 crushed concrete')),32);
 assert.equal(sum(deliveries.filter(row=>row.materialGroup==='Type 1 / recycled Type 1')),14);
 assert.deepEqual(Object.keys(data.queries).sort(),['activities','day_register','delivery_source_notes','material_deliveries','progress_posts']);
 const notes=data.queries.delivery_source_notes.rows;
 assert.equal(notes.length,4);
 assert(notes.every(row=>row.includedInConfirmedDeliveryTotals===false));
 assert.equal(notes.find(row=>row.id==='NOTE-2026-09-21-20MIL').wording,'20 mil single (3)');
 assert.equal(notes.find(row=>row.id==='NOTE-2026-09-21-TOILET').wording,'Toilet wash');
 const mondayDay=data.queries.day_register.rows.find(row=>row.date==='2026-09-21');
 assert(mondayDay&&!Object.hasOwn(mondayDay,'siteHours'));
 const posts=data.queries.progress_posts.rows;
 assert.equal(posts.length,29);
 assert(posts.every(row=>row.date==='2026-09-17'&&row.day==='Thursday'));
 assert.equal(new Set(posts.filter(row=>row.contributorStatus==='confirmed').map(row=>row.postedBy)).size,8);
 assert.equal(posts.filter(row=>row.mediaType==='photo').reduce((total,row)=>total+row.attachmentCount,0),52);
 assert.equal(posts.filter(row=>row.mediaType==='video').length,5);
 assert.equal(data.queries.activities.rows.length,12);
 assert(data.queries.activities.rows.every(row=>posts.some(post=>post.id===row.linkedPostId)));
 assert(!/(?:\+44|\b07\d{3})[\s\d-]{7,}/.test(JSON.stringify(data)),'No contact numbers in packaged data');
 assert.equal(data.buildStatus,'complete');
}
const source=JSON.parse(readFileSync('source/src/data.json','utf8'));
const html=readFileSync('public/index.html','utf8');
const match=html.match(/<script[^>]*id="data-app-reviewed-snapshot"[^>]*>([\s\S]*?)<\/script>/);
assert(match,'Compiled export must contain the reviewed snapshot');
const embedded=JSON.parse(match[1]);
verify(source);verify(embedded);
assert.deepEqual(embedded,source,'Export must exactly match the reviewed source data');
const compiledText=html+[...html.matchAll(/data:text\/javascript;charset=utf-8;base64,([A-Za-z0-9+/=]+)/g)].map(match=>Buffer.from(match[1],'base64').toString('utf8')).join('\n');
for(const stale of ['site_progress','progress-6038','Recorded time notes','Friday is pending.']) assert(!compiledText.includes(stale),`Stale content: ${stale}`);
assert(compiledText.includes('Progress Post Register'));
assert(compiledText.includes('Confirmed activities from captions'));
assert(compiledText.includes('Source notes awaiting clarification'));
assert(compiledText.includes('No progress posts recorded for Friday 18 September 2026.'));
console.log('Verified export: 11 + 23 + 12 = 46 deliveries; 32 6F5 + 14 Type 1; 29 Thursday progress posts; ambiguous Monday notes excluded.');
