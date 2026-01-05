import { CONFIG } from './config.js';

// 🔐 解密与验证逻辑
export const Auth = {
    /**
     * 尝试使用密码解密 Token
     * @param {string} password 用户输入的密码
     * @returns {string|null} 解密后的 Token 或 null
     */
    decryptToken(password) {
        if (!CONFIG.ENCRYPTED_TOKEN) {
            throw new Error("请先在 config.js 中配置加密的 Token");
        }

        try {
            const bytes = CryptoJS.AES.decrypt(CONFIG.ENCRYPTED_TOKEN, password);
            const originalToken = bytes.toString(CryptoJS.enc.Utf8);

            // 简单验证解密结果是否像一个 Token (以 ghp_ 开头或长度足够)
            // GitHub Classic Token: ghp_...
            // Fine-grained Token: github_pat_...
            if (originalToken.startsWith('ghp_') || originalToken.startsWith('github_pat_')) {
                return originalToken;
            }
            return null; // 解密出来的东西不像 Token，密码可能错了
        } catch (e) {
            console.error("解密失败", e);
            return null;
        }
    },

    /**
     * 验证 Token 是否有效 (调用 GitHub API)
     * @param {string} token 
     */
    async verifyToken(token) {
        const octokit = new Octokit({ auth: token });
        try {
            const { data } = await octokit.rest.users.getAuthenticated();
            console.log("登录成功:", data.login);
            return data;
        } catch (e) {
            throw new Error("Token 无效或已过期");
        }
    }
};
