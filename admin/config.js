// 🔐 管理后台配置
// 仓库中仅保留非敏感默认值；敏感配置请写入同目录下被忽略的 config.local.js

const DEFAULT_CONFIG = {
    // GitHub Token (加密) - 用于博客文章管理
    GITHUB_TOKEN: "",

    // Cloudflare API Token (加密) - 用于域名/缓存/KV管理
    CF_TOKEN: "",

    // API 代理服务 (Worker) - 解决移动端连接问题
    CF_API_PROXY: "https://api.lingshichat.top/_api",

    // 博客配置
    OWNER: "lingshichat",
    REPO: "myblog-source",
    BRANCH: "main",

    // 路径配置
    POSTS_PATH: "source/_posts",
    TRASH_PATH: "source/_trash",

    // Cloudflare 配置
    CF_ZONE_ID: "7931b7dab6b4f52709a6d7e1bf4924a2",
    CF_ACCOUNT_ID: "",
    CF_KV_ID: ""
};

function isPlainObject(value) {
    return Object.prototype.toString.call(value) === "[object Object]";
}

function mergeConfig(base, override) {
    if (!isPlainObject(override)) {
        return { ...base };
    }

    const result = { ...base };

    Object.entries(override).forEach(([key, value]) => {
        if (isPlainObject(value) && isPlainObject(base[key])) {
            result[key] = mergeConfig(base[key], value);
            return;
        }

        result[key] = value;
    });

    return result;
}

const localOverride = typeof window !== "undefined" && isPlainObject(window.__ADMIN_CONFIG_OVERRIDE__)
    ? window.__ADMIN_CONFIG_OVERRIDE__
    : {};

export const CONFIG = mergeConfig(DEFAULT_CONFIG, localOverride);
