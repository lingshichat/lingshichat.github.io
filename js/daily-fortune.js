/**
 * 🔮 交互式今日运势模块 - Interactive Daily Fortune
 * 
 * 功能：水晶球占卜交互 + 绽放动画 + 运势展示
 * 特点：
 * - 每次刷新都可重新点击水晶球体验动画
 * - 运势结果基于日期种子，同一天固定
 * - 缓慢优雅的 2 秒绽放动画
 */

(function () {
    "use strict";

    // ==================== 配置区 ====================

    // 运势等级配置
    const FORTUNE_LEVELS = [
        { level: "大吉", icon: "🌟", color: "#FFD700", glowColor: "rgba(255, 215, 0, 0.6)" },
        { level: "中吉", icon: "✨", color: "#87CEEB", glowColor: "rgba(135, 206, 235, 0.6)" },
        { level: "小吉", icon: "🌸", color: "#FFB6C1", glowColor: "rgba(255, 182, 193, 0.6)" },
        { level: "吉", icon: "🍀", color: "#98FB98", glowColor: "rgba(152, 251, 152, 0.6)" },
        { level: "末吉", icon: "☁️", color: "#E6E6FA", glowColor: "rgba(230, 230, 250, 0.6)" }
    ];

    // 运势维度
    const DIMENSIONS = [
        { key: "career", name: "事业", icon: "💼" },
        { key: "love", name: "感情", icon: "💕" },
        { key: "wealth", name: "财运", icon: "💰" },
        { key: "health", name: "健康", icon: "🏃" }
    ];

    // 每日箴言库
    const QUOTES = [
        "保持平常心，好运自然来",
        "今日宜静不宜动，蓄势待发",
        "贵人相助，诸事顺遂",
        "小心谨慎，稳中求进",
        "心想事成，万事如意",
        "厚积薄发，水到渠成",
        "守得云开见月明",
        "退一步海阔天空",
        "机会就在眼前，把握当下",
        "耐心等待，转机将至",
        "今日适合创新尝试",
        "与人为善，福报自来",
        "专注当下，不念过往",
        "脚踏实地，仰望星空",
        "顺其自然，随遇而安"
    ];

    // 幸运色库
    const LUCKY_COLORS = [
        { name: "天蓝", hex: "#87CEEB" },
        { name: "玫瑰粉", hex: "#FFB6C1" },
        { name: "薄荷绿", hex: "#98FB98" },
        { name: "薰衣草紫", hex: "#E6E6FA" },
        { name: "琥珀金", hex: "#FFBF00" },
        { name: "珊瑚橙", hex: "#FF7F50" },
        { name: "宝石蓝", hex: "#3b70fc" }
    ];

    // 注：已移除 localStorage，每次刷新都可重新交互

    // ==================== 核心算法 ====================

    function getDateSeed() {
        const today = new Date();
        return today.getFullYear() * 10000 +
            (today.getMonth() + 1) * 100 +
            today.getDate();
    }

    function seededRandom(seed) {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }

    function seededPick(arr, seed) {
        const index = Math.floor(seededRandom(seed) * arr.length);
        return arr[index];
    }

    function generateStars(seed) {
        const rand = seededRandom(seed);
        if (rand < 0.1) return 2;
        if (rand < 0.3) return 3;
        if (rand < 0.6) return 4;
        return 5;
    }

    function generateDailyFortune() {
        const baseSeed = getDateSeed();
        const fortuneLevel = seededPick(FORTUNE_LEVELS, baseSeed);
        const dimensions = DIMENSIONS.map((dim, index) => ({
            ...dim,
            stars: generateStars(baseSeed + index * 1000)
        }));
        const quote = seededPick(QUOTES, baseSeed + 5000);
        const luckyColor = seededPick(LUCKY_COLORS, baseSeed + 6000);
        const luckyNumber = Math.floor(seededRandom(baseSeed + 7000) * 9) + 1;

        return { level: fortuneLevel, dimensions, quote, luckyColor, luckyNumber };
    }

    // ==================== 状态管理（已简化）====================
    // 每次刷新都从待机状态开始，运势结果由日期种子保证同一天固定

    // ==================== UI 渲染 ====================

    function renderStars(count) {
        const filled = "★".repeat(count);
        const empty = "☆".repeat(5 - count);
        return `<span class="fortune-stars">${filled}${empty}</span>`;
    }

    /**
     * 渲染待机状态（大水晶球）
     */
    function renderIdleState() {
        return `
            <div class="card-widget card-fortune" data-state="idle">
                <div class="fortune-idle-container">
                    <div class="fortune-orb-large">
                        <div class="orb-inner">
                            <span class="orb-emoji">🔮</span>
                        </div>
                        <div class="orb-glow"></div>
                        <div class="orb-pulse"></div>
                    </div>
                    <div class="fortune-hint">
                        <span class="hint-star">✦</span>
                        <span class="hint-text">点击占卜</span>
                        <span class="hint-star">✦</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染展示状态（完整运势）
     */
    function renderRevealedState(fortune) {
        const dimensionsHtml = fortune.dimensions.map(dim => `
            <div class="fortune-dimension">
                <span class="dim-icon">${dim.icon}</span>
                <span class="dim-name">${dim.name}</span>
                ${renderStars(dim.stars)}
            </div>
        `).join("");

        return `
            <div class="card-widget card-fortune" data-state="revealed">
                <div class="fortune-header">
                    <div class="fortune-orb-small">
                        <span class="orb-emoji">🔮</span>
                    </div>
                    <span class="fortune-title">今日运势</span>
                </div>
                
                <div class="fortune-level-wrapper">
                    <span class="fortune-level-icon">${fortune.level.icon}</span>
                    <span class="fortune-level" style="--fortune-color: ${fortune.level.color}; --fortune-glow: ${fortune.level.glowColor}">
                        ${fortune.level.level}
                    </span>
                </div>
                
                <div class="fortune-divider"></div>
                
                <div class="fortune-dimensions">
                    ${dimensionsHtml}
                </div>
                
                <div class="fortune-divider"></div>
                
                <div class="fortune-quote">
                    <span class="quote-icon">📝</span>
                    <span class="quote-text">"${fortune.quote}"</span>
                </div>
                
                <div class="fortune-lucky">
                    <span class="lucky-item">
                        <span class="lucky-dot" style="background: ${fortune.luckyColor.hex}"></span>
                        幸运色: ${fortune.luckyColor.name}
                    </span>
                    <span class="lucky-item">
                        🔢 幸运数字: ${fortune.luckyNumber}
                    </span>
                </div>
            </div>
        `;
    }

    /**
     * 执行绽放动画
     */
    function playRevealAnimation(cardElement, fortune) {
        return new Promise((resolve) => {
            const container = cardElement.querySelector(".fortune-idle-container");
            const orb = cardElement.querySelector(".fortune-orb-large");

            // 添加绽放动画类
            cardElement.classList.add("revealing");
            orb.classList.add("orb-bursting");

            // 创建光芒粒子
            createLightParticles(container);

            // 动画完成后替换内容
            setTimeout(() => {
                // 淡出当前内容
                cardElement.style.opacity = "0";

                setTimeout(() => {
                    // 替换为展示状态
                    const tempDiv = document.createElement("div");
                    tempDiv.innerHTML = renderRevealedState(fortune).trim();
                    const newCard = tempDiv.firstChild;
                    newCard.classList.add("fortune-entering");

                    cardElement.replaceWith(newCard);

                    // 触发入场动画
                    requestAnimationFrame(() => {
                        newCard.style.opacity = "1";
                    });

                    resolve(newCard);
                }, 300);
            }, 1700); // 总动画时长约 2 秒
        });
    }

    /**
     * 创建光芒粒子效果
     */
    function createLightParticles(container) {
        const particleCount = 12;
        const colors = ["#FFD700", "#87CEEB", "#FFB6C1", "#E6E6FA", "#fff"];

        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement("div");
            particle.className = "light-particle";

            const angle = (i / particleCount) * 360;
            const color = colors[i % colors.length];

            particle.style.cssText = `
                --angle: ${angle}deg;
                --color: ${color};
                animation-delay: ${i * 50}ms;
            `;

            container.appendChild(particle);

            // 动画结束后移除粒子
            setTimeout(() => particle.remove(), 1500);
        }
    }

    /**
     * 处理水晶球点击
     */
    function handleOrbClick(cardElement) {
        if (cardElement.classList.contains("revealing")) return;

        const fortune = generateDailyFortune();

        playRevealAnimation(cardElement, fortune).then(() => {
            console.log("[DailyFortune] 占卜完成:", fortune.level.level);
        });
    }

    /**
     * 注入运势卡片
     */
    function injectFortuneCard() {
        const aside = document.getElementById("aside-content");
        if (!aside) {
            console.warn("[DailyFortune] 未找到侧边栏容器");
            return;
        }

        // 每次都显示待机状态（水晶球）
        const cardHtml = renderIdleState();

        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = cardHtml.trim();
        const fortuneCard = tempDiv.firstChild;

        // 插入到侧边栏最顶部
        aside.insertBefore(fortuneCard, aside.firstChild);

        // 绑定点击事件
        const orbContainer = fortuneCard.querySelector(".fortune-idle-container");
        orbContainer.addEventListener("click", () => handleOrbClick(fortuneCard));
        orbContainer.style.cursor = "pointer";

        console.log("[DailyFortune] 水晶球已就位，等待占卜...");
    }

    // ==================== 初始化 ====================

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", injectFortuneCard);
    } else {
        injectFortuneCard();
    }

})();
