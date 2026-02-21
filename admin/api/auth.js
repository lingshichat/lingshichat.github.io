/**
 * 🔐 Admin 认证模块 (引用公共模块)
 */
import { CONFIG } from '../config.js';
import { AuthModule } from '../../js/auth-module.js';

// 初始化配置
AuthModule.init(CONFIG);

// 导出兼容接口 - 保持与原有代码的兼容性
export const Auth = {
    SESSION_KEY: AuthModule.SESSION_KEY,

    /**
     * 尝试使用密码解密所有 Token
     * @param {string} password 用户输入的密码
     * @returns {object|null} 解密后的 tokens 对象 或 null
     */
    decryptAll(password) {
        return AuthModule.decryptAll(password);
    },

    /**
     * 保存会话到 localStorage
     */
    saveSession(tokens) {
        return AuthModule.saveSession(tokens);
    },

    /**
     * 获取当前会话
     */
    getSession() {
        return AuthModule.getSession();
    },

    /**
     * 登出
     */
    logout() {
        return AuthModule.logout();
    },

    /**
     * 验证是否已登录
     */
    isLoggedIn() {
        return AuthModule.isLoggedIn();
    }
};
