// Every recommended bundle must pass every catalogue eligibility rule.  Run: node tests/engine.test.mjs
import fs from 'fs';
const E = await import(new URL('../frontend/js/engine.js', import.meta.url));
const cat = JSON.parse(fs.readFileSync(new URL('../frontend/data/catalogue.json', import.meta.url)));
const C = Object.fromEntries(cat.map(p=>[p.id,p]));
const cases = [
 {seg:'micro',employees:2,sites:1,tier:2,net:'hotspot',needs:['pos','cctv','wa'],gstin:null},
 {seg:'micro',employees:6,sites:1,tier:1,net:'home',needs:[],gstin:'X',gstStatus:'Cancelled'},
 {seg:'prof',employees:6,sites:1,tier:1,net:'home',needs:[],gstin:'X',gstStatus:'Active'},
 {seg:'multi',employees:40,sites:4,tier:1,net:'mixed',needs:['failover','cctv','pos','secure'],gstin:'X',gstStatus:'Active'},
 {seg:'mfg',employees:40,sites:1,tier:2,net:'ll',needs:['iot','email','secure'],gstin:'X',gstStatus:'Active'},
 {seg:'mfg',employees:15,sites:1,tier:2,net:'ll',needs:['iot'],gstin:null},
];
let bad=0;
for (const p of cases) { const it=E.recommend(p,cat); const q=E.price(it,cat,false);
  for (const i of it) { const r=E.ineligibleReason(C[i.id],p,it); if (r){bad++; console.log('VIOL',i.id,r);} }
  console.log(p.seg, p.employees, p.sites, '->', it.map(i=>i.id+'x'+i.qty).join(' '), E.fmt(q.monthly), q.term+'mo'); }
console.log('violations', bad); if (bad) process.exit(1);
