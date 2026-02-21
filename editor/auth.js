/**
 * 🔐 Editor 认证模块 (引用公共模块)
 */
import { CONFIG } from './config.js';
import { AuthModule } from '../js/auth-module.js';

// 初始化配置
AuthModule.init(CONFIG);

// 导出兼容接口 - 保持与原有代码的兼容性
export const Auth = {
    /**
     * 尝试使用密码解密 Token
     * @param {string} password 用户输入的密码
     * @returns {string|null} 解密后的 Token 或 null
     */
    decryptToken(password) {
        return AuthModule.decryptGitHubToken(password);
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
    },

    // 透传公共模块的方法
    saveSession: AuthModule.saveSession.bind(AuthModule),
    getSession: AuthModule.getSession.bind(AuthModule),
    logout: AuthModule.logout.bind(AuthModule),
    isLoggedIn: AuthModule.isLoggedIn.bind(AuthModule)
};
