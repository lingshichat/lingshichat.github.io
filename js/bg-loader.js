/**
 * 背景图片优雅加载器
 * 实现主色调占位 + 平滑淡入效果
 */
(function() {
    'use strict';

    // 背景配置
    const config = {
        // 占位背景色 - 与背景图主色调一致（深蓝）
        placeholderColor: '#0a1628',
        // 过渡动画时长（毫秒）
        transitionDuration: 800,
        // 背景图片URL（从配置读取或自动检测）
        backgroundUrl: null
    };

    // 获取实际的背景图片URL
    function getBackgroundUrl() {
        // 优先从 body 样式中获取
        const bodyStyle = window.getComputedStyle(document.body);
        const bgImage = bodyStyle.backgroundImage;
        
        if (bgImage && bgImage !== 'none') {
            // 提取 url("...") 中的链接
            const match = bgImage.match(/url\(["']?([^"']+)["']?\)/);
            if (match) return match[1];
        }
        
        // 从 data 属性获取
        const dataBg = document.body.dataset.background;
        if (dataBg) return dataBg;
        
        // 默认值
        return '/img/bg.jpg';
    }

    // 初始化背景加载
    function initBackgroundLoader() {
        const bgUrl = config.backgroundUrl || getBackgroundUrl();
        
        // 创建背景加载层
        const loader = document.createElement('div');
        loader.id = 'bg-loader';
        loader.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: ${config.placeholderColor};
            z-index: -9999;
            transition: opacity ${config.transitionDuration}ms ease-in-out;
        `;
        
        // 创建背景图片层（初始透明）
        const bgLayer = document.createElement('div');
        bgLayer.id = 'bg-layer';
        bgLayer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-image: url('${bgUrl}');
            background-size: cover;
            background-position: center;
            background-attachment: fixed;
            z-index: -10000;
            opacity: 0;
            transition: opacity ${config.transitionDuration}ms ease-in-out;
        `;
        
        // 插入到 body 最前面
        document.body.insertBefore(bgLayer, document.body.firstChild);
        document.body.insertBefore(loader, document.body.firstChild);
        
        // 预加载图片
        const img = new Image();
        
        img.onload = function() {
            // 图片加载完成，触发淡入
            requestAnimationFrame(() => {
                bgLayer.style.opacity = '1';
                
                // 动画完成后隐藏加载层
                setTimeout(() => {
                    loader.style.opacity = '0';
                    setTimeout(() => {
                        loader.remove();
                    }, config.transitionDuration);
                }, 100);
            });
        };
        
        img.onerror = function() {
            console.warn('[BG-Loader] 背景图片加载失败，保持占位色');
        };
        
        // 开始加载
        img.src = bgUrl;
        
        // 如果图片已经缓存（complete），立即触发
        if (img.complete) {
            img.onload();
        }
    }

    // DOM  ready 时初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBackgroundLoader);
    } else {
        initBackgroundLoader();
    }
})();
