/**
 * 🔮 Admin Portal - The Hidden Door (Footer Version)
 * 在页脚独立一行的水晶球占卜入口
 */
(function () {
    const injectPortal = () => {
        // 1. Target the runtime span to find the footer context
        const runtimeSpan = document.getElementById('runtime_span');
        if (!runtimeSpan) return;

        // 2. Avoid duplicates
        if (document.getElementById('admin-portal-container')) return;

        // 3. Create a wrapper for the new line
        const container = document.createElement('div');
        container.id = 'admin-portal-container';
        container.style.cssText = `
            width: 100%;
            text-align: center;
            margin-top: 10px;
            margin-bottom: 5px;
            height: 30px; /* Reserve space */
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        // 4. Create the crystal ball button
        const btn = document.createElement('a');
        btn.id = 'admin-footer-portal';
        btn.href = '/admin/';
        btn.title = "命运的占卜";

        // Style: Centered, Colorful, Glowing on Hover
        btn.style.cssText = `
            cursor: pointer;
            text-decoration: none;
            transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            font-size: 24px; /* Larger size */
            display: inline-block;
            filter: drop-shadow(0 0 2px rgba(168, 85, 247, 0.3)); /* Subtle default glow */
            opacity: 0.9;
        `;
        btn.innerHTML = '🔮';

        // Hover effect: Strong Glow + Float
        btn.addEventListener('mouseenter', () => {
            btn.style.filter = 'drop-shadow(0 0 15px rgba(168, 85, 247, 0.8)) hue-rotate(-10deg)';
            btn.style.transform = 'translateY(-3px) scale(1.1)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.filter = 'drop-shadow(0 0 2px rgba(168, 85, 247, 0.3))';
            btn.style.transform = 'translateY(0) scale(1)';
        });

        // 5. Login Check
        const session = JSON.parse(localStorage.getItem('auth_session') || 'null');
        if (session && session.expires > Date.now()) {
            btn.title = "进入控制台";
            btn.style.filter = 'drop-shadow(0 0 5px rgba(59, 112, 252, 0.6))'; // Blue glow for logged in
        }

        // 6. Append to container, then insert container after runtimeSpan's parent (often a <p>)
        // Trying to append to the end of the footer content wrapper which usually holds the copyright paragraphs
        container.appendChild(btn);

        // We find the parent of runtimeSpan (usually a <div> or <p>)
        // And append our container AFTER it.
        const parentBlock = runtimeSpan.parentNode;
        if (parentBlock && parentBlock.parentNode) {
            parentBlock.parentNode.insertBefore(container, parentBlock.nextSibling);
        }
    };

    // Run on init and Pjax complete
    document.addEventListener('DOMContentLoaded', injectPortal);
    document.addEventListener('pjax:complete', injectPortal);
    injectPortal();
})();

// ============================================
// 彩蛋触发系统 - Konami Code + CSS 流星 (非首页)
// 注意：首页的流星由 shooting_stars.js (Canvas 版) 负责。
// 本系统仅在非首页、非 admin、非 easter-egg 页面运行。
// ============================================
(function () {
    // 防止在彩蛋页面或 admin 页面触发
    if (window.location.pathname.includes('/easter-egg') ||
        window.location.pathname.includes('/admin')) {
        return;
    }

    // ========== Konami Code 监听器 ==========
    const konamiCode = [
        'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
        'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
        'KeyB', 'KeyA'
    ];
    let konamiIndex = 0;

    document.addEventListener('keydown', (e) => {
        if (e.code === konamiCode[konamiIndex]) {
            konamiIndex++;
            if (konamiIndex === konamiCode.length) {
                konamiIndex = 0;
                triggerEasterEgg();
            }
        } else {
            konamiIndex = 0;
        }
    });

    // ========== 流星系统 ==========
    class ShootingStar {
        constructor() {
            this.element = null;
            this.isActive = false;
            this.injectStyles();
            this.scheduleNext();
        }

        // 注入 CSS 样式
        injectStyles() {
            if (document.getElementById('shooting-star-styles')) return;

            const style = document.createElement('style');
            style.id = 'shooting-star-styles';
            style.textContent = `
                .shooting-star {
                    position: fixed;
                    width: 6px;
                    height: 6px;
                    background: #fff;
                    border-radius: 50%;
                    pointer-events: auto;
                    cursor: pointer;
                    z-index: 99999;
                    box-shadow: 
                        0 0 10px #fff,
                        0 0 20px #3b70fc,
                        0 0 30px #3b70fc;
                    animation: shootingStarMove 2.5s linear forwards;
                }

                .shooting-star::before {
                    content: '';
                    position: absolute;
                    top: 50%;
                    right: 6px;
                    width: 120px;
                    height: 2px;
                    background: linear-gradient(90deg, 
                        rgba(59, 112, 252, 0.9),
                        rgba(131, 56, 236, 0.5),
                        transparent
                    );
                    transform: translateY(-50%);
                    border-radius: 2px;
                }

                .shooting-star:hover {
                    box-shadow: 
                        0 0 15px #fff,
                        0 0 30px #3b70fc,
                        0 0 50px #3b70fc;
                    transform: scale(1.5);
                }

                @keyframes shootingStarMove {
                    0% {
                        opacity: 1;
                    }
                    90% {
                        opacity: 1;
                    }
                    100% {
                        transform: translate(-120vw, 80vh);
                        opacity: 0;
                    }
                }

                /* Emoji 散落动画 */
                .falling-emoji {
                    position: fixed;
                    font-size: 24px;
                    pointer-events: none;
                    z-index: 999999;
                    animation: emojifall 2s ease-out forwards;
                }

                @keyframes emojifall {
                    0% {
                        opacity: 1;
                        transform: translate(0, 0) rotate(0deg) scale(1);
                    }
                    100% {
                        opacity: 0;
                        transform: translate(var(--tx), var(--ty)) rotate(var(--rot)) scale(0.5);
                    }
                }
            `;
            document.head.appendChild(style);
        }

        // 安排下一次流星出现
        scheduleNext() {
            // 30-90秒随机间隔
            const delay = 30000 + Math.random() * 60000;
            setTimeout(() => this.spawn(), delay);
        }

        // 生成流星
        spawn() {
            if (this.isActive) {
                this.scheduleNext();
                return;
            }

            this.isActive = true;

            // 创建流星元素
            this.element = document.createElement('div');
            this.element.className = 'shooting-star';

            // 随机起始位置 (屏幕右上区域)
            const startX = window.innerWidth * 0.6 + Math.random() * window.innerWidth * 0.4;
            const startY = Math.random() * window.innerHeight * 0.3;

            this.element.style.left = startX + 'px';
            this.element.style.top = startY + 'px';

            // 绑定点击事件
            this.element.addEventListener('click', (e) => {
                e.stopPropagation();
                this.onClick(e);
            });

            document.body.appendChild(this.element);

            // 动画结束后移除
            setTimeout(() => {
                if (this.element && this.element.parentNode) {
                    this.element.parentNode.removeChild(this.element);
                }
                this.isActive = false;
                this.scheduleNext();
            }, 2500);
        }

        // 点击流星
        onClick(e) {
            const clickX = e.clientX;
            const clickY = e.clientY;

            // 移除流星
            if (this.element && this.element.parentNode) {
                this.element.parentNode.removeChild(this.element);
            }
            this.isActive = false;

            // 触发 emoji 散落效果
            this.spawnEmojiExplosion(clickX, clickY);

            // 延迟后跳转
            setTimeout(() => {
                window.location.href = '/easter-egg/';
            }, 1800);
        }

        // 生成 emoji 散落
        spawnEmojiExplosion(x, y) {
            const count = 30 + Math.floor(Math.random() * 20); // 30-50个

            for (let i = 0; i < count; i++) {
                const emoji = document.createElement('div');
                emoji.className = 'falling-emoji';
                emoji.textContent = '🌠';

                // 随机散落方向
                const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
                const distance = 100 + Math.random() * 300;
                const tx = Math.cos(angle) * distance;
                const ty = Math.sin(angle) * distance + 200; // 加重力下落
                const rotation = (Math.random() - 0.5) * 720;

                emoji.style.left = x + 'px';
                emoji.style.top = y + 'px';
                emoji.style.setProperty('--tx', tx + 'px');
                emoji.style.setProperty('--ty', ty + 'px');
                emoji.style.setProperty('--rot', rotation + 'deg');
                emoji.style.animationDelay = (Math.random() * 0.3) + 's';
                emoji.style.fontSize = (20 + Math.random() * 16) + 'px';

                document.body.appendChild(emoji);

                // 动画结束后移除
                setTimeout(() => {
                    if (emoji.parentNode) {
                        emoji.parentNode.removeChild(emoji);
                    }
                }, 2500);
            }
        }
    }

    // 触发彩蛋 (Konami Code 方式)
    function triggerEasterEgg() {
        // 简单闪烁效果后跳转
        const flash = document.createElement('div');
        flash.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(59, 112, 252, 0.3);
            z-index: 999999;
            animation: flashEffect 0.5s ease-out forwards;
        `;

        const flashStyle = document.createElement('style');
        flashStyle.textContent = `
            @keyframes flashEffect {
                0% { opacity: 0; }
                50% { opacity: 1; }
                100% { opacity: 0; }
            }
        `;
        document.head.appendChild(flashStyle);
        document.body.appendChild(flash);

        setTimeout(() => {
            window.location.href = '/easter-egg/';
        }, 500);
    }

    // 初始化流星系统
    new ShootingStar();
})();
