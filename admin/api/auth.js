import { CONFIG } from '../config.js';

// 🔐 共享认证模块 (Admin & Editor)
export const Auth = {
    SESSION_KEY: 'auth_session',

    /**
     * 尝试使用密码解密所有 Token
     * @param {string} password 用户输入的密码
     * @returns {object|null} 解密后的 tokens 对象 或 null
     */
    decryptAll(password) {
        const result = {
            github: null,
            cf: null
        };

        try {
            // 1. 解密 GitHub Token
            if (CONFIG.GITHUB_TOKEN) {
                const bytes = CryptoJS.AES.decrypt(CONFIG.GITHUB_TOKEN, password);
                const original = bytes.toString(CryptoJS.enc.Utf8);
                if (original.startsWith('ghp_') || original.startsWith('github_pat_')) {
                    result.github = original;
                } else {
                    // 密码错误导致解密出垃圾数据
                    return null;
                }
            }

            // 2. 解密 CF Token (如果有配置)
            if (CONFIG.CF_TOKEN) {
                const bytes = CryptoJS.AES.decrypt(CONFIG.CF_TOKEN, password);
                const original = bytes.toString(CryptoJS.enc.Utf8);
                // CF Token 通常是 40 字符的 hex 或 base64，这里不做严格校验，只要能解密即可
                if (original) {
                    result.cf = original;
                }
            }

            return result;
        } catch (e) {
            console.error("解密失败", e);
            return null;
        }
    },

    /**
     * 保存会话到 localStorage
     */
    saveSession(tokens) {
        const session = {
            ...tokens,
            login_time: Date.now(),
            expires: Date.now() + 24 * 60 * 60 * 1000 // 24小时有效
        };
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
    },

    /**
     * 获取当前会话
     */
    getSession() {
        const json = localStorage.getItem(this.SESSION_KEY);
        if (!json) return null;

        try {
            const session = JSON.parse(json);
            if (Date.now() > session.expires) {
                this.logout();
                return null;
            }
            return session;
        } catch (e) {
            this.logout();
            return null;
        }
    },

    /**
     * 登出
     */
    logout() {
        localStorage.removeItem(this.SESSION_KEY);
        // 如果在 Admin 页面，可能需要重定向到登录页
    },

    /**
     * 验证是否已登录
     */
    isLoggedIn() {
        return !!this.getSession();
    }
};
