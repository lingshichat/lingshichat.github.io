/**
 * Neon City Pixel Runner
 * Style: Cyberpunk Pixel Art with Procedural Parallax Background
 * Core Mechanics: Based on Chromium T-Rex Runner
 */

// ============================================
// 常量与配置
// ============================================
const FPS = 60;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 300;

const CONFIG = {
    GRAVITY: 0.27,              // 更低重力，延长空中时间
    INITIAL_JUMP_VELOCITY: -8,  // 配合保持峰顶高度，水平更远
    DROP_VELOCITY: -6,
    MIN_JUMP_HEIGHT: 35,
    SPEED: 2.5,
    MAX_SPEED: 6,
    ACCELERATION: 0.001,
    GAP_COEFFICIENT: 0.6,
    BOTTOM_PAD: 30
};

const COLORS = {
    // 霓虹灯颜色 - 匹配黄昏暖色调
    neonCyan: '#4dd9e6',
    neonPink: '#ff6b9d',
    neonPurple: '#a855f7',
    neonYellow: '#fbbf24',
    neonOrange: '#fb923c',
    dark: '#1a1520',
    bodyGray: '#3d3545',
    white: '#fff5eb',
    // 天空渐变 - 更明亮的黄昏色调 (参考图片)
    skyTop: '#3d2850',      // 深紫色顶部
    skyMid1: '#8b5a7a',     // 粉紫过渡
    skyMid2: '#d88b7a',     // 珊瑚粉
    skyBottom: '#f5a575',   // 暖橙
    skyHorizon: '#ffd4b0',  // 浅金色地平线
    // 城市剪影 - 更明显的层次
    farCity: '#5a4565',     // 远景：较淡紫色
    midCity: '#3d3048',     // 中景：中等紫色
    nearCity: '#251b30',    // 近景：深紫黑色
    // 建筑灯光
    windowWarm: '#fbbf24',
    windowCool: '#4dd9e6',
    // 云彩 - 更亮
    cloudPink: 'rgba(220, 140, 160, 0.75)',
    cloudPurple: 'rgba(140, 100, 140, 0.55)'
};

// ============================================
// 工具函数
// ============================================
function getRandomNum(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ============================================
// 成就系统
// ============================================

const ACHIEVEMENTS = {
    // 单次得分成就
    score50: { id: 'score50', name: '初出茅庐', desc: '单次得分 50', target: 50, type: 'single', icon: '🏆' },
    score100: { id: 'score100', name: '屋顶飞人', desc: '单次得分 100', target: 100, type: 'single', icon: '🏆' },
    score200: { id: 'score200', name: '跑酷达人', desc: '单次得分 200', target: 200, type: 'single', icon: '🥇' },
    score500: { id: 'score500', name: '霓虹传说', desc: '单次得分 500', target: 500, type: 'single', icon: '👑' },
    // 累计得分成就
    total500: { id: 'total500', name: '积少成多', desc: '累计得分 500', target: 500, type: 'total', icon: '⭐' },
    total1000: { id: 'total1000', name: '坚持不懈', desc: '累计得分 1000', target: 1000, type: 'total', icon: '🌟' },
    total5000: { id: 'total5000', name: '城市守望者', desc: '累计得分 5000', target: 5000, type: 'total', icon: '💫' },
    total10000: { id: 'total10000', name: '永恒行者', desc: '累计得分 10000', target: 10000, type: 'total', icon: '🌠' }
};

class AchievementSystem {
    constructor() {
        this.unlocked = this.loadUnlocked();
        this.totalScore = this.loadTotalScore();
        this.pendingPopups = [];
        this.currentPopup = null;
        this.popupTimer = 0;
    }

    loadUnlocked() {
        try {
            return JSON.parse(localStorage.getItem('neonRunnerAchievements')) || {};
        } catch { return {}; }
    }

    saveUnlocked() {
        localStorage.setItem('neonRunnerAchievements', JSON.stringify(this.unlocked));
    }

    loadTotalScore() {
        try {
            return parseInt(localStorage.getItem('neonRunnerTotalScore')) || 0;
        } catch { return 0; }
    }

    saveTotalScore() {
        localStorage.setItem('neonRunnerTotalScore', this.totalScore.toString());
    }

    // 游戏结束时调用
    onGameEnd(sessionScore) {
        this.totalScore += sessionScore;
        this.saveTotalScore();

        // 检查单次得分成就
        Object.values(ACHIEVEMENTS).forEach(ach => {
            if (ach.type === 'single' && sessionScore >= ach.target && !this.unlocked[ach.id]) {
                this.unlock(ach);
            }
        });

        // 检查累计得分成就
        Object.values(ACHIEVEMENTS).forEach(ach => {
            if (ach.type === 'total' && this.totalScore >= ach.target && !this.unlocked[ach.id]) {
                this.unlock(ach);
            }
        });
    }

    // 游戏中实时检查（单次分数）
    checkDuringGame(currentScore) {
        Object.values(ACHIEVEMENTS).forEach(ach => {
            if (ach.type === 'single' && currentScore >= ach.target && !this.unlocked[ach.id]) {
                this.unlock(ach);
            }
        });
    }

    unlock(achievement) {
        this.unlocked[achievement.id] = true;
        this.saveUnlocked();
        this.pendingPopups.push(achievement);
    }

    update(deltaTime) {
        // 处理弹出队列
        if (this.currentPopup) {
            this.popupTimer -= deltaTime;
            if (this.popupTimer <= 0) {
                this.currentPopup = null;
            }
        } else if (this.pendingPopups.length > 0) {
            this.currentPopup = this.pendingPopups.shift();
            this.popupTimer = 3000; // 显示 3 秒
        }
    }

    draw(ctx) {
        if (!this.currentPopup) return;

        const ach = this.currentPopup;
        const popupW = 200;
        const popupH = 60;
        const popupX = (CANVAS_WIDTH - popupW) / 2;
        const popupY = 20;
        const progress = Math.min(1, (3000 - this.popupTimer) / 300); // 淡入
        const fadeOut = this.popupTimer < 500 ? this.popupTimer / 500 : 1; // 淡出

        ctx.save();
        ctx.globalAlpha = Math.min(progress, fadeOut);

        // 背景（像素风格）
        ctx.fillStyle = '#1a1528';
        ctx.fillRect(popupX, popupY, popupW, popupH);

        // 边框
        ctx.strokeStyle = COLORS.neonCyan;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 8;
        ctx.shadowColor = COLORS.neonCyan;
        ctx.strokeRect(popupX + 2, popupY + 2, popupW - 4, popupH - 4);
        ctx.shadowBlur = 0;

        // 奖杯图标区域
        ctx.fillStyle = '#2a2040';
        ctx.fillRect(popupX + 8, popupY + 8, 44, 44);

        // 像素奖杯绘制
        this.drawPixelTrophy(ctx, popupX + 12, popupY + 12, ach.icon === '👑' ? '#ffd700' : '#ffaa00');

        // 文字
        ctx.fillStyle = COLORS.neonCyan;
        ctx.font = '16px "DotGothic16", sans-serif'; // 再放大一点名字
        ctx.fillText(ach.name, popupX + 60, popupY + 30); // 居中调整

        ctx.fillStyle = '#aaaaaa';
        ctx.font = '10px "DotGothic16", sans-serif'; // 描述使用点阵中文字体
        ctx.fillText(ach.desc, popupX + 60, popupY + 48); // 居中调整

        ctx.restore();
    }

    drawPixelTrophy(ctx, x, y, color) {
        ctx.fillStyle = color;
        // 奖杯主体（像素风格）
        // 顶部杯口
        ctx.fillRect(x + 4, y, 28, 4);
        ctx.fillRect(x, y + 4, 36, 4);
        // 杯身
        ctx.fillRect(x + 2, y + 8, 32, 12);
        ctx.fillRect(x + 6, y + 20, 24, 4);
        ctx.fillRect(x + 10, y + 24, 16, 4);
        // 底座
        ctx.fillRect(x + 12, y + 28, 12, 4);
        ctx.fillRect(x + 8, y + 32, 20, 4);

        // 高光
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 6, y + 10, 4, 8);
    }
}

