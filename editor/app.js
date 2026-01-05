import { CONFIG } from './config.js';
import { Auth } from './auth.js';
import { Octokit } from "https://cdn.skypack.dev/@octokit/rest";

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
        postTags: '',
        postCategories: '',
        easyMDE: null,
        sidebarOpen: true, // Desktop default
        previewMode: false // Mobile default
    },
    async mounted() {
        // Init Mobile State
        if (window.innerWidth < 768) {
            this.sidebarOpen = false;
        }

        // Check LocalStorage
        const cachedToken = localStorage.getItem('blog_editor_token');
        if (cachedToken) {
            this.token = cachedToken;
            this.initData(); // 直接初始化，暂不验证以加快速度
            this.isLoggedIn = true;
        }
    },
    methods: {
        async login() {
            if (!this.password && !CONFIG.ENCRYPTED_TOKEN) {
                this.errorMsg = '尚未配置加密 Token，请查看教程';
                return;
            }

            this.loading = true;
            this.errorMsg = '';

            // 1. Decrypt
            const decryptedToken = Auth.decryptToken(this.password);

            if (!decryptedToken) {
                this.errorMsg = '密码错误，无法解密';
                this.loading = false;
                return;
            }

            // 2. Verify
            try {
                // Warning: We are instantiating Octokit globally or per request
                // For verification we just make a simple call
                const octokit = new Octokit({ auth: decryptedToken });
                await octokit.rest.users.getAuthenticated();

                // Success
                this.token = decryptedToken;
                this.isLoggedIn = true;

                if (this.rememberMe) {
                    localStorage.setItem('blog_editor_token', this.token);
                }

                this.initData();
            } catch (e) {
                this.errorMsg = '验证失败: ' + e.message;
            } finally {
                this.loading = false;
            }
        },

        logout() {
            localStorage.removeItem('blog_editor_token');
            this.token = '';
            this.isLoggedIn = false;
            this.password = '';
            window.location.reload();
        },

        initData() {
            this.$nextTick(() => {
                this.initEasyMDE();
                this.fetchPosts();
            });
        },

        initEasyMDE() {
            this.easyMDE = new EasyMDE({
                element: document.getElementById('markdown-editor'),
                spellChecker: false,
                autosave: {
                    enabled: true,
                    uniqueId: "blog_draft",
                    delay: 1000,
                },
                toolbar: [
                    "bold", "italic", "heading", "|",
                    "quote", "unordered-list", "ordered-list", "|",
                    "link", "image", "|",
                    "preview", "side-by-side", "fullscreen"
                ],
                status: ["lines", "words"] // Optional status bar
            });

            // Sync content change to simple variable if needed, 
            // but usually we get value when saving.
        },

        toggleSidebar() {
            this.sidebarOpen = !this.sidebarOpen;
        },

        // --- GitHub API Operations ---

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

                // Filter only .md files
                this.posts = data.filter(file => file.name.endsWith('.md'))
                    .sort((a, b) => b.name.localeCompare(a.name)); // Simple sort by name (date usually)

            } catch (e) {
                alert('获取文章列表失败: ' + e.message);
            }
        },

        async loadPost(post) {
            // Mobile: Close sidebar after selection
            if (window.innerWidth < 768) this.sidebarOpen = false;

            const octokit = this.getOctokit();
            try {
                const { data } = await octokit.rest.repos.getContent({
                    owner: CONFIG.OWNER,
                    repo: CONFIG.REPO,
                    path: post.path,
                });

                // Decode Content (GitHub API returns Base64)
                const content = decodeURIComponent(escape(atob(data.content)));

                // Parse Front-matter (Simple Regex)
                this.parseFrontMatter(content);
                this.currentPost = { ...post, sha: data.sha, path: post.path }; // Update SHA is important!

            } catch (e) {
                alert('加载文章失败: ' + e.message);
            }
        },

        parseFrontMatter(content) {
            const fmRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
            const match = content.match(fmRegex);

            if (match) {
                const yamlStr = match[1];
                const body = match[2];
                this.easyMDE.value(body);

                // Very simple YAML parser (recommend using js-yaml lib for robust parsing)
                // Here we just extract title, date, tags via Regex
                this.postTitle = this.extractYamlValue(yamlStr, 'title');
                this.postDate = this.extractYamlValue(yamlStr, 'date');
                this.postTags = this.extractYamlValue(yamlStr, 'tags'); // This might be complex if multiline
                this.postCategories = this.extractYamlValue(yamlStr, 'categories');
            } else {
                // No front-matter or new file
                this.easyMDE.value(content);
                this.postTitle = this.currentPost ? this.currentPost.name.replace('.md', '') : '';
            }
        },

        extractYamlValue(yaml, key) {
            const regex = new RegExp(`^${key}:\\s*(.*)$`, 'm');
            const match = yaml.match(regex);
            return match ? match[1].trim() : '';
        },

        newPost() {
            this.currentPost = null;
            this.postTitle = '';
            this.postDate = new Date().toISOString().replace('T', ' ').substring(0, 19);
            this.postTags = '';
            this.postCategories = '';
            this.easyMDE.value('');
            if (window.innerWidth < 768) this.sidebarOpen = false;
        },

        async savePost() {
            if (!this.postTitle) {
                alert('请输入标题');
                return;
            }
            this.saving = true;

            // Construct Content
            const frontMatter = `---
title: ${this.postTitle}
date: ${this.postDate}
tags: [${this.postTags}]
categories: [${this.postCategories}]
---
`;
            const content = frontMatter + this.easyMDE.value();
            // Encode
            const contentBase64 = btoa(unescape(encodeURIComponent(content)));

            const filename = `${this.postTitle}.md`.replace(/\s+/g, '-'); // Sanitize filename
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

                // Update current post status
                this.currentPost = {
                    name: filename,
                    path: data.content.path,
                    sha: data.content.sha
                };

                alert('发布成功! Cloudflare Pages 将自动构建。');
                this.fetchPosts(); // Refresh list

            } catch (e) {
                console.error(e);
                alert('保存失败: ' + e.message);
            } finally {
                this.saving = false;
            }
        },

        formatDate(str) {
            return str ? str.substring(0, 10) : '';
        }
    }
});
