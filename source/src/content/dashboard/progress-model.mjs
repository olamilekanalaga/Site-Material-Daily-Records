export const UNKNOWN_DATE = 'Date not confirmed';
export function filterProgress(rows, {date='all', contributor='all', description='all', search=''} = {}) {
 const needle = search.trim().toLocaleLowerCase();
 return rows.filter(r => (date === 'all' || r.date === date)
  && (contributor === 'all' || r.postedBy === contributor)
  && (description === 'all' || (description === 'with' ? r.hasDescription : !r.hasDescription))
  && (!needle || [r.caption,r.postedBy,r.time,r.date,r.day].join(' ').toLocaleLowerCase().includes(needle)));
}
export function timeMinutes(value) {
 const m = /^(\d{1,2}):(\d{2}) (am|pm)$/.exec(value);
 return m ? (+m[1]%12)*60 + +m[2] + (m[3]==='pm'?720:0) : Infinity;
}
export function orderProgress(rows) {
 return [...rows].sort((a,b) => (a.date===UNKNOWN_DATE)-(b.date===UNKNOWN_DATE)
  || a.date.localeCompare(b.date) || timeMinutes(a.time)-timeMinutes(b.time) || a.id.localeCompare(b.id));
}
export function progressTotals(rows) {
 return {updates:rows.length, contributors:new Set(rows.filter(r=>r.contributorConfirmed).map(r=>r.postedBy)).size,
  photos:rows.reduce((n,r)=>n+r.photoCount,0), withoutDescription:rows.filter(r=>!r.hasDescription).length,
  videos:rows.filter(r=>r.mediaType==='video').length, minimum:rows.some(r=>r.photoCountStatus==='minimum visible'),
  unknownContributors:rows.filter(r=>!r.contributorConfirmed).length};
}
export function contributorSummary(rows) {
 return [...new Set(rows.filter(r=>r.contributorConfirmed).map(r=>r.postedBy))].sort((a,b)=>a.localeCompare(b)).map(name=>{
  const posts=rows.filter(r=>r.postedBy===name);
  const datesConfirmed=posts.every(r=>r.date!==UNKNOWN_DATE);
  const latest=datesConfirmed?orderProgress(posts).at(-1):null;
  return {name,updates:posts.length,photos:posts.reduce((n,r)=>n+r.photoCount,0),photosLabel:`${posts.some(r=>r.photoCountStatus==='minimum visible')?'≥ ':''}${posts.reduce((n,r)=>n+r.photoCount,0)}`,latest:latest?new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${latest.date}T00:00:00Z`)).replace('Sept','Sep'):'Date not confirmed'};
 });
}
