import React,{useEffect,useMemo,useState} from 'react';
import {DataComponent,Dialog,useDataApp} from '../../data-app-public.jsx';
import {displayTime,filterProgress,orderProgress,progressTotals,recordTypeLabel} from './progress-model.mjs';
import {evidencePreviews} from './evidence-previews.js';
const QUERY='progress_posts', ACTIVITY_QUERY='activities';
const formatDate=date=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z')).replace('Sept','Sep');
const mediaLabel=row=>row.mediaType==='video'?'Video':'Photos';
function Kpi({id,label,value,note,rows,tone,icon}){return <DataComponent id={id} queryId={QUERY} title={label} kind="metric" variant="card" className={"super-kpi-card tone-"+tone} showHeading={false} sourceRows={rows} displayRows={[{label,value}]}><div className={"site-kpi super-kpi tone-"+tone} data-reviewed-rows><div className="kpi-symbol" aria-hidden="true">{icon}</div><span>{label}</span><strong>{value}</strong><small>{note}</small><span className="kpi-detail" aria-hidden="true">→</span></div></DataComponent>}
function Select({label,value,onChange,children}){return <label className="site-filter"><span>{label}</span><select value={value} onChange={event=>onChange(event.target.value)}>{children}</select></label>}
export function SiteProgressContent(){
 const {queries}=useDataApp();
 const allPosts=queries[QUERY]?.rows??[], allActivities=queries[ACTIVITY_QUERY]?.rows??[], calendar=queries.day_register?.rows??[];
 const [date,setDate]=useState('all'),[contributor,setContributor]=useState('all'),[recordType,setRecordType]=useState('all'),[description,setDescription]=useState('all'),[search,setSearch]=useState(''),[evidence,setEvidence]=useState(null),[filtersOpen,setFiltersOpen]=useState(()=>globalThis.matchMedia?.('(min-width: 621px)').matches??true);
 const posts=orderProgress(filterProgress(allPosts,{date,contributor,recordType,description,search}));
 const total=progressTotals(posts), names=[...new Set(allPosts.map(row=>row.postedBy))].sort((a,b)=>a.localeCompare(b)), types=[...new Set(allPosts.map(row=>row.recordType))];
 const activityByPost=useMemo(()=>Object.fromEntries(allActivities.map(row=>[row.linkedPostId,row])),[allActivities]);
 const visiblePostIds=new Set(posts.map(row=>row.id));
 const activities=allActivities.filter(row=>visiblePostIds.has(row.linkedPostId));
 const preview=evidence?evidencePreviews[evidence.id]:null, activity=evidence?activityByPost[evidence.id]:null;
 const selectedDay=date==='all'?null:calendar.find(row=>row.date===date);
 const dateHasRecords=date==='all'||allPosts.some(row=>row.date===date);
 useEffect(()=>setEvidence(null),[date,contributor,recordType,description,search]);
 const reset=()=>{setDate('all');setContributor('all');setRecordType('all');setDescription('all');setSearch('');};
 return <section className={"dashboard-view progress-page"+(dateHasRecords?"":" no-record-date")}>
  <header className="view-heading"><div><h1>{selectedDay?'Site Progress · '+selectedDay.day:'Site Progress'}</h1><p>{selectedDay?formatDate(selectedDay.date):'All recorded progress dates'}</p></div><span className="status-chip">● Recorded site updates</span></header>
  <details className="mobile-filter-panel" open={filtersOpen} onToggle={event=>setFiltersOpen(event.currentTarget.open)}>
   <summary>Filters</summary>
   <div className="filter-strip progress-filter-strip">
   <Select label="RECORDED DAY" value={date} onChange={setDate}><option value="all">All recorded days</option>{calendar.map(row=><option key={row.date} value={row.date}>{row.day} · {formatDate(row.date)}</option>)}</Select>
   <Select label="POSTED BY" value={contributor} onChange={setContributor}><option value="all">All posters</option>{names.map(name=><option key={name}>{name}</option>)}</Select>
   <Select label="ACTIVITY / TYPE" value={recordType} onChange={setRecordType}><option value="all">All activities</option>{types.map(type=><option key={type} value={type}>{recordTypeLabel(type)}</option>)}</Select>
   <Select label="DESCRIPTION" value={description} onChange={setDescription}><option value="all">All descriptions</option><option value="with">With descriptions</option><option value="without">Without descriptions</option></Select>
   <label className="site-filter progress-search"><span>SEARCH</span><input type="search" value={search} placeholder="Caption or poster" onChange={event=>setSearch(event.target.value)}/></label>
   <button className="reset-button" onClick={reset}>Reset</button>
  </div>
  </details>
  <div className="kpi-grid progress-kpis">
   <Kpi id="progress-count" label="Progress updates" value={total.updates} note="One row per WhatsApp post" rows={posts} tone="pink" icon="◇"/>
   <Kpi id="progress-contributors" label="Contributors" value={total.contributors} note="Confirmed display names" rows={posts} tone="lavender" icon="◎"/>
   <Kpi id="progress-photos" label="Photographs" value={(total.minimum?'≥':'')+total.photos} note="Minimum documented count" rows={posts} tone="mint" icon="▧"/>
   <Kpi id="progress-videos" label="Video posts" value={total.videos} note="Recorded video updates" rows={posts} tone="yellow" icon="▷"/>
  </div>
  <div className="progress-workspace">
   <DataComponent id="progress-register" queryId={QUERY} title="Progress register" kind="table" variant="card" sourceRows={posts} displayRows={posts} description="One row per reviewed WhatsApp post. Posted by identifies the contributor, not the person who performed the work.">
    <div className="section-title"><div><h2>Progress Post Register</h2><p>{posts.length} reviewed posts · chronological order</p></div></div>
    {!posts.length?<p className="empty-state">No site-progress updates recorded for this date.</p>:<div className="progress-list" data-reviewed-rows><div className="progress-register-head" aria-hidden="true"><span>Time</span><span>Posted by</span><span>Reported update</span><span>Evidence</span><span>View</span></div>{posts.map(row=><article key={row.id} className={evidence?.id===row.id?'is-selected':''}><time>{displayTime(row.time)}</time><strong className="post-author">{row.postedBy}</strong><div className="post-main"><p className={row.descriptionStatus!=='provided'?'is-muted':''}>{row.captionRaw}</p><span className={'description-badge '+(row.descriptionStatus==='provided'?'is-provided':'is-missing')}>{row.descriptionStatus==='provided'?'Description provided':'Description not provided'}</span>{row.contributorStatus!=='confirmed'&&<small>Contributor cropped/unconfirmed</small>}</div><div className={'post-media '+(row.mediaType==='video'?'is-video':'is-photo')}><strong>{row.attachmentCountStatus==='minimum_visible'?'≥ ':''}{row.attachmentCount}</strong><span>{mediaLabel(row)}</span></div><button onClick={()=>setEvidence(row)}>View</button></article>)}</div>}
    <p className="progress-note">Evidence contribution summary only. Photograph and post counts are not measures of employee performance or work completed.</p>
   </DataComponent>
   <aside className="evidence-panel" aria-live="polite">
    <div className="section-title"><div><h2>Update detail</h2><p>Structured record · private source retained</p></div></div>
    {!evidence?<div className="detail-empty"><span>▧</span><strong>Select an update</strong><p>Use View to inspect its structured evidence record. Original WhatsApp screenshots are not publicly served.</p></div>:<div className="detail-content" data-reviewed-rows><div className="detail-meta"><span>{displayTime(evidence.time)}</span><span>{evidence.attachmentCountStatus==='minimum_visible'?'≥ ':''}{evidence.attachmentCount} {mediaLabel(evidence)}</span></div><h3>{evidence.postedBy}</h3><p className={evidence.descriptionStatus!=='provided'?'is-muted':''}>{evidence.captionRaw}</p><dl><div><dt>Record</dt><dd>{evidence.id}</dd></div><div><dt>Evidence</dt><dd>{evidence.sourceEvidenceId}</dd></div><div><dt>Activity</dt><dd>{activity?.activity??'Not stated'}</dd></div><div><dt>Location</dt><dd>{activity?.workArea??'Not stated'}</dd></div></dl><button className="detail-button" onClick={()=>setEvidence({...evidence,openDialog:true})}>Open detail</button></div>}
   </aside>
  </div>
  <DataComponent id="progress-activities" queryId={ACTIVITY_QUERY} title="Confirmed activities from captions" kind="table" variant="card" sourceRows={activities} displayRows={activities} description="Caption-only activity view; no activity is inferred from photographs.">
   <details className="activity-register"><summary>Confirmed activities from captions ({activities.length})</summary>{activities.length?<div className="activity-grid" data-reviewed-rows>{activities.map(row=><article key={row.id}><strong>{row.activity}</strong><span>{row.workArea} · {row.status}</span><small>{row.linkedPostId} · {row.evidence}</small></article>)}</div>:<p>No confirmed activities match these filters.</p>}</details>
  </DataComponent>  <details className="limitations"><summary>Evidence limitations and cropped records</summary><p>Original screenshots remain in private evidence storage. Cropped names, incomplete caption areas, minimum album counts and unavailable media retain their uncertainty flags.</p></details>
  <Dialog open={Boolean(evidence?.openDialog)} onClose={()=>setEvidence(evidence?{...evidence,openDialog:false}:null)} title="Progress evidence" expanded>{evidence&&<div className="progress-evidence" data-reviewed-rows><dl><div><dt>Post</dt><dd>{evidence.id}</dd></div><div><dt>Posted by</dt><dd>{evidence.postedBy}</dd></div><div><dt>Date / time</dt><dd>{evidence.dayLabel} · {displayTime(evidence.time)}</dd></div><div><dt>Original caption</dt><dd>{evidence.captionRaw}</dd></div><div><dt>Evidence documented</dt><dd>{evidence.attachmentCountStatus==='minimum_visible'?'At least ':''}{evidence.attachmentCount} {evidence.mediaType==='video'?'video':'photo'}{evidence.attachmentCount===1?'':'s'}</dd></div><div><dt>Evidence reference</dt><dd>{evidence.sourceEvidenceId}</dd></div></dl>{preview?<figure><img src={preview} alt={`Privacy-safe evidence preview for ${evidence.id}`}/><figcaption>Privacy-safe evidence preview.</figcaption></figure>:<p className="progress-preview-pending">The private source screenshot is not publicly served. This dialog shows its reviewed structured record.</p>}</div>}</Dialog>
 </section>;
}
