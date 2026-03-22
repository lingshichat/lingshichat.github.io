/**
 * 公共工具函数模块
 * 供 Admin、Editor 等模块共用，避免重复实现
 */

/**
 * 格式化文件大小
 * @param {number} bytes 字节数
 * @returns {string} 格式化后的字符串
 */
export function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * 判断是否为纯对象
 * @param {*} value
 * @returns {boolean}
 */
export function isPlainObject(value) {
    return Object.prototype.toString.call(value) === "[object Object]";
}

/**
 * 深度合并配置对象（base + override）
 * @param {object} base 基础配置
 * @param {object} override 覆盖配置
 * @returns {object} 合并后的配置
 */
export function mergeConfig(base, override) {
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