// 成就菜单逻辑
function showAchievements() {
    const list = document.getElementById('achievementList');
    list.innerHTML = '';

    if (!achievements) achievements = new AchievementSystem();

    Object.values(ACHIEVEMENTS).forEach(ach => {
        const unlocked = achievements.unlocked[ach.id];
        const item = document.createElement('div');
        item.className = `ach-item ${unlocked ? 'unlocked' : ''}`;

        item.innerHTML = `
            <div class="ach-icon">${ach.icon}</div>
            <div class="ach-content">
                <div class="ach-name">${ach.name}</div>
                <div class="ach-desc">${ach.desc}</div>
            </div>
        `;
        list.appendChild(item);
    });

    document.getElementById('achievementsOverlay').classList.remove('hidden');
}

document.getElementById('achievementsBtnStart').addEventListener('click', showAchievements);
document.getElementById('achievementsBtnOver').addEventListener('click', showAchievements);
document.getElementById('closeAchievementsBtn').addEventListener('click', () => {
    document.getElementById('achievementsOverlay').classList.add('hidden');
});

// ============================================
// 背景层类
// ============================================

// 星星
class Stars {
    constructor(count) {
        this.stars = [];
        for (let i = 0; i < count; i++) {
            this.stars.push({
                x: Math.random() * CANVAS_WIDTH,
                y: Math.random() * CANVAS_HEIGHT * 0.4, // 顶部 40%
                size: Math.random() > 0.8 ? 2 : 1,
                twinkle: Math.random() * Math.PI * 2
            });
        }
    }

    update(deltaTime) {
        this.stars.forEach(s => {
            s.twinkle += deltaTime * 0.005;
        });
    }

    draw(ctx) {
        this.stars.forEach(s => {
            const alpha = 0.5 + Math.sin(s.twinkle) * 0.5;
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.fillRect(s.x, s.y, s.size, s.size);
        });
    }
}

// 云层 - 像素艺术风格升级
class CloudLayer {
    constructor() {
        this.clouds = [];
        // 初始化云朵 - 更多层次
        for (let i = 0; i < 6; i++) {
            this.clouds.push(this.createCloud(Math.random() * CANVAS_WIDTH));
        }
    }

