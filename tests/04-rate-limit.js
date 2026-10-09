import http from 'k6/http'; import {Rate} from 'k6/metrics';
const BASE_URL=__ENV.BASE_URL; const limited=new Rate('rate_limited');
export const options={vus:10,duration:'20s',thresholds:{rate_limited:['rate<0.03']}};
export default function(){const l=http.post(`${BASE_URL}/api/auth/login`,JSON.stringify({user:'student',password:'qa123'}),{headers:{'Content-Type':'application/json'}});const t=l.json('token');for(let i=0;i<8;i++){const r=http.get(`${BASE_URL}/api/search?q=Producto`,{headers:{Authorization:`Bearer ${t}`}});limited.add(r.status===429);}}
