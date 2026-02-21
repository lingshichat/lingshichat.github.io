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

        const icons = {
            success: 'fa-solid fa-check',
            warning: 'fa-solid fa-triangle-exclamation',
            error: 'fa-solid fa-circle-xmark',
            info: 'fa-solid fa-circle-info'
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-icon"><i class="${icons[type] || icons.info}"></i></div>
            <div class="toast-content">
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close"><i class="fa-solid fa-xmark"></i></button>
        `;

        // Close button logic
        toast.querySelector('.toast-close').onclick = () => {
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