    createCloud(x) {
        const isPink = Math.random() > 0.4;
        return {
            x: x,
            y: getRandomNum(20, 90),
            width: getRandomNum(80, 160),
            height: getRandomNum(25, 50),
            speed: 0.2 + Math.random() * 0.15,
            color: isPink ? COLORS.cloudPink : COLORS.cloudPurple,
            // 像素化云朵的块状结构
            blocks: this.generateCloudBlocks()
        };
    }

    generateCloudBlocks() {
        // 生成像素化云朵的随机块结构
        const blocks = [];
        const cols = getRandomNum(5, 8);
        const rows = getRandomNum(2, 4);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                // 云朵中间更密集，边缘稀疏
                const centerDist = Math.abs(c - cols / 2) / (cols / 2);
                if (Math.random() > centerDist * 0.6) {
                    blocks.push({ col: c, row: r });
                }
            }
        }
        return blocks;
    }

    update(gameSpeed, deltaTime) {
        const speedFactor = gameSpeed * 0.2 * (deltaTime / 16);
        this.clouds.forEach(c => {
            c.x -= speedFactor * c.speed;
        });
        // 移除屏幕外的云
        this.clouds = this.clouds.filter(c => c.x + c.width > -50);
        // 生成新云
        if (this.clouds.length < 6 && Math.random() < 0.01) {
            this.clouds.push(this.createCloud(CANVAS_WIDTH + 100));
        }
    }

    draw(ctx) {
        this.clouds.forEach(cloud => {
            const blockW = cloud.width / 8;
            const blockH = cloud.height / 3;
            ctx.fillStyle = cloud.color;

            cloud.blocks.forEach(block => {
                const bx = cloud.x + block.col * blockW;
                const by = cloud.y + block.row * blockH;
                // 像素化矩形
                ctx.fillRect(Math.floor(bx), Math.floor(by), Math.ceil(blockW), Math.ceil(blockH));
            });
        });
    }
}

// 城市天际线 - 像素艺术风格升级
class CityLayer {
    constructor(color, minH, maxH, speedFactor, layerType) {
        this.color = color;
        this.speedFactor = speedFactor;
        this.layerType = layerType; // 'far', 'mid', 'near'
        this.offset = 0;
        this.buildings = [];
        this.totalWidth = 0;
        // 生成足够宽的城市
        while (this.totalWidth < CANVAS_WIDTH * 2) {
            this.addBuilding(minH, maxH);
        }
    }

    addBuilding(minH, maxH) {
        const w = getRandomNum(25, 70);
        const h = getRandomNum(minH, maxH);

        // 建筑详细结构
        const building = {
            x: this.totalWidth,
            w: w,
            h: h,
            // 屋顶装饰
            roofType: this.layerType === 'near' ? getRandomNum(0, 4) : 0,
            // 窗户网格
            windows: [],
            // 霓虹招牌
            sign: null,
            // 天线/水塔
            antenna: null
        };

        // 近景建筑才有详细结构
        if (this.layerType === 'near' || this.layerType === 'mid') {
            // 生成窗户网格
            const windowCols = Math.floor(w / 10);
            const windowRows = Math.floor(h / 12);
            for (let row = 0; row < windowRows; row++) {
                for (let col = 0; col < windowCols; col++) {
                    if (Math.random() > 0.3) {
                        building.windows.push({
                            col: col,
                            row: row,
                            lit: Math.random() > 0.4,
                            color: Math.random() > 0.7 ? COLORS.windowCool : COLORS.windowWarm
                        });
                    }
                }
            }

            // 随机添加霓虹招牌 (近景)
            if (this.layerType === 'near' && Math.random() > 0.6 && w > 35) {
                building.sign = {
                    x: getRandomNum(5, w - 20),
                    y: getRandomNum(10, Math.min(30, h - 15)),
                    w: getRandomNum(15, 25),
                    h: 8,
                    color: Math.random() > 0.5 ? COLORS.neonPink : COLORS.neonCyan
                };
            }

            // 屋顶天线或水塔
            if (Math.random() > 0.5) {
                building.antenna = {
                    type: getRandomNum(0, 2), // 0: 细天线, 1: 粗天线, 2: 水塔
                    x: getRandomNum(5, w - 10),
                    h: getRandomNum(8, 20)
                };
            }
        }

        this.buildings.push(building);
        this.totalWidth += w + getRandomNum(1, 6);
    }

    update(gameSpeed, deltaTime) {
        const speed = gameSpeed * this.speedFactor * (deltaTime / 16);
        this.offset -= speed;
        // 无限循环
        if (Math.abs(this.offset) >= this.totalWidth / 2) {
            this.offset = 0;
        }
    }

