declare namespace Cloudflare {
  interface Env {
    ADMIN_SETUP_KEY?: string;
    SITE_DATA_OWNER?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
