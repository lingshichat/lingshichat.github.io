/**
 * 泠诗的存图站 - Gallery 主逻辑
 * Vue 2.x 应用
 */

// ============================================
// 配置区
// ============================================
const CONFIG = {
    WORKER_URL: 'https://gallery-presign.lingshichat.workers.dev',
    S3_PUBLIC_URL: 'https://lingshichat.s3.bitiful.net',
    S3_BUCKET: 'lingshichat',
    S3_REGION: 'cn-east-1',
    IMAGE_BASE_PREFIX: 'img/gallery/',
    THUMBNAIL_PARAMS: '?w=400&h=400&fit=cover&q=80&f=webp',
    STORAGE_KEY: 'gallery_password',
    ADMIN_KEY: 'gallery_admin_token',
    OPEN_MODE: true
};

const CATEGORIES = [
    { key: 'all', name: '全部', icon: 'fa-solid fa-images', prefix: '' },
    { key: 'anime', name: '二次元', icon: 'fa-solid fa-wand-magic-sparkles', prefix: '二次元/' },
    { key: 'landscape', name: '风景', icon: 'fa-solid fa-mountain-sun', prefix: '风景/' },
    { key: 'beauty', name: '美图', icon: 'fa-solid fa-palette', prefix: '美图/' },
    { key: 'portrait', name: '人像', icon: 'fa-solid fa-user', prefix: '人像/' }
];

const UPLOAD_CATEGORIES = CATEGORIES.filter(c => c.key !== 'all');

