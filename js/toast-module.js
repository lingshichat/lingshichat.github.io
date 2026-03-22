export const Toast = {
    /**
     * 显示 Toast 通知
     * @param {string} message 消息内容
     * @param {string} type 类型: 'success' | 'warning' | 'error' | 'info'
     * @param {number} duration 持续时间 (ms)
     */
    show(message, type = 'info', duration = 3500) {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }
        container.classList.add('toast-container');

        const icons = {
            success: 'fa-solid fa-check',
            warning: 'fa-solid fa-triangle-exclamation',
            error: 'fa-solid fa-circle-xmark',
            info: 'fa-solid fa-circle-info'
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        // 使用 DOM API 构建，避免 innerHTML XSS 风险
        const iconDiv = document.createElement('div');
        iconDiv.className = 'toast-icon';
        const iconEl = document.createElement('i');
        iconEl.className = icons[type] || icons.info;
        iconDiv.appendChild(iconEl);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'toast-content';
        const msgDiv = document.createElement('div');
        msgDiv.className = 'toast-message';
        msgDiv.textContent = message;
        contentDiv.appendChild(msgDiv);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'toast-close';
        const closeIcon = document.createElement('i');
        closeIcon.className = 'fa-solid fa-xmark';
        closeBtn.appendChild(closeIcon);

        toast.appendChild(iconDiv);
        toast.appendChild(contentDiv);
        toast.appendChild(closeBtn);

        // Close button logic
        closeBtn.onclick = () => {
            toast.classList.add('toast-exit');
            setTimeout(() => toast.remove(), 300);
        };

        container.appendChild(toast);

        // Auto remove
        setTimeout(() => {
            if (toast.parentNode) {
                toast.classList.add('toast-exit');
                setTimeout(() => toast.remove(), 300);
            }
        }, duration);
    }
};
