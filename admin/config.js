// 🔐 管理后台配置
// 警告：不要直接在此处填入明文 Token！

export const CONFIG = {
    // GitHub Token (加密) - 用于博客文章管理
    // 请使用 tools/token-generator.html 生成
    GITHUB_TOKEN: "U2FsdGVkX1+d2SJx+G13fLOncdZ14PXzGe4ZxLamEkqe2LFmhpbxZCeNkZc1pwXHo+K3kyWp/cOUvj0pWx+fqA==",

    // Cloudflare API Token (加密) - 用于域名/缓存/KV管理
    // 权限要求: Zone.Cache Purge, Zone.DNS, Workers KV, Zone.Page Rules, Zone.Settings
    CF_TOKEN: "U2FsdGVkX18eef0TlSVDCmajbxNYmeC6NDLNoj6pShHFUQUb4FO+js+Uto/IFcr7kyBsy7vmwBxUuiNT1ZUSWQ==", // 待配置

    // API 代理服务 (Worker) - 解决移动端连接问题
    // 复用 Shortlink Worker，请填入 Worker 根地址 + /_api
    // 例如 "https://shortlink.yourname.workers.dev/_api"
    // 留空则使用默认公共代理 (不稳定)
    CF_API_PROXY: "https://api.lingshichat.top/_api",

    // 博客配置
    OWNER: "lingshichat",
    REPO: "myblog-source",
    BRANCH: "main",

    // 路径配置
    POSTS_PATH: "source/_posts",
    TRASH_PATH: "source/_trash",

    // Cloudflare 配置
    CF_ZONE_ID: "7931b7dab6b4f52709a6d7e1bf4924a2",          // 域名 Zone ID
    CF_ACCOUNT_ID: "",       // 账户 ID
    CF_KV_ID: "",            // 短链 KV Namespace ID (Phase 4)
};