// ============================================
// 图片列表服务
// ============================================
const GalleryService = {
    async listImages(prefix = '') {
        const fullPrefix = prefix ? `${CONFIG.IMAGE_BASE_PREFIX}${prefix}` : CONFIG.IMAGE_BASE_PREFIX;
        const url = `${CONFIG.WORKER_URL}?action=list&prefix=${encodeURIComponent(fullPrefix)}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.code !== 200) {
            throw new Error(data.message || '获取图片列表失败');
        }
        
        return data.images;
    },

    async updateMetadata(key, title, tags, adminToken) {
        const response = await fetch(`${CONFIG.WORKER_URL}?action=updateMeta`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ key, title, tags })
        });
        
        const data = await response.json();
        if (data.code !== 200) {
            throw new Error(data.message || '更新元数据失败');
        }
        return data.metadata;
    },

    async moveImage(oldKey, newKey, adminToken) {
        const response = await fetch(`${CONFIG.WORKER_URL}?action=moveImage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ oldKey, newKey })
        });
        
        const data = await response.json();
        if (data.code !== 200) {
            throw new Error(data.message || '移动图片失败');
        }
        return data;
    },

    async deleteImage(key, adminToken) {
        const response = await fetch(`${CONFIG.WORKER_URL}?action=deleteImage&key=${encodeURIComponent(key)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        
        const data = await response.json();
        if (data.code !== 200) {
            throw new Error(data.message || '删除图片失败');
        }
        return data;
    },

    async verifyAdmin(password) {
        // 简单验证：尝试调用一个需要权限的接口
        try {
            const response = await fetch(`${CONFIG.WORKER_URL}?action=getMeta`, {
                headers: {
                    'Authorization': `Bearer ${password}`
                }
            });
            return response.ok;
        } catch {
            return false;
        }
    }
};

// ============================================
// Vue 应用
// ============================================
new Vue({
    el: '#app',
    data: {
        isUnlocked: false,
        password: '',
        rememberMe: true,
        loading: false,
        errorMsg: '',
        
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
        
        // 管理功能
        isAdminMode: false,
        showAdminLogin: false,
        adminPassword: '',
        adminError: '',
        adminToken: localStorage.getItem(CONFIG.ADMIN_KEY) || '',
        
        // 编辑功能
        showEditModal: false,
        editingImage: null,
        editTitle: '',
        editTags: [],
        newEditTag: '',
        editCategory: '',
        savingEdit: false,
        
        toast: {
            show: false,
            message: '',
            type: 'success'
        }
    },
    
    mounted() {
        this.checkSavedPassword();
        this.$nextTick(() => {
            this.initFancybox();
        });
        document.addEventListener('paste', this.handlePaste);
    },
    
    beforeDestroy() {
        document.removeEventListener('paste', this.handlePaste);
    },
    
    watch: {
        images() {
            this.$nextTick(() => {
                this.initFancybox();
            });
        }
    },
    
    methods: {
        // ============================================
        // 认证相关
        // ============================================
        
        checkSavedPassword() {
            if (CONFIG.OPEN_MODE) {
                this.isUnlocked = true;
                this.loadAllCategories();
                return;
            }
            
            const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (saved) {
                this.password = saved;
                this.unlock();
            }
        },
        
        unlock() {
            if (!this.password.trim()) {
                this.errorMsg = '请输入访问密钥';
                return;
            }
            
            this.loading = true;
            this.errorMsg = '';
            
            if (this.rememberMe) {
                localStorage.setItem(CONFIG.STORAGE_KEY, this.password);
            }
            
            this.verifyPassword()
                .then(valid => {
                    if (valid) {
                        this.isUnlocked = true;
                        this.loadAllCategories();
                    } else {
                        this.errorMsg = '密钥错误，请重试';
                        localStorage.removeItem(CONFIG.STORAGE_KEY);
                    }
                })
                .catch(err => {
                    this.errorMsg = '验证失败: ' + err.message;
                })
                .finally(() => {
                    this.loading = false;
                });
        },
        
        async verifyPassword() {
            try {
                const response = await fetch(`${CONFIG.WORKER_URL}?key=test`, {
                    headers: {
                        'Authorization': `Bearer ${this.password}`
                    }
                });
                
                const data = await response.json();
                return data.code !== 401;
            } catch (error) {
                console.error('验证密码时出错:', error);
                return true;
            }
        },
        
        logout() {
            this.isUnlocked = false;
            this.password = '';
            this.images = [];
            this.allImages = {};
            this.isAdminMode = false;
            this.adminToken = '';
            localStorage.removeItem(CONFIG.STORAGE_KEY);
            localStorage.removeItem(CONFIG.ADMIN_KEY);
        },
        
        // ============================================
        // 管理模式
        // ============================================
        
        toggleAdminMode() {
            if (this.isAdminMode) {
                // 退出管理
                this.isAdminMode = false;
                this.showToast('已退出管理模式', 'success');
            } else {
                // 进入管理 - 检查是否有 token
                if (this.adminToken) {
                    this.isAdminMode = true;
                    this.showToast('已进入管理模式', 'success');
                } else {
                    this.showAdminLogin = true;
                    this.adminPassword = '';
                    this.adminError = '';
                }
            }
        },
        
        async loginAdmin() {
            if (!this.adminPassword) return;
            
            const isValid = await GalleryService.verifyAdmin(this.adminPassword);
            
            if (isValid) {
                this.adminToken = this.adminPassword;
                localStorage.setItem(CONFIG.ADMIN_KEY, this.adminToken);
                this.isAdminMode = true;
                this.showAdminLogin = false;
                this.showToast('管理员验证成功', 'success');
            } else {
                this.adminError = '密码错误';
            }
        },
        
        // ============================================
        // 分类相关
        // ============================================
        
        async loadAllCategories() {
            this.loading = true;
            
            try {
                const allImages = await GalleryService.listImages('');
                this.allImages['all'] = allImages;
                this.images = allImages;
                this.$set(this.categoryCounts, 'all', allImages.length);
                
                this.loadCategoryCounts();
                
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
                    const images = await GalleryService.listImages(cat.prefix);
                    this.allImages[cat.key] = images;
                    this.$set(this.categoryCounts, cat.key, images.length);
                } catch (e) {
                    console.warn(`加载分类 ${cat.name} 失败:`, e);
                }
            }
        },
        
        async selectCategory(categoryKey) {
            if (this.currentCategory === categoryKey) return;
            
            this.currentCategory = categoryKey;
            this.loading = true;
            
            try {
                if (this.allImages[categoryKey]) {
                    this.images = this.allImages[categoryKey];
                } else {
                    const cat = CATEGORIES.find(c => c.key === categoryKey);
                    const images = await GalleryService.listImages(cat.prefix);
                    this.allImages[categoryKey] = images;
                    this.images = images;
                }
            } catch (error) {
                console.error('加载分类图片失败:', error);
                this.showToast('加载失败: ' + error.message, 'error');
            } finally {
                this.loading = false;
            }
        },
        
        async loadImages() {
            this.allImages = {};
            await this.loadAllCategories();
        },
        
        // ============================================
        // 上传相关
        // ============================================
        
        triggerFileInput() {
            this.$refs.fileInput.click();
        },
        
        handleFileSelect(event) {
            const files = Array.from(event.target.files);
            this.addFiles(files);
            event.target.value = '';
        },
        
        handleDrop(event) {
            this.isDragging = false;
            const files = Array.from(event.dataTransfer.files);
            this.addFiles(files);
        },
        
        handleModalDrop(event) {
            const files = Array.from(event.dataTransfer.files).filter(f => f.type.startsWith('image/'));
            this.addFiles(files);
        },
        
        handlePaste(event) {
            if (!this.isUnlocked) return;
            
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
                    await this.uploadFile(file, categoryPrefix);
                    successCount++;
                } catch (error) {
                    console.error('上传失败:', error);
                    this.showToast(`上传 ${file.name} 失败: ${error.message}`, 'error');
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
        
        async uploadFile(file, categoryPrefix) {
            const timestamp = Date.now();
            const randomStr = Math.random().toString(36).substring(2, 8);
            const ext = file.name.split('.').pop() || 'jpg';
            const filename = `${timestamp}_${randomStr}.${ext}`;
            const key = `${CONFIG.IMAGE_BASE_PREFIX}${categoryPrefix}${filename}`;
            
            // 获取上传签名
            const signResponse = await fetch(`${CONFIG.WORKER_URL}?action=sign&key=${encodeURIComponent(key)}&type=${encodeURIComponent(file.type)}`);
            const signData = await signResponse.json();
            
            if (signData.code !== 200) {
                throw new Error(signData.message || '获取签名失败');
            }
            
            // 上传到 S3
            await this.uploadToS3(signData.url, signData.headers, file);
            
            // 保存元数据（如果有标题或标签）
            if (this.uploadTitle || this.uploadTags.length > 0) {
                try {
                    // 使用第一个文件的标题和标签给所有文件（简化处理）
                    // 实际应该为每个文件单独设置
                    await GalleryService.updateMetadata(
                        key, 
                        this.uploadTitle || file.name,
                        this.uploadTags,
                        this.adminToken || 'anonymous'
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
                await GalleryService.updateMetadata(
                    this.editingImage.key,
                    this.editTitle,
                    this.editTags,
                    this.adminToken
                );
                
                // 如果需要移动分类
                const currentCat = UPLOAD_CATEGORIES.find(c => c.key === this.editCategory);
                const currentPrefix = currentCat ? currentCat.prefix : '';
                
                const oldKey = this.editingImage.key;
                const filename = oldKey.split('/').pop();
                const newKey = `${CONFIG.IMAGE_BASE_PREFIX}${currentPrefix}${filename}`;
                
                if (oldKey !== newKey) {
                    await GalleryService.moveImage(oldKey, newKey, this.adminToken);
                    this.showToast('图片已移动到 ' + currentCat.name, 'success');
                } else {
                    this.showToast('保存成功！', 'success');
                }
                
                this.showEditModal = false;
                await this.loadImages();
                
            } catch (error) {
                console.error('保存失败:', error);
                this.showToast('保存失败: ' + error.message, 'error');
            } finally {
                this.savingEdit = false;
            }
        },
        
        // ============================================
        // 删除功能
        // ============================================
        
        confirmDelete(image) {
            if (confirm(`确定要删除 "${image.title || image.name}" 吗？此操作不可恢复。`)) {
                this.deleteImage(image);
            }
        },
        
        async deleteImage(image) {
            try {
                await GalleryService.deleteImage(image.key, this.adminToken);
                this.showToast('图片已删除', 'success');
                await this.loadImages();
            } catch (error) {
                console.error('删除失败:', error);
                this.showToast('删除失败: ' + error.message, 'error');
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
