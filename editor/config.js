// 🔐 安全配置
// 请使用 tools/token-generator.html 生成此处的加密字符串
// 警告：不要直接在此处填入明文 Token！

export const CONFIG = {
    // GitHub Token (加密)
    // 请使用 tools/token-generator.html 生成
    // 警告：不要直接在此处填入明文 Token！
    GITHUB_TOKEN: "U2FsdGVkX1+d2SJx+G13fLOncdZ14PXzGe4ZxLamEkqe2LFmhpbxZCeNkZc1pwXHo+K3kyWp/cOUvj0pWx+fqA==",

    // 您的 GitHub 用户名
    OWNER: "lingshichat",

    // 您的博客仓库名
    REPO: "myblog-source", // 确认是否为这个仓库名

    // 文章存放路径 (通常是 source/_posts)
    POSTS_PATH: "source/_posts",

    // 如果您的默认分支不是 main，请修改此处
    BRANCH: "main",

    // 回收站路径
    TRASH_PATH: "source/_trash"
};
