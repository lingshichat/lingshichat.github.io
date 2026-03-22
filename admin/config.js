// 管理后台配置
// 仓库中仅保留非敏感默认值；敏感配置请写入同目录下被忽略的 config.local.js

import { isPlainObject, mergeConfig } from '../js/utils.js';

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

    // Cloudflare 配置（敏感 ID 请配置在 config.local.js）
    CF_ZONE_ID: "",
    CF_ACCOUNT_ID: "",
    CF_KV_ID: ""
};

const localOverride = typeof window !== "undefined" && isPlainObject(window.__ADMIN_CONFIG_OVERRIDE__)
    ? window.__ADMIN_CONFIG_OVERRIDE__
    : {};

export const CONFIG = mergeConfig(DEFAULT_CONFIG, localOverride);
