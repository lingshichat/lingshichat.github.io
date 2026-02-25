/**
 * 泠诗的存图站 - Gallery 主逻辑
 * Vue 2.x 应用
 */

// ============================================
// 配置区
// ============================================
const CONFIG = {
    WORKER_URL: 'https://api-gallery.lingshichat.top',
    S3_PUBLIC_URL: 'https://lingshichat.s3.bitiful.net',
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

    async adminCreateInvite(token, maxUses = 1) {
        const res = await fetch(`${CONFIG.WORKER_URL}?action=adminCreateInvite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ maxUses })
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

        // 认证与权限
        showAuthModal: false,
        authMode: 'login',
        authEmail: '',
        authPassword: '',
        authError: '',
        authSubmitting: false,
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

        toast: {
            show: false,
            message: '',
            type: 'success'
        },

        // 1x1 透明 GIF 占位符，避免浏览器提前加载 placeholderUrl
        lazyPlaceholder: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        imageObserver: null,
        loadMoreObserver: null,
        loadingMore: false,
        paginationByCategory: {}
    },

    async mounted() {
        this.restoreSession();
        await this.syncSessionOnBoot();
        await this.loadImages();
        this.$nextTick(() => {
            this.initFancybox();
        });
        document.addEventListener('paste', this.handlePaste);
        window.addEventListener('storage', this.handleStorageChange);
        this.initLazyLoader();
    },

    beforeDestroy() {
        document.removeEventListener('paste', this.handlePaste);
        window.removeEventListener('storage', this.handleStorageChange);
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
        }
    },

    methods: {
        // ============================================
        // 认证相关
        // ============================================

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

        openAuthModal(mode = 'login', message = '') {
            this.authMode = mode;
            this.authPassword = '';
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
                await this.loadImages();
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
            await this.loadImages();
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
            this.$set(this.categoryCounts, categoryKey, total);
        },

        async fetchCategoryPage(categoryKey, options = {}) {
            const { prefix, owner, token } = this.getCategoryQuery(categoryKey);
            return GalleryService.listImages(prefix, token, owner, options);
        },

        async loadAllCategories() {
            this.loading = true;

            try {
                const allPage = await this.fetchCategoryPage('all', { limit: 60 });
                this.saveCategoryPageState('all', allPage);

                if (this.currentCategory === 'all') {
                    this.images = this.allImages['all'];
                }

                const listToken = this.getReadableSessionToken();
                if (listToken) {
                    const minePage = await this.fetchCategoryPage('mine', { limit: 60 });
                    this.saveCategoryPageState('mine', minePage);
                } else {
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

                await this.loadCategoryCounts();

            } catch (error) {
                console.error('加载图片失败:', error);
                this.showToast('加载图片失败: ' + error.message, 'error');
            } finally {
                this.loading = false;
            }
        },

        async loadCategoryCounts() {
            for (const cat of UPLOAD_CATEGORIES) {
                try {
                    const page = await this.fetchCategoryPage(cat.key, { limit: 1 });
                    const pagination = page?.pagination || {};
                    const total = Number.isFinite(pagination.total)
                        ? pagination.total
                        : (Array.isArray(page?.images) ? page.images.length : 0);
                    this.$set(this.categoryCounts, cat.key, total);
                } catch (e) {
                    console.warn(`加载分类 ${cat.name} 失败:`, e);
                }
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
                this.$set(this.categoryCounts, this.currentCategory, total);
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
                rootMargin: '260px 0px',
                threshold: 0.01
            });

            this.loadMoreObserver.observe(sentinel);
        },

        async loadImages() {
            this.allImages = {};
            this.paginationByCategory = {};
            await this.loadAllCategories();
        },

        // ============================================
        // 上传相关
        // ============================================

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
                this.showUploadModal = true;
            }
        },

        addFiles(files) {
            files.forEach(file => {
                if (!file.type.startsWith('image/')) return;

                const reader = new FileReader();
                reader.onload = (e) => {
                    this.uploadFiles.push({
                        file: file,
                        name: file.name,
                        preview: e.target.result
                    });
                };
                reader.readAsDataURL(file);
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

        async startUpload() {
            if (this.uploadFiles.length === 0) return;
            if (!this.ensureSession()) {
                this.openAuthModal('login', '登录后可上传图片');
                return;
            }

            const uploadFileCount = this.uploadFiles.length;
            this.showUploadModal = false;
            this.uploading = true;
            this.uploadProgress = 0;

            const category = UPLOAD_CATEGORIES.find(c => c.key === this.uploadCategory);
            const categoryPrefix = category ? category.prefix : '';

            let successCount = 0;

            for (let i = 0; i < this.uploadFiles.length; i++) {
                const fileData = this.uploadFiles[i];
                const file = fileData.file;

                this.uploadFileName = file.name;
                this.uploadProgress = Math.round((i / uploadFileCount) * 100);

                try {
                    await this.uploadFile(file, categoryPrefix, i, uploadFileCount);
                    successCount++;
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
                    if (error?.code === 429) {
                        this.showToast(`上传 ${file.name} 失败: 请求过于频繁，请稍后重试`, 'error');
                    } else {
                        this.showToast(`上传 ${file.name} 失败: ${error.message}`, 'error');
                    }
                }
            }

            this.uploading = false;
            this.uploadProgress = 0;
            this.uploadFiles = [];
            this.uploadTitle = '';
            this.uploadTags = [];

            if (successCount > 0) {
                this.showToast(`成功上传 ${successCount} 张图片！`, 'success');
                await this.loadImages();
            }
        },

        async uploadFile(file, categoryPrefix, fileIndex = 0, totalFiles = 1) {
            const timestamp = Date.now();
            const randomStr = Math.random().toString(36).substring(2, 8);
            const ext = file.name.split('.').pop() || 'jpg';
            const filename = `${timestamp}_${randomStr}.${ext}`;
            const key = `${CONFIG.IMAGE_BASE_PREFIX}${categoryPrefix}${filename}`;

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
                    sizeBytes: file.size
                })
            });
            const signData = await signResponse.json();

            if (signData.code !== 200) {
                const signError = new Error(signData.message || '获取签名失败');
                signError.code = signData.code;
                throw signError;
            }

            // 上传到 S3
            await this.uploadToS3(signData.url, signData.headers, file);

            const effectiveKey = signData.key || key;

            // 保存元数据（如果有标题或标签）
            if (this.uploadTitle || this.uploadTags.length > 0) {
                try {
                    const baseTitle = this.uploadTitle ? this.uploadTitle.trim() : '';
                    const metadataTitle = baseTitle
                        ? (totalFiles > 1 ? `${baseTitle} #${fileIndex + 1}` : baseTitle)
                        : file.name;

                    await GalleryService.updateMetadata(
                        effectiveKey,
                        metadataTitle,
                        this.uploadTags,
                        this.sessionToken
                    );
                } catch (e) {
                    console.warn('保存元数据失败:', e);
                }
            }
        },

        uploadToS3(url, headers, file) {
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();

                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const progress = Math.round((e.loaded / e.total) * 70) + 20;
                        this.uploadProgress = Math.min(progress, 90);
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

                xhr.open('PUT', url, true);

                for (const [key, value] of Object.entries(headers)) {
                    xhr.setRequestHeader(key, value);
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
                await this.loadImages();

            } catch (error) {
                console.error('保存失败:', error);
                if (error?.code === 409) {
                    this.showToast('保存冲突：图片元数据已被其他会话修改，已为你刷新列表', 'error');
                    this.showEditModal = false;
                    await this.loadImages();
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
                    await this.loadImages();
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

        confirmDelete(image) {
            if (!this.ensureSession('admin')) {
                this.showToast('仅管理员可删除图片', 'error');
                this.openAuthModal('login', '请使用管理员账号登录');
                return;
            }

            if (confirm(`确定要删除 "${image.title || image.name}" 吗？此操作不可恢复。`)) {
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
                await this.loadImages();
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
                    await this.loadImages();
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
                rootMargin: '200px 0px',
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
            img.src = realSrc;
        },

        onLazyImageLoad(event) {
            const img = event.target;
            if (!img || !img.dataset) return;
            // 只要 src 已被替换为真实缩略图（不再是占位图），即视为加载完成
            if (img.src && !img.src.startsWith("data:")) {
                img.dataset.loaded = "true";
                img.classList.add("is-loaded");
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
            if (!confirm(`确定将 ${user.email} 的角色改为「${label}」吗？`)) return;
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
            if (!confirm(`确定${label}用户 ${user.email} 吗？`)) return;
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
                const result = await GalleryService.adminCreateInvite(token, this.newInviteMaxUses);
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
            this.toast = {
                show: true,
                message,
                type
            };

            setTimeout(() => {
                this.toast.show = false;
            }, 3000);
        }
    }
});
