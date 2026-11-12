// Independent namespaces for this service; shared counters are per Cloudflare
// location and approximate, not a worldwide hard spending cap.
export const workerRateLimits=[
 {name:'AUTH_LOGIN_IP',namespace_id:'2026111101',simple:{limit:5,period:60 as const}},
 {name:'AUTH_LOGIN_TOTAL',namespace_id:'2026111102',simple:{limit:10,period:60 as const}},
 {name:'AUTH_SESSION_IP',namespace_id:'2026111103',simple:{limit:60,period:60 as const}},
 {name:'AUTH_SESSION_TOTAL',namespace_id:'2026111104',simple:{limit:120,period:60 as const}},
 {name:'SITE_PAGE_IP',namespace_id:'2026111201',simple:{limit:120,period:60 as const}},
 {name:'SITE_API_IP',namespace_id:'2026111202',simple:{limit:300,period:60 as const}},
 // Galleries and ZIP downloads issue one request per original photo.
 {name:'SITE_MEDIA_IP',namespace_id:'2026111203',simple:{limit:1800,period:60 as const}},
];
