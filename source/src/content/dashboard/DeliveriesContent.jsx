import React,{useState} from 'react';
import {DataComponent,EvidenceChart,useDataApp} from '../../data-app-public.jsx';
import './dashboard.css';
const QUERY='material_deliveries';
const sum=rows=>rows.reduce((n,row)=>n+row.deliveries,0);
const formatDate=date=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${date}T00:00:00Z`)).replace('Sept','Sep');
const materialGroup=row=>row.materialGroup??(row.material.startsWith('6F5')?'6F5 crushed concrete':'Type 1 / recycled Type 1');
const COLORS={'6F5 crushed concrete':'var(--chart-1)','Type 1 / recycled Type 1':'var(--chart-2)'};
const dailySpec={type:'stackedBar',x:'dayLabel',y:'deliveries',series:'materialGroup',colors:COLORS,showXAxisLabel:false,showYAxisLabel:false,valueDecimals:0};
function FilterSelect({label,value,onChange,children}){return <label className="site-filter"><span>{label}</span><select value={value} onChange={event=>onChange(event.target.value)}>{children}</select></label>}
function Kpi({id,label,value,note,rows}){return <DataComponent id={id} queryId={QUERY} title={label} kind="metric" variant="card" sourceRows={rows} displayRows={[{label,value}]}><div className="site-kpi" data-reviewed-rows><span>{label}</span><strong>{value}</strong><small>{note}</small></div></DataComponent>}
export function DeliveriesContent(){
 const {queries,filters,setFilter,reviewedRows}=useDataApp();
 const allRows=queries[QUERY]?.rows??[], calendar=queries.day_register?.rows??[];
 const day=filters.deliveryDay??'all';
 const [material,setMaterial]=useState('all'),[supplier,setSupplier]=useState('all');
 const dayRows=reviewedRows(QUERY,['date','day','dayLabel','material','materialGroup','time','deliveryCompany','gate']);
 const rows=dayRows.filter(row=>(material==='all'||materialGroup(row)===material)&&(supplier==='all'||row.deliveryCompany===supplier));
 const total=sum(rows), sixF5=sum(rows.filter(row=>materialGroup(row)==='6F5 crushed concrete')), type1=sum(rows.filter(row=>materialGroup(row)==='Type 1 / recycled Type 1'));
 const days=new Set(rows.map(row=>row.date)).size;
 const materials=[...new Set(allRows.map(materialGroup))], suppliers=[...new Set(allRows.map(row=>row.deliveryCompany))];
 const daily=calendar.map(entry=>{const scoped=rows.filter(row=>row.date===entry.date);return {...entry,total:sum(scoped),sixF5:sum(scoped.filter(row=>materialGroup(row)==='6F5 crushed concrete')),type1:sum(scoped.filter(row=>materialGroup(row)==='Type 1 / recycled Type 1'))};});
 return <section className="dashboard-view delivery-dashboard">
  <header className="view-heading"><div><h1>Second Gate · Delivery Overview</h1><p>Material arrival records · 17–18 September 2026</p></div><span className="status-chip">● Recorded site data</span></header>
  <div className="filter-strip" aria-label="Delivery filters">
   <FilterSelect label="DATE / DAY" value={day} onChange={value=>setFilter('deliveryDay',value)}><option value="all">All recorded days</option>{calendar.map(row=><option key={row.date} value={row.date}>{row.day} · {formatDate(row.date)}</option>)}</FilterSelect>
   <FilterSelect label="MATERIAL" value={material} onChange={setMaterial}><option value="all">All materials</option>{materials.map(value=><option key={value} value={value}>{value}</option>)}</FilterSelect>
   <FilterSelect label="SUPPLIER" value={supplier} onChange={setSupplier}><option value="all">All suppliers</option>{suppliers.map(value=><option key={value} value={value}>{value}</option>)}</FilterSelect>
  </div>
  <div className="kpi-grid"><Kpi id="delivery-total" label="Total deliveries" value={total} note="Recorded delivery visits" rows={rows}/><Kpi id="delivery-6f5" label="6F5 crushed concrete" value={sixF5} note="Delivery visits" rows={rows}/><Kpi id="delivery-type1" label="Type 1 / recycled Type 1" value={type1} note="Delivery visits" rows={rows}/><Kpi id="delivery-days" label="Recorded days" value={days} note="Days in current selection" rows={rows}/></div>
  <div className="daily-grid">{daily.map(item=><article className="daily-card" key={item.date}><div><span>{item.day}</span><strong>{formatDate(item.date)}</strong></div><b>{item.total}<small>deliveries</small></b><dl><div><dt>6F5 crushed concrete</dt><dd>{item.sixF5}</dd></div><div><dt>Type 1 / recycled Type 1</dt><dd>{item.type1}</dd></div><div><dt>Site hours</dt><dd>{item.siteHours??'—'}</dd></div></dl></article>)}</div>
  <DataComponent id="delivery-register" queryId={QUERY} title="Delivery register" kind="table" variant="card" sourceRows={rows} displayRows={rows} description="Authoritative supplied tally totals. Counts are delivery visits, not tonnes; an em dash means arrival time was not reliably recorded.">
   <div className="section-title"><div><h2>Delivery register</h2><p>Authoritative material tally · one row per date and material</p></div><strong>{total} visits</strong></div>
   <div className="delivery-table-wrap"><table className="delivery-register" data-reviewed-rows><thead><tr>{['Date','Day','Time','Material','Deliveries','Supplier','Gate'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{formatDate(row.date)}</td><td>{row.day}</td><td>{row.time??'—'}</td><td>{row.material}</td><td>{row.deliveries}</td><td>{row.deliveryCompany}</td><td>{row.gate}</td></tr>)}</tbody></table></div>
   {!rows.length&&<p className="empty-state">No delivery records match these filters.</p>}
  </DataComponent>
  <div className="secondary-chart"><EvidenceChart id="delivery-day-chart" queryId={QUERY} title="Deliveries by day" variant="card" spec={dailySpec} rows={rows} sourceRows={rows} height={220} description="Delivery visits by recorded date and material category."/></div>
 </section>;
}
