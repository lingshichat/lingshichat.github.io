import { CONFIG } from './config.js';
import { Auth } from './auth.js';
import { Octokit } from "https://esm.sh/@octokit/rest";
import { Toast } from '../js/toast-module.js';
import { s3Service } from './s3-service.js';


new Vue({
    el: '#app',
    data: {
        isLoggedIn: false,
        password: '',
        token: '',
        rememberMe: false,
        loading: false,
        saving: false,
        errorMsg: '',

        // Editor State
        posts: [],
        currentPost: null, // { sha, name, path, content }
        postTitle: '',
        postDate: '',
        postUpdated: '', // New: Updated time
        postTags: [], // Changed to Array
        postCategories: [], // Changed to Array
        tagInput: '', // Temp input for tags
        catInput: '', // Temp input for categories
        easyMDE: null,
        sidebarOpen: window.innerWidth > 768,
        editMode: false,
        saveStatus: '',
        splitMode: false,
        fullscreenMode: false,
        compiledMarkdown: '',

        // Recycle Bin State
        trashPosts: [],

        viewMode: 'posts', // 'posts' | 'trash'

        // Modal State
        modal: {
            show: false,
            type: 'info', // 'info' | 'confirm'
            title: '',
            message: '',
            resolve: null
        },

        // 🖼️ 图床状态
        imageGallery: {
            show: false,
            images: [],
            selectedImage: null,
            loading: false,
            uploading: false,
            uploadProgress: 0,
            isDragging: false
        }
    },
    async mounted() {
        // ESC listener for fullscreen
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.fullscreenMode) {
                this.toggleFullscreen();
            }
        });

        if (window.innerWidth < 768) {
            this.sidebarOpen = false;
        }

        // Check Shared Session (from Admin) first
        try {
            const session = JSON.parse(localStorage.getItem('auth_session'));
            if (session && session.github && session.expires > Date.now()) {
                this.token = session.github;
                this.isLoggedIn = true;
                this.initData();
                return;
            }
        } catch (e) {
            console.warn('Failed to parse auth_session', e);
        }

        // Fallback to legacy check
        const cachedToken = localStorage.getItem('blog_editor_token');
        if (cachedToken) {
            this.token = cachedToken;
            this.isLoggedIn = true;
            this.initData();
        }
    },
    methods: {
        // --- Modal System ---
        showLoading(title, message) {
            this.modal = {
                show: true,
                type: 'loading',
                title: title,
                message: message,
                resolve: null
            };
        },

        showConfirm(title, message) {
            return new Promise((resolve) => {
                this.modal = {
                    show: true,
                    type: 'confirm',
                    title: title,
                    message: message,
                    resolve: resolve
                };
            });
        },

        showAlert(message) {
            this.modal = {
                show: true,
                type: 'info',
                title: '提示',
                message: message,
                resolve: null
            };
        },

        closeModal(result) {
            this.modal.show = false;
            // 短暂延迟清理，避免快速切换样式闪烁
            setTimeout(() => {
                if (this.modal.resolve) {
                    this.modal.resolve(result);
                    this.modal.resolve = null;
                }
            }, 100);
        },

        async login() {
            if (!this.password && !CONFIG.GITHUB_TOKEN) {
                this.errorMsg = '尚未配置加密 Token，请查看教程';
                return;
            }

            this.loading = true;
            this.errorMsg = '';

            const decryptedToken = Auth.decryptToken(this.password);

            if (!decryptedToken) {
                this.errorMsg = '密码错误，无法解密';
                this.loading = false;
                return;
            }

            try {
                const octokit = new Octokit({ auth: decryptedToken });
                await octokit.rest.users.getAuthenticated();

                this.token = decryptedToken;

                if (this.rememberMe) {
                    localStorage.setItem('blog_editor_token', this.token);
                    // Also save to shared session (GitHub only)
                    localStorage.setItem('auth_session', JSON.stringify({
                        github: this.token,
                        expires: Date.now() + 24 * 60 * 60 * 1000
                    }));
                }

                // 添加淡出动画
                const loginContainer = document.querySelector('.login-container');
                if (loginContainer) {
                    loginContainer.classList.add('fade-out');
                }

                // 延迟切换到编辑器界面，等待淡出动画完成
                setTimeout(() => {
                    this.isLoggedIn = true;
                    this.initData();
                }, 600); // 与 CSS 动画时长匹配

            } catch (e) {
                console.error("Login verification failed", e);
                const status = e.status;
                if (status === 401) {
                    this.errorMsg = '验证失败: 401 Unauthorized (Token 无效)';
                } else if (status === 403) {
                    this.errorMsg = '验证失败: 403 Forbidden (API 限制)';
                } else if (!navigator.onLine) {
                    this.errorMsg = '验证失败: 网络未连接';
                } else {
                    this.errorMsg = '验证失败: ' + (e.message || '未知错误');
                }
            } finally {
                this.loading = false;
            }
        },

        logout() {
            localStorage.removeItem('blog_editor_token');
            localStorage.removeItem('auth_session'); // Clear shared session
            this.token = '';
            this.isLoggedIn = false;
            this.password = '';
            window.location.reload();
        },

        initData() {
            this.$nextTick(() => {
                this.initEasyMDE();
                this.initFlatpickr();
                this.fetchPosts();
                this.fetchTrashPosts(); // Load trash on init
            });
        },

        initFlatpickr() {
            // Destroy existing instance if any
            const existing = document.querySelector("#date-picker")?._flatpickr;
            if (existing) existing.destroy();

            flatpickr("#date-picker", {
                enableTime: true,
                dateFormat: "Y-m-d H:i",
                time_24hr: true,
                disableMobile: true,
                // static: true removed to avoid clipping
                onChange: (selectedDates, dateStr) => {
                    this.postDate = dateStr;
                }
            });
        },

        initEasyMDE() {
            const editorElem = document.getElementById('markdown-editor');
            if (!editorElem) {
                console.error("Markdown Editor element not found via ID. Init aborted.");
                return;
            }

            // prevent duplicate initialization
            if (this.easyMDE) {
                try {
                    this.easyMDE.toTextArea();
                } catch (e) {
                    console.warn("Retrying EasyMDE cleanup...", e);
                }
                this.easyMDE = null;
            }

            this.easyMDE = new EasyMDE({
                element: editorElem,
                spellChecker: false,
                autosave: {
                    enabled: true,
                    uniqueId: "blog_draft",
                    delay: 1000,
                },
                toolbar: [
                    "bold", "italic", "heading", "quote", "unordered-list", "ordered-list",
                    "link", "image", "table",
                    // 图床按钮
                    {
                        name: "image-gallery",
                        action: () => {
                            this.openImageGallery();
                        },
                        className: "fa fa-images no-disable",
                        title: "图床",
                    },
                    "|",
                    // Custom Split Button
                    {
                        name: "side-by-side",
                        action: () => {
                            this.toggleSplitMode();
                        },
                        className: "fa fa-columns no-disable",
                        title: "双栏预览",
                    },
                    {
                        name: "zen-mode",
                        action: () => {
                            this.toggleFullscreen();
                        },
                        className: "fa fa-expand no-disable",
                        title: "沉浸模式 (ESC 退出)",
                    }
                ],
                status: ["lines", "words"],
                previewRender: (plainText) => {
                    return this.renderHexoContent(plainText);
                }
            });

            // Bind change event for real-time preview
            this.easyMDE.codemirror.on("change", () => {
                if (this.splitMode) {
                    this.updateSplitPreview();
                }
            });
        },

        toggleSidebar() {
            this.sidebarOpen = !this.sidebarOpen;
        },

        toggleSplitMode() {
            this.splitMode = !this.splitMode;
            if (this.splitMode) {
                // Auto close sidebar for more space
                this.sidebarOpen = false;
                this.updateSplitPreview();
            }
            // Trigger layout refresh for CodeMirror
            this.$nextTick(() => {
                this.easyMDE.codemirror.refresh();
            });
        },

        updateSplitPreview() {
            const raw = this.easyMDE.value();
            this.compiledMarkdown = this.renderHexoContent(raw);
        },

        toggleFullscreen() {
            this.fullscreenMode = !this.fullscreenMode;
        },

        enableEditMode() {
            this.editMode = true;
            this.$nextTick(() => {
                this.easyMDE.codemirror.refresh();
            });
        },

        async cancelEdit() {
            if (await this.showConfirm("确认放弃", "确定放弃未保存的修改吗？")) {
                this.editMode = false;
                if (this.currentPost) {
                    this.loadPost(this.currentPost);
                }
            }
        },

        // --- Tag / Category Logic ---
        addTag() {
            const val = this.tagInput.trim();
            if (val && !this.postTags.includes(val)) {
                this.postTags.push(val);
            }
            this.tagInput = '';
        },
        removeTag(index) {
            this.postTags.splice(index, 1);
        },
        addCategory() {
            const val = this.catInput.trim();
            if (val && !this.postCategories.includes(val)) {
                this.postCategories.push(val);
            }
            this.catInput = '';
        },
        removeCategory(index) {
            this.postCategories.splice(index, 1);
        },

        // --- Rendering ---
        renderHexoContent(content) {
            // 1. Strip Front Matter
            const fmRegex = /^---\n[\s\S]*?\n---\n/;
            const bodyContent = content.replace(fmRegex, '');

            // 2. Basic Markdown Render
            let html = this.easyMDE.markdown(bodyContent);

            // 3. Hexo Tag Support
            // Regex to capture content inside {% meting ... %}
            html = html.replace(/{% meting\s+([\s\S]+?)\s*%}/g, (match, argsContent) => {
                // Split by spaces
                // We use a regex to match quoted strings OR non-whitespace sequences
                // helping to keep "key:value" together if they don't have spaces
                // But simple split by space is usually enough for Hexo args
                const rawParts = argsContent.trim().split(/\s+/);

                // Clean quotes from start/end of each part
                const args = rawParts.map(arg => arg.replace(/^['"]|['"]$/g, ''));

                let id = args[0] || '';
                let server = args[1] || 'netease';
                let type = args[2] || 'playlist';

                let extraAttrs = '';

                // Process remaining args (index 3+) for options like "mutex:true"
                for (let i = 3; i < args.length; i++) {
                    let arg = args[i];
                    if (arg.indexOf(':') > -1) {
                        let [key, val] = arg.split(':');
                        extraAttrs += ` ${key}="${val}"`;
                    }
                }

                // Set default theme only if not provided
                if (extraAttrs.indexOf('theme=') === -1) {
                    extraAttrs += ' theme="var(--primary-color)"';
                }

                return `<meting-js server="${server}" type="${type}" id="${id}"${extraAttrs}></meting-js>`;
            });

            html = html.replace(/{% btn (.+?) %}/g, '<button class="hexo-btn">$1</button>');

            return html;
        },

        getOctokit() {
            return new Octokit({ auth: this.token });
        },

        async fetchPosts() {
            const octokit = this.getOctokit();
            try {
                const { data } = await octokit.rest.repos.getContent({
                    owner: CONFIG.OWNER,
                    repo: CONFIG.REPO,
                    path: CONFIG.POSTS_PATH,
                });

                this.posts = data.filter(file => file.name.endsWith('.md'))
                    .sort((a, b) => b.name.localeCompare(a.name));

            } catch (e) {
                console.error("Fetch posts failed", e);
                // If 404, maybe path doesn't exist yet, ignore
            }
        },

        async fetchTrashPosts() {
            const octokit = this.getOctokit();
            try {
                const { data } = await octokit.rest.repos.getContent({
                    owner: CONFIG.OWNER,
                    repo: CONFIG.REPO,
                    path: CONFIG.TRASH_PATH,
                });

                this.trashPosts = data.filter(file => file.name.endsWith('.md'))
                    .sort((a, b) => b.name.localeCompare(a.name));
            } catch (e) {
                console.warn("Fetch trash failed (folder might not exist yet)", e);
                this.trashPosts = [];
            }
        },

        toggleViewMode(mode) {
            this.viewMode = mode;
            this.currentPost = null;
            this.editMode = false;
            if (mode === 'trash') this.fetchTrashPosts();
            else this.fetchPosts();
        },

        async loadPost(post) {
            if (window.innerWidth < 768) this.sidebarOpen = false;

            const octokit = this.getOctokit();
            try {
                const { data } = await octokit.rest.repos.getContent({
                    owner: CONFIG.OWNER,
                    repo: CONFIG.REPO,
                    path: post.path,
                });

                const content = decodeURIComponent(escape(atob(data.content)));

                this.parseFrontMatter(content);
                this.currentPost = { ...post, sha: data.sha, path: post.path };

                this.editMode = false;
                document.getElementById('preview-content').innerHTML = this.renderHexoContent(content);

            } catch (e) {
                Toast.show('加载文章失败: ' + e.message, 'error');
            }
        },

        parseFrontMatter(content) {
            const fmRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
            const match = content.match(fmRegex);

            if (match) {
                const yamlStr = match[1];
                const body = match[2];
                // 添加 easyMDE 存在性检查
                if (this.easyMDE) {
                    this.easyMDE.value(body);
                }

                this.postTitle = this.extractYamlValue(yamlStr, 'title');

                // Parse Date (keep pure string or format for datetime-local)
                const rawDate = this.extractYamlValue(yamlStr, 'date');
                this.postDate = this.formatDateForInput(rawDate);

                // Parse Updated
                const rawUpdated = this.extractYamlValue(yamlStr, 'updated');
                this.postUpdated = this.formatDateForInput(rawUpdated);

                // Parse Arrays (Simple)
                // Yaml can be [a, b] or \n - a \n - b
                this.postTags = this.parseYamlArray(yamlStr, 'tags');
                this.postCategories = this.parseYamlArray(yamlStr, 'categories');
            } else {
                // 添加 easyMDE 存在性检查
                if (this.easyMDE) {
                    this.easyMDE.value(content);
                }
                this.postTitle = this.currentPost ? this.currentPost.name.replace('.md', '') : '';
                this.postTags = [];
                this.postCategories = [];
            }
        },

        formatDateForInput(dateStr) {
            if (!dateStr) return '';
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr; // Fallback

            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const hour = String(d.getHours()).padStart(2, '0');
            const minute = String(d.getMinutes()).padStart(2, '0');
            return `${year}-${month}-${day} ${hour}:${minute}`;
        },

        parseYamlArray(yaml, key) {
            // Match: key: [a, b, c] OR key: a
            const regex = new RegExp(`^${key}:\\s*(.*)$`, 'm');
            const match = yaml.match(regex);
            if (!match) return [];

            let val = match[1].trim();
            // Remove brackets
            if (val.startsWith('[') && val.endsWith(']')) {
                val = val.slice(1, -1);
            }
            if (!val) return [];
            return val.split(',').map(s => s.trim()).filter(s => s);
        },

        extractYamlValue(yaml, key) {
            const regex = new RegExp(`^${key}:\\s*(.*)$`, 'm');
            const match = yaml.match(regex);
            // If it's an array format [ ... ], we might want to skip this generic extractor or handle it.
            // This simple extractor is mostly for single lines.
            // For duplications check: verify render logic.
            return match ? match[1].trim() : '';
        },

        newPost() {
            this.currentPost = null;
            this.postTitle = '';
            // Default to current time YYYY-MM-DD HH:mm for Flatpickr compatibility
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hour = String(now.getHours()).padStart(2, '0');
            const minute = String(now.getMinutes()).padStart(2, '0');
            this.postDate = `${year}-${month}-${day} ${hour}:${minute}`;
            this.postUpdated = this.postDate; // Init updated same as date

            this.postTags = [];
            this.postCategories = [];
            // 添加 easyMDE 存在性检查
            if (this.easyMDE) {
                this.easyMDE.value('');
            }

            this.editMode = true;
            if (window.innerWidth < 768) this.sidebarOpen = false;

            this.$nextTick(() => {
                // 添加 easyMDE 存在性检查
                if (this.easyMDE && this.easyMDE.codemirror) {
                    this.easyMDE.codemirror.refresh();
                }
                // 添加 flatpickr 存在性检查
                const datePicker = document.querySelector("#date-picker");
                if (datePicker && datePicker._flatpickr) {
                    datePicker._flatpickr.setDate(this.postDate);
                }
            });
        },

        async savePost() {
            if (!this.postTitle) {
                this.showAlert('请输入标题');
                return;
            }
            this.saving = true;

            // User requirement: Stay with original date, but update "updated" time.
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hour = String(now.getHours()).padStart(2, '0');
            const minute = String(now.getMinutes()).padStart(2, '0');

            // Should we update postDate? NO, keep it from input (this.postDate).
            // But we must set postUpdated to NOW.
            this.postUpdated = `${year}-${month}-${day} ${hour}:${minute}`;

            // Construct Content
            const tagsStr = `[${this.postTags.join(', ')}]`;
            const catsStr = `[${this.postCategories.join(', ')}]`;

            const frontMatter = `---
title: ${this.postTitle}
date: ${this.postDate}:00
updated: ${this.postUpdated}:00
tags: ${tagsStr}
categories: ${catsStr}
---
`;
            const content = frontMatter + this.easyMDE.value();
            const contentBase64 = btoa(unescape(encodeURIComponent(content)));

            const filename = `${this.postTitle}.md`.replace(/\s+/g, '-');
            const path = this.currentPost ? this.currentPost.path : `${CONFIG.POSTS_PATH}/${filename}`;
            const message = this.currentPost ? `Update post ${this.postTitle}` : `Create post ${this.postTitle}`;
            const sha = this.currentPost ? this.currentPost.sha : undefined;

            const octokit = this.getOctokit();
            try {
                const { data } = await octokit.rest.repos.createOrUpdateFileContents({
                    owner: CONFIG.OWNER,
                    repo: CONFIG.REPO,
                    path: path,
                    message: message,
                    content: contentBase64,
                    sha: sha
                });

                this.currentPost = {
                    name: filename,
                    path: data.content.path,
                    sha: data.content.sha
                };

                Toast.show('发布成功! Cloudflare Pages 将自动构建。', 'success');
                this.saveStatus = '已保存';
                setTimeout(() => this.saveStatus = '', 3000);

                this.fetchPosts();

                // Auto-exit edit mode and show reader view
                this.editMode = false;
                // Render content for reader mode
                this.$nextTick(() => {
                    document.getElementById('preview-content').innerHTML = this.renderHexoContent(content);
                });

            } catch (e) {
                console.error(e);
                Toast.show('保存失败: ' + e.message, 'error');
            } finally {
                this.saving = false;
            }
        },

        // --- Recycle Bin Logic ---

        // 1. Move to Trash (Soft Delete)
        async moveToTrash() {
            if (!this.currentPost) {
                this.showAlert('请先选择文章');
                return;
            }

            const postName = this.currentPost.name;
            const postSha = this.currentPost.sha; // Capture SHA

            if (!await this.showConfirm("移至回收站", `确定要将 "${postName.replace('.md', '')}" 移至回收站吗？`)) {
                return;
            }

            this.showLoading("正在移动...", "正在将文章移至回收站，请稍候...");

            const octokit = this.getOctokit();

            try {
                // Step 1: Get current content (we need it to recreate in trash)
                console.log(`Getting content for ${this.currentPost.path}...`);
                const { data: sourceData } = await octokit.rest.repos.getContent({
                    owner: CONFIG.OWNER,
                    repo: CONFIG.REPO,
                    path: this.currentPost.path,
                });

                // Step 2: Create in Trash
                const trashPath = `${CONFIG.TRASH_PATH}/${postName}`;
                console.log(`Creating copy at ${trashPath}...`);

                await octokit.rest.repos.createOrUpdateFileContents({
                    owner: CONFIG.OWNER,
                    repo: CONFIG.REPO,
                    path: trashPath,
                    message: `Move ${postName} to Trash`,
                    content: sourceData.content, // Already base64
                });

                // Step 3: Delete original
                console.log(`Deleting original at ${this.currentPost.path}...`);
                await octokit.rest.repos.deleteFile({
                    owner: CONFIG.OWNER,
                    repo: CONFIG.REPO,
                    path: this.currentPost.path,
                    message: `Move ${postName} to Trash (Source Delete)`,
                    sha: sourceData.sha
                });

                // --- Optimistic Update ---
                this.posts = this.posts.filter(p => p.sha !== postSha);

                // Add to trashPosts manually
                this.trashPosts.unshift({
                    name: postName,
                    path: trashPath,
                    sha: postSha + '_trash_temp',
                    type: 'file'
                });
                // We don't add to trashPosts immediately because we don't have the new SHA
                // But removing from current list is enough for visual feedback
                this.viewMode = 'posts'; // Ensure we stay on posts view or switch? Usually stay.

                Toast.show('已移至回收站', 'success');

                // Clear state
                this.currentPost = null;
                this.editMode = false;

                // REMOVED fetch to avoid race condition

            } catch (e) {
                console.error("Move to trash failed:", e);

                Toast.show('移动失败: ' + e.message, 'error');
            }
        },

        // 2. Restore Post
        async restorePost() {
            if (!this.currentPost) return;

            const postName = this.currentPost.name;
            const postSha = this.currentPost.sha;

            if (!await this.showConfirm("确认还原", `确定要还原 "${postName.replace('.md', '')}" 吗？\n\n注意：还原操作基于 GitHub 仓库的当前状态。如果您刚刚将其移至回收站，可能需要稍候片刻等待远程数据同步。`)) {
                return;
            }

            this.showLoading("正在还原...", "正在从回收站还原文章，请稍候...");

            const octokit = this.getOctokit();

            try {
                // Step 1: Get content from Trash
                const { data: trashData } = await octokit.rest.repos.getContent({
                    owner: CONFIG.OWNER,
                    repo: CONFIG.REPO,
                    path: this.currentPost.path,
                });

                // Step 2: Create in Posts
                const postsPath = `${CONFIG.POSTS_PATH}/${postName}`;
                await octokit.rest.repos.createOrUpdateFileContents({
                    owner: CONFIG.OWNER,
                    repo: CONFIG.REPO,
                    path: postsPath,
                    message: `Restore ${postName}`,
                    content: trashData.content,
                });

                // Step 3: Delete from Trash
                await octokit.rest.repos.deleteFile({
                    owner: CONFIG.OWNER,
                    repo: CONFIG.REPO,
                    path: this.currentPost.path,
                    message: `Restore ${postName} (Cleanup Trash)`,
                    sha: trashData.sha
                });

                // --- Optimistic Update ---
                this.trashPosts = this.trashPosts.filter(p => p.sha !== postSha);

                // Add to posts manually
                this.posts.unshift({
                    name: postName,
                    path: postsPath,
                    sha: postSha + '_restore_temp',
                    type: 'file'
                });

                this.toggleViewMode('posts'); // Auto switch back
                Toast.show('已恢复文章', 'success');

            } catch (e) {
                console.error("Restore failed:", e);

                Toast.show('恢复失败: ' + e.message, 'error');
            }
        },

        // 3. Permanent Delete
        async permanentDelete() {
            if (!this.currentPost) return;

            const postName = this.currentPost.name.replace('.md', '');
            const postSha = this.currentPost.sha;

            if (!await this.showConfirm("彻底删除警告", `⚠️ 确定要彻底销毁 "${postName}" 吗？\n\n此操作将永久删除文件，无法找回！`)) {
                return;
            }

            this.showLoading("正在删除...", "正在彻底删除文件，此操作不可逆...");

            const octokit = this.getOctokit();

            try {
                await octokit.rest.repos.deleteFile({
                    owner: CONFIG.OWNER,
                    repo: CONFIG.REPO,
                    path: this.currentPost.path,
                    message: `Permanent Delete: ${postName}`,
                    sha: this.currentPost.sha
                });

                // --- Optimistic Update ---
                this.trashPosts = this.trashPosts.filter(p => p.sha !== postSha);

                Toast.show('文件已彻底销毁', 'success');
                this.currentPost = null;


            } catch (e) {
                console.error(e);
                Toast.show('删除失败: ' + e.message, 'error');
            }
        },

        formatDate(str) {
            return str ? str.substring(0, 10) : '';
        },

        // 🖼️ 图床功能方法

        // 打开图床模态框
        async openImageGallery() {
            if (!CONFIG.S3_CONFIG.accessKeyId || !CONFIG.S3_CONFIG.secretAccessKey) {
                this.showAlert('S3 图床未配置，请先配置 config.js 中的 S3_CONFIG');
                return;
            }
            
            this.imageGallery.show = true;
            this.imageGallery.selectedImage = null;
            await this.loadGalleryImages();
        },

        // 关闭图床模态框
        closeImageGallery() {
            this.imageGallery.show = false;
            this.imageGallery.selectedImage = null;
            this.imageGallery.isDragging = false;
        },

        // 加载图床图片列表
        async loadGalleryImages() {
            this.imageGallery.loading = true;
            try {
                const images = await s3Service.listImages();
                this.imageGallery.images = images;
            } catch (error) {
                console.error('加载图片列表失败:', error);
                Toast.show('加载图片列表失败: ' + error.message, 'error');
            } finally {
                this.imageGallery.loading = false;
            }
        },

        // 选择图片
        selectImage(image) {
            this.imageGallery.selectedImage = image;
        },

        // 触发文件选择
        triggerFileInput() {
            if (this.imageGallery.uploading) return;
            this.$refs.fileInput.click();
        },

        // 处理文件选择
        async handleFileSelect(event) {
            const files = Array.from(event.target.files);
            if (files.length > 0) {
                await this.uploadFiles(files);
            }
            // 清空 input 以便再次选择相同文件
            event.target.value = '';
        },

        // 处理拖拽文件
        async handleDrop(event) {
            this.imageGallery.isDragging = false;
            const files = Array.from(event.dataTransfer.files).filter(file =>
                file.type.startsWith('image/')
            );
            if (files.length > 0) {
                await this.uploadFiles(files);
            }
        },

        // 上传文件
        async uploadFiles(files) {
            if (this.imageGallery.uploading) return;
            
            this.imageGallery.uploading = true;
            this.imageGallery.uploadProgress = 0;
            
            try {
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    
                    // 检查文件类型
                    if (!file.type.startsWith('image/')) {
                        Toast.show(`${file.name} 不是图片文件，已跳过`, 'warning');
                        continue;
                    }
                    
                    // 检查文件大小 (最大 10MB)
                    if (file.size > 10 * 1024 * 1024) {
                        Toast.show(`${file.name} 超过 10MB 限制，已跳过`, 'warning');
                        continue;
                    }
                    
                    const result = await s3Service.uploadFile(file, (progress) => {
                        this.imageGallery.uploadProgress = progress;
                    });
                    
                    // 添加到列表开头
                    this.imageGallery.images.unshift({
                        key: result.key,
                        name: result.name,
                        size: result.size,
                        url: result.url,
                        thumbnailUrl: result.url,
                        lastModified: new Date().toISOString()
                    });
                    
                    Toast.show(`${file.name} 上传成功`, 'success');
                }
            } catch (error) {
                console.error('上传失败:', error);
                Toast.show('上传失败: ' + error.message, 'error');
            } finally {
                this.imageGallery.uploading = false;
                this.imageGallery.uploadProgress = 0;
            }
        },

        // 插入选中的图片到编辑器
        insertSelectedImage() {
            if (!this.imageGallery.selectedImage || !this.easyMDE) return;
            
            const image = this.imageGallery.selectedImage;
            const cm = this.easyMDE.codemirror;
            const cursor = cm.getCursor();
            
            // 生成 Markdown 图片语法
            const imageMarkdown = `![${image.name}](${image.url})`;
            
            // 插入到光标位置
            cm.replaceRange(imageMarkdown, cursor);
            
            // 关闭模态框
            this.closeImageGallery();
            
            Toast.show('图片已插入', 'success');
            
            // 聚焦编辑器
            cm.focus();
        },

        // 格式化文件大小
        formatFileSize(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
    }
});
