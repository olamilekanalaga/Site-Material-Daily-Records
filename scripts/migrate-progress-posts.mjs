import {readFileSync,writeFileSync} from 'node:fs';

const path='source/src/data.json';
const data=JSON.parse(readFileSync(path,'utf8'));
const legacy=data.queries.progress_posts.rows;
if(legacy.every(row=>/^PROG-\d{3}$/.test(row.id))&&data.queries.activities){
 console.log(JSON.stringify({progressPosts:legacy.length,activities:data.queries.activities.rows.length,alreadyMigrated:true}));
 process.exit(0);
}
const chronologicalIds=[
 'progress-6038','progress-6037-a','progress-6037-b','progress-6039-a','progress-6039-b',
 'progress-6040','progress-6041','progress-6042','progress-6043','progress-6044','progress-6045',
 'progress-6046','progress-6047','progress-6048','progress-6049','progress-6050','progress-6036-a',
 'progress-6051','progress-6036-b','progress-6035-a','progress-6052-a','progress-6052-b',
 'progress-6053','progress-6035-b','progress-6054','progress-6055','progress-6056','progress-6057',
 'progress-6037-c'
];
const recordTypeByLegacyId={
 'progress-6036-a':'query_or_clarification',
 'progress-6041':'video_update','progress-6044':'video_update','progress-6045':'video_update',
 'progress-6047':'video_update','progress-6048':'video_update'
};
const tersePhotoUpdates=new Set(['progress-6037-a','progress-6042']);
const byLegacyId=new Map(legacy.map(row=>[row.id,row]));
const to24Hour=value=>{
 const match=/^(\d{1,2}):(\d{2}) (am|pm)$/.exec(value);
 if(!match) return '—';
 const hours=(Number(match[1])%12)+(match[3]==='pm'?12:0);
 return `${String(hours).padStart(2,'0')}:${match[2]}`;
};
const progressPosts=chronologicalIds.map((legacyId,index)=>{
 const row=byLegacyId.get(legacyId);
 if(!row) throw new Error(`Missing legacy row ${legacyId}`);
 const id=`PROG-${String(index+1).padStart(3,'0')}`;
 const descriptionStatus=row.descriptionStatus.replaceAll(' ','_');
 const recordType=recordTypeByLegacyId[legacyId]
  ?? (descriptionStatus!=='provided'||tersePhotoUpdates.has(legacyId)?'photo_update':'progress_update');
 return {
  id,date:row.date,day:row.day,dayLabel:'Thu 17 Sep',time:to24Hour(row.time),postedBy:row.postedBy,
  captionRaw:descriptionStatus==='not_confirmed'?'Description not confirmed':row.caption,
  recordType,mediaType:row.mediaType,attachmentCount:row.mediaType==='video'?1:row.photoCount,
  descriptionStatus,sourceEvidenceId:`EVID-IMG-${row.sourceScreenshot.match(/\d+/)?.[0]}`,
  sourceScreenshot:`private-site-progress-evidence/site-progress-source-images/${row.sourceScreenshot}`,
  contributorStatus:row.contributorConfirmed?'confirmed':'not_confirmed',
  attachmentCountStatus:row.photoCountStatus.replaceAll(' ','_'),evidenceNote:row.evidenceNote
 };
});
const newByLegacyId=new Map(chronologicalIds.map((legacyId,index)=>[legacyId,`PROG-${String(index+1).padStart(3,'0')}`]));
const activitySpecs=[
 ['progress-6038','Not stated','6F5 going in rolled and dipped','Documented'],
 ['progress-6040','Storage area','Storage area works','Nearly complete'],
 ['progress-6041','MH S35 to S34','Air test','Documented'],
 ['progress-6044','MH S30 to S36','Air test','Documented'],
 ['progress-6045','MH S29 to S30','Air test','Documented'],
 ['progress-6046','Not stated','Starting second layer of type 1 lay out for dozer','Documented'],
 ['progress-6047','F309-F308','Air test','Documented'],
 ['progress-6048','MH S28 to S29','Air test','Documented'],
 ['progress-6049','New compound area','Jetwashes moved','Documented'],
 ['progress-6050','Not stated','Septic tank being moved','Documented'],
 ['progress-6051','Not stated','Clearing geo grid','Documented'],
 ['progress-6035-b','Footpath','Footpath move','Ready to move']
];
const activities=activitySpecs.map(([legacyId,workArea,activity,status],index)=>{
 const post=progressPosts.find(row=>row.id===newByLegacyId.get(legacyId));
 return {id:`ACT-${String(index+1).padStart(3,'0')}`,linkedPostId:post.id,date:post.date,
  dayLabel:post.dayLabel,workArea,activity,status,
  evidence:`${post.attachmentCount} ${post.mediaType==='video'?'video':'photo'}${post.attachmentCount===1?'':'s'}`};
});
data.generatedAt=new Date().toISOString();
data.queries.progress_posts={
 rows:progressPosts,
 source:{label:'Owner-supplied Capstone progress photos WhatsApp screenshots',description:'Manual migration of 29 authoritative extracted WhatsApp posts from 23 private screenshots. One row represents one WhatsApp post. The owner confirmed that every post belongs to Thursday, 17 September 2026. Three cropped headers have no confirmed contributor. Photograph totals are a documented minimum because two posts are cropped. Five video thumbnails are recorded as video posts. Raw screenshots remain private and are referenced only by private evidence identifiers.',tables:[],metricDefinitions:[
  {label:'Progress posts',definition:'Count of distinct WhatsApp posts after review and deduplication. One post remains one row even when it contains several attachments.'},
  {label:'Photographs documented',definition:'Sum of attachmentCount for photo posts. Album counters are included; video attachments are excluded. Two cropped posts make the total a minimum.'},
  {label:'Contributors',definition:'Distinct confirmed WhatsApp display names. Three posts with cropped contributor headers are excluded.'},
  {label:'Record type',definition:'Caption-backed classification: progress update, photo update, query or clarification, or video update. It is not a work-performance category.'}
 ],filters:[]},
 methods:[{language:'text',code:'Migrate the existing reviewed extraction without re-reading or inventing posts. Normalize IDs to PROG-001 onward in chronological display order; normalize readable times to 24-hour HH:mm; retain an em dash for the cropped unknown time; preserve caption text and uncertainty notes; count photo attachments separately from video attachments; retain private source references without serving the screenshots. Owner confirmation controls the common date: 2026-09-17.'}]
};
data.queries.activities={rows:activities,source:{label:'Confirmed activities derived from progress-post captions',description:'Caption-only activity view. A row is included only when the WhatsApp caption explicitly identifies work or status. Missing work area is shown as Not stated. No activity, location, worker identity or completion state is inferred from photographs.',tables:[],metricDefinitions:[{label:'Confirmed activities',definition:'Progress posts whose caption explicitly states a work activity or status. Each row links back to one reviewed progress post.'}],filters:[]},methods:[{language:'text',code:'Review captionRaw only. Include a linked activity when the caption explicitly names work or a status. Preserve explicit places or asset references as workArea; otherwise use Not stated. Use Documented when the caption identifies work but does not state a status.'}]};
writeFileSync(path,JSON.stringify(data,null,2)+'\n','utf8');
console.log(JSON.stringify({progressPosts:progressPosts.length,activities:activities.length}));

