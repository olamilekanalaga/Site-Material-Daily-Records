import React from 'react';
import {useDashboardTabs,useDataApp} from '../../data-app-public.jsx';
import {DeliveriesContent} from './DeliveriesContent.jsx';
import {SiteProgressContent} from './SiteProgressContent.jsx';
import logo from '../assets/dj-civils-logo.jpg';
import './site-progress.css';

export function DashboardContent(){
 const {activeTabId}=useDashboardTabs([
  {id:'deliveries',label:'Deliveries',filterIds:['deliveryDay']},
  {id:'site-progress',label:'Site Progress',filterIds:[]}
 ]);
 const {exploreDashboard}=useDataApp();
 return <div className="site-app">
  <aside className="site-sidebar" aria-label="DJ Civils dashboard navigation">
   <div className="site-logo"><img src={logo} alt="DJ Civils Ltd — Enabling, Groundworks, Civil Engineering"/><span>Site Records</span></div>
   <nav>
    <button className={activeTabId==='deliveries'?'is-active':''} onClick={()=>exploreDashboard('deliveries')}><span aria-hidden="true">▦</span>Deliveries</button>
    <button className={activeTabId==='site-progress'?'is-active':''} onClick={()=>exploreDashboard('site-progress')}><span aria-hidden="true">▧</span>Site Progress</button>
   </nav>
   <p>Independent prototype<br/>Olamilekan Alaga</p>
  </aside>
  <div className="site-main">
   <div hidden={activeTabId!=='deliveries'}><DeliveriesContent/></div>
   <div hidden={activeTabId!=='site-progress'}><SiteProgressContent/></div>
  </div>
 </div>;
}
