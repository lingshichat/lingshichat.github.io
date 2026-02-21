/**
 * 缤纷云背景图片渐进式加载器
 * 两级加载：模糊占位图 (~5KB) → WebP优化版 (~400KB)
 * 
 * 特性：
 * - 瞬间显示模糊占位图，消除白屏
 * - 平滑过渡到清晰 WebP 版本
 * - 比原图节省 70% 流量
 * - 适配移动端和桌面端
 */
(function() {
    'use strict';

    const config = {
        // 原始图片基础路径
        baseUrl: 'https://lingshichat.s3.bitiful.net/img/blog/bg.jpg',
        // 模糊占位图参数 (5KB, 瞬间加载)
        blurParams: '?width=100&blur=30',
        // WebP优化版参数 (400KB, 平衡质量与大小)
        webpParams: '?format=webp&q=85&width=1920',
        // 过渡动画时长 (毫秒)
        transitionDuration: 600,
        // 占位背景色 (与图片主色调一致)
        placeholderColor: '#0a1628'
    };

    /**
     * 构建图片 URL
     */
    function getImageUrl(params) {
        return config.baseUrl + params;
    }

    /**
     * 创建背景图层
     */
    function createLayer(id, bgUrl, opacity = 0, zIndex = -10000) {
        const layer = document.createElement('div');
        layer.id = id;
        layer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-image: url('${bgUrl}');
            background-size: cover;
            background-position: center;
            background-attachment: fixed;
            background-repeat: no-repeat;
            z-index: ${zIndex};
            opacity: ${opacity};
            transition: opacity ${config.transitionDuration}ms ease-in-out;
            will-change: opacity;
            transform: translateZ(0);
        `;
        return layer;
    }

    /**
     * 初始化渐进式加载
     */
    function initProgressiveLoader() {
        const blurUrl = getImageUrl(config.blurParams);
        const webpUrl = getImageUrl(config.webpParams);
        
        // 创建模糊占位图层 (立即显示，无需额外背景色)
        const blurLayer = createLayer('bg-blur', blurUrl, 1, -10002);
        blurLayer.style.transform = 'scale(1.1) translateZ(0)'; // 放大避免模糊边缘
        
        // 创建 WebP 清晰图层 (初始透明)
        const webpLayer = createLayer('bg-webp', webpUrl, 0, -10001);
        
        // 插入到 body 最前面
        document.body.insertBefore(blurLayer, document.body.firstChild);
        document.body.insertBefore(webpLayer, document.body.firstChild);
        
        // 隐藏 body 默认背景图，由我们的图层接管
        const originalBg = document.body.style.backgroundImage;
        document.body.style.backgroundImage = 'none';
        document.body.dataset.originalBg = originalBg;
        
        // 预加载 WebP 版本
        const webpImg = new Image();
        
        webpImg.onload = function() {
            requestAnimationFrame(() => {
                // WebP 加载完成，淡入清晰图层
                webpLayer.style.opacity = '1';
                
                // 动画完成后淡出并移除模糊层
                setTimeout(() => {
                    blurLayer.style.opacity = '0';
                    setTimeout(() => {
                        if (blurLayer.parentNode) {
                            blurLayer.remove();
                        }
                    }, config.transitionDuration);
                }, config.transitionDuration);
            });
        };
        
        webpImg.onerror = function() {
            console.warn('[BG-Loader] WebP 加载失败，保持模糊占位图');
            // 尝试降级到 JPEG
            tryJpegFallback(blurLayer, webpLayer);
        };
        
        // 开始加载 WebP
        webpImg.src = webpUrl;
        
        // 如果图片已缓存，立即触发
        if (webpImg.complete && webpImg.naturalWidth > 0) {
            webpImg.onload();
        }
    }

    /**
     * WebP 失败时的 JPEG 降级方案
     */
    function tryJpegFallback(blurLayer, webpLayer) {
        const jpegUrl = config.baseUrl + '?width=1920&q=85';
        const jpegImg = new Image();
        
        jpegImg.onload = function() {
            webpLayer.style.backgroundImage = `url('${jpegUrl}')`;
            requestAnimationFrame(() => {
                webpLayer.style.opacity = '1';
                setTimeout(() => {
                    blurLayer.style.opacity = '0';
                    setTimeout(() => blurLayer.remove(), config.transitionDuration);
                }, config.transitionDuration);
            });
        };
        
        jpegImg.onerror = function() {
            console.error('[BG-Loader] 所有格式加载失败');
        };
        
        jpegImg.src = jpegUrl;
    }

    /**
     * 检查浏览器是否支持 WebP
     */
    function checkWebPSupport() {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img.width === 1);
            img.onerror = () => resolve(false);
            img.src = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';
        });
    }

    /**
     * 初始化入口
     */
    async function init() {
        // 检查 WebP 支持
        const supportsWebP = await checkWebPSupport();
        if (!supportsWebP) {
            // 降级到 JPEG 参数
            config.webpParams = '?width=1920&q=85';
        }
        
        // 启动加载器
        initProgressiveLoader();
    }

    // DOM ready 时初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
