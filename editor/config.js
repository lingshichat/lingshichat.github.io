// 🔐 安全配置
// 仓库中仅保留非敏感默认值；敏感配置请写入同目录下被忽略的 config.local.js

const DEFAULT_CONFIG = {
    // GitHub Token (加密)
    GITHUB_TOKEN: "",

    // 您的 GitHub 用户名
    OWNER: "lingshichat",

    // 您的博客仓库名
    REPO: "myblog-source",

    // 文章存放路径 (通常是 source/_posts)
    POSTS_PATH: "source/_posts",

    // 如果您的默认分支不是 main，请修改此处
    BRANCH: "main",

    // 回收站路径
    TRASH_PATH: "source/_trash",

    // 🖼️ 缤纷云 S3 图床配置
    S3_CONFIG: {
        endpoint: "https://s3.bitiful.net",
        bucket: "lingshichat",
        region: "cn-east-1",
        accessKeyId: "",
        secretAccessKey: "",
        publicUrl: ""
    }
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

const localOverride = typeof window !== "undefined" && isPlainObject(window.__EDITOR_CONFIG_OVERRIDE__)
    ? window.__EDITOR_CONFIG_OVERRIDE__
    : {};

export const CONFIG = mergeConfig(DEFAULT_CONFIG, localOverride);
