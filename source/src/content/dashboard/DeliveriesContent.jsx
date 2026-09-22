import React,{useState} from 'react';
import {DataComponent,EvidenceChart,useDataApp} from '../../data-app-public.jsx';
import './dashboard.css';
const QUERY='material_deliveries';
const sum=rows=>rows.reduce((n,row)=>n+(row.quantity??row.deliveries??0),0);
const formatDate=date=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${date}T00:00:00Z`)).replace('Sept','Sep');
const COLORS={'6F5 crushed concrete':'var(--chart-1)','Type 1 / recycled Type 1':'var(--chart-2)','20Mill':'var(--chart-3)','Welfare service':'var(--chart-4)'};
const dailySpec={type:'stackedBar',x:'dayLabel',y:'deliveries',series:'materialGroup',colors:COLORS,showXAxisLabel:false,showYAxisLabel:false,valueDecimals:0};
function FilterSelect({label,value,onChange,children}){return <label className="site-filter"><span>{label}</span><select value={value} onChange={event=>onChange(event.target.value)}>{children}</select></label>}
function Kpi({id,label,value,note,rows,tone,icon}){return <DataComponent id={id} queryId={QUERY} title={label} kind="metric" variant="card" className={'super-kpi-card tone-'+tone} showHeading={false} sourceRows={rows} displayRows={[{label,value}]}><div className={'site-kpi super-kpi tone-'+tone} data-reviewed-rows><div className="kpi-symbol" aria-hidden="true">{icon}</div><span>{label}</span><strong>{value}</strong><small>{note}</small><span className="kpi-detail" aria-hidden="true">→</span></div></DataComponent>}
export function DeliveriesContent(){
 const {queries,filters,setFilter}=useDataApp();
 const allRows=queries[QUERY]?.rows??[], calendar=queries.day_register?.rows??[];
 const day=filters.deliveryDay??'all';
 const [arrival,setArrival]=useState('all'),[company,setCompany]=useState('all'),[filtersOpen,setFiltersOpen]=useState(()=>globalThis.matchMedia?.('(min-width: 621px)').matches??true);
 const bySelectedDate=dataset=>day==='all'?dataset:dataset.filter(row=>row.date===day);
 const matchesSecondary=row=>(arrival==='all'||row.arrival===arrival)&&(company==='all'||row.company===company);
 const rows=bySelectedDate(allRows).filter(matchesSecondary);
 const dailyRecords=bySelectedDate(queries.daily_records?.rows??[]).filter(matchesSecondary);
 const calendarRows=bySelectedDate(calendar);
 const selectedDay=day==='all'?null:calendar.find(row=>row.date===day);
 const materialRows=rows.filter(row=>row.category==='Material delivery');
 const totalSite=sum(rows), materialTotal=sum(materialRows), welfareTotal=sum(rows.filter(row=>row.category==='Welfare service'));
 const sixF5=sum(rows.filter(row=>row.arrival==='6F5')), type1=sum(rows.filter(row=>row.arrival==='Type 1')), mill=sum(rows.filter(row=>row.arrival==='20Mill'));
 const arrivals=[...new Set(allRows.map(row=>row.arrival))], companies=[...new Set(allRows.map(row=>row.company))];
 const daily=calendarRows.map(entry=>{const scoped=rows.filter(row=>row.date===entry.date);return {...entry,total:sum(scoped),sixF5:sum(scoped.filter(row=>row.arrival==='6F5')),type1:sum(scoped.filter(row=>row.arrival==='Type 1')),mill:sum(scoped.filter(row=>row.arrival==='20Mill')),welfare:sum(scoped.filter(row=>row.category==='Welfare service'))};});
 return <section className="dashboard-view delivery-dashboard">
  <header className="view-heading"><div><h1>{selectedDay?selectedDay.day+' · '+formatDate(selectedDay.date):'Second Gate · Delivery Overview'}</h1><p>{selectedDay?'Second Gate site arrivals':'All recorded dates · 17–21 September 2026'}</p></div><div className="header-chips"><span className="status-chip">● Recorded site data</span><span className="hours-chip">Site hours · 7:00am–5:30pm</span></div></header>
  <div className="section-title kpi-heading"><div><h2>Site arrivals</h2><p>Live totals for the current selection</p></div></div>
  <div className="kpi-grid delivery-kpis">
   <Kpi id="arrival-total" label="Total site arrivals" value={totalSite} note="Materials and welfare visits" rows={rows} tone="pink" icon="◇"/>
   <Kpi id="delivery-total" label="Material deliveries" value={materialTotal} note="Confirmed material arrivals" rows={rows} tone="lavender" icon="▦"/>
   <Kpi id="sixf5-total" label="6F5" value={sixF5} note="Crushed concrete" rows={rows} tone="yellow" icon="⬡"/>
   <Kpi id="type1-total" label="Type 1" value={type1} note="Material arrivals" rows={rows} tone="mint" icon="△"/>
   <Kpi id="20mill-total" label="20Mill" value={mill} note="Material arrivals" rows={rows} tone="blue" icon="◫"/>
   <Kpi id="welfare-total" label="Welfare visits" value={welfareTotal} note="Toilet wash service" rows={rows} tone="peach" icon="○"/>
  </div>
  <details className="mobile-filter-panel" open={filtersOpen} onToggle={event=>setFiltersOpen(event.currentTarget.open)}>
   <summary>Filters</summary>
   <div className="filter-strip" aria-label="Delivery filters">
    <FilterSelect label="DATE / DAY" value={day} onChange={value=>setFilter('deliveryDay',value)}><option value="all">All recorded days</option>{calendar.map(row=><option key={row.date} value={row.date}>{row.day} · {formatDate(row.date)}</option>)}</FilterSelect>
    <FilterSelect label="ARRIVAL" value={arrival} onChange={setArrival}><option value="all">All arrivals</option>{arrivals.map(value=><option key={value} value={value}>{value}</option>)}</FilterSelect>
    <FilterSelect label="COMPANY" value={company} onChange={setCompany}><option value="all">All companies</option>{companies.map(value=><option key={value} value={value}>{value}</option>)}</FilterSelect>
   </div>
  </details>
  <div className="daily-grid">{daily.map(item=><article className="daily-card" key={item.date}><div><span>{item.day}</span><strong>{formatDate(item.date)}</strong></div><b>{item.total}<small>site arrivals</small></b><dl><div><dt>6F5</dt><dd>{item.sixF5}</dd></div><div><dt>Type 1</dt><dd>{item.type1}</dd></div>{item.mill>0&&<div><dt>20Mill</dt><dd>{item.mill}</dd></div>}{item.welfare>0&&<div><dt>Welfare service</dt><dd>{item.welfare}</dd></div>}</dl></article>)}</div>
  <DataComponent id="delivery-register" queryId={QUERY} title="Overview" kind="table" variant="card" sourceRows={rows} displayRows={rows} description="One aggregated row per date and arrival type. Daily Records are not added again to these quantities.">
   <div className="section-title"><div><h2>Overview</h2><p>Aggregated arrival quantities · no individual times</p></div><strong>{totalSite} arrivals</strong></div>
   <div className="delivery-table-wrap"><table className="delivery-register overview-register" data-reviewed-rows><thead><tr>{['Date','Day','Arrival','Quantity','Category','Company','Gate'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{formatDate(row.date)}</td><td>{row.day}</td><td>{row.arrival}</td><td>{row.quantity}</td><td>{row.category}</td><td>{row.company}</td><td>{row.gate}</td></tr>)}</tbody></table></div>
   {!rows.length&&<p className="empty-state">No arrival records match these filters.</p>}
  </DataComponent>
  {day!=='all'&&<DataComponent id="daily-records" queryId="daily_records" title="Daily Records" kind="table" variant="card" sourceRows={dailyRecords} displayRows={dailyRecords} description="One row per arrival. Recorded times reproduce Ola’s notes; estimated times are explicitly labelled and never treated as recorded evidence.">
   <div className="section-title"><div><h2>Daily Records</h2><p>{dailyRecords.length?`${dailyRecords.length} individual arrivals`:'No individual arrival schedule recorded for this day'}</p></div></div>
   {dailyRecords.length?<div className="delivery-table-wrap"><table className="delivery-register daily-records-table" data-reviewed-rows><thead><tr>{['Time','Arrival','Category','Company','Gate','Time status'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{dailyRecords.map(row=><tr key={row.id}><td>{row.time}</td><td>{row.arrival}</td><td>{row.category}</td><td>{row.company}</td><td>{row.gate}</td><td><span className={`time-status is-${row.timeStatus.toLowerCase()}`}>{row.timeStatus}</span></td></tr>)}</tbody></table></div>:<p className="empty-state">Daily Records are available for Monday 21 September 2026.</p>}
  </DataComponent>}
  <div className="secondary-chart"><EvidenceChart id="delivery-day-chart" queryId={QUERY} title="Site arrivals by day" variant="card" spec={dailySpec} rows={rows} sourceRows={rows} height={220} description="Aggregated site arrivals by recorded date and arrival group."/></div>
 </section>;
}
