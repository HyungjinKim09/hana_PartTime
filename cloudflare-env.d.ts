declare namespace Cloudflare {
  interface Env {
    ADMIN_SETUP_KEY?: string;
    AI?: {run(model:string,input:unknown):Promise<unknown>};
    SITE_DATA_OWNER?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
