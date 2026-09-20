import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const expectedDeliveries=[
 ['2026-09-17','Thursday','—','6F5 crushed concrete',7,'LIME LOGISTICS','Second Gate'],
 ['2026-09-17','Thursday','—','Type 1 / recycled Type 1',4,'LIME LOGISTICS','Second Gate'],
 ['2026-09-18','Friday','—','6F5 crushed concrete',19,'LIME LOGISTICS','Second Gate'],
 ['2026-09-18','Friday','—','Type 1',4,'LIME LOGISTICS','Second Gate']
];
function verify(data){
 const deliveries=data.queries.material_deliveries.rows;
 assert.deepEqual(deliveries.map(row=>[row.date,row.day,row.time,row.material,row.deliveries,row.deliveryCompany,row.gate]),expectedDeliveries);
 const sum=rows=>rows.reduce((total,row)=>total+row.deliveries,0);
 assert.equal(sum(deliveries.filter(row=>row.date==='2026-09-17')),11);
 assert.equal(sum(deliveries.filter(row=>row.date==='2026-09-18')),23);
 assert.equal(sum(deliveries),34);
 assert.equal(sum(deliveries.filter(row=>row.materialGroup==='6F5 crushed concrete')),26);
 assert.equal(sum(deliveries.filter(row=>row.materialGroup==='Type 1 / recycled Type 1')),8);
 assert.deepEqual(Object.keys(data.queries).sort(),['activities','day_register','material_deliveries','progress_posts']);
 const posts=data.queries.progress_posts.rows;
 assert.equal(posts.length,29);
 assert(posts.every(row=>row.date==='2026-09-17'&&row.day==='Thursday'));
 assert.equal(posts.filter(row=>row.date==='2026-09-18').length,0);
 assert.equal(new Set(posts.filter(row=>row.contributorStatus==='confirmed').map(row=>row.postedBy)).size,8);
 assert.equal(posts.filter(row=>row.mediaType==='photo').reduce((total,row)=>total+row.attachmentCount,0),52);
 assert.equal(posts.filter(row=>row.mediaType==='video').length,5);
 assert.equal(data.queries.activities.rows.length,12);
 assert(data.queries.activities.rows.every(row=>posts.some(post=>post.id===row.linkedPostId)));
 assert(!/(?:\+44|\b07\d{3})[\s\d-]{7,}/.test(JSON.stringify(data)),'No contact numbers in packaged data');
 assert(data.queries.day_register.rows.every(row=>row.siteHours==='7:00am–5:30pm'));
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
assert(compiledText.includes('No progress posts recorded for Friday 18 September 2026.'));
console.log('Verified source + compiled export: deliveries 11 + 23 = 34; 29 Thursday progress posts; 8 contributors; 52 photos; 5 video posts; Friday progress empty.');