    drawBuilding(ctx, b, drawX, groundY) {
        // 主体建筑
        ctx.fillStyle = this.color;
        ctx.fillRect(drawX, groundY - b.h, b.w, b.h);

        // 屋顶变化 (近景)
        if (b.roofType === 1) {
            // 阶梯式屋顶
            ctx.fillRect(drawX + 3, groundY - b.h - 8, b.w - 6, 8);
        } else if (b.roofType === 2) {
            // 尖顶
            ctx.beginPath();
            ctx.moveTo(drawX + b.w / 2, groundY - b.h - 12);
            ctx.lineTo(drawX + b.w / 2 + 8, groundY - b.h);
            ctx.lineTo(drawX + b.w / 2 - 8, groundY - b.h);
            ctx.closePath();
            ctx.fill();
        }

        // 天线/水塔
        if (b.antenna) {
            ctx.fillStyle = this.layerType === 'near' ? '#2a2030' : this.color;
            if (b.antenna.type === 0) {
                // 细天线
                ctx.fillRect(drawX + b.antenna.x, groundY - b.h - b.antenna.h, 2, b.antenna.h);
            } else if (b.antenna.type === 1) {
                // 粗天线
                ctx.fillRect(drawX + b.antenna.x, groundY - b.h - b.antenna.h, 4, b.antenna.h);
                ctx.fillRect(drawX + b.antenna.x - 3, groundY - b.h - b.antenna.h, 10, 3);
            } else {
                // 水塔
                ctx.fillRect(drawX + b.antenna.x - 2, groundY - b.h - b.antenna.h, 8, b.antenna.h);
                ctx.fillRect(drawX + b.antenna.x - 4, groundY - b.h - b.antenna.h - 6, 12, 8);
            }
        }

        // 窗户
        const windowW = 4;
        const windowH = 6;
        const windowPadX = 6;
        const windowPadY = 8;
        b.windows.forEach(win => {
            if (win.lit) {
                ctx.fillStyle = win.color;
                const wx = drawX + windowPadX + win.col * (windowW + 4);
                const wy = groundY - b.h + windowPadY + win.row * (windowH + 5);
                ctx.fillRect(wx, wy, windowW, windowH);
            }
        });

        // 霓虹招牌
        if (b.sign) {
            ctx.fillStyle = b.sign.color;
            ctx.fillRect(drawX + b.sign.x, groundY - b.h + b.sign.y, b.sign.w, b.sign.h);
            // 招牌文字效果（简单像素块）
            ctx.fillStyle = this.color;
            for (let i = 0; i < 3; i++) {
                ctx.fillRect(drawX + b.sign.x + 3 + i * 6, groundY - b.h + b.sign.y + 2, 4, 4);
            }
        }
    }

    draw(ctx) {
        const groundY = CANVAS_HEIGHT - CONFIG.BOTTOM_PAD;
        // 中景和近景需要延伸到屏幕底部
        const extendToBottom = (this.layerType === 'mid' || this.layerType === 'near');

        this.buildings.forEach(b => {
            const drawX = b.x + this.offset;
            // 只绘制屏幕内的建筑
            if (drawX + b.w > 0 && drawX < CANVAS_WIDTH) {
                this.drawBuilding(ctx, b, drawX, groundY);
                // 延伸建筑到屏幕底部
                if (extendToBottom) {
                    ctx.fillStyle = this.color;
                    ctx.fillRect(drawX, groundY, b.w, CANVAS_HEIGHT - groundY + 10);
                }
            }
            // 循环绘制
            const drawX2 = drawX + this.totalWidth / 2;
            if (drawX2 + b.w > 0 && drawX2 < CANVAS_WIDTH) {
                this.drawBuilding(ctx, b, drawX2, groundY);
                if (extendToBottom) {
                    ctx.fillStyle = this.color;
                    ctx.fillRect(drawX2, groundY, b.w, CANVAS_HEIGHT - groundY + 10);
                }
            }
        });
    }
}

// ============================================
// 前景建筑平台层 - 玩家在此跑酷
// ============================================

class RooftopPlatform {
    constructor() {
        this.platforms = [];
        this.offset = 0;
        // 基准屋顶高度和错落范围
        this.baseRoofY = CANVAS_HEIGHT - 70;
        this.heightVariation = 30; // 高度差异范围（±15像素）

        // 生成初始平台 - 第一个平台较低便于开始
        let lastEnd = 0;
        let lastRoofY = this.baseRoofY;

        // 第一个平台
        this.addPlatform(0, 180, lastRoofY);
        lastEnd = 180;

        // 继续生成更多平台
        while (lastEnd < CANVAS_WIDTH * 2.5) {
            const gap = getRandomNum(35, 55); // 减小初始缝隙，更容易跳过
            const width = getRandomNum(120, 200); // 稍微加宽平台
            // 错落高度：相对上一个平台 ±15 像素，更平缓
            const heightDiff = getRandomNum(-15, 15);
            const newRoofY = Math.max(
                this.baseRoofY - this.heightVariation,
                Math.min(this.baseRoofY + this.heightVariation, lastRoofY + heightDiff)
            );
            this.addPlatform(lastEnd + gap, width, newRoofY);
            lastEnd = lastEnd + gap + width;
            lastRoofY = newRoofY;
        }
    }

    addPlatform(startX, width, roofY) {
        const buildingHeight = CANVAS_HEIGHT - roofY + 30; // 延伸到屏幕外
        const platform = {
            x: startX,
            w: width,
            roofY: roofY, // 每个平台有自己的屋顶高度
            h: buildingHeight,
            // 装饰
            hasAntenna: Math.random() > 0.6,
            antennaX: getRandomNum(10, Math.max(15, width - 15)),
            hasWaterTank: Math.random() > 0.75,
            tankX: getRandomNum(15, Math.max(20, width - 25)),
            // 窗户
            windows: this.generateWindows(width, buildingHeight)
        };
        this.platforms.push(platform);
    }

