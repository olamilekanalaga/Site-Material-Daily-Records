import React,{useState} from 'react';
import {DataComponent,EvidenceChart,useDataApp} from '../../data-app-public.jsx';
import './dashboard.css';
const QUERY='material_deliveries';
const sum=rows=>rows.reduce((n,row)=>n+(row.quantity??row.deliveries??0),0);
const formatDate=date=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${date}T00:00:00Z`)).replace('Sept','Sep');
const COLORS={'6F5 crushed concrete':'var(--chart-1)','Type 1 / recycled Type 1':'var(--chart-2)','20Mill':'var(--chart-3)','Welfare service':'var(--chart-4)'};
const dailySpec={type:'stackedBar',x:'dayLabel',y:'deliveries',series:'materialGroup',colors:COLORS,showXAxisLabel:false,showYAxisLabel:false,valueDecimals:0};
function FilterSelect({label,value,onChange,children}){return <label className="site-filter"><span>{label}</span><select value={value} onChange={event=>onChange(event.target.value)}>{children}</select></label>}
function Kpi({id,label,value,note,rows}){return <DataComponent id={id} queryId={QUERY} title={label} kind="metric" variant="card" sourceRows={rows} displayRows={[{label,value}]}><div className="site-kpi" data-reviewed-rows><span>{label}</span><strong>{value}</strong><small>{note}</small></div></DataComponent>}
export function DeliveriesContent(){
 const {queries,filters,setFilter,reviewedRows}=useDataApp();
 const allRows=queries[QUERY]?.rows??[], calendar=queries.day_register?.rows??[];
 const day=filters.deliveryDay??'all';
 const [arrival,setArrival]=useState('all'),[company,setCompany]=useState('all'),[filtersOpen,setFiltersOpen]=useState(()=>globalThis.matchMedia?.('(min-width: 621px)').matches??true);
 const dayRows=reviewedRows(QUERY,['date','day','dayLabel','arrival','material','materialGroup','quantity','deliveries','category','company','deliveryCompany','gate']);
 const notes=reviewedRows('delivery_source_notes',['date','noteType','wording','quantity','classificationStatus','unitStatus','includedInConfirmedDeliveryTotals']);
 const dailyRecords=reviewedRows('daily_records',['date','day','time','arrival','category','company','gate','timeStatus']);
 const rows=dayRows.filter(row=>(arrival==='all'||row.arrival===arrival)&&(company==='all'||row.company===company));
 const materialRows=rows.filter(row=>row.category==='Material delivery');
 const totalSite=sum(rows), materialTotal=sum(materialRows), welfareTotal=sum(rows.filter(row=>row.category==='Welfare service'));
 const days=new Set(rows.map(row=>row.date)).size;
 const arrivals=[...new Set(allRows.map(row=>row.arrival))], companies=[...new Set(allRows.map(row=>row.company))];
 const daily=calendar.map(entry=>{const scoped=rows.filter(row=>row.date===entry.date);return {...entry,total:sum(scoped),sixF5:sum(scoped.filter(row=>row.arrival==='6F5')),type1:sum(scoped.filter(row=>row.arrival==='Type 1')),mill:sum(scoped.filter(row=>row.arrival==='20Mill')),welfare:sum(scoped.filter(row=>row.category==='Welfare service'))};});
 return <section className="dashboard-view delivery-dashboard">
  <header className="view-heading"><div><h1>Second Gate · Delivery Overview</h1><p>Site arrival records · 17–21 September 2026</p></div><span className="status-chip">● Recorded site data</span></header>
  <div className="kpi-grid delivery-kpis"><Kpi id="arrival-total" label="Total site arrivals" value={totalSite} note="Materials and welfare visits" rows={rows}/><Kpi id="delivery-total" label="Material deliveries" value={materialTotal} note="Confirmed material arrivals" rows={rows}/><Kpi id="welfare-total" label="Welfare visits" value={welfareTotal} note="Recorded separately" rows={rows}/><Kpi id="delivery-days" label="Recorded days" value={days} note="Days in current selection" rows={rows}/></div>
  <details className="mobile-filter-panel" open={filtersOpen} onToggle={event=>setFiltersOpen(event.currentTarget.open)}>
   <summary>Filters</summary>
   <div className="filter-strip" aria-label="Delivery filters">
    <FilterSelect label="DATE / DAY" value={day} onChange={value=>setFilter('deliveryDay',value)}><option value="all">All recorded days</option>{calendar.map(row=><option key={row.date} value={row.date}>{row.day} · {formatDate(row.date)}</option>)}</FilterSelect>
    <FilterSelect label="ARRIVAL" value={arrival} onChange={setArrival}><option value="all">All arrivals</option>{arrivals.map(value=><option key={value} value={value}>{value}</option>)}</FilterSelect>
    <FilterSelect label="COMPANY" value={company} onChange={setCompany}><option value="all">All companies</option>{companies.map(value=><option key={value} value={value}>{value}</option>)}</FilterSelect>
   </div>
  </details>
  <div className="daily-grid">{daily.map(item=><article className="daily-card" key={item.date}><div><span>{item.day}</span><strong>{formatDate(item.date)}</strong></div><b>{item.total}<small>site arrivals</small></b><dl><div><dt>6F5</dt><dd>{item.sixF5}</dd></div><div><dt>Type 1</dt><dd>{item.type1}</dd></div>{item.mill>0&&<div><dt>20Mill</dt><dd>{item.mill}</dd></div>}{item.welfare>0&&<div><dt>Welfare service</dt><dd>{item.welfare}</dd></div>}<div><dt>Site hours</dt><dd>{item.siteHours??'—'}</dd></div></dl></article>)}</div>
  <DataComponent id="delivery-register" queryId={QUERY} title="Overview" kind="table" variant="card" sourceRows={rows} displayRows={rows} description="One aggregated row per date and arrival type. Daily Records are not added again to these quantities.">
   <div className="section-title"><div><h2>Overview</h2><p>Aggregated arrival quantities · no individual times</p></div><strong>{totalSite} arrivals</strong></div>
   <div className="delivery-table-wrap"><table className="delivery-register overview-register" data-reviewed-rows><thead><tr>{['Date','Day','Arrival','Quantity','Category','Company','Gate'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{formatDate(row.date)}</td><td>{row.day}</td><td>{row.arrival}</td><td>{row.quantity}</td><td>{row.category}</td><td>{row.company}</td><td>{row.gate}</td></tr>)}</tbody></table></div>
   {!rows.length&&<p className="empty-state">No arrival records match these filters.</p>}
  </DataComponent>
  {day!=='all'&&<DataComponent id="daily-records" queryId="daily_records" title="Daily Records" kind="table" variant="card" sourceRows={dailyRecords} displayRows={dailyRecords} description="One row per arrival. Recorded times reproduce Ola’s notes; estimated times are explicitly labelled and never treated as recorded evidence.">
   <div className="section-title"><div><h2>Daily Records</h2><p>{dailyRecords.length?`${dailyRecords.length} individual arrivals`:'No individual arrival schedule recorded for this day'}</p></div></div>
   {dailyRecords.length?<div className="delivery-table-wrap"><table className="delivery-register daily-records-table" data-reviewed-rows><thead><tr>{['Time','Arrival','Category','Company','Gate','Time status'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{dailyRecords.map(row=><tr key={row.id}><td>{row.time}</td><td>{row.arrival}</td><td>{row.category}</td><td>{row.company}</td><td>{row.gate}</td><td><span className={`time-status is-${row.timeStatus.toLowerCase()}`}>{row.timeStatus}</span></td></tr>)}</tbody></table></div>:<p className="empty-state">Daily Records are available for Monday 21 September 2026.</p>}
  </DataComponent>}
  {notes.length>0&&<DataComponent id="delivery-source-notes" queryId="delivery_source_notes" title="Source interpretation notes" kind="table" variant="card" sourceRows={notes} displayRows={notes} description="Original wording and interpretation lineage are retained alongside the owner’s latest classification.">
   <div className="section-title"><div><h2>Source interpretation notes</h2><p>Original wording and resolved classifications</p></div></div>
   <div className="source-note-grid" data-reviewed-rows>{notes.map(note=><article key={note.id}><strong>{note.wording}</strong><dl><div><dt>Quantity</dt><dd>{note.quantity}</dd></div><div><dt>Classification</dt><dd>{note.classificationStatus}</dd></div><div><dt>Unit</dt><dd>{note.unitStatus}</dd></div></dl></article>)}</div>
  </DataComponent>}
  <div className="secondary-chart"><EvidenceChart id="delivery-day-chart" queryId={QUERY} title="Site arrivals by day" variant="card" spec={dailySpec} rows={rows} sourceRows={rows} height={220} description="Aggregated site arrivals by recorded date and arrival group."/></div>
 </section>;
}
