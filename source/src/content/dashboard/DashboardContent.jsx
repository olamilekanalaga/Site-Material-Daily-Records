import React from "react";
import { DataComponent, DataTable, EvidenceChart, SortableItem, SortableRegion, useDataApp } from "../../data-app-public.jsx";
import "./dashboard.css";
const QUERY = "material_deliveries";
const MATERIALS = ["Type 1 / recycled Type 1", "6F5 crushed concrete"];
const COLOURS = { "Type 1 / recycled Type 1": "var(--chart-1)", "6F5 crushed concrete": "var(--chart-2)" };
const sum = rows => rows.reduce((n, r) => n + r.deliveries, 0);
const formatDate = date => new Intl.DateTimeFormat("en-GB", {day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(`${date}T00:00:00Z`)).replace("Sept", "Sep");
const dailySpec = {type:"stackedBar",x:"dayLabel",y:"deliveries",series:"materialGroup",colors:COLOURS,showXAxisLabel:false,showYAxisLabel:false,valueDecimals:0};
const materialSpec = {type:"horizontalBar",x:"material",y:"deliveries",colors:COLOURS,showXAxisLabel:false,showYAxisLabel:false,valueDecimals:0};
const columns = [
 {field:"displayDate",label:"Date"}, {field:"day",label:"Day"}, {field:"time",label:"Time"},
 {field:"material",label:"Material"}, {field:"deliveries",label:"Number of deliveries"},
 {field:"deliveryCompany",label:"Supplier"}, {field:"gate",label:"Gate"}
];
export function DashboardContent() {
 const {queries,filters,setFilter,reviewedRows} = useDataApp();
 const selected = filters.deliveryDay ?? "all", allRows = queries[QUERY]?.rows ?? [];
 const calendar = queries.day_register?.rows ?? [];
 const rows = reviewedRows(QUERY,["date","day","dayLabel","material","materialGroup"]);
 const contexts = reviewedRows("day_register",["date"]);
 const total = sum(rows);
 const tableRows = rows.map(r => ({...r,displayDate:formatDate(r.date)}));
 const materialRows = MATERIALS.map(material => ({material,deliveries:sum(rows.filter(r=>r.materialGroup===material))})).filter(r=>r.deliveries>0);
 const leading = [...materialRows].sort((a,b)=>b.deliveries-a.deliveries)[0];
 const selectedDay = calendar.find(r=>r.date===selected);
 const scopeLabel = selected === "all" ? "Recorded deliveries" : `${selectedDay?.day ?? "Selected date"} ${formatDate(selected)}`;
 const canvasRows = [
  {id:"delivery:summary",items:["delivery-highlights"],spacing:"content"},
  {id:"delivery:details",items:["delivery-breakdown"],spacing:"content"},
  {id:"delivery:notes",items:["delivery-hours"],spacing:"content"},
  {id:"delivery:charts",items:["delivery-day-chart","delivery-material-chart"],spacing:"content"}
 ];
 return <div className="delivery-dashboard">
  <div className="delivery-intro"><div><span className="delivery-eyebrow">SECOND GATE · MATERIAL ARRIVALS</span><p>LIME LOGISTICS · 17–18 September 2026</p></div><span className="delivery-recorded-badge">Recorded site data</span></div>
  <div className="delivery-day-picker" role="group" aria-label="Choose delivery day" data-reviewed-rows>
   {[{date:"all",day:"All days"},...calendar].map(({date,day})=>{
    const count=sum(date==="all"?allRows:allRows.filter(r=>r.date===date));
    return <button key={date} type="button" className="delivery-day-card" aria-label={`${day}, ${count} deliveries`} aria-pressed={selected===date} onClick={()=>setFilter("deliveryDay",date)}><span className="delivery-card-top"><span>{day}</span><span className="delivery-selection-dot" aria-hidden="true"/></span><span className="delivery-card-value">{count}<small>deliveries</small></span><span className="delivery-card-date">{date==="all"?"Recorded dates only":formatDate(date)}</span></button>;
   })}
  </div>
  <div className="delivery-scope" aria-live="polite" data-reviewed-rows><p><strong>{scopeLabel}</strong><span>{` · ${total} delivery visits · ${materialRows.length} material types`}</span></p></div>
  <SortableRegion id="delivery:canvas" authoredRevision={3} variant="canvas" spacing="standard" columns={12} rows={canvasRows} label="Delivery dashboard panels">
   <SortableItem id="delivery-highlights" label="At a glance" kind="custom" span={12}><DataComponent id="delivery-highlights" queryId={QUERY} title="At a glance" kind="custom" variant="card" sourceRows={rows} displayRows={materialRows} description="Authoritative tally totals supplied by Ola. Type 1 includes recycled Type 1; counts are delivery visits, not tonnes."><div className="delivery-highlights" data-reviewed-rows><p className="delivery-highlight-lead"><strong>{total}</strong><span>recorded delivery visits</span></p><div className="delivery-insight"><span className="delivery-insight-label">Material types</span><strong>{materialRows.length}</strong><span>Type 1 includes recycled Type 1</span></div><div className="delivery-insight"><span className="delivery-insight-label">Most delivered material</span><strong>{leading?.material ?? "—"}</strong><span>{leading ? `${leading.deliveries} visits · ${Math.round(leading.deliveries/total*100)}% of selected deliveries` : "—"}</span></div></div></DataComponent></SortableItem>
   <SortableItem id="delivery-breakdown" label="Delivery records" kind="table" span={12}><DataComponent id="delivery-breakdown" queryId={QUERY} title="Delivery records" kind="table" variant="card" sourceRows={rows} displayRows={tableRows} description="One row per date and material tally, not per vehicle. Supplied tally counts are authoritative; incomplete handwritten arrival notes never override totals. — means a time was not reliably recorded."><div className="delivery-table delivery-operational-table" data-reviewed-rows><DataTable rows={tableRows} columns={columns} rowKey="id" searchable={false} caption="Delivery records"/></div><p className="delivery-chart-note">Tally counts are authoritative. — = time not reliably recorded.</p><div className="delivery-total" data-reviewed-rows><span>Recorded total</span><strong>{total} <span>deliveries</span></strong></div></DataComponent></SortableItem>
   <SortableItem id="delivery-hours" label="Site hours" kind="custom" span={12}><DataComponent id="delivery-hours" queryId="day_register" title="Site hours" kind="custom" variant="card" sourceRows={contexts} displayRows={contexts} description="Previously supplied site opening hours, separate from delivery arrival times. Missing hours are not inferred."><dl className="delivery-hours" data-reviewed-rows>{contexts.map(r=><div key={r.date}><dt>{r.day} · {formatDate(r.date)}</dt><dd>{r.siteHours ?? "—"}</dd></div>)}</dl></DataComponent></SortableItem>
   <SortableItem id="delivery-day-chart" label="Deliveries by day" kind="chart" span={7}><EvidenceChart id="delivery-day-chart" queryId={QUERY} title="Deliveries by day" variant="card" spec={dailySpec} rows={rows} sourceRows={rows} height={245} description="Authoritative delivery visits by date and material category. Friday Type 1 belongs to the combined Type 1 / recycled Type 1 category."/></SortableItem>
   <SortableItem id="delivery-material-chart" label="Material mix" kind="chart" span={5}><EvidenceChart id="delivery-material-chart" queryId={QUERY} title="Material mix" variant="card" spec={materialSpec} rows={materialRows} sourceRows={rows} height={245} description="Delivery visits by material category for the selected dates. Type 1 and recycled Type 1 are combined."><div className="delivery-material-counts" data-reviewed-rows>{materialRows.map(r=><span key={r.material}><i style={{background:COLOURS[r.material]}}/>{r.material} <strong>{r.deliveries}</strong></span>)}</div></EvidenceChart></SortableItem>
  </SortableRegion>
  <footer className="delivery-footer"><span>Prepared by Ola · Construction delivery analytics</span><span>Second Gate only · Delivery visits, not tonnes.</span></footer>
 </div>;
}
