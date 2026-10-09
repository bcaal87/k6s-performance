import http from 'k6/http'; import {check} from 'k6';
const BASE_URL=__ENV.BASE_URL;
export const options={vus:1,iterations:1,thresholds:{'http_req_duration{cache:HIT}':['p(95)<100']}};
export default function(){
 const l=http.post(`${BASE_URL}/api/auth/login`,JSON.stringify({user:'student',password:'qa123'}),{headers:{'Content-Type':'application/json'}}); const t=l.json('token');
 let first;
 for(let i=0;i<5;i++){
  const r=http.get(`${BASE_URL}/api/products/2`,{headers:{Authorization:`Bearer ${t}`},tags:{cache:i===0?'MISS':'HIT'}});
  if(i===0) first=r.timings.duration;
  check(r,{[`call ${i+1} ok`]:x=>x.status===200});
  if(i>0) console.log(`mejora ${i+1}: ${(((first-r.timings.duration)/first)*100).toFixed(1)}%`);
 }
}
