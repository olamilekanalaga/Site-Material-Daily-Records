import React, {useState} from 'react';
import {DataComponent, DataTable, Dialog, Dropdown, SortableItem, SortableRegion, useDataApp} from '../../data-app-public.jsx';
import {UNKNOWN_DATE,filterProgress,orderProgress,progressTotals,contributorSummary} from './progress-model.mjs';
import {evidencePreviews} from './evidence-previews.js';
const QUERY='site_progress';
const dateLabel=date=>date==='all'?'All recorded days':!/^\d{4}-\d{2}-\d{2}$/.test(date)?UNKNOWN_DATE:new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${date}T00:00:00Z`));
function Metric({id,label,value,note,rows}) {
 return <DataComponent id={id} queryId={QUERY} title={label} kind="metric" variant="card" sourceRows={rows} displayRows={[{label,value}]}><div className="progress-metric" data-reviewed-rows><strong>{value}</strong><span>{note}</span></div></DataComponent>;
}
export function OverviewContent() {
 const {queries,exploreDashboard}=useDataApp();
 const deliveries=queries.material_deliveries.rows;
 const records=queries[QUERY]?.rows??[];
 const total=progressTotals(records);
 return <section className="progress-page"><header className="progress-heading"><h2>Site records overview</h2><p>Material arrivals and photographic site updates</p></header>
 <div className="overview-cards">
  <DataComponent id="overview-deliveries" queryId="material_deliveries" title="Material deliveries" kind="metric" variant="card" sourceRows={deliveries} displayRows={[{deliveries:deliveries.reduce((n,r)=>n+r.deliveries,0)}]}><div className="progress-metric" data-reviewed-rows><strong>{deliveries.reduce((n,r)=>n+r.deliveries,0)}</strong><span>LIME LOGISTICS · Second Gate<br/>17–18 September 2026</span></div><button className="progress-link" onClick={()=>exploreDashboard('deliveries')}>Open Deliveries →</button></DataComponent>
  <Metric id="overview-progress" label="Site progress updates" value={total.updates} note={`${total.contributors} identifiable contributors · 17 September 2026`} rows={records}/>
  <Metric id="overview-photos" label="Photographic evidence" value={`${total.minimum?'≥ ':''}${total.photos}`} note={`${total.videos} video posts recorded separately`} rows={records}/>
 </div>
 <div className="progress-separation"><div><h3>Site Visual Progress Register</h3><p>Search original captions, review photographic evidence and see who posted each update.</p><button className="progress-link" onClick={()=>exploreDashboard('site-progress')}>Open Site Progress →</button></div><p>Deliveries record material arriving through Second Gate. Site Progress records photographic updates across the site. No relationship between those records is implied.</p></div></section>;
}
export function SiteProgressContent() {
 const {queries}=useDataApp();
 const allRows=queries[QUERY]?.rows??[];
 const [date,setDate]=useState('all'),[contributor,setContributor]=useState('all'),[description,setDescription]=useState('all'),[search,setSearch]=useState(''),[evidence,setEvidence]=useState(null);
 const rows=orderProgress(filterProgress(allRows,{date,contributor,description,search}));
 const total=progressTotals(rows),contributors=contributorSummary(rows);
 const dates=[...new Set(allRows.map(r=>r.date))].sort();
 const names=[...new Set(allRows.map(r=>r.postedBy))].sort((a,b)=>a.localeCompare(b));
 const preview=evidence?evidencePreviews[evidence.id]:null;
 const uncertain=rows.filter(r=>!r.contributorConfirmed||r.photoCountStatus==='minimum visible'||r.descriptionStatus==='not confirmed');
 const canvasRows=[{id:'progress:metrics',items:['progress-count','progress-contributors','progress-photos','progress-descriptions'],spacing:'content'},
  {id:'progress:register',items:['progress-register'],spacing:'content'}, {id:'progress:contributors',items:['progress-contributor-summary'],spacing:'content'}, {id:'progress:review',items:['progress-evidence-review'],spacing:'content'}];
 return <section className="progress-page">
  <header className="progress-heading"><div><h2>Site Visual Progress Register</h2><p>Structured photographic updates from site activity</p></div><span className="delivery-recorded-badge">Source-reviewed register</span></header>
  <div className="progress-filters" aria-label="Progress filters">
   <Dropdown label="Recorded day" allLabel="All recorded days" showLabel value={dates.includes(date)||date==='all'?date:'specific'} choices={['all',...dates,...(!dates.includes(date)&&date!=='all'?['specific']:[])]} choiceLabels={{all:'All recorded days',specific:dateLabel(date)}} formatChoice={v=>v==='all'?'All recorded days':v==='specific'?dateLabel(date):dateLabel(v)} onChange={setDate}/>
   <Dropdown label="Contributor" allLabel="All contributors" searchable showLabel value={contributor} choices={['all',...names]} choiceLabels={{all:'All contributors'}} onChange={setContributor}/>
   <Dropdown label="Description" allLabel="All updates" showLabel value={description} choices={['all','with','without']} choiceLabels={{all:'All updates',with:'Updates with descriptions',without:'Updates without descriptions'}} onChange={setDescription}/>
   <label className="progress-input">Search updates<input type="search" placeholder="Search caption or contributor" value={search} onChange={e=>setSearch(e.target.value)}/></label>
   <label className="progress-input progress-date">Specific date<input type="date" aria-label="Specific progress date" value={/^\d{4}-/.test(date)?date:''} onChange={e=>setDate(e.target.value||'all')}/></label>
   <button className="progress-reset" onClick={()=>{setDate('all');setContributor('all');setDescription('all');setSearch('');}}>Reset filters</button>
  </div>
  <aside className="progress-date-note"><strong>Thursday, 17 September 2026.</strong> Date confirmed by the owner for all supplied progress screenshots. Friday, 18 September delivery records remain separate.</aside>
  <SortableRegion id="progress:canvas" authoredRevision={1} variant="canvas" spacing="standard" columns={12} rows={canvasRows} label="Site progress panels">
   <SortableItem id="progress-count" label="Progress updates" kind="metric" span={3}><Metric id="progress-count" label="Progress updates" value={total.updates} note="One record per WhatsApp post" rows={rows}/></SortableItem>
   <SortableItem id="progress-contributors" label="Contributors" kind="metric" span={3}><Metric id="progress-contributors" label="Contributors" value={total.contributors} note={total.unknownContributors?`${total.unknownContributors} posts have cropped contributor names`:'Identifiable display names'} rows={rows}/></SortableItem>
   <SortableItem id="progress-photos" label="Photographs documented" kind="metric" span={3}><Metric id="progress-photos" label="Photographs documented" value={`${total.minimum?'≥ ':''}${total.photos}`} note={`${total.minimum?'Minimum visible / displayed count · ':''}${total.videos} video posts excluded`} rows={rows}/></SortableItem>
   <SortableItem id="progress-descriptions" label="Updates without descriptions" kind="metric" span={3}><Metric id="progress-descriptions" label="Updates without descriptions" value={total.withoutDescription} note={rows.some(r=>r.descriptionStatus==='not confirmed')?'Includes one cropped caption area':'No caption supplied in the evidence'} rows={rows}/></SortableItem>
   <SortableItem id="progress-register" label="Progress register" kind="table" span={12}><DataComponent id="progress-register" queryId={QUERY} title="Progress register" kind="table" variant="card" sourceRows={rows} displayRows={rows} description="Original posted captions and display names. Posting is evidence contribution, not proof that the contributor performed the work. Photograph counts are not productivity or completed work.">
    <div className="progress-results" aria-live="polite" data-reviewed-rows>{rows.length} updates · {date==='all'?'All recorded days':dateLabel(date)}</div>
    {!rows.length?<p className="progress-empty">{date!=='all'&&!allRows.some(r=>r.date===date)?'No progress updates recorded for this day.':'No progress updates match these filters.'}</p>:<div className="progress-table-wrap"><table className="progress-table" data-reviewed-rows><caption className="progress-sr-only">Site progress updates</caption><thead><tr>{['Date','Posted by','Progress update','Photos','Evidence'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id} data-progress-id={r.id}><td data-label="Date"><strong>{dateLabel(r.date)}</strong></td><td data-label="Posted by">{r.postedBy}{!r.contributorConfirmed&&<small>Header cropped</small>}</td><td data-label="Progress update"><span className={!r.hasDescription?'progress-muted':''}>{r.caption}</span>{r.descriptionStatus==='not confirmed'&&<small>Caption area cropped</small>}{r.mediaType==='video'&&<small className="progress-tag">Video thumbnail</small>}</td><td data-label="Photos" className="progress-number">{r.photoCountStatus==='minimum visible'?'≥ ':''}{r.photoCount}{r.mediaType==='video'&&<small>1 video</small>}</td><td data-label="Evidence"><button className="progress-evidence-button" aria-label={`View evidence for ${r.id}`} onClick={()=>setEvidence(r)}>View evidence ↗</button></td></tr>)}</tbody></table></div>}
    <p className="progress-footnote">Photographs document posts; they do not measure employee productivity or work completed. “Posted by” identifies the contributor, not who performed the work.</p>
   </DataComponent></SortableItem>
   <SortableItem id="progress-contributor-summary" label="Contributor summary" kind="table" span={12}><DataComponent id="progress-contributor-summary" queryId={QUERY} title="Contributor summary" kind="table" variant="card" sourceRows={rows} displayRows={contributors} description="Alphabetical evidence contribution summary. Unknown contributors are excluded. Latest documented date is based on owner-confirmed calendar dates."><div className="progress-summary-table"><DataTable rows={contributors} rowKey="name" searchable={false} columns={[{field:'name',label:'Contributor'},{field:'updates',label:'Updates posted'},{field:'photosLabel',label:'Photographs attached'},{field:'latest',label:'Latest documented update'}]} caption="Evidence contributions"/></div><p className="progress-footnote">Alphabetical order · Evidence contributions, not a performance ranking. Latest documented date uses the owner-confirmed date for this batch.</p></DataComponent></SortableItem>
   <SortableItem id="progress-evidence-review" label="Evidence limitations" kind="custom" span={12}><DataComponent id="progress-evidence-review" queryId={QUERY} title="Evidence limitations" kind="custom" variant="card" sourceRows={rows} displayRows={uncertain} description="All source images were individually reviewed. Partial adjacent posts are not counted again. Separate messages with the same sender and minute remain distinct when their photographs differ."><details><summary>Review cropped or incomplete records ({uncertain.length})</summary><ul className="progress-ambiguities" data-reviewed-rows>{uncertain.map(r=><li key={r.id}><strong>{r.id} · {r.time}</strong><span>{r.evidenceNote}</span></li>)}</ul></details><p className="progress-footnote">Original screenshots stay in private evidence storage. Previews do not contain group-member contact details. Video files and photographs hidden behind album counters were not supplied.</p></DataComponent></SortableItem>
  </SortableRegion>
  <Dialog open={Boolean(evidence)} onClose={()=>setEvidence(null)} title="Progress evidence" expanded>
   {evidence&&<div className="progress-evidence" data-reviewed-rows><dl><div><dt>Posted by</dt><dd>{evidence.postedBy}</dd></div><div><dt>Date / time</dt><dd>{dateLabel(evidence.date)} · {evidence.time}</dd></div><div><dt>Progress update</dt><dd>{evidence.caption}</dd></div><div><dt>Photographs documented</dt><dd>{evidence.photoCountStatus==='minimum visible'?'At least ':''}{evidence.photoCount}{evidence.mediaType==='video'?' · 1 video thumbnail':''}</dd></div></dl>
    {preview?<figure><img src={preview} alt={`Privacy-safe evidence preview for ${evidence.postedBy}'s ${evidence.time} post`}/><figcaption>Privacy-safe crop from the supplied screenshot. {evidence.mediaType==='video'?'Thumbnail only; video is unavailable.':'Only the visible screenshot evidence is available.'}</figcaption></figure>:<p className="progress-preview-pending">Photographic preview awaiting privacy-safe preparation. The original remains private.</p>}
    {evidence.evidenceNote&&<p className="progress-footnote">{evidence.evidenceNote}</p>}
   </div>}
  </Dialog>
 </section>;
}
