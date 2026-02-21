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
    TRASH_PATH: "source/_trash",

    // 🖼️ 缤纷云 S3 图床配置
    // 请填写您的缤纷云 S3 配置信息
    S3_CONFIG: {
        // 端点地址 (缤纷云示例: https://s3.bitiful.net)
        endpoint: "https://s3.bitiful.net",
        // 存储桶名称
        bucket: "lingshichat",
        // 区域 (缤纷云示例: cn-east-1)
        region: "cn-east-1",
        // Access Key ID
        accessKeyId: "aqj85VOsiAZM411uEXZdyh3D",
        // Secret Access Key
        secretAccessKey: "MmkXjM0AHgmyZgbPbQfjYWVmAvbqVVT",
        // 图片访问基础 URL (可选，默认为 endpoint/bucket)
        // 如果您绑定了自定义域名，请填写: https://img.yourdomain.com
        publicUrl: "https://lingshichat.s3.bitiful.net"
    }
};
