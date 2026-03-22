/**
 * 拟物化流星雨特效 + 彩蛋触发器 (Canvas 版，仅首页)
 *
 * 注意：本文件仅在首页 (/) 运行，使用 Canvas 绘制五角星流星。
 * 非首页的彩蛋触发由 admin-portal.js 中的 CSS 流星系统负责。
 * 两者职责互斥，不会同时运行。
 */

(function () {
    // 仅在首页运行
    if (location.pathname !== '/' && location.pathname !== '/index.html') {
        return;
    }

    const canvas = document.createElement('canvas');
    canvas.id = 'star-canvas';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    let width, height;
    let stars = [];
    const STAR_COUNT = 8; // 同屏在流星数量，不仅太密集
    let animationFrameId;

    // 彩蛋配置
    const SPECIAL_STAR_PROBABILITY = 0.15; // 15% 概率生成特别流星
    const EASTER_EGG_URL = '/easter-egg/';

    // 初始化画布尺寸
    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
    }

    window.addEventListener('resize', resize);
    resize();

    // 流星类
    class Star {
        constructor() {
            this.reset(true);
        }

        reset(initial = false) {
            this.x = Math.random() * width;
            this.y = Math.random() * height * 0.5; // 从上半部分开始
            this.len = Math.random() * 80 + 150; // 拖尾长度
            this.speed = Math.random() * 0.6 + 0.2; // 速度：极慢 (0.2 ~ 0.8)
            this.size = Math.random() * 1 + 0.5; // 大小
            this.angle = 45 * Math.PI / 180; // 45度角下落

            // 拟物化：根据速度决定透明度，越快越亮
            this.opacity = Math.random() * 0.5 + 0.3;

            // 是否为特别流星
            this.isSpecial = Math.random() < SPECIAL_STAR_PROBABILITY;

            // 流彩动画属性
            this.hue = Math.random() * 360;

            // 如果是初始生成，随机分布在屏幕上；否则从屏幕外生成
            if (!initial) {
                // 为了向右下移动，起始点主要生成在左上方
                this.x = Math.random() * width * 1.2 - width * 0.2; // -0.2w ~ 1.0w
                this.y = -100;
            }

            // 样式配置
            if (this.isSpecial) {
                this.size *= 2; // 特别流星稍大
                this.speed *= 0.9; // 稍慢，方便点击
                this.opacity = 1;
                // Color handled in draw() for rainbow effect
            } else {
                // 普通流星现在是之前的"特别流星"设计（金色星星）
                this.color = '#FFD700'; // 金色
            }
        }

        update() {
            this.x += this.speed * Math.cos(this.angle); // 向右下移动
            this.y += this.speed * Math.sin(this.angle);

            // 更新流彩颜色
            if (this.isSpecial) {
                this.hue = (this.hue + 2) % 360;
            }

            // 边界检查：超出屏幕重置
            if (this.x > width + this.len || this.y > height + this.len) {
                this.reset();
            }
        }

        draw() {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.angle - Math.PI); // 旋转以匹配运动方向

            // 1. 绘制拖尾 (Gradient Trail)
            // 从头部的中心开始，向后延伸
            const gradient = ctx.createLinearGradient(0, 0, this.len, 0);

            if (this.isSpecial) {
                // 彩虹拖尾 - 静态不流动 (Static Rainbow)
                // 颜色固定，不随 this.hue 变化，形成稳定的彩虹条
                gradient.addColorStop(0, `hsla(0, 100%, 65%, ${this.opacity})`);    // 红
                gradient.addColorStop(0.2, `hsla(45, 100%, 65%, ${this.opacity})`); // 橙
                gradient.addColorStop(0.4, `hsla(90, 100%, 65%, ${this.opacity})`); // 绿
                gradient.addColorStop(0.6, `hsla(180, 100%, 65%, ${this.opacity})`);// 青
                gradient.addColorStop(0.8, `hsla(270, 100%, 65%, ${this.opacity})`);// 紫
                gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            } else {
                // 普通金星：白色/浅金拖尾
                gradient.addColorStop(0, `rgba(255, 223, 0, ${this.opacity})`); // 接头部的金色
                gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            }

            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(this.len, 0);
            ctx.lineWidth = this.size;
            ctx.strokeStyle = gradient;
            ctx.lineCap = 'round';
            ctx.stroke();

            // 2. 绘制头部 (Glowing Head)

            if (this.isSpecial) {
                // 流彩五角星 - Telegram 会员标风格 (Premium Gradient)
                // 去除水流晃动，改为高质感的对角线渐变

                // 1. 定义线性渐变：从左上角到右下角
                // 覆盖星星的包围盒
                const r = this.size * 2;
                const starGrad = ctx.createLinearGradient(-r, -r, r, r);

                // 2. 颜色配置：基于 this.hue 生成双色渐变，营造立体感
                // 亮部
                starGrad.addColorStop(0, `hsla(${this.hue}, 100%, 75%, 1)`);
                // 暗部/对比色 (偏移 45度色相)
                starGrad.addColorStop(1, `hsla(${(this.hue + 45) % 360}, 100%, 50%, 1)`);

                // 3. 光晕：保持同色系
                ctx.shadowBlur = 15;
                ctx.shadowColor = `hsla(${this.hue}, 100%, 50%, 0.8)`;
                ctx.fillStyle = starGrad;

                this.drawStar(0, 0, 5, this.size * 4, this.size * 2);
            } else {
                // 普通流星：金色五角星
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#FFD700'; // 金色光晕
                ctx.fillStyle = '#FFD700';   // 金色实体
                // 尺寸稍微比特别流星小一点
                this.drawStar(0, 0, 5, this.size * 3, this.size * 1.5);
            }

            ctx.restore();
        }

        // 绘制五角星辅助函数
        drawStar(cx, cy, spikes, outerRadius, innerRadius) {
            let rot = Math.PI / 2 * 3;
            let checkX = cx;
            let checkY = cy;
            let step = Math.PI / spikes;

            ctx.beginPath();
            ctx.moveTo(cx, cy - outerRadius);

            for (let i = 0; i < spikes; i++) {
                checkX = cx + Math.cos(rot) * outerRadius;
                checkY = cy + Math.sin(rot) * outerRadius;
                ctx.lineTo(checkX, checkY);
                rot += step;

                checkX = cx + Math.cos(rot) * innerRadius;
                checkY = cy + Math.sin(rot) * innerRadius;
                ctx.lineTo(checkX, checkY);
                rot += step;
            }
            ctx.lineTo(cx, cy - outerRadius);
            ctx.closePath();
            ctx.fill();
        }

        // 简单的点击检测（圆形判定）
        checkClick(mouseX, mouseY) {
            if (!this.isSpecial) return false;

            // 计算流星头部的距离
            const dx = mouseX - this.x;
            const dy = mouseY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // 判定范围：头部半径 + 20px 缓冲
            return distance < (this.size * 5 + 20);
        }
    }

    // 初始化流星
    for (let i = 0; i < STAR_COUNT; i++) {
        stars.push(new Star());
    }

    // 动画循环（页面不可见时自动暂停，节省资源）
    let isPageVisible = true;

    function animate() {
        if (!isPageVisible) return;

        ctx.clearRect(0, 0, width, height);

        stars.forEach(star => {
            star.update();
            star.draw();
        });

        animationFrameId = requestAnimationFrame(animate);
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            isPageVisible = false;
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
        } else {
            isPageVisible = true;
            animate();
        }
    });

    animate();

    // 交互监听
    // 交互监听：使用 window 监听，因为 canvas 默认 pointer-events: none
    window.addEventListener('click', (e) => {
        // 如果点击时 Canvas 处于允许点击状态（即在星星上），则我们在 Canvas 的 click 事件中处理
        // 但由于 pointer-events 切换可能有延迟或竞态，这里也进行一次判定作为备份，
        // 或者完全依赖 window 的点击判定。
        // 为了稳健，直接在这里判定是否点中特别流星。

        // 注意：如果 canvas pointer-events: auto 生效，window 也会收到冒泡（除非 stopPropagation）。
        // 这里的逻辑改为：只在 window 层面做判定，完全忽略 canvas 的点击事件绑定，
        // 这样可以避免 pointer-events 切换带来的复杂性。

        const mouseX = e.clientX;
        const mouseY = e.clientY;

        for (let star of stars) {
            if (star.checkClick(mouseX, mouseY)) {
                // 触发彩蛋！
                console.log("🌟 Special Star Clicked!");

                // 简单的视觉反馈 - 可以在点击处生成一个小火花（可选，暂略）

                // 跳转
                window.location.href = EASTER_EGG_URL;
                break;
            }
        }
    });

    // 鼠标移动时的光标反馈 & 在星星上时为了视觉效果（如 tooltip）临时启用 pointer-events (可选)
    // 但更简单的做法是：不用切换 pointer-events，只改变光标。
    // 问题：如果 pointer-events: none，canvas 无法设置 cursor: pointer 给用户看。
    // 解决：给这里的 document.body 设置 cursor，或者当悬停时切换 canvas 的 pointer-events。

    window.addEventListener('mousemove', (e) => {
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        let hoveringSpecial = false;
        for (let star of stars) {
            if (star.checkClick(mouseX, mouseY)) {
                hoveringSpecial = true;
                break;
            }
        }

        if (hoveringSpecial) {
            canvas.style.pointerEvents = 'auto'; // 允许捕获点击（如果保留 canvas click）和显示小手
            canvas.style.cursor = 'pointer';
        } else {
            canvas.style.pointerEvents = 'none'; // 恢复穿透
            canvas.style.cursor = 'default';
        }
    });

})();
