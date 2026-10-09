import http from 'k6/http'; import {Rate} from 'k6/metrics';
const BASE_URL=__ENV.BASE_URL; const paymentFailures=new Rate('payment_failures');
export const options={vus:15,duration:'35s',thresholds:{payment_failures:['rate<0.04']}};
export default function(){const l=http.post(`${BASE_URL}/api/auth/login`,JSON.stringify({user:'student',password:'qa123'}),{headers:{'Content-Type':'application/json'}});const t=l.json('token');const r=http.post(`${BASE_URL}/api/payments`,JSON.stringify({amount:100}),{headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`}});paymentFailures.add(r.status!==200);}
