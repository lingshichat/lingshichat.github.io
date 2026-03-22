/**
 * 🎭 通用确认弹窗模块 (Confirmation Modal)
 * 
 * 功能：提供优雅的确认和提示弹窗，替代原生 alert() 和 confirm()
 * 适用范围：Admin、Editor 等所有页面
 * 
 * 使用方法：
 * ```javascript
 * import { ConfirmModal } from './js/confirm-modal.js';
 * 
 * // 确认弹窗
 * const confirmed = await ConfirmModal.show({
 *     title: '删除确认',
 *     message: '确定要删除这条记录吗？',
 *     confirmText: '确定',
 *     cancelText: '取消',
 *     type: 'danger' // 'info' | 'warning' | 'danger'
 * });
 * 
 * if (confirmed) {
 *     // 用户点击了确定
 * }
 * 
 * // 提示弹窗（仅确认）
 * await ConfirmModal.alert({
 *     title: '提示',
 *     message: '操作成功！'
 * });
 * ```
 */

export const ConfirmModal = {
    // 模态框容器
    container: null,
    currentResolve: null,
    _escHandler: null,

    /**
     * 初始化模态框 DOM
     */
    init() {
        if (this.container) return; // 已初始化

        // 创建模态框 HTML
        const html = `
            <div id="confirm-modal-overlay" class="confirm-modal-overlay" style="display: none;">
                <div class="confirm-modal-container">
                    <div class="confirm-modal-header">
                        <i class="confirm-modal-icon fa-solid"></i>
                        <h3 class="confirm-modal-title"></h3>
                    </div>
                    <div class="confirm-modal-body">
                        <p class="confirm-modal-message"></p>
                    </div>
                    <div class="confirm-modal-footer">
                        <button class="confirm-modal-btn confirm-modal-btn-cancel">取消</button>
                        <button class="confirm-modal-btn confirm-modal-btn-confirm">确定</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', html);
        this.container = document.getElementById('confirm-modal-overlay');

        // 绑定事件
        this.bindEvents();
        this.injectStyles();
    },

    /**
     * 绑定按钮事件
     */
    bindEvents() {
        const confirmBtn = this.container.querySelector('.confirm-modal-btn-confirm');
        const cancelBtn = this.container.querySelector('.confirm-modal-btn-cancel');
        const overlay = this.container;

        confirmBtn.addEventListener('click', () => this.close(true));
        cancelBtn.addEventListener('click', () => this.close(false));

        // 点击背景关闭
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.close(false);
            }
        });

        // ESC 处理函数保存引用，供 show/close 动态绑定/解绑
        this._escHandler = (e) => {
            if (e.key === 'Escape') {
                this.close(false);
            }
        };
    },

    /**
     * 注入样式
     */
    injectStyles() {
        if (document.getElementById('confirm-modal-styles')) return;

        const style = document.createElement('style');
        style.id = 'confirm-modal-styles';
        style.textContent = `
            .confirm-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0, 0, 0, 0.6);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                animation: fadeIn 0.2s ease-out;
            }

            .confirm-modal-container {
                background: rgba(20, 40, 80, 0.95);
                backdrop-filter: blur(40px);
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 16px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                padding: 28px;
                min-width: 360px;
                max-width: 480px;
                animation: modalSlideIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }

            .confirm-modal-header {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 20px;
            }

            .confirm-modal-icon {
                font-size: 1.5rem;
                width: 40px;
                height: 40px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }

            .confirm-modal-icon.type-info {
                background: rgba(59, 112, 252, 0.2);
                color: #3b70fc;
            }

            .confirm-modal-icon.type-warning {
                background: rgba(251, 191, 36, 0.2);
                color: #fbbf24;
            }

            .confirm-modal-icon.type-danger {
                background: rgba(239, 68, 68, 0.2);
                color: #ef4444;
            }

            .confirm-modal-title {
                margin: 0;
                font-size: 1.2rem;
                font-weight: 600;
                color: #fff;
                flex: 1;
            }

            .confirm-modal-body {
                margin-bottom: 24px;
            }

            .confirm-modal-message {
                margin: 0;
                font-size: 0.95rem;
                color: rgba(255, 255, 255, 0.8);
                line-height: 1.6;
                white-space: pre-wrap;
            }

            .confirm-modal-footer {
                display: flex;
                gap: 12px;
                justify-content: flex-end;
            }

            .confirm-modal-btn {
                padding: 10px 24px;
                border-radius: 8px;
                border: none;
                font-size: 0.9rem;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
            }

            .confirm-modal-btn-cancel {
                background: rgba(255, 255, 255, 0.1);
                color: rgba(255, 255, 255, 0.7);
                border: 1px solid rgba(255, 255, 255, 0.1);
            }

            .confirm-modal-btn-cancel:hover {
                background: rgba(255, 255, 255, 0.15);
                color: #fff;
            }

            .confirm-modal-btn-confirm {
                background: #3b70fc;
                color: #fff;
                box-shadow: 0 4px 12px rgba(59, 112, 252, 0.3);
            }

            .confirm-modal-btn-confirm:hover {
                background: #2563eb;
                box-shadow: 0 6px 16px rgba(59, 112, 252, 0.4);
                transform: translateY(-1px);
            }

            .confirm-modal-btn-confirm:active {
                transform: translateY(0);
            }

            .confirm-modal-btn-confirm.type-danger {
                background: #ef4444;
                box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
            }

            .confirm-modal-btn-confirm.type-danger:hover {
                background: #dc2626;
                box-shadow: 0 6px 16px rgba(239, 68, 68, 0.4);
            }

            /* 仅 Alert 模式：隐藏取消按钮 */
            .confirm-modal-overlay.alert-mode .confirm-modal-btn-cancel {
                display: none;
            }

            @keyframes fadeIn {
                from {
                    opacity: 0;
                }
                to {
                    opacity: 1;
                }
            }

            @keyframes modalSlideIn {
                from {
                    opacity: 0;
                    transform: translateY(-20px) scale(0.95);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }
        `;
        document.head.appendChild(style);
    },

    /**
     * 显示确认弹窗
     * @param {Object} options - 配置选项
     * @returns {Promise<boolean>} - 用户是否确认
     */
    show(options = {}) {
        this.init();

        const {
            title = '确认',
            message = '',
            confirmText = '确定',
            cancelText = '取消',
            type = 'info' // 'info' | 'warning' | 'danger'
        } = options;

        // 设置内容
        this.container.querySelector('.confirm-modal-title').textContent = title;
        this.container.querySelector('.confirm-modal-message').textContent = message;
        this.container.querySelector('.confirm-modal-btn-confirm').textContent = confirmText;
        this.container.querySelector('.confirm-modal-btn-cancel').textContent = cancelText;

        // 设置图标和样式
        const icon = this.container.querySelector('.confirm-modal-icon');
        const confirmBtn = this.container.querySelector('.confirm-modal-btn-confirm');

        icon.className = `confirm-modal-icon fa-solid type-${type}`;
        confirmBtn.className = `confirm-modal-btn confirm-modal-btn-confirm type-${type}`;

        if (type === 'info') {
            icon.classList.add('fa-circle-info');
        } else if (type === 'warning') {
            icon.classList.add('fa-triangle-exclamation');
        } else if (type === 'danger') {
            icon.classList.add('fa-circle-exclamation');
        }

        // 移除 alert 模式
        this.container.classList.remove('alert-mode');

        // 显示弹窗
        this.container.style.display = 'flex';

        // 绑定 ESC 监听
        document.addEventListener('keydown', this._escHandler);

        // 返回 Promise
        return new Promise((resolve) => {
            this.currentResolve = resolve;
        });
    },

    /**
     * 显示提示弹窗（仅确认按钮）
     * @param {Object} options - 配置选项
     * @returns {Promise<void>}
     */
    async alert(options = {}) {
        this.init();

        const {
            title = '提示',
            message = '',
            confirmText = '确定',
            type = 'info'
        } = options;

        // 标记为 alert 模式
        this.container.classList.add('alert-mode');

        await this.show({
            title,
            message,
            confirmText,
            type
        });
    },

    /**
     * 关闭弹窗
     * @param {boolean} result - 确认结果
     */
    close(result) {
        // 解绑 ESC 监听
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
        }

        if (this.currentResolve) {
            // 短暂延迟，避免样式闪烁
            setTimeout(() => {
                this.currentResolve(result);
                this.currentResolve = null;
            }, 100);
        }

        this.container.style.display = 'none';
    }
};

// 全局便捷方法（可选）
window.confirm = async (message) => {
    return await ConfirmModal.show({
        title: '确认',
        message: message,
        type: 'warning'
    });
};

window.alert = async (message) => {
    await ConfirmModal.alert({
        title: '提示',
        message: message
    });
};
