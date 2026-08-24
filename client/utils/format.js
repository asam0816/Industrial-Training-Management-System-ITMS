export const formatDate=(v,withTime=false)=>{if(!v)return '—';const d=new Date(v);return new Intl.DateTimeFormat(undefined,withTime?{dateStyle:'medium',timeStyle:'short'}:{dateStyle:'medium'}).format(d)};
export const bytes=(n=0)=>n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(1)} MB`;
