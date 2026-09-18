import React from 'react';
import {useDashboardTabs} from '../../data-app-public.jsx';
import {DeliveriesContent} from './DeliveriesContent.jsx';
import {SiteProgressContent, OverviewContent} from './SiteProgressContent.jsx';
import logo from '../assets/dj-civils-logo.jpg';
import './site-progress.css';
export function DashboardContent() {
 const {activeTabId}=useDashboardTabs([
  {id:'overview',label:'Overview',filterIds:[]},
  {id:'deliveries',label:'Deliveries',filterIds:['deliveryDay']},
  {id:'site-progress',label:'Site Progress',filterIds:[]}
 ]);
 return <div className="site-app">
  <div className="site-brand"><img src={logo} alt="DJ Civils Ltd — Enabling, Groundworks, Civil Engineering" width="100" height="100"/><p>Independent proof-of-work prototype prepared by Olamilekan Alaga. This is not an official DJ Civils system.</p></div>
  {activeTabId==='deliveries'?<DeliveriesContent/>:activeTabId==='site-progress'?<SiteProgressContent/>:<OverviewContent/>}
 </div>;
}