    generateWindows(width, height) {
        const windows = [];
        const cols = Math.floor(width / 16);
        const rows = Math.floor(height / 18);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (Math.random() > 0.35) {
                    windows.push({
                        col: c, row: r,
                        lit: Math.random() > 0.25,
                        color: Math.random() > 0.7 ? COLORS.windowCool : COLORS.windowWarm
                    });
                }
            }
        }
        return windows;
    }

    update(gameSpeed, deltaTime) {
        const speed = gameSpeed * (deltaTime / 16);
        this.offset -= speed;

        // 移除屏幕外的平台
        while (this.platforms.length > 0 &&
            this.platforms[0].x + this.platforms[0].w + this.offset < -100) {
            this.platforms.shift();
        }

        // 在右侧生成新平台
        const lastP = this.platforms[this.platforms.length - 1];
        if (lastP) {
            const lastEnd = lastP.x + lastP.w + this.offset;
            if (lastEnd < CANVAS_WIDTH + 300) {
                // 速度越快，缝隙越小（保持跳跃难度平衡）
                // 初始速度2.5时：缝隙 40-60
                // 最大速度6时：缝隙 30-50
                const speedRatio = (gameSpeed - CONFIG.SPEED) / (CONFIG.MAX_SPEED - CONFIG.SPEED);
                const gapMin = Math.floor(40 - speedRatio * 10);
                const gapMax = Math.floor(60 - speedRatio * 10);
                const gap = getRandomNum(gapMin, gapMax);
                const width = getRandomNum(120, 200);
                const heightDiff = getRandomNum(-15, 15);
                const newRoofY = Math.max(
                    this.baseRoofY - this.heightVariation,
                    Math.min(this.baseRoofY + this.heightVariation, lastP.roofY + heightDiff)
                );
                const newX = lastP.x + lastP.w + gap;
                this.addPlatform(newX, width, newRoofY);
            }
        }
    }

    draw(ctx) {
        this.platforms.forEach(p => {
            const drawX = p.x + this.offset;

            if (drawX + p.w < -50 || drawX > CANVAS_WIDTH + 50) return;

            const roofY = p.roofY;
            const bldgBottom = CANVAS_HEIGHT + 30;

            // 建筑主体
            ctx.fillStyle = '#15101a';
            ctx.fillRect(drawX, roofY, p.w, bldgBottom - roofY);

            // 屋顶发光边缘
            ctx.strokeStyle = COLORS.neonOrange;
            ctx.lineWidth = 3;
            ctx.shadowBlur = 8;
            ctx.shadowColor = COLORS.neonOrange;
            ctx.beginPath();
            ctx.moveTo(drawX, roofY);
            ctx.lineTo(drawX + p.w, roofY);
            ctx.stroke();
            ctx.shadowBlur = 0;

            // 侧边
            ctx.strokeStyle = '#2a2030';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(drawX, roofY);
            ctx.lineTo(drawX, bldgBottom);
            ctx.moveTo(drawX + p.w, roofY);
            ctx.lineTo(drawX + p.w, bldgBottom);
            ctx.stroke();

            // 窗户
            const winW = 6, winH = 8;
            const winPadX = 10, winPadY = 15;
            p.windows.forEach(win => {
                if (win.lit) {
                    ctx.fillStyle = win.color;
                    const wx = drawX + winPadX + win.col * (winW + 8);
                    const wy = roofY + winPadY + win.row * (winH + 8);
                    if (wx < drawX + p.w - winW) {
                        ctx.fillRect(wx, wy, winW, winH);
                    }
                }
            });

            // 天线
            if (p.hasAntenna && p.antennaX > 5 && p.antennaX < p.w - 5) {
                ctx.fillStyle = '#35303f';
                ctx.fillRect(drawX + p.antennaX, roofY - 18, 2, 18);
                ctx.fillStyle = COLORS.neonPink;
                ctx.fillRect(drawX + p.antennaX - 1, roofY - 20, 4, 3);
            }

            // 水塔
            if (p.hasWaterTank && p.tankX > 10 && p.tankX < p.w - 15) {
                ctx.fillStyle = '#2a2535';
                ctx.fillRect(drawX + p.tankX, roofY - 10, 5, 10);
                ctx.fillRect(drawX + p.tankX - 4, roofY - 18, 13, 10);
            }
        });
    }

    // 获取角色脚下的平台信息，返回 {onPlatform, roofY, blockedByWall}
    checkPlatformCollision(x, y, width, height) {
        const footY = y + height;
        const leftFoot = x + 4;
        const rightFoot = x + width - 4;
        const centerX = x + width / 2;

        let result = { onPlatform: false, roofY: this.baseRoofY, blockedByWall: false };

        for (const p of this.platforms) {
            const pLeft = p.x + this.offset;
            const pRight = pLeft + p.w;
            const pRoofY = p.roofY;

            // 检查是否被建筑物侧面挡住（从左侧撞墙）
            if (rightFoot > pLeft && leftFoot < pLeft && footY > pRoofY) {
                result.blockedByWall = true;
            }

            // 检查是否在平台上
            if ((leftFoot >= pLeft && leftFoot <= pRight) ||
                (rightFoot >= pLeft && rightFoot <= pRight) ||
                (centerX >= pLeft && centerX <= pRight)) {
                // 检查Y位置是否在平台表面附近
                if (footY >= pRoofY - 10 && footY <= pRoofY + 20) {
                    result.onPlatform = true;
                    result.roofY = pRoofY;
                }
            }
        }
        return result;
    }

    // 获取基准屋顶Y坐标（用于初始化）
    getRooftopY() {
        return this.baseRoofY;
    }
}

