export const UNKNOWN_DATE = 'Date not confirmed';
export function filterProgress(rows, {date='all', contributor='all', recordType='all', description='all', search=''} = {}) {
 const needle=search.trim().toLocaleLowerCase();
 return rows.filter(row=>(date==='all'||row.date===date)
  && (contributor==='all'||row.postedBy===contributor)
  && (recordType==='all'||row.recordType===recordType)
  && (description==='all'||(description==='with'?row.descriptionStatus==='provided':row.descriptionStatus!=='provided'))
  && (!needle||[row.captionRaw,row.postedBy,row.time,row.date,row.day,row.recordType].join(' ').toLocaleLowerCase().includes(needle)));
}
export function timeMinutes(value) {
 const match=/^(\d{2}):(\d{2})$/.exec(value);
 return match?Number(match[1])*60+Number(match[2]):Infinity;
}
export function orderProgress(rows) {
 return [...rows].sort((a,b)=>(a.date===UNKNOWN_DATE)-(b.date===UNKNOWN_DATE)
  ||a.date.localeCompare(b.date)||timeMinutes(a.time)-timeMinutes(b.time)||a.id.localeCompare(b.id));
}
export function progressTotals(rows) {
 return {
  updates:rows.length,
  contributors:new Set(rows.filter(row=>row.contributorStatus==='confirmed').map(row=>row.postedBy)).size,
  photos:rows.filter(row=>row.mediaType==='photo').reduce((total,row)=>total+row.attachmentCount,0),
  withoutDescription:rows.filter(row=>row.descriptionStatus!=='provided').length,
  videos:rows.filter(row=>row.mediaType==='video').length,
  minimum:rows.some(row=>row.attachmentCountStatus==='minimum_visible'),
  unknownContributors:rows.filter(row=>row.contributorStatus!=='confirmed').length
 };
}
export function displayTime(value) {
 const match=/^(\d{2}):(\d{2})$/.exec(value);
 if(!match) return '—';
 const hour=Number(match[1]);
 return `${hour%12||12}:${match[2]} ${hour>=12?'pm':'am'}`;
}
export const recordTypeLabel=value=>({progress_update:'Progress update',photo_update:'Photo update',query_or_clarification:'Query / clarification',video_update:'Video update'}[value]??value);
