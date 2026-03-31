/**
 * 泠诗的存图站 - Gallery 主逻辑
 * Vue 2.x 应用
 */

// ============================================
// 配置区
// ============================================
const CONFIG = {
    WORKER_URL: 'https://api-gallery.lingshichat.cn',
    S3_PUBLIC_URL: 'https://img.lingshichat.cn',
    S3_BUCKET: 'lingshichat',
    S3_REGION: 'cn-east-1',
    IMAGE_BASE_PREFIX: 'img/gallery/',
    THUMBNAIL_PARAMS: '?w=400&q=80&f=webp',
    SESSION_TOKEN_KEY: 'gallery_session_token',
    SESSION_ROLE_KEY: 'gallery_session_role',
    SESSION_USER_KEY: 'gallery_session_user',
    SESSION_EMAIL_KEY: 'gallery_session_email',
    SESSION_EXPIRES_KEY: 'gallery_session_expires',
    OPEN_MODE: true
};

const CATEGORIES = [
    { key: 'all', name: '全部', icon: 'fa-solid fa-images', prefix: '' },
    { key: 'anime', name: '二次元', icon: 'fa-solid fa-wand-magic-sparkles', prefix: '二次元/' },
    { key: 'landscape', name: '风景', icon: 'fa-solid fa-mountain-sun', prefix: '风景/' },
    { key: 'beauty', name: '美图', icon: 'fa-solid fa-palette', prefix: '美图/' },
    { key: 'portrait', name: '人像', icon: 'fa-solid fa-user', prefix: '人像/' },
    { key: 'mine', name: '我的', icon: 'fa-solid fa-user', prefix: '', owner: 'mine' }
];

const UPLOAD_CATEGORIES = CATEGORIES.filter(c => c.key !== 'all' && c.key !== 'mine');

function createUploadQueueId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseTagInput(value) {
    return String(value || '')
        .split(/[,\n，]+/)
        .map((tag) => tag.trim())
        .filter((tag, index, list) => tag && list.indexOf(tag) === index);
}