// ============================================
// 游戏对象
// ============================================

class NeonBot {
    constructor(canvasHeight, platformY) {
        this.config = {
            WIDTH: 20,
            HEIGHT: 24
        };

        // 使用平台Y坐标作为地面
        this.platformY = platformY || (canvasHeight - 60);
        this.groundYPos = this.platformY - this.config.HEIGHT;
        this.xPos = 50;
        this.yPos = this.groundYPos;

        this.velocity = 0;
        this.jumping = false;
        this.jumpCount = 0;
        this.falling = false; // 掉入缝隙

        this.frame = 0;
        this.timer = 0;
    }

    reset() {
        this.yPos = this.groundYPos;
        this.velocity = 0;
        this.jumping = false;
        this.jumpCount = 0;
        this.falling = false;
    }

    // 更新平台Y位置（用于平台检测）
    setPlatformY(y) {
        this.platformY = y;
        this.groundYPos = y - this.config.HEIGHT;
    }

    jump(speed) {
        if (!this.jumping && !this.falling) {
            this.jumping = true;
            // 速度越快，跳跃越低（前期容易，后期难）
            // 初始速度3时：-14 + 0.3 = -13.7（跳得高）
            // 最大速度7时：-14 + 1.4 = -12.6（跳得低）
            const speedFactor = (speed - CONFIG.SPEED) * 0.35;
            this.velocity = CONFIG.INITIAL_JUMP_VELOCITY + speedFactor;
        }
    }

    update(deltaTime, collisionInfo) {
        // collisionInfo = { onPlatform, roofY, blockedByWall }
        this.timer += deltaTime;
        if (this.timer > 80) {
            this.frame = (this.frame + 1) % 2;
            this.timer = 0;
        }

        const currentHeight = this.config.HEIGHT;

        // 如果被墙挡住，游戏结束
        if (collisionInfo.blockedByWall) {
            return 'wall'; // 撞墙死亡
        }

        // 更新平台高度（用于落地）
        if (collisionInfo.onPlatform) {
            this.platformY = collisionInfo.roofY;
        }
        const targetGroundY = this.platformY - currentHeight;

        if (this.jumping || this.falling) {
            this.yPos += this.velocity;
            this.velocity += CONFIG.GRAVITY;

            // 检查是否落到平台上（向下运动时）
            if (collisionInfo.onPlatform && this.velocity > 0 && this.yPos >= targetGroundY) {
                this.yPos = targetGroundY;
                this.velocity = 0;
                this.jumping = false;
                this.falling = false;
            }

            // 检查是否掉出屏幕（游戏结束）
            if (this.yPos > CANVAS_HEIGHT + 50) {
                return 'fall'; // 掉落死亡
            }
        } else {
            // 不跳跃时，检查是否在平台上
            if (collisionInfo.onPlatform) {
                this.yPos = targetGroundY;
            } else {
                // 不在平台上，开始掉落
                this.falling = true;
            }
        }
        return null; // 未死亡
    }

    // 绘制bot
    draw(ctx) {
        const w = this.config.WIDTH;
        const h = this.config.HEIGHT;
        const x = this.xPos;
        const y = this.yPos;

        // 发光效果
        ctx.shadowBlur = 8;
        ctx.shadowColor = COLORS.neonCyan;

        // 站立/跑步
        // 身体
        ctx.fillStyle = COLORS.bodyGray;
        ctx.fillRect(x + 4, y + 8, 12, 12); // 躯干
        // 头
        ctx.fillRect(x + 2, y, 16, 10);
        // 面罩
        ctx.fillStyle = COLORS.neonCyan;
        ctx.fillRect(x + 12, y + 2, 6, 6);

        // 能量核心
        ctx.fillStyle = COLORS.neonPink;
        ctx.fillRect(x + 8, y + 12, 4, 4);

        // 腿 (动画)
        ctx.fillStyle = COLORS.bodyGray;
        if (this.jumping) {
            ctx.fillRect(x + 4, y + 20, 4, 4);
            ctx.fillRect(x + 12, y + 20, 4, 4);
        } else {
            if (this.frame === 0) {
                ctx.fillRect(x + 4, y + 20, 4, 6);
                ctx.fillRect(x + 12, y + 18, 4, 4);
            } else {
                ctx.fillRect(x + 4, y + 18, 4, 4);
                ctx.fillRect(x + 12, y + 20, 4, 6);
            }
        }
        ctx.shadowBlur = 0;
    }
}

