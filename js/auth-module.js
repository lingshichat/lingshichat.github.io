/**
 * 🔐 统一认证模块 (Shared Auth Module)
 * 供 Editor 和 Admin 共用
 */

// 通用配置加载器 - 由调用方传入
let _config = null;

export const AuthModule = {
    SESSION_KEY: 'auth_session',

    /**
     * 初始化配置
     * @param {object} config - 包含 GITHUB_TOKEN, CF_TOKEN 等的配置对象
     */
    init(config) {
        _config = config;
    },

    /**
     * 通用 Token 解密
     * @param {string} password - 用户密码
     * @param {string} encryptedToken - 加密的 Token
     * @returns {string|null} 解密后的 Token 或 null
     */
    decryptToken(password, encryptedToken) {
        if (!encryptedToken) {
            throw new Error("未配置加密的 Token");
        }

        try {
            const bytes = CryptoJS.AES.decrypt(encryptedToken, password);
            const original = bytes.toString(CryptoJS.enc.Utf8);
            return original || null;
        } catch (e) {
            console.error("解密失败", e);
            return null;
        }
    },

    /**
     * 解密 GitHub Token 并验证格式
     * @param {string} password - 用户密码
     * @returns {string|null} 解密后的 GitHub Token 或 null
     */
    decryptGitHubToken(password) {
        if (!_config || !_config.GITHUB_TOKEN) {
            throw new Error("请先在 config.js 中配置加密的 Token");
        }

        try {
            const bytes = CryptoJS.AES.decrypt(_config.GITHUB_TOKEN, password);
            const original = bytes.toString(CryptoJS.enc.Utf8);

            // 验证 Token 格式
            if (original.startsWith('ghp_') || original.startsWith('github_pat_')) {
                return original;
            }
            return null; // 密码错误导致解密出垃圾数据
        } catch (e) {
            console.error("解密失败", e);
            return null;
        }
    },

    /**
     * 批量解密所有 Token (GitHub + CF)
     * @param {string} password - 用户密码
     * @returns {object|null} 解密后的 tokens 对象 或 null
     */
    decryptAll(password) {
        if (!_config) {
            throw new Error("请先调用 AuthModule.init(config) 初始化配置");
        }

        const result = {
            github: null,
            cf: null
        };

        try {
            // 1. 解密 GitHub Token
            if (_config.GITHUB_TOKEN) {
                const bytes = CryptoJS.AES.decrypt(_config.GITHUB_TOKEN, password);
                const original = bytes.toString(CryptoJS.enc.Utf8);
                if (original.startsWith('ghp_') || original.startsWith('github_pat_')) {
                    result.github = original;
                } else {
                    // 密码错误导致解密出垃圾数据
                    return null;
                }
            }

            // 2. 解密 CF Token (如果有配置)
            if (_config.CF_TOKEN) {
                const bytes = CryptoJS.AES.decrypt(_config.CF_TOKEN, password);
                const original = bytes.toString(CryptoJS.enc.Utf8);
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
     * @param {object} tokens - { github, cf } Token 对象
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
     * @returns {object|null} 会话对象或 null
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
     * 登出 - 清除会话
     */
    logout() {
        localStorage.removeItem(this.SESSION_KEY);
        // 兼容旧版 Editor 的 token 存储
        localStorage.removeItem('blog_editor_token');
    },

    /**
     * 验证是否已登录
     * @returns {boolean}
     */
    isLoggedIn() {
        return !!this.getSession();
    }
};