// ============================================
// 图片列表服务
// ============================================
const GalleryService = {
    async listImages(prefix = '', token = '', owner = '', options = {}) {
        const fullPrefix = prefix ? `${CONFIG.IMAGE_BASE_PREFIX}${prefix}` : CONFIG.IMAGE_BASE_PREFIX;
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

        const limitRaw = Number(options.limit);
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 200) : 60;
        const cursor = typeof options.cursor === 'string' ? options.cursor.trim() : '';

        const params = new URLSearchParams({
            action: 'list',
            prefix: fullPrefix,
            limit: String(limit)
        });
        if (owner) {
            params.set('owner', owner);
        }
        if (cursor) {
            params.set('cursor', cursor);
        }
        if (options.bustCache) {
            params.set('_t', String(Date.now()));
        }

        const response = await fetch(`${CONFIG.WORKER_URL}?${params.toString()}`, { headers });
        const data = await response.json();

        if (data.code !== 200) {
            const err = new Error(data.message || '获取图片列表失败');
            err.code = data.code;
            throw err;
        }

        return {
            images: Array.isArray(data.images) ? data.images : [],
            pagination: data.pagination || {
                limit,
                hasMore: false,
                nextCursor: '',
                total: 0
            }
        };
    },

    async getCounts(bustCache = false, token = '') {
        const url = bustCache
            ? `${CONFIG.WORKER_URL}?action=counts&_t=${Date.now()}`
            : `${CONFIG.WORKER_URL}?action=counts`;
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const response = await fetch(url, { headers });
        const data = await response.json();
        if (data.code !== 200) throw new Error(data.message || '获取计数失败');
        return data.counts;
    },

    async login(email, password) {
        const response = await fetch(`${CONFIG.WORKER_URL}?action=login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (data.code !== 200 || !data.data?.token) {
            const err = new Error(data.message || '登录失败');
            err.code = data.code;
            throw err;
        }
        return data.data;
    },

    async register(email, password, inviteCode = '') {
        const response = await fetch(`${CONFIG.WORKER_URL}?action=register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, inviteCode })
        });
        const data = await response.json();
        if (data.code !== 200) {
            const err = new Error(data.message || '注册失败');
            err.code = data.code;
            throw err;
        }
        return data;
    },

    // 管理员 API
    async adminListUsers(token) {
        const res = await fetch(`${CONFIG.WORKER_URL}?action=adminListUsers`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.code !== 200) throw new Error(data.message || '获取用户列表失败');
        return data.data || [];
    },

    async adminUpdateUser(token, userId, updates) {
        const res = await fetch(`${CONFIG.WORKER_URL}?action=adminUpdateUser`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ userId, ...updates })
        });
        const data = await res.json();
        if (data.code !== 200) throw new Error(data.message || '更新用户失败');
        return data;
    },

    async adminListInvites(token) {
        const res = await fetch(`${CONFIG.WORKER_URL}?action=adminListInvites`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.code !== 200) throw new Error(data.message || '获取邀请码列表失败');
        return data.data || [];
    },

    async adminCreateInvite(token, maxUses = 1, customCode = '') {
        const res = await fetch(`${CONFIG.WORKER_URL}?action=adminCreateInvite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ maxUses, ...(customCode ? { customCode } : {}) })
        });
        const data = await res.json();
        if (data.code !== 200) throw new Error(data.message || '创建邀请码失败');
        return data.data;
    },

    async adminUpdateInvite(token, code, updates) {
        const res = await fetch(`${CONFIG.WORKER_URL}?action=adminUpdateInvite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ code, ...updates })
        });
        const data = await res.json();
        if (data.code !== 200) throw new Error(data.message || '更新邀请码失败');
        return data;
    },

    async logout(token) {
        const response = await fetch(`${CONFIG.WORKER_URL}?action=logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();
        if (data.code !== 200) {
            const err = new Error(data.message || '退出失败');
            err.code = data.code;
            throw err;
        }
        return data;
    },

    async updateMetadata(key, title, tags, token, expectedVersion = null) {
        const payload = { key, title, tags };
        if (expectedVersion !== null && expectedVersion !== undefined) {
            payload.expectedVersion = expectedVersion;
        }

        const response = await fetch(`${CONFIG.WORKER_URL}?action=updateMeta`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.code !== 200) {
            const err = new Error(data.message || '更新元数据失败');
            err.code = data.code;
            err.currentVersion = data.currentVersion;
            err.latestMetadata = data.metadata;
            throw err;
        }
        return data.metadata;
    },

    async moveImage(oldKey, newKey, token) {
        const response = await fetch(`${CONFIG.WORKER_URL}?action=moveImage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ oldKey, newKey })
        });

        const data = await response.json();
        if (data.code !== 200) {
            const err = new Error(data.message || '移动图片失败');
            err.code = data.code;
            throw err;
        }
        return data;
    },

    async deleteImage(key, token) {
        const response = await fetch(`${CONFIG.WORKER_URL}?action=deleteImage&key=${encodeURIComponent(key)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();
        if (data.code !== 200) {
            const err = new Error(data.message || '删除图片失败');
            err.code = data.code;
            throw err;
        }
        return data;
    },

    async me(token) {
        const response = await fetch(`${CONFIG.WORKER_URL}?action=me`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();
        if (data.code !== 200 || !data.data) {
            const err = new Error(data.message || '会话无效');
            err.code = data.code;
            throw err;
        }
        return data.data;
    },

    // 查询当前用户今日上传额度
    async getUploadQuota(token) {
        const response = await fetch(`${CONFIG.WORKER_URL}?action=uploadQuota`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.code !== 200) {
            const err = new Error(data.message || '查询额度失败');
            err.code = data.code;
            throw err;
        }
        return data;
    }
};

// ============================================
// Vue 应用
// ============================================
new Vue({
    el: '#app',
    data: {
        isUnlocked: true,
        loading: false,

        categories: CATEGORIES,
        uploadCategories: UPLOAD_CATEGORIES,
        currentCategory: 'all',
        categoryCounts: {},

        images: [],
        allImages: {},

        isDragging: false,

        showUploadModal: false,
        uploadFiles: [],
        uploadTitle: '',
        uploadTags: [],
        newTag: '',
        uploadCategory: 'anime',
        uploading: false,
        uploadProgress: 0,
        uploadFileName: '',

        // 每日上传额度（打开弹窗时从后端查询）
        dailyUploadUsed: 0,
        dailyUploadLimit: 30,
        isUploadUnlimited: false,

        // 认证与权限
        showAuthModal: false,
        authMode: 'login',
        authEmail: '',
        authPassword: '',
        authError: '',
        authSubmitting: false,
        modalMouseDownOnOverlay: false,
        sessionToken: localStorage.getItem(CONFIG.SESSION_TOKEN_KEY) || '',
        sessionRole: localStorage.getItem(CONFIG.SESSION_ROLE_KEY) || '',
        sessionUserId: localStorage.getItem(CONFIG.SESSION_USER_KEY) || '',
        sessionEmail: localStorage.getItem(CONFIG.SESSION_EMAIL_KEY) || '',
        sessionExpiresAt: localStorage.getItem(CONFIG.SESSION_EXPIRES_KEY) || '',

        // 编辑功能
        showEditModal: false,
        editingImage: null,
        editTitle: '',
        editTags: [],
        newEditTag: '',
        editCategory: '',
        savingEdit: false,

        // 注册邀请码
        inviteCode: '',

        // 管理员控制中心
        showAdminPanel: false,
        adminPanelTab: 'users',
        adminUsers: [],
        adminInvites: [],
        adminLoading: false,
        newInviteMaxUses: 1,
        newInviteCustomCode: '',

        // 1x1 透明 GIF 占位符，避免浏览器提前加载 placeholderUrl
        lazyPlaceholder: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        imageObserver: null,
        loadMoreObserver: null,
        loadingMore: false,
        paginationByCategory: {},

        isMobileViewport: false,
        lastScrollY: 0,
        isCategoryHidden: false,
        longPressTimer: null,
        activeOverlayKey: null,
        // 触摸滑动识别：记录按下时的坐标
        touchStartPos: { x: 0, y: 0 },
        // JS 瀑布流列数（随窗口尺寸动态计算，代替 CSS column-count）
        masonryColumnCount: 4
    },

    async mounted() {
        this.restoreSession();
        const bootPromise = this.syncSessionOnBoot();
        const loadPromise = this.loadImages();
        await Promise.all([bootPromise, loadPromise]);
        this.$nextTick(() => {
            this.initFancybox();
        });
        document.addEventListener('paste', this.handlePaste);
        window.addEventListener('storage', this.handleStorageChange);
        this.initLazyLoader();
        this.initResizeListener();
    },

    beforeDestroy() {
        document.removeEventListener('paste', this.handlePaste);
        window.removeEventListener('storage', this.handleStorageChange);
        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('scroll', this.handleScroll);
        if (this.imageObserver) {
            this.imageObserver.disconnect();
            this.imageObserver = null;
        }
        if (this.loadMoreObserver) {
            this.loadMoreObserver.disconnect();
            this.loadMoreObserver = null;
        }
    },

    watch: {
        images() {
            this.$nextTick(() => {
                this.initFancybox();
                this.initLazyLoader();
                this.initLoadMoreObserver();
            });
        }
    },

    computed: {
        hasMoreCurrentCategory() {
            const state = this.paginationByCategory[this.currentCategory];
            return !!(state && state.hasMore);
        },

        globalImageTotal() {
            const allTotal = Number(this.categoryCounts.all);
            return Number.isFinite(allTotal) && allTotal >= 0 ? allTotal : this.images.length;
        },

        accountBadgeLabel() {
            if (!this.sessionToken) {
                return 'Visitor';
            }
            return this.sessionRole === 'admin' ? 'Admin' : 'User';
        },

        accountBadgeClass() {
            if (!this.sessionToken) {
                return 'is-visitor';
            }
            return this.sessionRole === 'admin' ? 'is-admin' : 'is-user';
        },

        // JS 列式瀑布流：round-robin 分配图片到固定列
        // 加载更多时，已有图片的列归属不变，新图片追加到列尾
        imageColumns() {
            const numCols = this.masonryColumnCount;
            const cols = Array.from({ length: numCols }, () => []);
            this.images.forEach((img, i) => {
                cols[i % numCols].push(img);
            });
            return cols;
        }
    },

    methods: {
        isMobile() {
            return window.innerWidth <= 768 || ('ontouchstart' in window);
        },

        restoreSession() {
            if (!this.sessionToken) return;

            // 兼容修复：旧版可能只存 token，没有 expires/role/userId
            if (!this.sessionExpiresAt || !this.sessionRole || !this.sessionUserId) {
                this.clearSession();
                return;
            }

            const expiresTs = new Date(this.sessionExpiresAt).getTime();
            if (!Number.isFinite(expiresTs) || expiresTs <= Date.now()) {
                this.clearSession();
                return;
            }
        },

        async syncSessionOnBoot() {
            const token = this.getReadableSessionToken();
            if (!token) {
                return;
            }

            try {
                const profile = await GalleryService.me(token);
                this.sessionRole = profile.role || '';
                this.sessionUserId = profile.userId || '';
                this.sessionEmail = profile.email || '';
                this.sessionExpiresAt = profile.expiresAt || this.sessionExpiresAt;

                localStorage.setItem(CONFIG.SESSION_ROLE_KEY, this.sessionRole);
                localStorage.setItem(CONFIG.SESSION_USER_KEY, this.sessionUserId);
                localStorage.setItem(CONFIG.SESSION_EMAIL_KEY, this.sessionEmail);
                localStorage.setItem(CONFIG.SESSION_EXPIRES_KEY, this.sessionExpiresAt);
            } catch (error) {
                if (error?.code === 401) {
                    this.clearSession();
                }
            }
        },

        setSession(session) {
            this.sessionToken = session.token;
            this.sessionRole = session.role;
            this.sessionUserId = session.userId || session.ownerId || '';
            this.sessionEmail = session.email || '';
            this.sessionExpiresAt = session.expiresAt;
            localStorage.setItem(CONFIG.SESSION_TOKEN_KEY, this.sessionToken);
            localStorage.setItem(CONFIG.SESSION_ROLE_KEY, this.sessionRole);
            localStorage.setItem(CONFIG.SESSION_USER_KEY, this.sessionUserId);
            localStorage.setItem(CONFIG.SESSION_EMAIL_KEY, this.sessionEmail);
            localStorage.setItem(CONFIG.SESSION_EXPIRES_KEY, this.sessionExpiresAt);
        },

        clearSession() {
            this.sessionToken = '';
            this.sessionRole = '';
            this.sessionUserId = '';
            this.sessionEmail = '';
            this.sessionExpiresAt = '';
            localStorage.removeItem(CONFIG.SESSION_TOKEN_KEY);
            localStorage.removeItem(CONFIG.SESSION_ROLE_KEY);
            localStorage.removeItem(CONFIG.SESSION_USER_KEY);
            localStorage.removeItem(CONFIG.SESSION_EMAIL_KEY);
            localStorage.removeItem(CONFIG.SESSION_EXPIRES_KEY);
        },

        ensureSession(requiredRole = null) {
            if (!this.sessionToken) {
                return false;
            }
            if (this.sessionExpiresAt) {
                const expiresTs = new Date(this.sessionExpiresAt).getTime();
                if (Number.isFinite(expiresTs) && expiresTs <= Date.now()) {
                    this.clearSession();
                    this.showToast('登录状态已过期，请重新登录', 'error');
                    return false;
                }
            }
            if (requiredRole && this.sessionRole !== requiredRole) {
                return false;
            }
            return true;
        },

        handleStorageChange(event) {
            const keys = [
                CONFIG.SESSION_TOKEN_KEY,
                CONFIG.SESSION_ROLE_KEY,
                CONFIG.SESSION_USER_KEY,
                CONFIG.SESSION_EMAIL_KEY,
                CONFIG.SESSION_EXPIRES_KEY
            ];
            if (!keys.includes(event.key)) {
                return;
            }

            this.sessionToken = localStorage.getItem(CONFIG.SESSION_TOKEN_KEY) || '';
            this.sessionRole = localStorage.getItem(CONFIG.SESSION_ROLE_KEY) || '';
            this.sessionUserId = localStorage.getItem(CONFIG.SESSION_USER_KEY) || '';
            this.sessionEmail = localStorage.getItem(CONFIG.SESSION_EMAIL_KEY) || '';
            this.sessionExpiresAt = localStorage.getItem(CONFIG.SESSION_EXPIRES_KEY) || '';
            this.restoreSession();
        },

        // 防止拖拽穿透误关闭弹窗：mousedown + mouseup 都在 overlay 上才关闭
        overlayMouseDown(e) {
            this.modalMouseDownOnOverlay = (e.target === e.currentTarget);
        },
        overlayMouseUp(e, modalFlag) {
            if (this.modalMouseDownOnOverlay && e.target === e.currentTarget) {
                this[modalFlag] = false;
            }
            this.modalMouseDownOnOverlay = false;
        },

        openAuthModal(mode = 'login', message = '') {
            this.authMode = mode;
            this.authEmail = '';
            this.authPassword = '';
            this.inviteCode = '';
            this.authError = message;
            this.showAuthModal = true;
        },

        async submitAuth() {
            if (!this.authEmail.trim() || !this.authPassword) {
                this.authError = '请输入邮箱和密码';
                return;
            }

            this.authSubmitting = true;
            this.authError = '';
            try {
                if (this.authMode === 'register') {
                    await GalleryService.register(this.authEmail, this.authPassword, this.inviteCode);
                    this.inviteCode = '';
                }
                const session = await GalleryService.login(this.authEmail, this.authPassword);
                this.setSession(session);
                this.showAuthModal = false;
                await this.loadImages(true);
                this.showToast(this.authMode === 'register' ? '注册并登录成功' : '登录成功', 'success');
            } catch (error) {
                this.authError = error.message || '认证失败';
            } finally {
                this.authSubmitting = false;
            }
        },

        async logout() {
            const token = this.getReadableSessionToken();
            if (token) {
                try {
                    await GalleryService.logout(token);
                } catch (error) {
                    console.warn('退出登录请求失败:', error);
                }
            }
            this.clearSession();
            this.showAdminPanel = false;
            await this.loadImages(true);
            this.showToast('已退出登录', 'success');
        },

        // ============================================
        // 分类相关
        // ============================================

        getReadableSessionToken() {
            if (!this.sessionToken) {
                return '';
            }
            if (!this.sessionExpiresAt) {
                this.clearSession();
                return '';
            }
            const expiresTs = new Date(this.sessionExpiresAt).getTime();
            if (!Number.isFinite(expiresTs) || expiresTs <= Date.now()) {
                this.clearSession();
                return '';
            }
            return this.sessionToken;
        },

        getCategoryQuery(categoryKey) {
            const cat = CATEGORIES.find(c => c.key === categoryKey) || { prefix: '', owner: '' };
            const listToken = this.getReadableSessionToken();
            return {
                prefix: cat.prefix || '',
                owner: cat.owner || '',
                token: listToken
            };
        },

        saveCategoryPageState(categoryKey, page) {
            const images = Array.isArray(page?.images) ? page.images : [];
            const pagination = page?.pagination || {};
            const total = Number.isFinite(pagination.total) ? pagination.total : images.length;

            this.$set(this.allImages, categoryKey, images);
            this.$set(this.paginationByCategory, categoryKey, {
                hasMore: !!pagination.hasMore,
                nextCursor: pagination.nextCursor || '',
                total
            });
            // categoryCounts 仅由 counts API 写入，mine 除外（不在 counts API 中）
            if (categoryKey === 'mine') {
                this.$set(this.categoryCounts, 'mine', total);
            }
        },

        async fetchCategoryPage(categoryKey, options = {}) {
            const { prefix, owner, token } = this.getCategoryQuery(categoryKey);
            return GalleryService.listImages(prefix, token, owner, options);
        },

        async loadAllCategories(bustCache = false) {
            this.loading = true;

            try {
                const fetchOpts = bustCache ? { limit: 60, bustCache: true } : { limit: 60 };

                // Three-way parallel: all + mine (if logged in) + counts
                const allPromise = this.fetchCategoryPage('all', fetchOpts);
                const listToken = this.getReadableSessionToken();
                const minePromise = listToken
                    ? this.fetchCategoryPage('mine', fetchOpts).catch(e => {
                        console.warn('加载"我的图片"失败:', e);
                        return null;
                    })
                    : Promise.resolve(null);
                const countsPromise = GalleryService.getCounts(bustCache, listToken).catch(e => {
                    console.warn('加载分类计数失败:', e);
                    return null;
                });

                const [allPage, minePage, counts] = await Promise.all([allPromise, minePromise, countsPromise]);

                this.saveCategoryPageState('all', allPage);
                if (this.currentCategory === 'all') {
                    this.images = this.allImages['all'];
                }

                if (listToken && minePage) {
                    this.saveCategoryPageState('mine', minePage);
                } else if (!listToken) {
                    this.$set(this.allImages, 'mine', []);
                    this.$set(this.paginationByCategory, 'mine', {
                        hasMore: false,
                        nextCursor: '',
                        total: 0
                    });
                    this.$set(this.categoryCounts, 'mine', 0);
                    if (this.currentCategory === 'mine') {
                        this.currentCategory = 'all';
                        this.images = this.allImages['all'] || [];
                    }
                }

                if (counts) {
                    for (const key of Object.keys(counts)) {
                        this.$set(this.categoryCounts, key, counts[key]);
                    }
                }

            } catch (error) {
                console.error('加载图片失败:', error);
                this.showToast('加载图片失败: ' + error.message, 'error');
            } finally {
                this.loading = false;
            }
        },

        async loadCategoryCounts(bustCache = false) {
            try {
                const token = this.getReadableSessionToken();
                const counts = await GalleryService.getCounts(bustCache, token);
                if (counts) {
                    for (const key of Object.keys(counts)) {
                        this.$set(this.categoryCounts, key, counts[key]);
                    }
                }
            } catch (e) {
                console.warn('加载分类计数失败:', e);
            }
        },

        async selectCategory(categoryKey) {
            if (categoryKey === 'mine' && !this.getReadableSessionToken()) {
                this.openAuthModal('login', '登录后可查看“我的图片”');
                return;
            }

            if (this.currentCategory === categoryKey) return;

            this.currentCategory = categoryKey;
            this.loading = true;

            try {
                if (Array.isArray(this.allImages[categoryKey])) {
                    this.images = this.allImages[categoryKey];
                } else {
                    const page = await this.fetchCategoryPage(categoryKey, { limit: 60 });
                    this.saveCategoryPageState(categoryKey, page);
                    this.images = this.allImages[categoryKey] || [];
                }
            } catch (error) {
                console.error('加载分类图片失败:', error);
                this.showToast('加载失败: ' + error.message, 'error');
            } finally {
                this.loading = false;
            }
        },

        async loadMoreCurrentCategory() {
            if (this.loading || this.loadingMore) {
                return;
            }

            const currentState = this.paginationByCategory[this.currentCategory];
            if (!currentState || !currentState.hasMore || !currentState.nextCursor) {
                return;
            }

            this.loadingMore = true;
            try {
                const page = await this.fetchCategoryPage(this.currentCategory, {
                    cursor: currentState.nextCursor,
                    limit: 60
                });
                const appendImages = Array.isArray(page?.images) ? page.images : [];
                const existingImages = Array.isArray(this.allImages[this.currentCategory])
                    ? this.allImages[this.currentCategory]
                    : [];
                const merged = existingImages.concat(appendImages);
                this.$set(this.allImages, this.currentCategory, merged);
                this.images = merged;

                const pagination = page?.pagination || {};
                const total = Number.isFinite(pagination.total) ? pagination.total : merged.length;
                this.$set(this.paginationByCategory, this.currentCategory, {
                    hasMore: !!pagination.hasMore,
                    nextCursor: pagination.nextCursor || '',
                    total
                });
                // categoryCounts 仅由 counts API 写入，mine 除外
                if (this.currentCategory === 'mine') {
                    this.$set(this.categoryCounts, 'mine', total);
                }
            } catch (error) {
                console.error('加载更多失败:', error);
                this.showToast('加载更多失败: ' + error.message, 'error');
            } finally {
                this.loadingMore = false;
            }
        },

        initLoadMoreObserver() {
            if (this.loadMoreObserver) {
                this.loadMoreObserver.disconnect();
                this.loadMoreObserver = null;
            }

            if (!this.hasMoreCurrentCategory) {
                return;
            }

            const sentinel = this.$refs.loadMoreSentinel;
            if (!sentinel || !('IntersectionObserver' in window)) {
                return;
            }

            this.loadMoreObserver = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    this.loadMoreCurrentCategory();
                });
            }, {
                root: null,
                // 提前 800px 触发加载，用户看不到底部时就开始预请求下一批
                rootMargin: '800px 0px',
                threshold: 0.01
            });

            this.loadMoreObserver.observe(sentinel);
        },

        async loadImages(bustCache = false) {
            this.allImages = {};
            this.paginationByCategory = {};
            await this.loadAllCategories(bustCache);
        },

        // ============================================
        // 上传相关
        // ============================================

        async openUploadModal() {
            if (!this.ensureSession()) {
                this.openAuthModal('login', '登录后可上传图片');
                return;
            }
            // 查询今日上传额度
            try {
                const quota = await GalleryService.getUploadQuota(this.sessionToken);
                this.dailyUploadUsed = quota.dailyUsed || 0;
                this.dailyUploadLimit = quota.dailyLimit || 30;
                this.isUploadUnlimited = !!quota.isUnlimited;
            } catch (e) {
                console.warn('查询上传额度失败:', e);
            }
            this.showUploadModal = true;
        },

        triggerFileInput() {
            this.$refs.fileInput.click();
        },

        handleFileSelect(event) {
            if (!this.ensureSession()) {
                this.openAuthModal('login', '登录后可上传图片');
                event.target.value = '';
                return;
            }
            const files = Array.from(event.target.files);
            this.addFiles(files);
            event.target.value = '';
        },

        handleDrop(event) {
            this.isDragging = false;
            if (!this.ensureSession()) {
                this.openAuthModal('login', '登录后可上传图片');
                return;
            }
            const files = Array.from(event.dataTransfer.files);
            this.addFiles(files);
        },

        handleModalDrop(event) {
            if (!this.ensureSession()) {
                this.openAuthModal('login', '登录后可上传图片');
                return;
            }
            const files = Array.from(event.dataTransfer.files).filter(f => f.type.startsWith('image/'));
            this.addFiles(files);
        },

        handlePaste(event) {
            if (!this.isUnlocked) return;
            if (!this.ensureSession()) return;

            const items = event.clipboardData?.items;
            if (!items) return;

            const files = [];
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.startsWith('image/')) {
                    const file = items[i].getAsFile();
                    if (file) files.push(file);
                }
            }

            if (files.length > 0) {
                this.addFiles(files);
                this.openUploadModal();
            }
        },

        hasImageDimensions(image) {
            const width = Number(image?.width);
            const height = Number(image?.height);
            return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
        },

        getLazyImageStyle(image) {
            if (!this.hasImageDimensions(image)) {
                return {};
            }

            return {
                aspectRatio: `${Math.floor(Number(image.width))} / ${Math.floor(Number(image.height))}`
            };
        },

        readFileAsDataUrl(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    if (typeof event.target?.result === 'string') {
                        resolve(event.target.result);
                        return;
                    }
                    reject(new Error('预览数据格式无效'));
                };
                reader.onerror = () => reject(new Error('读取文件失败'));
                reader.readAsDataURL(file);
            });
        },

        loadImageDimensions(previewUrl) {
            return new Promise((resolve) => {
                if (!previewUrl) {
                    resolve({ width: null, height: null });
                    return;
                }

                const image = new Image();
                image.onload = () => {
                    resolve({
                        width: image.naturalWidth || null,
                        height: image.naturalHeight || null
                    });
                };
                image.onerror = () => resolve({ width: null, height: null });
                image.src = previewUrl;
            });
        },

        async buildUploadFileItem(file) {
            const preview = await this.readFileAsDataUrl(file);
            const dimensions = await this.loadImageDimensions(preview);

            return {
                id: createUploadQueueId(),
                file: file,
                name: file.name,
                // 默认不预填标题，避免与文件名提示重复；上传时回退到建议标题
                title: '',
                suggestedTitle: file.name.replace(/\.[^.]+$/, ''),
                preview,
                width: dimensions.width,
                height: dimensions.height,
                settingsExpanded: false,
                customCategoryEnabled: false,
                customCategory: '',
                customTagsEnabled: false,
                customTagsText: ''
            };
        },

        addFiles(files) {
            // 管理员不限制单次多选数量，普通用户限制 30 张
            const isAdmin = this.sessionRole === 'admin';
            const MAX_UPLOAD_COUNT = isAdmin ? Infinity : 30;
            // 只保留图片类型
            const imageFiles = files.filter(f => f.type.startsWith('image/'));

            // 计算当前已有的文件数量
            const remaining = MAX_UPLOAD_COUNT - this.uploadFiles.length;
            if (remaining <= 0) {
                if (!isAdmin) {
                    this.showToast(`单次最多支持上传 ${MAX_UPLOAD_COUNT} 张图片，已无法继续添加`, 'error');
                }
                return;
            }

            // 普通用户还需要考虑每日剩余额度
            let effectiveRemaining = remaining;
            if (!isAdmin && !this.isUploadUnlimited) {
                const dailyRemaining = Math.max(0, this.dailyUploadLimit - this.dailyUploadUsed - this.uploadFiles.length);
                effectiveRemaining = Math.min(remaining, dailyRemaining);
                if (effectiveRemaining <= 0) {
                    this.showToast('今日上传额度已用完，请明天再试', 'error');
                    return;
                }
            }

            let filesToAdd = imageFiles;
            if (imageFiles.length > effectiveRemaining) {
                filesToAdd = imageFiles.slice(0, effectiveRemaining);
                if (!isAdmin) {
                    this.showToast(`已截断为前 ${effectiveRemaining} 张（受每日限额约束）`, 'error');
                }
            }

            Promise.all(filesToAdd.map((file) => this.buildUploadFileItem(file).catch((error) => {
                console.error('构建上传预览失败:', error);
                this.showToast(`读取 ${file.name} 预览失败`, 'error');
                return null;
            }))).then((items) => {
                items.filter(Boolean).forEach((item) => {
                    this.uploadFiles.push(item);
                });
            });
        },

        removeFile(index) {
            this.uploadFiles.splice(index, 1);
        },

        addTag() {
            const tag = this.newTag.trim();
            if (tag && !this.uploadTags.includes(tag)) {
                this.uploadTags.push(tag);
            }
            this.newTag = '';
        },

        removeTag(index) {
            this.uploadTags.splice(index, 1);
        },

        getUploadCategoryName(categoryKey) {
            const category = UPLOAD_CATEGORIES.find((item) => item.key === categoryKey);
            return category ? category.name : '未选择';
        },

        getUploadTagsSummary(tags) {
            if (!Array.isArray(tags) || tags.length === 0) {
                return '未设置批量标签';
            }
            if (tags.length <= 3) {
                return tags.join(' / ');
            }
            return `${tags.slice(0, 3).join(' / ')} 等 ${tags.length} 个标签`;
        },

        getFileCategorySummary(file) {
            if (!file || !file.customCategoryEnabled) {
                return `批量 · ${this.getUploadCategoryName(this.uploadCategory)}`;
            }
            return `单独 · ${this.getUploadCategoryName(file.customCategory || this.uploadCategory)}`;
        },

        getFileTagsSummary(file) {
            if (!file || !file.customTagsEnabled) {
                return `批量 · ${this.getUploadTagsSummary(this.uploadTags)}`;
            }
            const customTags = parseTagInput(file.customTagsText);
            if (customTags.length === 0) {
                return '单独 · 未填写';
            }
            return `单独 · ${this.getUploadTagsSummary(customTags)}`;
        },

        toggleFileSettings(file) {
            file.settingsExpanded = !file.settingsExpanded;
        },

        enableFileCustomCategory(file) {
            file.customCategoryEnabled = true;
            if (!file.customCategory) {
                file.customCategory = this.uploadCategory;
            }
        },

        disableFileCustomCategory(file) {
            file.customCategoryEnabled = false;
        },

        enableFileCustomTags(file) {
            file.customTagsEnabled = true;
            if (!String(file.customTagsText || '').trim() && this.uploadTags.length > 0) {
                file.customTagsText = this.uploadTags.join(', ');
            }
        },

        disableFileCustomTags(file) {
            file.customTagsEnabled = false;
        },

        async startUpload() {
            if (this.uploadFiles.length === 0) return;
            if (!this.ensureSession()) {
                this.openAuthModal('login', '登录后可上传图片');
                return;
            }

            const globalCategoryKey = this.uploadCategory;
            const uploadTagsSnapshot = [...this.uploadTags];
            const uploadQueue = this.uploadFiles.map((item) => ({
                id: item.id || createUploadQueueId(),
                file: item.file,
                name: item.name,
                title: typeof item.title === 'string' ? item.title : '',
                suggestedTitle: typeof item.suggestedTitle === 'string' ? item.suggestedTitle : '',
                preview: item.preview,
                width: Number.isFinite(Number(item.width)) ? Number(item.width) : null,
                height: Number.isFinite(Number(item.height)) ? Number(item.height) : null,
                settingsExpanded: !!item.settingsExpanded,
                customCategoryEnabled: !!item.customCategoryEnabled,
                customCategory: typeof item.customCategory === 'string' ? item.customCategory : '',
                customTagsEnabled: !!item.customTagsEnabled,
                customTagsText: typeof item.customTagsText === 'string' ? item.customTagsText : ''
            }));
            const uploadFileCount = uploadQueue.length;
            this.showUploadModal = false;
            this.uploading = true;
            this.uploadProgress = 0;

            let uploadedCount = 0;
            let createdCount = 0;
            // 每个文件占的进度比重（每个文件内部 XHR 进度再细分）
            const perFileWeight = 100 / uploadFileCount;

            for (let i = 0; i < uploadQueue.length; i++) {
                const fileData = uploadQueue[i];
                const file = fileData.file;
                const displayTitle = (fileData.title || '').trim() || fileData.suggestedTitle || file.name;
                const resolvedCategoryKey = fileData.customCategoryEnabled
                    ? (fileData.customCategory || globalCategoryKey)
                    : globalCategoryKey;
                const resolvedCategory = UPLOAD_CATEGORIES.find((item) => item.key === resolvedCategoryKey);
                const resolvedTags = fileData.customTagsEnabled
                    ? parseTagInput(fileData.customTagsText)
                    : uploadTagsSnapshot;

                this.uploadFileName = displayTitle;
                // 当前文件开始时进度置为已完成文件数的比重
                this.uploadProgress = Math.round(i * perFileWeight);

                try {
                    const uploadResult = await this.uploadFile(fileData, {
                        categoryPrefix: resolvedCategory ? resolvedCategory.prefix : '',
                        tags: resolvedTags
                    }, i, uploadFileCount, perFileWeight);
                    if (uploadResult === 'uploaded') {
                        uploadedCount++;
                        createdCount++;
                    } else if (uploadResult === 'referenced') {
                        createdCount++;
                    }
                } catch (error) {
                    console.error('上传失败:', error);
                    if (error?.code === 401) {
                        this.clearSession();
                        this.openAuthModal('login', '登录已失效，请重新登录后上传');
                        this.showToast('登录已失效，请重新登录后再上传', 'error');
                        break;
                    }
                    if (error?.code === 403) {
                        this.openAuthModal('login', '当前账号无上传权限');
                        this.showToast('当前身份无上传权限，请重新登录', 'error');
                        break;
                    }
                    // 普通失败（网络/格式/限速）：提示后继续上传剩余图片
                    if (error?.code === 429) {
                        this.showToast(`上传 ${file.name} 失败: 请求过于频繁，请稍后重试`, 'error');
                    } else {
                        this.showToast(`上传 ${file.name} 失败: ${error.message}`, 'error');
                    }
                    // 继续下一张，不中断整个队列
                    continue;
                }
            }

            this.uploading = false;
            this.uploadProgress = 0;
            this.uploadFiles = [];
            this.uploadTitle = '';
            this.uploadTags = [];

            if (createdCount > 0) {
                // 本地同步每日已用额度，避免重新打开弹窗时显示旧数据
                this.dailyUploadUsed += createdCount;
                await this.loadImages(true);
            }

            if (uploadedCount > 0) {
                this.showToast(`成功上传 ${uploadedCount} 张图片！`, 'success');
            }
        },

        async uploadFile(fileData, uploadConfig, fileIndex = 0, totalFiles = 1, perFileWeight = 100) {
            const file = fileData.file;
            const fileTitle = (fileData.title || '').trim();
            const fallbackTitle = fileData.suggestedTitle || file.name.replace(/\.[^.]+$/, '') || file.name;
            const normalizedTags = Array.isArray(uploadConfig?.tags) ? uploadConfig.tags : [];
            const categoryPrefix = uploadConfig?.categoryPrefix || '';
            const timestamp = Date.now();
            const randomStr = Math.random().toString(36).substring(2, 8);
            const ext = file.name.split('.').pop() || 'jpg';
            const filename = `${timestamp}_${randomStr}.${ext}`;
            const key = `${CONFIG.IMAGE_BASE_PREFIX}${categoryPrefix}${filename}`;

            // Compute SHA-256 hash for deduplication
            const arrayBuffer = await file.arrayBuffer();
            const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const contentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            // 获取上传签名
            if (!this.ensureSession()) {
                this.openAuthModal('login', '请先登录后上传');
                throw new Error('请先登录账号');
            }

            const signResponse = await fetch(`${CONFIG.WORKER_URL}?action=sign`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.sessionToken}`
                },
                body: JSON.stringify({
                    key,
                    contentType: file.type,
                    sizeBytes: file.size,
                    contentHash
                })
            });
            const signData = await signResponse.json();

            // Handle duplicate detection
            if (signData.duplicate) {
                const displayTitle = fileTitle || fallbackTitle;
                if (signData.own) {
                    // User's own duplicate — skip
                    this.showToast(`跳过「${displayTitle}」: ${signData.message}`, 'info');
                    return 'skipped';
                } else {
                    // Another user's image — create reference without S3 upload
                    const refConfirm = await fetch(`${CONFIG.WORKER_URL}?action=confirm-upload`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.sessionToken}`
                        },
                        body: JSON.stringify({
                            key,
                            contentHash,
                            fileSize: file.size,
                            storageKey: signData.storageKey,
                            width: fileData.width,
                            height: fileData.height
                        })
                    });
                    const refData = await refConfirm.json();
                    if (refData.code !== 200) {
                        throw new Error(refData.message || '创建引用失败');
                    }

                    // Save metadata
                    const metadataTitle = fileTitle || fallbackTitle;
                    if (metadataTitle || normalizedTags.length > 0) {
                        try {
                            await GalleryService.updateMetadata(key, metadataTitle, normalizedTags, this.sessionToken);
                        } catch (e) {
                            console.warn('保存元数据失败:', e);
                            throw new Error(`引用已创建，但标题/标签保存失败: ${e.message || '未知错误'}`);
                        }
                    }
                    this.showToast(`已添加引用「${displayTitle}」`, 'success');
                    return 'referenced';
                }
            }

            if (signData.code !== 200) {
                const signError = new Error(signData.message || '获取签名失败');
                signError.code = signData.code;
                throw signError;
            }

            // 上传到 S3
            await this.uploadToS3(signData.url, signData.headers, file, fileIndex, perFileWeight);

            const effectiveKey = signData.key || key;

            // 上传成功后确认，写入 DB 记录
            await fetch(`${CONFIG.WORKER_URL}?action=confirm-upload`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.sessionToken}`
                },
                body: JSON.stringify({
                    key: effectiveKey,
                    contentHash,
                    fileSize: file.size,
                    width: fileData.width,
                    height: fileData.height
                })
            });

            // 保存元数据：每张图片使用各自的标题
            const metadataTitle = fileTitle || fallbackTitle;
            if (metadataTitle || normalizedTags.length > 0) {
                try {
                    await GalleryService.updateMetadata(
                        effectiveKey,
                        metadataTitle,
                        normalizedTags,
                        this.sessionToken
                    );
                } catch (e) {
                    console.warn('保存元数据失败:', e);
                    throw new Error(`图片已上传，但标题/标签保存失败: ${e.message || '未知错误'}`);
                }
            }

            return 'uploaded';
        },

        uploadToS3(url, headers, file, fileIndex, perFileWeight) {
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();

                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        // 全局进度 = 已完成文件权重 + 当前文件 XHR 进度在本文件权重内的占比
                        const fileBaseProgress = fileIndex * perFileWeight;
                        const fileXhrProgress = (e.loaded / e.total) * perFileWeight;
                        this.uploadProgress = Math.min(Math.round(fileBaseProgress + fileXhrProgress), 99);
                    }
                });

                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve();
                    } else {
                        reject(new Error(`上传失败: ${xhr.status} ${xhr.responseText}`));
                    }
                });

                xhr.addEventListener('error', () => reject(new Error('网络错误')));
                xhr.addEventListener('abort', () => reject(new Error('上传已取消')));

                xhr.open('PUT', url, true);

                // 过滤浏览器禁止手动设置的 header
                const UNSAFE_HEADERS = ['content-length', 'host'];
                for (const [key, value] of Object.entries(headers)) {
                    if (!UNSAFE_HEADERS.includes(key.toLowerCase())) {
                        xhr.setRequestHeader(key, value);
                    }
                }

                xhr.send(file);
            });
        },

        // ============================================
        // 编辑功能
        // ============================================

        openEditModal(image) {
            if (!this.ensureSession('admin')) {
                this.showToast('仅管理员可编辑图片', 'error');
                this.openAuthModal('login', '请使用管理员账号登录');
                return;
            }

            this.editingImage = image;
            this.editTitle = image.title || '';
            this.editTags = image.tags ? [...image.tags] : [];
            this.newEditTag = '';

            // 确定当前分类
            const pathParts = image.key.split('/');
            if (pathParts.length >= 2) {
                const folderName = pathParts[pathParts.length - 2];
                const cat = UPLOAD_CATEGORIES.find(c => c.prefix.replace('/', '') === folderName);
                this.editCategory = cat ? cat.key : UPLOAD_CATEGORIES[0].key;
            } else {
                this.editCategory = UPLOAD_CATEGORIES[0].key;
            }

            this.showEditModal = true;
        },

        addEditTag() {
            const tag = this.newEditTag.trim();
            if (tag && !this.editTags.includes(tag)) {
                this.editTags.push(tag);
            }
            this.newEditTag = '';
        },

        removeEditTag(index) {
            this.editTags.splice(index, 1);
        },

        async saveEdit() {
            if (!this.editingImage) return;

            this.savingEdit = true;

            try {
                // 更新元数据
                if (!this.ensureSession('admin')) {
                    throw new Error('仅管理员可编辑图片');
                }

                await GalleryService.updateMetadata(
                    this.editingImage.key,
                    this.editTitle,
                    this.editTags,
                    this.sessionToken,
                    Number.isFinite(this.editingImage.version) ? this.editingImage.version : null
                );

                // 如果需要移动分类
                const currentCat = UPLOAD_CATEGORIES.find(c => c.key === this.editCategory);
                const currentPrefix = currentCat ? currentCat.prefix : '';

                const oldKey = this.editingImage.key;
                const filename = oldKey.split('/').pop();
                const newKey = `${CONFIG.IMAGE_BASE_PREFIX}${currentPrefix}${filename}`;

                if (oldKey !== newKey) {
                    await GalleryService.moveImage(oldKey, newKey, this.sessionToken);
                    this.showToast('图片已移动到 ' + currentCat.name, 'success');
                } else {
                    this.showToast('保存成功！', 'success');
                }

                this.showEditModal = false;
                await this.loadImages(true);

            } catch (error) {
                console.error('保存失败:', error);
                if (error?.code === 409) {
                    this.showToast('保存冲突：图片元数据已被其他会话修改，已为你刷新列表', 'error');
                    this.showEditModal = false;
                    await this.loadImages(true);
                } else if (error?.code === 401) {
                    this.clearSession();
                    this.openAuthModal('login', '登录已失效，请重新登录');
                    this.showToast('登录已失效，请重新登录', 'error');
                } else if (error?.code === 403) {
                    this.openAuthModal('login', '无管理员权限，请切换账号');
                    this.showToast('无管理员权限，无法编辑图片', 'error');
                } else if (error?.code === 404) {
                    this.showToast('图片不存在或已被删除，已为你刷新列表', 'error');
                    this.showEditModal = false;
                    await this.loadImages(true);
                } else if (error?.code === 429) {
                    this.showToast('操作过于频繁，请稍后重试', 'error');
                } else {
                    this.showToast('保存失败: ' + error.message, 'error');
                }
            } finally {
                this.savingEdit = false;
            }
        },

        // ============================================
        // 删除功能
        // ============================================

        async confirmDelete(image) {
            if (!this.ensureSession('admin')) {
                this.showToast('仅管理员可删除图片', 'error');
                this.openAuthModal('login', '请使用管理员账号登录');
                return;
            }

            const confirmed = await ConfirmModal.show({
                title: '删除确认',
                message: `确定要删除 "${image.title || image.name}" 吗？此操作不可恢复。`,
                confirmText: '删除',
                cancelText: '取消',
                type: 'danger'
            });
            if (confirmed) {
                this.deleteImage(image);
            }
        },

        async deleteImage(image) {
            try {
                if (!this.ensureSession('admin')) {
                    throw new Error('仅管理员可删除图片');
                }
                await GalleryService.deleteImage(image.key, this.sessionToken);
                this.showToast('图片已删除', 'success');
                await this.loadImages(true);
            } catch (error) {
                console.error('删除失败:', error);
                if (error?.code === 401) {
                    this.clearSession();
                    this.openAuthModal('login', '登录已失效，请重新登录');
                    this.showToast('登录已失效，请重新登录', 'error');
                } else if (error?.code === 403) {
                    this.openAuthModal('login', '无管理员权限，请切换账号');
                    this.showToast('无管理员权限，无法删除图片', 'error');
                } else if (error?.code === 404) {
                    this.showToast('图片不存在或已被删除，正在刷新列表', 'error');
                    await this.loadImages(true);
                } else if (error?.code === 429) {
                    this.showToast('请求过于频繁，请稍后再试', 'error');
                } else {
                    this.showToast('删除失败: ' + error.message, 'error');
                }
            }
        },

        // ============================================
        // Fancybox
        // ============================================

        initFancybox() {
            if (typeof Fancybox !== 'undefined') {
                Fancybox.unbind('[data-fancybox="gallery"]');
                Fancybox.bind('[data-fancybox="gallery"]', {
                    Thumbs: { type: 'classic' },
                    Toolbar: {
                        display: {
                            left: ['infobar'],
                            middle: [],
                            right: ['slideshow', 'thumbs', 'close'],
                        },
                    },
                });
            }
        },

        initLazyLoader() {
            const lazyImages = this.$el ? this.$el.querySelectorAll('img[data-src]') : [];
            if (!lazyImages.length) return;

            if (!('IntersectionObserver' in window)) {
                this.promoteAllLazyImages(lazyImages);
                return;
            }

            if (this.imageObserver) {
                this.imageObserver.disconnect();
            }

            this.imageObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    this.promoteLazyImage(entry.target);
                    observer.unobserve(entry.target);
                });
            }, {
                root: null,
                rootMargin: '400px 0px',
                threshold: 0.01
            });

            lazyImages.forEach((img) => this.imageObserver.observe(img));
        },

        promoteAllLazyImages(lazyImages) {
            lazyImages.forEach((img) => this.promoteLazyImage(img));
        },

        promoteLazyImage(img) {
            if (!img || img.dataset.loaded === 'true') return;
            const realSrc = img.dataset.src;
            if (!realSrc) return;
            // 设置标记：下一个 load 事件才是真实缩略图加载完成
            // 避免 placeholderUrl（极小图）加载完后就提前清除模糊效果
            img.dataset.readyForLoaded = 'true';
            img.src = realSrc;
        },

        onLazyImageLoad(event) {
            const img = event.target;
            if (!img || !img.dataset) return;
            // 只有在 promoteLazyImage 设置了真实缩略图 src 后（标记存在），才移除模糊效果
            // 占位图（placeholderUrl）加载完时标记还不存在，因此不会误触发
            if (img.dataset.readyForLoaded === 'true') {
                img.dataset.loaded = 'true';
                img.classList.add('is-loaded');
            }
        },

        // ============================================
        // 复制功能
        // ============================================

        async copyMarkdown(image) {
            const alt = image.title || image.name;
            const markdown = `![${alt}](${image.url})`;
            await this.copyToClipboard(markdown);
            this.showToast('Markdown 已复制！', 'success');
        },

        async copyUrl(image) {
            await this.copyToClipboard(image.url);
            this.showToast('链接已复制！', 'success');
        },

        async copyToClipboard(text) {
            try {
                await navigator.clipboard.writeText(text);
            } catch (err) {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
        },

        onTouchStart(e, image) {
            clearTimeout(this.longPressTimer);
            // 记录按下时的初始坐标，用于判断是滚动还是长按
            const touch = e.touches[0];
            this.touchStartPos = { x: touch.clientX, y: touch.clientY };

            this.longPressTimer = setTimeout(() => {
                this.activeOverlayKey = image.key;
                const el = e.currentTarget;
                if (el) el.classList.add('overlay-active');
            }, 550); // 阈值从 300ms 提高到 550ms，避免误触
        },

        onTouchMove(e) {
            // 如果手指移动超过 8px，则判定为滚动，取消长按定时器
            const touch = e.touches[0];
            const dx = Math.abs(touch.clientX - this.touchStartPos.x);
            const dy = Math.abs(touch.clientY - this.touchStartPos.y);
            if (dx > 8 || dy > 8) {
                clearTimeout(this.longPressTimer);
            }
        },

        onTouchEnd(image) {
            clearTimeout(this.longPressTimer);
            setTimeout(() => {
                const el = document.querySelector(`.masonry-item.overlay-active`);
                if (el) el.classList.remove('overlay-active');
                this.activeOverlayKey = null;
            }, 2000);
        },

        handleResize() {
            this.isMobileViewport = window.innerWidth <= 768;
            // 更新瀑布流列数，与 CSS 媒体查询断点保持一致
            const w = window.innerWidth;
            if (w <= 900) {
                this.masonryColumnCount = 2;
            } else if (w <= 1200) {
                this.masonryColumnCount = 3;
            } else {
                this.masonryColumnCount = 4;
            }
        },

        initResizeListener() {
            this.handleResize();
            window.addEventListener('resize', this.handleResize);
            this.initScrollListener();
        },

        initScrollListener() {
            window.addEventListener('scroll', this.handleScroll, { passive: true });
        },

        handleScroll() {
            const currentScrollY = window.scrollY;
            const scrollDiff = currentScrollY - this.lastScrollY;
            const threshold = 10;

            if (scrollDiff > threshold && currentScrollY > 100) {
                this.isCategoryHidden = true;
            } else if (scrollDiff < -threshold) {
                this.isCategoryHidden = false;
            }

            this.lastScrollY = currentScrollY;
        },

        // ============================================
        // 管理员控制中心
        // ============================================

        async openAdminPanel() {
            if (!this.ensureSession("admin")) {
                this.showToast("仅管理员可访问控制中心", "error");
                return;
            }
            this.showAdminPanel = true;
            this.adminPanelTab = "users";
            await this.loadAdminData();
        },

        async loadAdminData() {
            this.adminLoading = true;
            try {
                const token = this.getReadableSessionToken();
                const [users, invites] = await Promise.all([
                    GalleryService.adminListUsers(token),
                    GalleryService.adminListInvites(token)
                ]);
                this.adminUsers = users;
                this.adminInvites = invites;
            } catch (error) {
                console.error("加载管理数据失败:", error);
                this.showToast("加载管理数据失败: " + error.message, "error");
            } finally {
                this.adminLoading = false;
            }
        },

        async adminToggleRole(user) {
            const newRole = user.role === "admin" ? "user" : "admin";
            const label = newRole === "admin" ? "管理员" : "普通用户";
            const confirmed = await ConfirmModal.show({
                title: '角色变更',
                message: `确定将 ${user.email} 的角色改为「${label}」吗？`,
                confirmText: '确定',
                cancelText: '取消',
                type: 'warning'
            });
            if (!confirmed) return;
            try {
                const token = this.getReadableSessionToken();
                await GalleryService.adminUpdateUser(token, user.id, { role: newRole });
                this.showToast(`已将 ${user.email} 设为${label}`, "success");
                await this.loadAdminData();
            } catch (error) {
                this.showToast("操作失败: " + error.message, "error");
            }
        },

        async adminToggleStatus(user) {
            const newStatus = user.status === "active" ? "disabled" : "active";
            const label = newStatus === "active" ? "启用" : "禁用";
            const confirmed = await ConfirmModal.show({
                title: '用户状态变更',
                message: `确定${label}用户 ${user.email} 吗？`,
                confirmText: '确定',
                cancelText: '取消',
                type: 'warning'
            });
            if (!confirmed) return;
            try {
                const token = this.getReadableSessionToken();
                await GalleryService.adminUpdateUser(token, user.id, { status: newStatus });
                this.showToast(`已${label}用户 ${user.email}`, "success");
                await this.loadAdminData();
            } catch (error) {
                this.showToast("操作失败: " + error.message, "error");
            }
        },

        async adminCreateInvite() {
            try {
                const token = this.getReadableSessionToken();
                const result = await GalleryService.adminCreateInvite(token, this.newInviteMaxUses, this.newInviteCustomCode);
                this.newInviteCustomCode = '';
                this.showToast(`邀请码 ${result.code} 已生成`, "success");
                await this.loadAdminData();
            } catch (error) {
                this.showToast("生成邀请码失败: " + error.message, "error");
            }
        },

        async adminToggleInvite(invite) {
            const newStatus = invite.status === "active" ? "disabled" : "active";
            const label = newStatus === "active" ? "启用" : "禁用";
            try {
                const token = this.getReadableSessionToken();
                await GalleryService.adminUpdateInvite(token, invite.code, { status: newStatus });
                this.showToast(`邀请码 ${invite.code} 已${label}`, "success");
                await this.loadAdminData();
            } catch (error) {
                this.showToast("操作失败: " + error.message, "error");
            }
        },

        async copyInviteCode(code) {
            await this.copyToClipboard(code);
            this.showToast("邀请码已复制: " + code, "success");
        },

        // ============================================
        // Toast 提示
        // ============================================

        showToast(message, type = 'success') {
            if (window.Toast && typeof window.Toast.show === 'function') {
                window.Toast.show(message, type);
            } else {
                console.log(`[Toast ${type}] ${message}`);
            }
        }
    }
});
