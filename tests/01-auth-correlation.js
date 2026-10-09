import http from 'k6/http';
import { check } from 'k6';
const BASE_URL=__ENV.BASE_URL;
export const options={vus:3,duration:'20s',thresholds:{http_req_failed:['rate<0.01'],'http_req_duration{endpoint:product}':['p(95)<500']}};
export default function(){
  const login=http.post(`${BASE_URL}/api/auth/login`,JSON.stringify({user:'student',password:'qa123'}),{headers:{'Content-Type':'application/json'},tags:{endpoint:'login'}});
  check(login,{'login 200':r=>r.status===200});
  const t=login.json('token');
  const p=http.get(`${BASE_URL}/api/products/1`,{headers:{Authorization:`Bearer ${t}`},tags:{endpoint:'product'}});
  check(p,{'product 200':r=>r.status===200,'cache header':r=>['HIT','MISS'].includes(r.headers['X-Cache'])});
}
