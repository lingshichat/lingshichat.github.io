/**
 * 全站BGM控制器 v2
 * 功能：
 * 1. 使用Meting播放网易云音乐
 * 2. 旋转音符开关控制
 * 3. 文章内APlayer播放时自动暂停BGM
 * 4. 顶栏右上角透明背景图标
 */

(function () {
    'use strict';

    // 配置
    const BGM_CONFIG = {
        songId: '1966353373',  // 网易云歌曲ID
        server: 'netease',     // 音乐服务商
        type: 'song',          // 类型
        volume: 0.5            // 默认音量
    };

    // 全局变量
    let bgmAp = null;
    let bgmBtn = null;
    let isPlaying = false;

    // 创建BGM按钮（顶栏右上角）
    function createBgmButton() {
        if (document.getElementById('global-bgm-btn')) return;

        bgmBtn = document.createElement('div');
        bgmBtn.id = 'global-bgm-btn';
        bgmBtn.className = 'paused';
        bgmBtn.innerHTML = '<i class="fas fa-music music-icon"></i>';
        bgmBtn.title = '点击播放/暂停背景音乐';
        document.body.appendChild(bgmBtn);

        bgmBtn.addEventListener('click', toggleBgm);
    }

    // 创建隐藏的APlayer
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
        meting.setAttribute('autoplay', 'false');  // 不自动播放，等用户点击

        container.appendChild(meting);
        document.body.appendChild(container);

        // 等待APlayer初始化
        waitForAPlayer();
    }

    // 等待APlayer实例初始化
    function waitForAPlayer() {
        const checkInterval = setInterval(function () {
            const meting = document.querySelector('#global-bgm-container meting-js');
            if (meting && meting.aplayer) {
                clearInterval(checkInterval);
                bgmAp = meting.aplayer;
                setupPlayerEvents();
                console.log('[BGM] 播放器初始化成功');
            }
        }, 300);

        // 10秒后停止等待
        setTimeout(function () {
            clearInterval(checkInterval);
            if (!bgmAp) {
                console.warn('[BGM] 播放器初始化超时');
            }
        }, 10000);
    }

    // 设置播放器事件监听
    function setupPlayerEvents() {
        if (!bgmAp) return;

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

        bgmAp.on('error', function () {
            console.error('[BGM] 播放出错');
        });
    }

    // 切换播放状态
    function toggleBgm() {
        if (!bgmAp) {
            console.warn('[BGM] 播放器尚未就绪');
            waitForAPlayer();
            return;
        }

        try {
            if (isPlaying) {
                bgmAp.pause();
            } else {
                bgmAp.play();
            }
        } catch (e) {
            console.error('[BGM] 操作失败:', e);
        }
    }

    // 更新按钮状态
    function updateButtonState() {
        if (!bgmBtn) return;

        if (isPlaying) {
            bgmBtn.className = 'playing';
        } else {
            bgmBtn.className = 'paused';
        }
    }

    // 监听文章内其他APlayer的播放（智能避让）
    function setupArticlePlayerListeners() {
        // MutationObserver监听新添加的APlayer
        const observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(function (node) {
                    if (node.nodeType === 1 && node.classList && node.classList.contains('aplayer')) {
                        attachPlayerListener(node);
                    }
                    if (node.nodeType === 1 && node.querySelectorAll) {
                        node.querySelectorAll('.aplayer').forEach(attachPlayerListener);
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // 也检查已存在的APlayer
        document.querySelectorAll('.aplayer').forEach(attachPlayerListener);
    }

    // 为文章内APlayer添加监听
    function attachPlayerListener(aplayerEl) {
        // 排除全局BGM播放器
        if (aplayerEl.closest('#global-bgm-container')) return;
        if (aplayerEl.dataset.bgmListenerAttached) return;
        aplayerEl.dataset.bgmListenerAttached = 'true';

        const checkInterval = setInterval(function () {
            if (aplayerEl.aplayer) {
                clearInterval(checkInterval);

                aplayerEl.aplayer.on('play', function () {
                    // 当文章内播放器开始播放时，暂停BGM
                    if (bgmAp && isPlaying) {
                        bgmAp.pause();
                        console.log('[BGM] 检测到文章内播放器播放，已暂停BGM');
                    }
                });
            }
        }, 300);

        setTimeout(function () {
            clearInterval(checkInterval);
        }, 5000);
    }

    // 主初始化
    function init() {
        // 等待DOM和依赖加载
        if (typeof MetingJSElement === 'undefined') {
            console.log('[BGM] 等待Meting.js加载...');
            setTimeout(init, 500);
            return;
        }

        createBgmButton();
        createBgmPlayer();
        setupArticlePlayerListeners();
        console.log('[BGM] 控制器初始化完成');
    }

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(init, 1000);  // 等待其他脚本加载
        });
    } else {
        setTimeout(init, 1000);
    }

    // pjax支持
    document.addEventListener('pjax:complete', function () {
        setupArticlePlayerListeners();
    });

})();
