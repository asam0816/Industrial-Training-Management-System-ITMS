export const strongPassword=p=>typeof p==='string'&&p.length>=8&&/[A-Z]/.test(p)&&/[a-z]/.test(p)&&/\d/.test(p);
