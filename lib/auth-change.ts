export const AUTH_CHANGE='hana:authentication-change';
export function announceAuthChange(){try{localStorage.setItem(AUTH_CHANGE,crypto.randomUUID());}catch{/* Identity is also checked on resume and each API request. */}}
