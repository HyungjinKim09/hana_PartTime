declare namespace Cloudflare {
  interface Env {
    CLOVA_OCR_URL?: string;
    CLOVA_OCR_SECRET?: string;
    CLOVA_OCR_MONTHLY_LIMIT?: string;
    ADMIN_SETUP_KEY?: string;
    AI?: {run(model:string,input:unknown):Promise<unknown>};
    SITE_DATA_OWNER?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
    AUTH_LOGIN_IP?: RateLimit;
    AUTH_LOGIN_TOTAL?: RateLimit;
    AUTH_SESSION_IP?: RateLimit;
    AUTH_SESSION_TOTAL?: RateLimit;
  }
}
