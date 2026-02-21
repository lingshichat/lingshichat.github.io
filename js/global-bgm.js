/**
 * 全站BGM控制器 v3 (修复版)
 * 功能：
 * 1. 自动检测并加载 APlayer 和 Meting 依赖
 * 2. 动态注入/检测导航栏音乐按钮
 * 3. 智能避让文章内播放器
 * 4. 修复无限循环等待问题
 */

(function () {
    'use strict';

    // 配置
    const BGM_CONFIG = {
        songId: '1966353373',  // 网易云歌曲ID
        server: 'netease',     // 音乐服务商
        type: 'song',          // 类型
        volume: 0.5,           // 默认音量
        // CDN 资源配置（如果本地未加载）
        cdn: {
            aplayerCSS: 'https://cdn.jsdelivr.net/npm/aplayer/dist/APlayer.min.css',
            aplayerJS: 'https://cdn.jsdelivr.net/npm/aplayer/dist/APlayer.min.js',
            metingJS: 'https://cdn.jsdelivr.net/npm/meting@2.0.1/dist/Meting.min.js'
        }
    };

    // 全局变量
    let bgmAp = null;
    let bgmBtn = null;
    let isPlaying = false;

    // 资源加载器
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.body.appendChild(script);
        });
    }

    function loadCSS(href) {
        if (document.querySelector(`link[href="${href}"]`)) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }

    // 初始化所需依赖
    async function initDependencies() {
        // 检查 APlayer
        if (typeof APlayer === 'undefined') {
            console.log('[BGM] 检测到 APlayer 未加载，正在通过 CDN 加载...');
            loadCSS(BGM_CONFIG.cdn.aplayerCSS);
            await loadScript(BGM_CONFIG.cdn.aplayerJS);
        }

        // 检查 Meting
        // 注意：Meting 可能没有全局变量，或者是 MetingJSElement
        // 我们主要通过 customElements.get('meting-js') 来判断是否注册
        if (!customElements.get('meting-js')) {
            console.log('[BGM] 检测到 Meting 未加载，正在通过 CDN 加载...');
            await loadScript(BGM_CONFIG.cdn.metingJS);
        }

        console.log('[BGM] 依赖加载完成');
    }

    // 初始化/注入按钮
    function initBgmButton() {
        bgmBtn = document.getElementById('nav-music-btn');

        // 如果 HTML 中没有在这个按钮（可能是缓存问题或模板未更新），则手动注入
        if (!bgmBtn) {
            console.warn('[BGM] HTML中未找到按钮，尝试动态注入...');
            const menus = document.getElementById('menus');
            if (menus) {
                const btnWrapper = document.createElement('div');
                btnWrapper.id = 'nav-music';
                btnWrapper.innerHTML = `
                    <a id="nav-music-btn" onclick="return false;" title="播放/暂停背景音乐">
                        <i class="fas fa-music"></i>
                    </a>
                `;
                // 插入到 menus 的末尾 (通常在 Search 之后或 Toggle 之前)
                // 尝试插入到 toggle-menu 之前
                const toggleBtn = document.getElementById('toggle-menu');
                if (toggleBtn) {
                    menus.insertBefore(btnWrapper, toggleBtn);
                } else {
                    menus.appendChild(btnWrapper);
                }
                bgmBtn = btnWrapper.querySelector('#nav-music-btn');
            }
        }

        if (!bgmBtn) {
            console.error('[BGM] 无法初始化按钮 - 未找到导航栏容器');
            return;
        }

        // 移除可能存在的旧类名，确保初始状态正确
        bgmBtn.classList.remove('playing');
        bgmBtn.classList.add('paused');

        // 绑定点击事件
        bgmBtn.onclick = toggleBgm;
        console.log('[BGM] 按钮初始化成功');
    }

    // 创建隐藏的APlayer (Meting模式)
    function createBgmPlayer() {
        if (document.getElementById('global-bgm-container')) return;

        const container = document.createElement('div');
        container.id = 'global-bgm-container';
        container.style.cssText = 'position:fixed;bottom:-500px;left:-500px;width:1px;height:1px;overflow:hidden;pointer-events:none;opacity:0;';

        // 创建meting-js元素
        const meting = document.createElement('meting-js');
        meting.setAttribute('server', BGM_CONFIG.server);
        meting.setAttribute('type', BGM_CONFIG.type);
        meting.setAttribute('id', BGM_CONFIG.songId);
        meting.setAttribute('volume', BGM_CONFIG.volume);
        meting.setAttribute('loop', 'all');
        meting.setAttribute('preload', 'auto');
        meting.setAttribute('autoplay', 'true');   // 开启自动播放
        meting.setAttribute('mutex', 'true');      // 互斥锁

        container.appendChild(meting);
        document.body.appendChild(container);

        // 等待APlayer初始化
        waitForAPlayer();
    }

    // 等待APlayer实例初始化
    function waitForAPlayer() {
        let attempts = 0;
        const checkInterval = setInterval(function () {
            const meting = document.querySelector('#global-bgm-container meting-js');
            // 检查 meting 元素是否已经加载了 aplayer 实例
            if (meting && meting.aplayer) {
                clearInterval(checkInterval);
                bgmAp = meting.aplayer;
                setupPlayerEvents();

                // 尝试自动播放
                const playPromise = bgmAp.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        console.warn('[BGM] 自动播放被拦截，等待用户交互...');
                    });
                }

                // 智能唤醒：监听任意交互来启动播放
                const activeBgm = () => {
                    if (bgmAp && bgmAp.audio.paused) {
                        bgmAp.play();
                        console.log('[BGM] 用户交互已触发，尝试启动播放');
                    }
                    // 解绑事件
                    ['click', 'scroll', 'keydown', 'touchstart'].forEach(event => {
                        document.removeEventListener(event, activeBgm);
                    });
                };

                ['click', 'scroll', 'keydown', 'touchstart'].forEach(event => {
                    document.addEventListener(event, activeBgm, { once: true });
                });

                console.log('[BGM] 播放器实例获取成功');
            }

            attempts++;
            if (attempts > 50) { // 15秒超时
                clearInterval(checkInterval);
                console.warn('[BGM] 获取播放器实例超时');
            }
        }, 300);
    }

    // 设置播放器事件监听
    function setupPlayerEvents() {
        if (!bgmAp) return;

        // 立即同步状态 (防止 autoplay 事件如果在绑定前触发导致状态不同步)
        if (!bgmAp.audio.paused) {
            isPlaying = true;
            updateButtonState();
        }

        bgmAp.on('play', function () {
            isPlaying = true;
            updateButtonState();
            console.log('[BGM] 开始播放');
        });

        bgmAp.on('pause', function () {
            isPlaying = false;
            updateButtonState();
            console.log('[BGM] 已暂停');
        });

        // 监听其他播放器的互斥暂停
        // Meting 自带 mutex，但我们需要手动更新按钮状态
        bgmAp.on('pause', () => {
            // 这是一个通用的暂停回调
        });
    }

    // 切换播放状态
    function toggleBgm() {
        if (!bgmAp) {
            console.warn('[BGM] 播放器尚未就绪，尝试重新初始化...');
            createBgmPlayer(); // 尝试重新创建
            return;
        }

        try {
            bgmAp.toggle(); // 使用 toggle 方法更简单
        } catch (e) {
            console.error('[BGM] 操作失败:', e);
        }
    }

    // 更新按钮状态
    function updateButtonState() {
        if (!bgmBtn) return;

        if (isPlaying) {
            bgmBtn.classList.remove('paused');
            bgmBtn.classList.add('playing');
            bgmBtn.title = '暂停播放';
        } else {
            bgmBtn.classList.remove('playing');
            bgmBtn.classList.add('paused');
            bgmBtn.title = '播放背景音乐';
        }
    }

    // 监听文章内其他APlayer的播放（智能避让）
    // 由于我们开启了 meting 的 mutex=true，理论上不需要手动处理互斥，
    // 但我们需要监听 document 的 'canplay' 或其他全局事件吗？
    // APlayer 的 mutex 机制通常会自动暂停其他 instance。
    // 我们只需要确保 bgmAp 的 pause 事件被正确处理来更新 UI。

    // 主初始化
    async function init() {
        try {
            await initDependencies();
            initBgmButton();
            createBgmPlayer();

            // Pjax 支持
            document.addEventListener('pjax:complete', function () {
                initBgmButton();
                updateButtonState();
            });

            console.log('[BGM] 控制器 v3 启动完成');
        } catch (e) {
            console.error('[BGM] 初始化失败:', e);
        }
    }

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