class NeonBuilding {
    constructor(type, xPos, platformY) {
        this.type = type;
        this.x = xPos;
        this.width = type.width;
        this.height = type.height;
        // 使用平台顶部Y位置
        this.y = platformY - this.height;

        this.remove = false;
        this.gap = getRandomNum(200, 350);

        // 随机霓虹色
        const neonColors = [COLORS.neonPink, COLORS.neonPurple, COLORS.neonCyan];
        this.neonColor = neonColors[Math.floor(Math.random() * neonColors.length)];

        // 窗户
        this.windows = [];
        const winCount = getRandomNum(2, 4);
        for (let i = 0; i < winCount; i++) {
            this.windows.push({
                x: getRandomNum(6, this.width - 10),
                y: getRandomNum(6, this.height - 10)
            });
        }
    }

    update(speed, deltaTime) {
        this.x -= speed * (deltaTime / 16);
        if (this.x + this.width < 0) this.remove = true;
    }

    draw(ctx) {
        // 黑色主体
        ctx.fillStyle = COLORS.dark;
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // 霓虹描边
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.neonColor;
        ctx.strokeStyle = this.neonColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
        ctx.shadowBlur = 0;

        // 窗户
        ctx.fillStyle = this.neonColor;
        this.windows.forEach(w => {
            ctx.fillRect(this.x + w.x, this.y + w.y, 4, 4);
        });
    }
}

class NeonDrone {
    constructor(xPos, platformY) {
        this.type = { type: 'DRONE' };
        this.x = xPos;
        this.width = 40;
        this.height = 20;
        // 无人机高度相对于平台顶部
        const heights = [30, 60, 90];
        this.y = platformY - this.height - heights[getRandomNum(0, 2)];

        this.remove = false;
        this.gap = getRandomNum(250, 400);
        this.frame = 0;
        this.timer = 0;
    }

    update(speed, deltaTime) {
        this.x -= speed * (deltaTime / 16);
        if (this.x + this.width < 0) this.remove = true;

        this.timer += deltaTime;
        if (this.timer > 100) {
            this.frame = (this.frame + 1) % 2;
            this.timer = 0;
        }
    }

    draw(ctx) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = COLORS.neonYellow;
        ctx.fillStyle = COLORS.neonYellow;

        ctx.beginPath();
        if (this.frame === 0) {
            ctx.moveTo(this.x, this.y + 10);
            ctx.lineTo(this.x + 20, this.y);
            ctx.lineTo(this.x + 40, this.y + 10);
            ctx.lineTo(this.x + 20, this.y + 20);
        } else {
            ctx.moveTo(this.x, this.y + 10);
            ctx.lineTo(this.x + 20, this.y + 5);
            ctx.lineTo(this.x + 40, this.y + 10);
            ctx.lineTo(this.x + 20, this.y + 15);
        }
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;
    }
}

// 障碍物尺寸参考 T-Rex 原版：CACTUS_SMALL 17×35, CACTUS_LARGE 25×50
const OBSTACLE_TYPES = [
    { type: 'BUILDING_S', width: 17, height: 35 },
    { type: 'BUILDING_L', width: 25, height: 50 }
];

// ============================================
// 主循环
// ============================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

let bot;
let obstacles = [];
let score = 0;
let highScore = localStorage.getItem('neonCityHS') || 0;
let speed = CONFIG.SPEED;
let isPlaying = false;
let isGameOver = false;
let lastTime = 0;
let animationId;
let distance = 0;

// 背景层
let stars;
let cloudLayer;
let farCity;
let midCity;
let nearCity;
let rooftopPlatform; // 前景建筑平台层

// 成就系统
let achievements;

function drawSkyGradient() {
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, COLORS.skyTop);
    gradient.addColorStop(0.3, COLORS.skyMid1);
    gradient.addColorStop(0.55, COLORS.skyMid2);
    gradient.addColorStop(0.75, COLORS.skyBottom);
    gradient.addColorStop(1, COLORS.skyHorizon);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 地平线光晕效果
    const horizonY = CANVAS_HEIGHT * 0.65;
    const glowGradient = ctx.createRadialGradient(
        CANVAS_WIDTH / 2, horizonY, 0,
        CANVAS_WIDTH / 2, horizonY, CANVAS_WIDTH * 0.6
    );
    glowGradient.addColorStop(0, 'rgba(255, 212, 163, 0.4)');
    glowGradient.addColorStop(1, 'rgba(255, 212, 163, 0)');
    ctx.fillStyle = glowGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function drawGround() {
    const groundY = CANVAS_HEIGHT - CONFIG.BOTTOM_PAD;
    ctx.shadowBlur = 8;
    ctx.shadowColor = COLORS.neonOrange;
    ctx.strokeStyle = COLORS.neonOrange;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(CANVAS_WIDTH, groundY);
    ctx.stroke();
    ctx.shadowBlur = 0;
}

function init() {
    // 初始化前景平台（先初始化以获取平台位置）
    rooftopPlatform = new RooftopPlatform();

    // 初始化角色，使用固定屋顶Y位置
    const rooftopY = rooftopPlatform.getRooftopY();
    bot = new NeonBot(CANVAS_HEIGHT, rooftopY);

    obstacles = []; // 保留但不使用旧障碍物
    score = 0;
    distance = 0;
    speed = CONFIG.SPEED;
    isGameOver = false;
    deathTime = 0; // 初始化死亡时间

    // 初始化成就系统
    if (!achievements) {
        achievements = new AchievementSystem();
    }

    stars = new Stars(60);
    cloudLayer = new CloudLayer();
    farCity = new CityLayer(COLORS.farCity, 50, 120, 0.3, 'far');
    midCity = new CityLayer(COLORS.midCity, 40, 90, 0.5, 'mid');
    nearCity = new CityLayer(COLORS.nearCity, 30, 70, 0.8, 'near');

    document.getElementById('highScore').innerText = highScore.toString().padStart(5, '0');
    document.getElementById('currentScore').innerText = '00000';

    // 初始渲染
    drawSkyGradient();
    stars.draw(ctx);
    cloudLayer.draw(ctx);
    farCity.draw(ctx);
    midCity.draw(ctx);
    nearCity.draw(ctx);
    rooftopPlatform.draw(ctx);
    bot.draw(ctx);
}

