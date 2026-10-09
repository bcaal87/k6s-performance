import http from 'k6/http'; import {check,sleep} from 'k6';
const BASE_URL=__ENV.BASE_URL;
export const options={
 scenarios:{
  browse:{executor:'ramping-vus',exec:'browse',startVUs:2,stages:[{duration:'15s',target:15},{duration:'30s',target:15},{duration:'10s',target:0}]},
  search:{executor:'constant-arrival-rate',exec:'search',rate:12,timeUnit:'1s',duration:'45s',preAllocatedVUs:20,maxVUs:60},
  orders:{executor:'constant-vus',exec:'orders',vus:5,duration:'45s'}
 },
 thresholds:{
  http_req_failed:['rate<0.05'],
  'http_req_duration{endpoint:product}':['p(95)<550'],
  'http_req_duration{endpoint:search}':['p(95)<750'],
  'http_req_duration{endpoint:orders}':['p(95)<950']
 }};
function login(){const r=http.post(`${BASE_URL}/api/auth/login`,JSON.stringify({user:'student',password:'qa123'}),{headers:{'Content-Type':'application/json'}});return r.json('token');}
export function browse(){const t=login(); const id=1+Math.floor(Math.random()*10); http.get(`${BASE_URL}/api/products/${id}`,{headers:{Authorization:`Bearer ${t}`},tags:{endpoint:'product'}});sleep(.3);}
export function search(){const t=login(); http.get(`${BASE_URL}/api/search?q=Producto`,{headers:{Authorization:`Bearer ${t}`},tags:{endpoint:'search'}});}
export function orders(){const t=login(); const key=`k-${__VU}-${__ITER}-${Date.now()}`; const r=http.post(`${BASE_URL}/api/orders`,JSON.stringify({productId:1+(__VU%10),quantity:1}),{headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`,'Idempotency-Key':key},tags:{endpoint:'orders'}});check(r,{'order 201':x=>x.status===201});sleep(1);}
