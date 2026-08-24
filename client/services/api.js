import axios from 'axios';
const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api', withCredentials: true });
let refreshing = null;
api.interceptors.response.use(r=>r, async err=>{
  const original=err.config;
  const skip=['/auth/refresh','/auth/login','/auth/forgot-password','/auth/reset-password'].some(x=>original?.url?.includes(x));
  if(err.response?.status===401 && !original?._retry && !skip){
    original._retry=true;
    try{ refreshing ||= api.post('/auth/refresh').finally(()=>{refreshing=null}); await refreshing; return api(original); }catch(e){ throw err; }
  }
  throw err;
});
export default api;