function reset() {
    init();
    isPlaying = true;
    lastTime = performance.now();
    document.getElementById('startOverlay').classList.add('hidden');
    document.getElementById('gameOverOverlay').classList.add('hidden');
    requestAnimationFrame(update);
}

function update(time) {
    if (!isPlaying) return;
    const deltaTime = time - lastTime;
    lastTime = time;

    // === 绘制背景 ===
    drawSkyGradient();
    stars.update(deltaTime);
    stars.draw(ctx);
    cloudLayer.update(speed, deltaTime);
    cloudLayer.draw(ctx);
    farCity.update(speed, deltaTime);
    farCity.draw(ctx);
    midCity.update(speed, deltaTime);
    midCity.draw(ctx);
    nearCity.update(speed, deltaTime);
    nearCity.draw(ctx);

    // === 前景平台层 ===
    rooftopPlatform.update(speed, deltaTime);
    rooftopPlatform.draw(ctx);

    // === 玩家 ===
    // 使用新的碰撞检测方法
    const currentHeight = bot.ducking ? bot.config.HEIGHT_DUCK : bot.config.HEIGHT;
    const collisionInfo = rooftopPlatform.checkPlatformCollision(
        bot.xPos, bot.yPos, bot.config.WIDTH, currentHeight
    );
    const deathType = bot.update(deltaTime, collisionInfo);
    bot.draw(ctx);

    // 死亡检测（掉落或撞墙）
    if (deathType) {
        gameOver();
    }

    // === 分数（基于生存距离）===
    distance += speed * (deltaTime / 16);
    const newScore = Math.floor(distance * 0.05);
    if (newScore > score) {
        score = newScore;
        document.getElementById('currentScore').innerText = score.toString().padStart(5, '0');

        // 随时间加速
        if (speed < CONFIG.MAX_SPEED && score % 100 === 0) {
            speed += 0.5;
        }

        // 检测成就
        if (achievements) {
            achievements.checkDuringGame(score);
        }
    }

    // === 成就系统 ===
    if (achievements) {
        achievements.update(deltaTime);
        achievements.draw(ctx);
    }

    if (!isGameOver) requestAnimationFrame(update);
}

function checkCollision(bot, obs) {
    const bx = bot.xPos + 2;
    const by = bot.yPos + 2;
    const bw = (bot.ducking ? bot.config.WIDTH_DUCK : bot.config.WIDTH) - 4;
    const bh = (bot.ducking ? bot.config.HEIGHT_DUCK : bot.config.HEIGHT) - 4;

    const ox = obs.x + 2;
    const oy = obs.y + 2;
    const ow = obs.width - 4;
    const oh = obs.height - 4;

    return (bx < ox + ow && bx + bw > ox && by < oy + oh && by + bh > oy);
}

function gameOver() {
    isPlaying = false;
    isGameOver = true;
    deathTime = Date.now(); // 记录死亡时间
    // 结算成就
    if (achievements) {
        achievements.onGameEnd(score);
    }

    if (score > highScore) {
        highScore = score;
        localStorage.setItem('neonCityHS', highScore);
        document.getElementById('highScore').innerText = highScore.toString().padStart(5, '0');
    }
    document.getElementById('finalScore').innerText = score;
    document.getElementById('gameOverOverlay').classList.remove('hidden');
}

// === 输入 ===
function onJump(e) {
    if (e) e.preventDefault();
    if (isPlaying) {
        bot.jump(speed);
    } else if (isGameOver) {
        // 防止连点误触：死亡后需要等待 800ms 才能重开
        if (Date.now() - deathTime > 800) {
            reset();
        }
    } else {
        // 未开始状态
        reset();
    }
}

window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'ArrowUp') onJump(e);
});

// 移动端/鼠标点击 全屏跳跃
const el = document.querySelector('.game-container');
el.addEventListener('touchstart', e => { e.preventDefault(); onJump(e); }, { passive: false });
el.addEventListener('mousedown', e => {
    // 只有左键点击才跳跃
    if (e.button === 0) {
        onJump(e);
    }
});

function tryPlayMusic() {
    const ap = document.querySelector('meting-js').aplayer;
    if (ap) {
        ap.play();
        // 设置单曲循环模式（以防 HTML 属性未生效）
        ap.setMode('normal');
    }
}

document.getElementById('startBtn').addEventListener('click', e => {
    e.stopPropagation();
    tryPlayMusic();
    reset();
});
document.getElementById('restartBtn').addEventListener('click', e => {
    e.stopPropagation();
    tryPlayMusic();
    reset();
});

init();
