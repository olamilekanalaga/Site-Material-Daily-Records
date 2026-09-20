import React,{useState} from 'react';
import {DataComponent,Dialog,Dropdown,SortableItem,SortableRegion,useDataApp} from '../../data-app-public.jsx';
import {displayTime,filterProgress,orderProgress,progressTotals,recordTypeLabel} from './progress-model.mjs';
import {evidencePreviews} from './evidence-previews.js';
const QUERY='progress_posts';
const ACTIVITY_QUERY='activities';
const dateLabels={all:'All progress posts','2026-09-17':'Thursday 17 September','2026-09-18':'Friday 18 September'};
const dateLabel=value=>dateLabels[value]??value;
const mediaLabel=row=>row.mediaType==='video'?'Video':'Photos';
function Metric({id,label,value,note,rows}){
 return <DataComponent id={id} queryId={QUERY} title={label} kind="metric" variant="card" sourceRows={rows} displayRows={[{label,value}]}><div className="progress-metric" data-reviewed-rows><strong>{value}</strong><span>{note}</span></div></DataComponent>;
}
export function OverviewContent(){
 const {queries,exploreDashboard}=useDataApp();
 const deliveries=queries.material_deliveries.rows;
 const posts=queries[QUERY]?.rows??[];
 const total=progressTotals(posts);
 return <section className="progress-page"><header className="progress-heading"><h2>Site records overview</h2><p>Material arrivals and WhatsApp progress evidence</p></header>
  <div className="overview-cards">
   <DataComponent id="overview-deliveries" queryId="material_deliveries" title="Material deliveries" kind="metric" variant="card" sourceRows={deliveries} displayRows={[{deliveries:deliveries.reduce((sum,row)=>sum+row.deliveries,0)}]}><div className="progress-metric" data-reviewed-rows><strong>{deliveries.reduce((sum,row)=>sum+row.deliveries,0)}</strong><span>LIME LOGISTICS · Second Gate<br/>17–18 September 2026</span></div><button className="progress-link" onClick={()=>exploreDashboard('deliveries')}>Open Deliveries →</button></DataComponent>
   <Metric id="overview-progress" label="Site progress posts" value={total.updates} note={`${total.contributors} confirmed display names · Thursday 17 September`} rows={posts}/>
   <Metric id="overview-photos" label="Photographic evidence" value={`${total.minimum?'≥ ':''}${total.photos}`} note={`${total.videos} video posts recorded separately`} rows={posts}/>
  </div>
  <div className="progress-separation"><div><h3>Site Visual Progress Register</h3><p>Review one structured row per WhatsApp post and the activities stated explicitly in captions.</p><button className="progress-link" onClick={()=>exploreDashboard('site-progress')}>Open Site Progress →</button></div><p>Deliveries record what arrived through Second Gate. Site Progress records what was posted into the construction progress group. No relationship between the two datasets is implied.</p></div>
 </section>;
}
export function SiteProgressContent(){
 const {queries}=useDataApp();
 const allPosts=queries[QUERY]?.rows??[];
 const allActivities=queries[ACTIVITY_QUERY]?.rows??[];
 const [date,setDate]=useState('all'),[contributor,setContributor]=useState('all'),[recordType,setRecordType]=useState('all'),[description,setDescription]=useState('all'),[search,setSearch]=useState(''),[evidence,setEvidence]=useState(null);
 const posts=orderProgress(filterProgress(allPosts,{date,contributor,recordType,description,search}));
 const visiblePostIds=new Set(posts.map(row=>row.id));
 const activities=allActivities.filter(row=>visiblePostIds.has(row.linkedPostId));
 const total=progressTotals(posts);
 const names=[...new Set(allPosts.map(row=>row.postedBy))].sort((a,b)=>a.localeCompare(b));
 const types=[...new Set(allPosts.map(row=>row.recordType))];
 const preview=evidence?evidencePreviews[evidence.id]:null;
 const uncertain=posts.filter(row=>row.contributorStatus!=='confirmed'||row.attachmentCountStatus==='minimum_visible'||row.descriptionStatus==='not_confirmed');
 const fridayEmpty=date==='2026-09-18'&&posts.length===0;
 const reset=()=>{setDate('all');setContributor('all');setRecordType('all');setDescription('all');setSearch('');};
 const canvasRows=[
  {id:'progress:metrics',items:['progress-count','progress-contributors','progress-photos','progress-descriptions'],spacing:'content'},
  {id:'progress:register',items:['progress-register'],spacing:'content'},
  {id:'progress:activities',items:['progress-activities'],spacing:'content'},
  {id:'progress:review',items:['progress-evidence-review'],spacing:'content'}
 ];
 return <section className="progress-page">
  <header className="progress-heading"><div><h2>Site Visual Progress Register</h2><p>Thursday 17 September 2026 · Photographic progress evidence</p></div><span className="delivery-recorded-badge">Source-reviewed register</span></header>
  <p className="progress-friday-note">Friday has delivery records but no progress posts recorded yet.</p>
  <div className="progress-filters" aria-label="Progress filters">
   <Dropdown label="Progress day" allLabel="All progress posts" showLabel value={date} choices={['all','2026-09-17','2026-09-18']} choiceLabels={dateLabels} onChange={setDate}/>
   <Dropdown label="Contributor" allLabel="All contributors" searchable showLabel value={contributor} choices={['all',...names]} choiceLabels={{all:'All contributors'}} onChange={setContributor}/>
   <Dropdown label="Record type" allLabel="All record types" showLabel value={recordType} choices={['all',...types]} choiceLabels={{all:'All record types',...Object.fromEntries(types.map(type=>[type,recordTypeLabel(type)]))}} onChange={setRecordType}/>
   <Dropdown label="Description" allLabel="All posts" showLabel value={description} choices={['all','with','without']} choiceLabels={{all:'All posts',with:'Posts with descriptions',without:'Posts without descriptions'}} onChange={setDescription}/>
   <label className="progress-input">Search posts<input type="search" placeholder="Search caption or contributor" value={search} onChange={event=>setSearch(event.target.value)}/></label>
   <button className="progress-reset" onClick={reset}>Reset filters</button>
  </div>
  <aside className="progress-date-note"><strong>One row equals one WhatsApp post.</strong> Attachment counts organise evidence; they do not measure work completed or employee productivity.</aside>
  <SortableRegion id="progress:canvas" authoredRevision={1} variant="canvas" spacing="standard" columns={12} rows={canvasRows} label="Site progress panels">
   <SortableItem id="progress-count" label="Progress posts" kind="metric" span={3}><Metric id="progress-count" label="Progress posts" value={total.updates} note="One record per WhatsApp post" rows={posts}/></SortableItem>
   <SortableItem id="progress-contributors" label="Contributors" kind="metric" span={3}><Metric id="progress-contributors" label="Contributors" value={total.contributors} note={total.unknownContributors?`${total.unknownContributors} posts have cropped contributor names`:'Confirmed display names'} rows={posts}/></SortableItem>
   <SortableItem id="progress-photos" label="Photographs documented" kind="metric" span={3}><Metric id="progress-photos" label="Photographs documented" value={`${total.minimum?'≥ ':''}${total.photos}`} note={`${total.videos} video posts recorded separately`} rows={posts}/></SortableItem>
   <SortableItem id="progress-descriptions" label="Posts without descriptions" kind="metric" span={3}><Metric id="progress-descriptions" label="Posts without descriptions" value={total.withoutDescription} note={posts.some(row=>row.descriptionStatus==='not_confirmed')?'Includes one cropped caption area':'No caption supplied'} rows={posts}/></SortableItem>
   <SortableItem id="progress-register" label="Progress Post Register" kind="table" span={12}><DataComponent id="progress-register" queryId={QUERY} title="Progress Post Register" kind="table" variant="card" sourceRows={posts} displayRows={posts} description="One row per reviewed WhatsApp post. Posted by identifies the contributor, not the person who performed the work.">
    <div className="progress-results" aria-live="polite" data-reviewed-rows>{posts.length} posts · {dateLabel(date)}</div>
    {!posts.length?<p className="progress-empty">{fridayEmpty?'No progress posts recorded for Friday 18 September 2026.':'No progress posts match these filters.'}</p>:<div className="progress-table-wrap"><table className="progress-table progress-post-table" data-reviewed-rows><caption className="progress-sr-only">Progress Post Register</caption><thead><tr>{['Time','Posted by','Caption / update','Media','Count','Evidence'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{posts.map(row=><tr key={row.id} data-progress-id={row.id}><td data-label="Time"><strong>{displayTime(row.time)}</strong></td><td data-label="Posted by">{row.postedBy}{row.contributorStatus!=='confirmed'&&<small>Header cropped</small>}</td><td data-label="Caption / update"><span className={row.descriptionStatus!=='provided'?'progress-muted':''}>{row.captionRaw}</span><small>{recordTypeLabel(row.recordType)}</small></td><td data-label="Media">{mediaLabel(row)}</td><td data-label="Count" className="progress-number">{row.attachmentCountStatus==='minimum_visible'?'≥ ':''}{row.attachmentCount}</td><td data-label="Evidence"><button className="progress-evidence-button" aria-label={`View evidence for ${row.id}`} onClick={()=>setEvidence(row)}>View evidence</button></td></tr>)}</tbody></table></div>}
    <p className="progress-footnote">Deliveries record material arriving through Second Gate. This register organises posts from the construction progress group and does not establish who performed the work.</p>
   </DataComponent></SortableItem>
   <SortableItem id="progress-activities" label="Confirmed activities from captions" kind="table" span={12}><DataComponent id="progress-activities" queryId={ACTIVITY_QUERY} title="Confirmed activities from captions" kind="table" variant="card" sourceRows={activities} displayRows={activities} description="Caption-only activity view. Missing work area is shown as Not stated; no activity is inferred from a photograph.">
    {!activities.length?<p className="progress-empty">No confirmed activities match these filters.</p>:<div className="progress-table-wrap"><table className="progress-table progress-activity-table" data-reviewed-rows><caption className="progress-sr-only">Confirmed activities from captions</caption><thead><tr>{['Activity ID','Linked post','Date','Work area','Activity','Status','Evidence'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{activities.map(row=><tr key={row.id}><td>{row.id}</td><td>{row.linkedPostId}</td><td>{row.dayLabel}</td><td>{row.workArea}</td><td>{row.activity}</td><td>{row.status}</td><td>{row.evidence}</td></tr>)}</tbody></table></div>}
    <p className="progress-footnote">Only statements made explicitly in captions are included. “Documented” means the caption identifies work; it does not certify completion.</p>
   </DataComponent></SortableItem>
   <SortableItem id="progress-evidence-review" label="Evidence limitations" kind="custom" span={12}><DataComponent id="progress-evidence-review" queryId={QUERY} title="Evidence limitations" kind="custom" variant="card" sourceRows={posts} displayRows={uncertain} description="Cropped or incomplete records retain their uncertainty flags and minimum supported counts."><details><summary>Review cropped or incomplete records ({uncertain.length})</summary><ul className="progress-ambiguities" data-reviewed-rows>{uncertain.map(row=><li key={row.id}><strong>{row.id} · {displayTime(row.time)}</strong><span>{row.evidenceNote}</span></li>)}</ul></details><p className="progress-footnote">Original screenshots remain in private evidence storage. Raw WhatsApp screenshots, hidden album photographs and video files are not publicly served.</p></DataComponent></SortableItem>
  </SortableRegion>
  <Dialog open={Boolean(evidence)} onClose={()=>setEvidence(null)} title="Progress evidence" expanded>
   {evidence&&<div className="progress-evidence" data-reviewed-rows><dl><div><dt>Post</dt><dd>{evidence.id}</dd></div><div><dt>Posted by</dt><dd>{evidence.postedBy}</dd></div><div><dt>Date / time</dt><dd>{evidence.dayLabel} · {displayTime(evidence.time)}</dd></div><div><dt>Caption / update</dt><dd>{evidence.captionRaw}</dd></div><div><dt>Media documented</dt><dd>{evidence.attachmentCountStatus==='minimum_visible'?'At least ':''}{evidence.attachmentCount} {evidence.mediaType==='video'?'video':'photo'}{evidence.attachmentCount===1?'':'s'}</dd></div><div><dt>Evidence reference</dt><dd>{evidence.sourceEvidenceId}</dd></div></dl>
    {preview?<figure><img src={preview} alt={`Privacy-safe evidence preview for ${evidence.id}`}/><figcaption>Privacy-safe evidence preview.</figcaption></figure>:<p className="progress-preview-pending">The private source screenshot is not publicly served. This dialog shows its reviewed structured record.</p>}
    {evidence.evidenceNote&&<p className="progress-footnote">{evidence.evidenceNote}</p>}
   </div>}
  </Dialog>
 </section>;
}
