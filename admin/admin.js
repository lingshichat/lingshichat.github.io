import { Auth } from './api/auth.js';
import { Cloudflare } from './api/cloudflare.js';
import { CONFIG } from './config.js';
import { Octokit } from "https://esm.sh/@octokit/rest";
import { Toast } from '../js/toast-module.js';
import { ConfirmModal } from '../js/confirm-modal.js';
import { formatFileSize } from '../js/utils.js';

new Vue({
    el: '#app',
    data: {
        isLoggedIn: false,
        isAuthChecking: true, // 新增：正在检查登录状态
        password: '',
        rememberMe: false,
        loading: false,
        errorMsg: '',

        currentView: 'dashboard',

        // 📱 移动端侧边栏状态
        isSidebarOpen: false,

        // 导航菜单配置
        navItems: [
            { id: 'dashboard', label: '仪表盘', icon: 'fa-solid fa-chart-line' },
            { id: 'switches', label: '常用开关', icon: 'fa-solid fa-toggle-on' },
            { id: 'portals', label: '任意门', icon: 'fa-solid fa-door-open' }, // Phase 3
            { id: 'shortlinks', label: '短链生成', icon: 'fa-solid fa-link' }, // Phase 4
            { id: 'monitor', label: '状态监控', icon: 'fa-solid fa-heart-pulse' }, // Phase 5
            { id: 'posts', label: '博客管理', icon: 'fa-solid fa-pen-nib' },
            { id: 'settings', label: '系统设置', icon: 'fa-solid fa-gear' }
        ],

        // 统计数据
        stats: {
            posts: '-',
            tags: '-',
            categories: '-',
            portals: '-'
        },
        recentPosts: [],

        // API Clients
        octokit: null,
        cfToken: null,

        // Cloudflare States
        cf: {
            devMode: false,
            devModeTimeLeft: '',
            securityLevel: 'medium', // 'medium' or 'under_attack'
            maintenanceMode: false,
            hotlinkProtection: false, // 防盗链状态
            purgeLoading: false,
            devModeLoading: false,
            securityLoading: false,
            maintenanceLoading: false,
            hotlinkLoading: false // 防盗链加载状态
        },

        monitor: {
            loading: false,
            requests: '-',
            bandwidth: '-',
            threats: '-',
            uniques: '-',
            period: '24h',
            charts: {
                requests: null,
                threats: null
            }
        },
        kv: {
            loading: false,
            listLoading: false,
            list: [],
            accountId: CONFIG.CF_ACCOUNT_ID || '',
            namespaceId: CONFIG.CF_KV_ID || '',
            inputKey: '',
            inputUrl: '',
            editingKey: null,
            search: '',
            result: null, // Success result
            deletedKeys: [] // Blacklist for session
        },

        // Portals State
        portalPrefix: '',
        portalTarget: '',
        portalList: [], // { id, prefix, target, deleting: false }
        portalLoading: false,
        portalListLoading: false,
        editingPortalId: null, // ID of the portal being edited
        originalPrefix: null, // Track original prefix to detect changes
        debugRules: null, // For Debug View

        // Posts State (博客管理)
        allPosts: [],
        filteredPosts: [],
        postsLoading: false,
        postSearchQuery: '',

        // Settings State (系统设置)
        settingsEditing: false,
        settingsSaving: false,
        settingsForm: {
            OWNER: CONFIG.OWNER || '',
            REPO: CONFIG.REPO || '',
            BRANCH: CONFIG.BRANCH || '',
            CF_ZONE_ID: CONFIG.CF_ZONE_ID || '',
            CF_ACCOUNT_ID: CONFIG.CF_ACCOUNT_ID || '',
            CF_KV_ID: CONFIG.CF_KV_ID || ''
        },

        // 🔍 Health Check State (健康检测)
        healthCheck: {
            github: {
                status: 'unknown', // 'connected', 'error', 'unknown'
                lastCheck: null,
                latency: null, // 毫秒
                message: ''
            },
            cloudflare: {
                status: 'unknown',
                lastCheck: null,
                latency: null,
                message: ''
            },
            timer: null // 定时器句柄
        }
    },

    computed: {
        filteredShortlinks() {
            let list = this.kv.list;
            // 1. Filter out deleted keys (Session Blacklist)
            if (this.kv.deletedKeys.length > 0) {
                list = list.filter(item => !this.kv.deletedKeys.includes(item.key));
            }
            // 2. Filter by search query
            const q = this.kv.search.trim().toLowerCase();
            if (!q) return list;

            return list.filter(item =>
                item.key.toLowerCase().includes(q) ||
                item.value.toLowerCase().includes(q)
            );
        }
    },

    async mounted() {
        await this.checkLogin();
        // 启动健康检测定时器（每30秒）
        if (this.isLoggedIn) {
            this.startHealthCheckTimer();
        }
    },

    beforeDestroy() {
        // 清理定时器
        if (this.healthCheck.timer) {
            clearInterval(this.healthCheck.timer);
        }
    },

    watch: {
        currentView(newVal) {
            if (newVal === 'portals' && this.cfToken) this.loadPortals();
            if (newVal === 'shortlinks') this.initShortlinks();
            if (newVal === 'monitor') this.fetchMonitorData();
            if (newVal === 'posts') this.loadAllPosts();
        }
    },

    methods: {
        // --- Toast 通知 ---
        showToast(message, type = 'info', duration = 3500) {
            Toast.show(message, type, duration);
        },

        // --- 认证逻辑 ---
        async checkLogin() {
            const session = Auth.getSession();
            if (session) {
                this.isLoggedIn = true;
                this.initApp(session);
            }
            // 无论成功与否，检查结束
            this.isAuthChecking = false;
        },

        async login() {
            if (!this.password) return;
            this.loading = true;
            this.errorMsg = '';

            const tokens = Auth.decryptAll(this.password);

            if (tokens && tokens.github) {
                try {
                    const tempOctokit = new Octokit({ auth: tokens.github });
                    await tempOctokit.rest.users.getAuthenticated();

                    // 验证通过
                    // 如果勾选记住密码，保存会话到 localStorage
                    // 否则仅在内存中保持 (Auth 模块目前默认保存到 localStorage，这里可以优化为不勾选则只保存 session 或仅内存)
                    // 由于 Auth.saveSession 目前是设计为持久化，我们暂时保留它
                    // 但正确的做法是：如果不记住，应该存 sessionStorage

                    if (this.rememberMe) {
                        Auth.saveSession(tokens);
                    } else {
                        // 临时会话，关闭浏览器即逝 (使用 sessionStorage)
                        // 现有的 Auth.js 是基于 localStorage 共享的。
                        // 为了与 Editor 共享，我们必须存 localStorage（否则 Editor 拿不到）
                        // 权衡：为了 Editor 共享，目前暂时都存 localStorage，或者修改 Auth.js 支持 session
                        // 为了简化，我们暂时还是调用 saveSession，但 TODO: 区分存储
                        Auth.saveSession(tokens);
                    }

                    // 淡出动画
                    const container = document.querySelector('.login-container');
                    if (container) container.classList.add('fade-out');

                    setTimeout(() => {
                        this.isLoggedIn = true;
                        this.initApp(tokens);
                    }, 600);

                } catch (e) {
                    console.error("Login verification failed", e);
                    const status = e.status;
                    if (status === 401) {
                        this.errorMsg = 'GitHub Token 无效 (401 Unauthorized)';
                    } else if (status === 403) {
                        this.errorMsg = 'API 请求受限 (403 Forbidden)';
                    } else {
                        this.errorMsg = `验证失败: ${e.message || '网络错误'}`;
                    }
                    this.loading = false;
                }
            } else {
                this.errorMsg = '密钥错误，无法解密';
                this.loading = false;
            }
        },

        logout() {
            Auth.logout();
            this.isLoggedIn = false;
            this.password = '';
            this.recentPosts = [];
            window.location.reload();
        },

        // --- 应用初始化 ---
        async initApp(tokens) {
            if (tokens.github) {
                this.octokit = new Octokit({ auth: tokens.github });
                this.fetchBlogStats();
            }
            if (tokens.cf) {
                this.cfToken = tokens.cf;
                this.fetchCloudflareStatus();
                // 如果当前页面已经是 portals (虽然初始默认 dashboard，但如果记住视图逻辑以后改了呢)，加载之
                if (this.currentView === 'portals') {
                    this.loadPortals();
                }


            }
        },

        // --- 🏥 健康检测逻辑 ---
        startHealthCheckTimer() {
            // 立即执行一次检测
            this.performHealthCheck();

            // 每30秒执行一次
            this.healthCheck.timer = setInterval(() => {
                this.performHealthCheck();
            }, 30000);
        },

        async performHealthCheck() {
            // 并行检测 GitHub 和 Cloudflare
            await Promise.allSettled([
                this.checkGitHubHealth(),
                this.checkCloudflareHealth()
            ]);
        },

        async checkGitHubHealth() {
            if (!this.octokit) {
                this.healthCheck.github.status = 'unknown';
                this.healthCheck.github.message = '未配置';
                return;
            }

            const prevStatus = this.healthCheck.github.status;
            const startTime = Date.now();
            try {
                await this.octokit.rest.users.getAuthenticated();

                const latency = Date.now() - startTime;
                this.healthCheck.github.status = 'connected';
                this.healthCheck.github.latency = latency;
                this.healthCheck.github.lastCheck = new Date();
                this.healthCheck.github.message = '连接正常';

                // 仅在状态变化时提示（从非连接变为连接）
                if (prevStatus !== 'connected') {
                    this.showToast(`GitHub API 连接成功 (${latency}ms)`, 'success', 2000);
                }
            } catch (e) {
                this.healthCheck.github.status = 'error';
                this.healthCheck.github.lastCheck = new Date();
                this.healthCheck.github.latency = null;

                let errorMsg = '连接失败';
                if (e.status === 401) {
                    this.healthCheck.github.message = 'Token 无效';
                    errorMsg = 'GitHub Token 无效或已过期';
                } else if (e.status === 403) {
                    this.healthCheck.github.message = 'API 限流';
                    errorMsg = 'GitHub API 请求超出限额';
                } else if (e.message && e.message.includes('fetch')) {
                    this.healthCheck.github.message = '网络错误';
                    errorMsg = '网络连接失败，请检查网络';
                } else {
                    this.healthCheck.github.message = '连接失败';
                    errorMsg = e.message || '未知错误';
                }

                this.showToast(`GitHub API 检测失败: ${errorMsg}`, 'error', 4000);
                console.warn('[Health Check] GitHub:', e.message);
            }
        },

        async checkCloudflareHealth() {
            if (!this.cfToken) {
                this.healthCheck.cloudflare.status = 'unknown';
                this.healthCheck.cloudflare.message = '未配置';
                return;
            }

            const prevStatus = this.healthCheck.cloudflare.status;
            const startTime = Date.now();
            try {
                const zoneData = await Cloudflare.healthCheck(this.cfToken);

                const latency = Date.now() - startTime;

                if (zoneData && zoneData.id) {
                    this.healthCheck.cloudflare.status = 'connected';
                    this.healthCheck.cloudflare.latency = latency;
                    this.healthCheck.cloudflare.lastCheck = new Date();
                    this.healthCheck.cloudflare.message = '连接正常';

                    // 仅在状态变化时提示
                    if (prevStatus !== 'connected') {
                        this.showToast(`Cloudflare API 连接成功 (${latency}ms)`, 'success', 2000);
                    }
                } else {
                    this.healthCheck.cloudflare.status = 'error';
                    this.healthCheck.cloudflare.lastCheck = new Date();
                    this.healthCheck.cloudflare.message = 'API异常';

                    this.showToast('Cloudflare API 检测失败: API返回异常', 'error', 4000);
                }
            } catch (e) {
                this.healthCheck.cloudflare.status = 'error';
                this.healthCheck.cloudflare.lastCheck = new Date();
                this.healthCheck.cloudflare.latency = null;

                let errorMsg = '连接失败';
                if (e.message.includes('Missing Cloudflare Zone ID')) {
                    this.healthCheck.cloudflare.message = '未配置Zone ID';
                    errorMsg = '请在设置中配置 CF_ZONE_ID';
                } else if (e.message.includes('CORS')) {
                    this.healthCheck.cloudflare.message = 'CORS错误';
                    errorMsg = 'CORS代理失败，请检查网络';
                } else if (e.message.includes('Unauthorized') || e.message.includes('Invalid')) {
                    this.healthCheck.cloudflare.message = 'Token无效';
                    errorMsg = 'Token 无效或权限不足';
                } else if (e.message.includes('fetch') || e.message.includes('Network')) {
                    this.healthCheck.cloudflare.message = '网络错误';
                    errorMsg = '网络连接失败，请检查网络';
                } else {
                    this.healthCheck.cloudflare.message = e.message || '连接失败';
                    errorMsg = e.message || '未知错误';
                }

                this.showToast(`Cloudflare API 检测失败: ${errorMsg}`, 'error', 4000);
                console.warn('[Health Check] Cloudflare:', e);
            }
        },

        // --- Cloudflare Logic ---
        async fetchCloudflareStatus() {
            if (!this.cfToken) return;
            try {
                // 1. Dev Mode
                const devRes = await Cloudflare.getDevMode(this.cfToken);
                this.cf.devMode = (devRes.value === 'on');
                // Calculate time left if on
                if (this.cf.devMode) {
                    this.updateDevModeTimer(devRes.time_remaining); // time_remaining is in seconds
                }

                // 2. Security Level
                const secRes = await Cloudflare.getSecurityLevel(this.cfToken);
                this.cf.securityLevel = secRes.value;

                // 3. Hotlink Protection
                const hotlinkRes = await Cloudflare.getHotlinkProtection(this.cfToken);
                this.cf.hotlinkProtection = (hotlinkRes.value === 'on');

                // 4. [NEW] Portal Count (Real Data) - Robust Counting
                const rules = await Cloudflare.getRedirectRules(this.cfToken);
                // 使用与 loadPortals 相同的宽松匹配逻辑
                const portalCount = rules.filter(r => {
                    const descMatch = r.description && r.description.startsWith('Portal: ');
                    const exprMatch = r.expression && r.expression.match(/http\.host\s+eq\s+"([^"]+)"/);
                    // 只要符合任意一种特征都算
                    return descMatch || (exprMatch && r.action === 'redirect');
                }).length;

                this.stats.portals = portalCount;

            } catch (e) {
                console.error("CF Status Load Failed", e);
            }
        },

        updateDevModeTimer(seconds) {
            if (seconds <= 0) {
                this.cf.devMode = false;
                this.cf.devModeTimeLeft = '';
                return;
            }
            // Simple formatter
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            this.cf.devModeTimeLeft = `${h}小时${m}分 后关闭`;

            // Countdown (Not implemented for simplicity, just static snapshot or simple interval)
        },

        async togglePurgeCache() {
            if (this.cf.purgeLoading) return;
            this.cf.purgeLoading = true;
            try {
                await Cloudflare.purgeCache(this.cfToken);
                this.showToast('缓存已清除，新内容已上线！', 'success');
            } catch (e) {
                this.showToast('清除缓存失败: ' + e.message, 'error');
            } finally {
                this.cf.purgeLoading = false;
            }
        },

        async toggleDevMode() {
            if (this.cf.devModeLoading) return;
            this.cf.devModeLoading = true;
            const newValue = !this.cf.devMode;
            try {
                await Cloudflare.setDevMode(this.cfToken, newValue ? 'on' : 'off');
                this.cf.devMode = newValue;
                if (newValue) {
                    this.cf.devModeTimeLeft = "3小时 后关闭";
                    this.showToast('调试模式已开启！缓存将被绕过 3 小时。', 'warning');
                } else {
                    this.cf.devModeTimeLeft = "";
                    this.showToast('调试模式已关闭，恢复正常缓存。', 'success');
                }
            } catch (e) {
                this.showToast('切换失败: ' + e.message, 'error');
                this.cf.devMode = !newValue; // revert
            } finally {
                this.cf.devModeLoading = false;
            }
        },

        async toggleSecurity() {
            if (this.cf.securityLoading) return;
            this.cf.securityLoading = true;
            const isAttack = (this.cf.securityLevel === 'under_attack');
            const targetVal = isAttack ? 'medium' : 'under_attack';

            try {
                await Cloudflare.setSecurityLevel(this.cfToken, targetVal);
                this.cf.securityLevel = targetVal;
                if (targetVal === 'under_attack') {
                    this.showToast('全站防御已部署！', 'warning');
                } else {
                    this.showToast('紧急防御已解除，恢复正常访问。', 'success');
                }
            } catch (e) {
                this.showToast('切换失败: ' + e.message, 'error');
            } finally {
                this.cf.securityLoading = false;
            }
        },

        async toggleHotlinkProtection() {
            if (this.cf.hotlinkLoading) return;
            this.cf.hotlinkLoading = true;
            const newValue = !this.cf.hotlinkProtection;

            try {
                await Cloudflare.setHotlinkProtection(this.cfToken, newValue ? 'on' : 'off');
                this.cf.hotlinkProtection = newValue;
                if (newValue) {
                    this.showToast('防盗链护盾已开启！', 'success');
                } else {
                    this.showToast('防盗链护盾已关闭。', 'info');
                }
            } catch (e) {
                let msg = e.message;
                if (msg.includes('unhandled')) {
                    msg = 'Token 可能缺少 Zone Settings 权限，或 CORS 代理服务暂时不稳定。';
                }
                this.showToast('切换失败: ' + msg, 'error', 5000);
            } finally {
                this.cf.hotlinkLoading = false;
            }
        },



        // --- 数据获取 ---
        async fetchBlogStats() {
            try {
                const { data: posts } = await this.octokit.rest.repos.getContent({
                    owner: CONFIG.OWNER,
                    repo: CONFIG.REPO,
                    path: CONFIG.POSTS_PATH
                });

                if (Array.isArray(posts)) {
                    const mdPosts = posts.filter(f => f.name.endsWith('.md'));
                    this.stats.posts = mdPosts.length;

                    // 并行获取前 5 篇文章的详情以解析日期
                    const recentFiles = mdPosts
                        .sort((a, b) => b.name.localeCompare(a.name))
                        .slice(0, 5);

                    const recentDetailsPromises = recentFiles.map(file =>
                        this.octokit.rest.repos.getContent({
                            owner: CONFIG.OWNER,
                            repo: CONFIG.REPO,
                            path: file.path
                        })
                    );

                    const recentDetails = await Promise.all(recentDetailsPromises);

                    this.recentPosts = recentDetails.map(res => {
                        const content = decodeURIComponent(escape(atob(res.data.content)));
                        const info = this.parseSimpleFrontMatter(content);
                        return {
                            name: res.data.name,
                            path: res.data.path,
                            title: info.title || res.data.name.replace('.md', ''),
                            date: info.date || new Date().toISOString()
                        };
                    });

                    // 从所有文章中解析标签和分类（利用已获取的详情）
                    const allTags = new Set();
                    const allCategories = new Set();

                    // 并行获取所有文章内容以解析 tags/categories
                    const allDetailsPromises = mdPosts.map(file =>
                        this.octokit.rest.repos.getContent({
                            owner: CONFIG.OWNER,
                            repo: CONFIG.REPO,
                            path: file.path
                        }).catch(() => null)
                    );

                    const allDetails = await Promise.all(allDetailsPromises);
                    allDetails.forEach(res => {
                        if (!res) return;
                        const content = decodeURIComponent(escape(atob(res.data.content)));
                        const fmRegex = /^---\n([\s\S]*?)\n---/;
                        const match = content.match(fmRegex);
                        if (match) {
                            const yaml = match[1];
                            // 解析 tags
                            const tagsMatch = yaml.match(/^tags:\s*(.*)$/m);
                            if (tagsMatch) {
                                let val = tagsMatch[1].trim();
                                if (val.startsWith('[') && val.endsWith(']')) val = val.slice(1, -1);
                                val.split(',').map(s => s.trim()).filter(Boolean).forEach(t => allTags.add(t));
                            }
                            // 解析 categories
                            const catsMatch = yaml.match(/^categories:\s*(.*)$/m);
                            if (catsMatch) {
                                let val = catsMatch[1].trim();
                                if (val.startsWith('[') && val.endsWith(']')) val = val.slice(1, -1);
                                val.split(',').map(s => s.trim()).filter(Boolean).forEach(c => allCategories.add(c));
                            }
                        }
                    });

                    this.stats.tags = allTags.size;
                    this.stats.categories = allCategories.size;
                }

            } catch (e) {
                console.error("加载统计数据失败", e);
            }
        },

        parseSimpleFrontMatter(content) {
            const fmRegex = /^---\n([\s\S]*?)\n---/;
            const match = content.match(fmRegex);
            const info = {};
            if (match) {
                const yaml = match[1];
                const titleMatch = yaml.match(/^title:\s*(.*)$/m);
                if (titleMatch) info.title = titleMatch[1].trim();
                const dateMatch = yaml.match(/^date:\s*(.*)$/m);
                if (dateMatch) info.date = dateMatch[1].trim();
            }
            return info;
        },

        // --- 导航操作 ---
        visitBlog(path) {
            window.open(path, '_blank');
        },

        visitArticle(post) {
            const d = new Date(post.date);
            if (isNaN(d.getTime())) {
                window.open('/', '_blank');
                return;
            }
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const slug = post.title.trim();
            // 简单构造链接
            const url = `/${year}/${month}/${day}/${slug}/`;
            window.open(url, '_blank');
        },

        navigateToEditor() {
            window.open('/editor/', '_blank');
        },

        purgeCache() {
            this.togglePurgeCache();
        },

        openBlog() {
            window.open('/', '_blank');
        },

        async runDiagnostics() {
            const confirmDiag = await ConfirmModal.show({
                title: '运行诊断',
                message: '鉴权失败 (Unauthorized)。\n\n可能是 Token 权限不足或 Zone ID 不匹配。\n是否运行自动诊断以检查 Token 状态？',
                type: 'warning',
                confirmText: '开始诊断',
                cancelText: '取消'
            });
            if (!confirmDiag) return;

            let report = "🕵️‍♂️ 诊断报告:\n";
            try {
                // 1. Check Config
                report += `\n1. 配置检查:\n   - Zone ID: ${CONFIG.CF_ZONE_ID || '未配置 ❌'}\n`;

                // 2. Verify Token
                report += `\n2. Token 验证 (/user/tokens/verify):\n`;
                const verifyData = await Cloudflare.verifyToken(this.cfToken)
                    .catch(e => ({ status: 'error', message: e?.message || 'Unknown Error' }));

                // Note: verify endpoint standard return is { result: { status: "active" }, success: true }
                if (verifyData && verifyData.status === 'active') {
                    report += `   - 状态: 有效 ✅\n`;
                } else {
                    report += `   - 状态: 无效/错误 ❌ (${verifyData?.message || 'Unknown'})\n`;
                }

                // 3. Check Zones
                report += `\n3. 区域权限 (/zones):\n`;
                const zones = await Cloudflare.getZones(this.cfToken).catch(e => []);
                if (zones && zones.length > 0) {
                    const matched = zones.find(z => z.id === CONFIG.CF_ZONE_ID);
                    if (matched) {
                        report += `   - 找到区域: ${matched.name} (ID 匹配 ✅)\n`;
                    } else {
                        report += `   - ID 不匹配 ❌\n   - Token 可访问区域: ${zones.map(z => `${z.name} (${z.id})`).join(', ')}\n`;
                        report += `   - 当前配置 ID: ${CONFIG.CF_ZONE_ID}\n`;
                    }
                } else {
                    report += `   - 无法获取区域列表 ❌ (权限不足?)\n`;
                }

                Toast.show(report, 'info', 10000);

            } catch (e) {
                console.error(e);
                Toast.show("诊断运行出错: " + (e?.message || String(e)), 'error');
            }
        },

        formatDate(isoStr) {
            return isoStr.split('T')[0];
        },

        formatTime(date) {
            if (!date) return '-';
            const now = new Date();
            const diff = Math.floor((now - new Date(date)) / 1000); // 秒

            if (diff < 60) return `${diff}秒前`;
            if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
            if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
            return `${Math.floor(diff / 86400)}天前`;
        },

        // 实时显示时间（每秒更新）
        formatTimeAgo(date) {
            if (!date) return '未检测';
            const now = new Date();
            const diff = Math.floor((now - new Date(date)) / 1000); // 秒

            if (diff < 60) return `${diff}秒前`;
            if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
            return `${Math.floor(diff / 3600)}小时前`;
        },

        getStatusText(status) {
            const statusMap = {
                'connected': '已连接',
                'error': '连接失败',
                'unknown': '未连接'
            };
            return statusMap[status] || '未知';
        },

        // --- 📱 移动端侧边栏控制 ---
        toggleSidebar() {
            this.isSidebarOpen = !this.isSidebarOpen;
        },

        closeSidebar() {
            this.isSidebarOpen = false;
        },

        // --- 任意门逻辑 (Portals) ---
        async loadPortals() {
            if (!this.cfToken) return;
            this.portalListLoading = true;
            try {
                // 1. 获取 Redirect Rules
                const rules = await Cloudflare.getRedirectRules(this.cfToken);
                // console.log("Include Rules:", rules);
                this.debugRules = rules; // Store for UI Debug

                // 2. 筛选并解析
                this.portalList = rules.map(r => {
                    // Method A: Check Description (Official)
                    // Robust Regex: Allow variable spaces, case insensitive for "Portal"
                    let match = r.description && r.description.match(/^Portal:\s*(.+?)\s*->\s*(.*)$/i);
                    if (match) {
                        return { id: r.id, prefix: match[1], target: match[2], deleting: false };
                    }

                    // Method B: Check Expression (Fallback for manually created rules)
                    // Regex: \s* allows optional spaces, ["'] handles both quote types
                    // Matches: http.host eq "foo" OR (http.host eq "foo")
                    const exprRegex = /http\.host\s+eq\s+["']([^"']+)["']/i;
                    const exprMatch = r.expression && r.expression.match(exprRegex);

                    if (exprMatch && r.action === 'redirect') {
                        const fullDomain = exprMatch[1]; // tv.lingshichat.top
                        // Extract prefix
                        const prefix = fullDomain.replace('.lingshichat.top', '');
                        // Extract target
                        const target = r.action_parameters?.from_value?.target_url?.value || 'Unknown';

                        return { id: r.id, prefix: prefix, target: target, deleting: false };
                    }

                    // Debug: Log rules that look like Portals but failed parsing
                    if (r.description && r.description.toLowerCase().includes('portal')) {
                        console.warn("⚠️ Found suspicious rule that failed parsing:", r);
                        // Optional: return a partial object so we can see it in UI?
                        // return { id: r.id, prefix: '???', target: 'Parse Error', raw: r, deleting: false };
                    }

                    return null;
                }).filter(Boolean);

                if (this.portalList.length === 0 && rules.length > 0) {
                    console.log("No portals found in", rules.length, "rules.");
                }

            } catch (e) {
                console.error("Failed to load portals", e);
                this.showToast("加载列表失败: " + e.message, 'error'); // Explicit alert
            } finally {
                this.portalListLoading = false;
            }
        },

        async savePortal() {
            if (!this.portalPrefix || !this.portalTarget) return;
            if (this.portalLoading) return;

            this.portalLoading = true;
            const prefix = this.portalPrefix.trim();
            let target = this.portalTarget.trim();

            // 🔧 自动补全协议前缀，防止被当作相对路径
            if (target && !target.match(/^https?:\/\//i)) {
                target = 'https://' + target;
            }

            // 是否是编辑模式
            const isEdit = !!this.editingPortalId;

            try {
                // 1. 检查/创建 DNS (始终检查，确保目标域名的路牌存在)
                // 如果是编辑模式且前缀没变，其实可以跳过，但检查一下也无妨
                if (!isEdit || (isEdit && prefix !== this.originalPrefix)) {
                    try {
                        const dnsName = `${prefix}.lingshichat.top`;
                        const dnsRecords = await Cloudflare.getDNSRecords(this.cfToken, dnsName);
                        if (dnsRecords.length === 0) {
                            await Cloudflare.createDNSRecord(this.cfToken, dnsName);
                        }
                    } catch (dnsErr) {
                        if (!dnsErr.message.includes('exists') && !dnsErr.message.includes('duplicate')) {
                            console.warn("DNS check failed but proceeding:", dnsErr);
                        }
                    }
                }

                // 2. 创建或更新 Rule
                if (isEdit) {
                    await Cloudflare.updateRedirectRule(this.cfToken, this.editingPortalId, {
                        prefix: prefix,
                        target: target
                    });
                    this.showToast('✅ 修改已保存！', 'success');
                } else {
                    await Cloudflare.createRedirectRule(this.cfToken, prefix, target);
                    this.showToast(`✨ 任意门已开启！ ${prefix}.lingshichat.top -> ${target}`, 'success');
                }

                // 重置表单
                this.cancelEdit();

                // 延迟刷新
                await new Promise(r => setTimeout(r, 1000));
                await this.loadPortals();
                // 同时更新一下仪表盘统计
                this.fetchCloudflareStatus();

            } catch (e) {
                console.error(e);
                this.showToast((isEdit ? "修改失败: " : "创建失败: ") + e.message, 'error');
            } finally {
                this.portalLoading = false;
            }
        },

        editPortal(portal) {
            this.editingPortalId = portal.id;
            this.portalPrefix = portal.prefix;
            this.portalTarget = portal.target;
            this.originalPrefix = portal.prefix;
            // 滚动到顶部
            const builder = document.querySelector('.portal-builder');
            if (builder) builder.scrollIntoView({ behavior: 'smooth' });
        },

        cancelEdit() {
            this.editingPortalId = null;
            this.portalPrefix = '';
            this.portalTarget = '';
            this.originalPrefix = null;
        },

        async deletePortal(portal) {
            const confirmed = await ConfirmModal.show({
                title: '拆除任意门',
                message: `确定要拆除通往 [${portal.target}] 的任意门吗？`,
                type: 'danger',
                confirmText: '拆除',
                cancelText: '取消'
            });

            if (!confirmed) return;

            portal.deleting = true;
            try {
                // 1. 删除 Rule
                await Cloudflare.deleteRedirectRule(this.cfToken, portal.id);

                // 2. [UX Fix] 立即从界面移除，防止用户再次点击
                this.portalList = this.portalList.filter(p => p.id !== portal.id);

                // 3. 删除 DNS (A记录) - 这是一个清理工作，失败不应阻塞 UI
                try {
                    const dnsName = `${portal.prefix}.lingshichat.top`;
                    const records = await Cloudflare.getDNSRecords(this.cfToken, dnsName);
                    for (const rec of records) {
                        await Cloudflare.deleteDNSRecord(this.cfToken, rec.id);
                    }
                } catch (dnsErr) {
                    console.warn("DNS cleanup failed or partial:", dnsErr);
                }

                // 4. 后台更新计数（不刷新列表，防止 CF API 延迟导致已删除项重现）
                // this.loadPortals(); // 移除立即刷新，避免读取到延迟数据
                this.fetchCloudflareStatus();
                this.showToast('任意门已拆除🗑️', 'success');

            } catch (e) {
                // [Self-Healing] 如果规则不存在 (404/not found)，说明已经删除了
                // 直接从界面移除，不报错
                const msg = e.message || '';
                if (msg.includes('not find rule') || msg.includes('404')) {
                    this.portalList = this.portalList.filter(p => p.id !== portal.id);
                    // 不再立即刷新，防止 CF 缓存导致僵尸条目通过 API 复活
                    // this.loadPortals();
                    this.fetchCloudflareStatus(); // 仅刷新计数
                    return;
                }

                this.showToast("拆除失败: " + e.message, 'error');
                portal.deleting = false;
            }
        },

        // --- 📊 状态监控 (Monitor) ---
        async fetchMonitorData() {
            if (!this.cfToken) return;
            this.monitor.loading = true;
            try {
                const data = await Cloudflare.getZoneAnalytics(this.cfToken);
                // 1. Update Totals
                const totals = data.totals;
                this.monitor.requests = totals.requests.all;
                this.monitor.bandwidth = formatFileSize(totals.bandwidth.all);
                this.monitor.threats = totals.threats.all;
                this.monitor.uniques = totals.uniques.all;

                // 2. Render Charts
                this.$nextTick(() => {
                    this.renderMonitorCharts(data.series);
                });
            } catch (e) {
                console.error("Monitor Load Failed", e);
                this.showToast("监控数据加载失败: " + e.message, 'error', 5000);
            } finally {
                this.monitor.loading = false;
            }
        },

        renderMonitorCharts(seriesData) {
            // Safety: Destroy old charts if they exist, to prevent canvas reuse errors
            if (this.monitor.charts.requests) {
                this.monitor.charts.requests.destroy();
                this.monitor.charts.requests = null;
            }
            if (this.monitor.charts.threats) {
                this.monitor.charts.threats.destroy();
                this.monitor.charts.threats = null;
            }

            if (!seriesData || seriesData.length === 0) return;

            // 🔧 先按时间排序，确保数据按时间顺序显示
            seriesData.sort((a, b) => new Date(a.time) - new Date(b.time));

            // 格式化时间标签 (第一个点和日期变化时显示日期标记)
            let lastDay = null;
            const labels = seriesData.map((d, index) => {
                const date = new Date(d.time);
                const day = date.getDate();
                const month = date.getMonth() + 1;
                const hours = date.getHours();

                // 第一个数据点或日期变化时，显示日期标记
                if (index === 0 || day !== lastDay) {
                    lastDay = day;
                    return `${month}/${day} ${hours}:00`;
                }
                return hours + ':00';
            });

            // 1. 流量趋势图 (Requests & Uniques)
            const ctxReq = document.getElementById('requestsChart')?.getContext('2d');
            if (ctxReq) {
                if (this.monitor.charts.requests) {
                    this.monitor.charts.requests.destroy();
                    this.monitor.charts.requests = null;
                }

                // 创建渐变
                const gradientReq = ctxReq.createLinearGradient(0, 0, 0, 400);
                gradientReq.addColorStop(0, 'rgba(100, 181, 246, 0.5)');
                gradientReq.addColorStop(1, 'rgba(100, 181, 246, 0)');

                const gradientUniq = ctxReq.createLinearGradient(0, 0, 0, 400);
                gradientUniq.addColorStop(0, 'rgba(255, 241, 118, 0.5)');
                gradientUniq.addColorStop(1, 'rgba(255, 241, 118, 0)');

                this.monitor.charts.requests = new Chart(ctxReq, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: '总请求数',
                                data: seriesData.map(d => d.requests),
                                borderColor: '#64b5f6',
                                backgroundColor: gradientReq,
                                borderWidth: 2,
                                tension: 0.4, // 平滑曲线
                                fill: true,
                                pointBackgroundColor: '#64b5f6',
                                pointRadius: 3,
                                pointHoverRadius: 6
                            },
                            {
                                label: '独立访客',
                                data: seriesData.map(d => d.uniques),
                                borderColor: '#fff176',
                                backgroundColor: gradientUniq,
                                borderWidth: 2,
                                tension: 0.4,
                                fill: true,
                                pointBackgroundColor: '#fff176',
                                pointRadius: 3,
                                pointHoverRadius: 6
                            }
                        ]
                    },
                    options: this.getChartOptions('流量趋势')
                });
            }

            // 2. 威胁拦截图 (Threats)
            const ctxThreat = document.getElementById('threatsChart')?.getContext('2d');
            if (ctxThreat) {
                if (this.monitor.charts.threats) {
                    this.monitor.charts.threats.destroy();
                }

                this.monitor.charts.threats = new Chart(ctxThreat, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: '拦截威胁',
                            data: seriesData.map(d => d.threats),
                            backgroundColor: 'rgba(229, 115, 115, 0.7)',
                            borderColor: '#e57373',
                            borderWidth: 1,
                            borderRadius: 4
                        }]
                    },
                    options: this.getChartOptions('威胁拦截')
                });
            }
        },

        getChartOptions(title) {
            return {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 800,
                    easing: 'easeInOutQuart'
                },
                plugins: {
                    legend: {
                        position: 'top',
                        align: 'end',
                        labels: {
                            color: 'rgba(255, 255, 255, 0.85)',
                            font: {
                                family: "'Segoe UI', 'PingFang SC', sans-serif",
                                size: 12,
                                weight: '500'
                            },
                            usePointStyle: true,      // 🎯 使用圆点代替矩形
                            pointStyle: 'circle',     // 圆形指示器
                            boxWidth: 8,              // 指示器大小
                            boxHeight: 8,
                            padding: 16               // 图例之间间距
                        }
                    },
                    tooltip: {
                        enabled: true,
                        mode: 'index',
                        intersect: false,
                        // 🎨 精致玻璃质感 Tooltip
                        backgroundColor: 'rgba(20, 25, 40, 0.92)',
                        titleColor: '#fff',
                        titleFont: {
                            family: "'Segoe UI', sans-serif",
                            size: 13,
                            weight: '600'
                        },
                        bodyColor: 'rgba(255, 255, 255, 0.8)',
                        bodyFont: {
                            family: "'Segoe UI', sans-serif",
                            size: 12
                        },
                        borderColor: 'rgba(100, 181, 246, 0.3)',
                        borderWidth: 1,
                        cornerRadius: 10,
                        padding: {
                            top: 10,
                            bottom: 10,
                            left: 14,
                            right: 14
                        },
                        boxPadding: 6,
                        usePointStyle: true,          // Tooltip 也用圆点
                        // 添加阴影效果
                        caretSize: 6,
                        caretPadding: 8,
                        displayColors: true
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.04)',
                            lineWidth: 1,
                            drawBorder: false
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.5)',
                            font: {
                                family: "'Segoe UI', sans-serif",
                                size: 11
                            },
                            padding: 8,
                            maxRotation: 0            // 保持水平
                        },
                        border: {
                            display: false
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.04)',
                            lineWidth: 1,
                            drawBorder: false
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.5)',
                            font: {
                                family: "'Segoe UI', sans-serif",
                                size: 11
                            },
                            padding: 10,
                            // 格式化大数字
                            callback: function (value) {
                                if (value >= 1000) {
                                    return (value / 1000).toFixed(1) + 'k';
                                }
                                return value;
                            }
                        },
                        border: {
                            display: false
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                },
                // 悬停效果
                hover: {
                    mode: 'nearest',
                    intersect: false,
                    animationDuration: 200
                }
            };
        },

        // --- 🔗 短链管理 (Shortlinks) ---
        async initShortlinks() {
            if (!this.cfToken) return;
            if (this.kv.list.length > 0 && !this.kv.listLoading) return;

            this.kv.listLoading = true;
            try {
                // 1. 获取 Account ID
                if (!this.kv.accountId) {
                    this.kv.accountId = await Cloudflare.getAccountId(this.cfToken);
                }

                // 2. 获取 Namespace ID (自动创建 "blog_shortlinks")
                if (!this.kv.namespaceId) {
                    const nss = await Cloudflare.listNamespaces(this.cfToken, this.kv.accountId);
                    const target = nss.find(n => n.title === 'blog_shortlinks');
                    if (target) {
                        this.kv.namespaceId = target.id;
                    } else {
                        const newNs = await Cloudflare.createNamespace(this.cfToken, this.kv.accountId, 'blog_shortlinks');
                        this.kv.namespaceId = newNs.id;
                    }
                }

                // 3. 加载数据
                await this.loadShortlinks();

            } catch (e) {
                console.error("Shortlinks Init Failed", e);
                this.showToast("短链初始化失败: " + e.message, 'error');
                this.kv.listLoading = false;
            }
        },

        async loadShortlinks() {
            this.kv.listLoading = true;
            try {
                const keys = await Cloudflare.listKVKeys(this.cfToken, this.kv.accountId, this.kv.namespaceId);
                // 并行获取值
                const list = [];
                await Promise.all(keys.map(async k => {
                    // Pre-filter: Don't fetch if in blacklist
                    if (this.kv.deletedKeys.includes(k.name)) return;

                    const val = await Cloudflare.getKV(this.cfToken, this.kv.accountId, this.kv.namespaceId, k.name);
                    // Filter out stale keys (deleted but still in list cache) which return 404/null value
                    if (val !== null) {
                        list.push({ key: k.name, value: val });
                    }
                }));
                this.kv.list = list.sort((a, b) => a.key.localeCompare(b.key));
            } catch (e) {
                this.showToast('列表加载失败: ' + e.message, 'error');
            } finally {
                this.kv.listLoading = false;
            }
        },

        generateRandomKey() {
            const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
            let result = '';
            for (let i = 0; i < 6; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            this.kv.inputKey = result;
        },

        copyToClipboard(text) {
            if (!text) return;
            navigator.clipboard.writeText(text).then(() => {
                this.showToast('已复制到剪贴板! 📋', 'success', 2000);
            }).catch(err => {
                console.error('Copy failed', err);
                this.showToast('复制失败', 'error');
            });
        },

        visitShortlink(key) {
            window.open(`https://lingshichat.top/s/${key}`, '_blank');
        },

        async saveShortlink() {
            let key = this.kv.inputKey.trim();
            let url = this.kv.inputUrl.trim();

            // Auto-generate key if empty
            if (!key) {
                this.generateRandomKey();
                key = this.kv.inputKey;
            }

            if (!key || !url) return;

            // 🔧 自动补全协议前缀，防止被当作相对路径
            if (url && !url.match(/^https?:\/\//i)) {
                url = 'https://' + url;
            }

            this.kv.loading = true;
            this.kv.result = null; // Reset result

            try {
                await Cloudflare.putKV(this.cfToken, this.kv.accountId, this.kv.namespaceId, key, url);

                // Success Handling
                const fullShortlink = `https://lingshichat.top/s/${key}`;
                this.kv.result = fullShortlink; // Show success panel
                this.showToast('✨ 短链已生成！', 'success');

                // 2. 乐观更新列表 (Optimistic Update)
                // 直接更新本地列表，无需等待 KV 的最终一致性
                const newItem = { key: key, value: url };

                // 检查是否存在（编辑模式或覆盖）
                const existingIndex = this.kv.list.findIndex(item => item.key === key);
                if (existingIndex > -1) {
                    // 更新现有项 (为了 Vue 响应式，使用 splice)
                    this.kv.list.splice(existingIndex, 1, newItem);
                } else {
                    // 添加新项并重新排序
                    this.kv.list.push(newItem);
                    this.kv.list.sort((a, b) => a.key.localeCompare(b.key));
                }

                // 从黑名单移除（如果存在）
                const idx = this.kv.deletedKeys.indexOf(key);
                if (idx > -1) this.kv.deletedKeys.splice(idx, 1);

                // Clear inputs if not editing (keep result visible)
                if (!this.kv.editingKey) {
                    this.kv.inputKey = '';
                    this.kv.inputUrl = '';
                } else {
                    this.cancelShortlinkEdit();
                }

                // 延后后台同步 (Optional, double check)
                setTimeout(() => this.loadShortlinks(), 2000);

            } catch (e) {
                this.showToast('保存失败: ' + e.message, 'error');
            } finally {
                this.kv.loading = false;
            }
        },

        editShortlink(item) {
            this.kv.inputKey = item.key;
            this.kv.inputUrl = item.value;
            this.kv.editingKey = item.key;
            const form = document.querySelector('.shortlink-form');
            if (form) form.scrollIntoView({ behavior: 'smooth' });
        },

        cancelShortlinkEdit() {
            this.kv.inputKey = '';
            this.kv.inputUrl = '';
            this.kv.editingKey = null;
        },

        async deleteShortlink(item) {
            const confirmed = await ConfirmModal.show({
                title: '删除确认',
                message: `确定要删除短链 [${item.key}] 吗？`,
                type: 'danger',
                confirmText: '删除',
                cancelText: '取消'
            });

            if (!confirmed) return;
            // Optimistic Update: Immediately remove from UI
            this.kv.deletedKeys.push(item.key);
            // Force update locally to feel instant
            // (The computed 'filteredShortlinks' will handle the hiding automatically based on deletedKeys)

            try {
                await Cloudflare.deleteKV(this.cfToken, this.kv.accountId, this.kv.namespaceId, item.key);
                this.showToast('短链已删除 🗑️', 'success');

                // 3. Remove from local list completely (Prevent zombie item due to API delay)
                const listIdx = this.kv.list.findIndex(i => i.key === item.key);
                if (listIdx > -1) this.kv.list.splice(listIdx, 1);

            } catch (e) {
                this.showToast('删除失败: ' + e.message, 'error');
                // Revert optimistic update if needed (but currently we only pushed to blacklist)
                const idx = this.kv.deletedKeys.indexOf(item.key);
                if (idx > -1) this.kv.deletedKeys.splice(idx, 1);
            }
        },

        // --- 📝 博客管理 (Posts) ---
        async loadAllPosts() {
            if (!this.octokit) return;
            this.postsLoading = true;
            try {
                const { data: files } = await this.octokit.rest.repos.getContent({
                    owner: CONFIG.OWNER,
                    repo: CONFIG.REPO,
                    path: 'source/_posts'
                });

                if (!Array.isArray(files)) {
                    this.allPosts = [];
                    this.filteredPosts = [];
                    return;
                }

                const mdFiles = files.filter(f => f.name.endsWith('.md'));

                // 并行获取每篇文章的详情以解析 title 和 date
                const detailsPromises = mdFiles.map(file =>
                    this.octokit.rest.repos.getContent({
                        owner: CONFIG.OWNER,
                        repo: CONFIG.REPO,
                        path: file.path
                    })
                );

                const details = await Promise.all(detailsPromises);

                this.allPosts = details.map(res => {
                    const content = decodeURIComponent(escape(atob(res.data.content)));
                    const info = this.parseSimpleFrontMatter(content);
                    return {
                        name: res.data.name,
                        path: res.data.path,
                        sha: res.data.sha,
                        title: info.title || res.data.name.replace('.md', ''),
                        date: info.date || ''
                    };
                });

                // 按日期排序（最新在前）
                this.allPosts.sort((a, b) => {
                    if (!a.date) return 1;
                    if (!b.date) return -1;
                    return new Date(b.date) - new Date(a.date);
                });

                this.filteredPosts = [...this.allPosts];
            } catch (e) {
                console.error("加载文章失败", e);
                Toast.show("加载文章列表失败: " + e.message, 'error');
            } finally {
                this.postsLoading = false;
            }
        },

        filterPosts() {
            const query = this.postSearchQuery.trim().toLowerCase();
            if (!query) {
                this.filteredPosts = [...this.allPosts];
                return;
            }
            this.filteredPosts = this.allPosts.filter(post =>
                (post.title && post.title.toLowerCase().includes(query)) ||
                (post.name && post.name.toLowerCase().includes(query))
            );
        },

        openInEditor(post) {
            // 在新窗口打开 Editor 并传递文章路径
            window.open(`/editor/?path=${encodeURIComponent(post.path)}`, '_blank');
        },

        // --- ⚙️ 系统设置 (Settings) ---
        startEditSettings() {
            // 初始化表单为当前配置
            this.settingsForm = {
                OWNER: CONFIG.OWNER || '',
                REPO: CONFIG.REPO || '',
                BRANCH: CONFIG.BRANCH || '',
                CF_ZONE_ID: CONFIG.CF_ZONE_ID || '',
                CF_ACCOUNT_ID: CONFIG.CF_ACCOUNT_ID || '',
                CF_KV_ID: CONFIG.CF_KV_ID || ''
            };
            this.settingsEditing = true;
        },

        cancelEditSettings() {
            this.settingsEditing = false;
        },

        async saveSettings() {
            if (!this.octokit) {
                Toast.show("GitHub 未连接，无法保存", 'error');
                return;
            }

            this.settingsSaving = true;

            try {
                // 1. 读取现有 config.js 文件获取 SHA
                const configPath = 'source/admin/config.js';
                let existingSha = null;

                try {
                    const { data: file } = await this.octokit.rest.repos.getContent({
                        owner: CONFIG.OWNER,
                        repo: CONFIG.REPO,
                        path: configPath
                    });
                    existingSha = file.sha;
                } catch (e) {
                    // 文件不存在，稍后创建
                    console.warn("config.js 不存在，将创建新文件");
                }

                // 2. 构造新的 config.js 内容
                const newConfigContent = `// 管理后台配置
// 仓库中仅保留非敏感默认值；敏感配置请写入同目录下被忽略的 config.local.js

import { isPlainObject, mergeConfig } from '../js/utils.js';

const DEFAULT_CONFIG = {
    // GitHub Token (加密) - 用于博客文章管理
    GITHUB_TOKEN: "",

    // Cloudflare API Token (加密) - 用于域名/缓存/KV管理
    CF_TOKEN: "",

    // API 代理服务 (Worker) - 解决移动端连接问题
    CF_API_PROXY: "https://api.lingshichat.top/_api",

    // 博客配置
    OWNER: "${this.settingsForm.OWNER}",
    REPO: "${this.settingsForm.REPO}",
    BRANCH: "${this.settingsForm.BRANCH}",

    // 路径配置
    POSTS_PATH: "source/_posts",
    TRASH_PATH: "source/_trash",

    // Cloudflare 配置（敏感 ID 请配置在 config.local.js）
    CF_ZONE_ID: "${this.settingsForm.CF_ZONE_ID}",
    CF_ACCOUNT_ID: "${this.settingsForm.CF_ACCOUNT_ID}",
    CF_KV_ID: "${this.settingsForm.CF_KV_ID}"
};

const localOverride = typeof window !== "undefined" && isPlainObject(window.__ADMIN_CONFIG_OVERRIDE__)
    ? window.__ADMIN_CONFIG_OVERRIDE__
    : {};

export const CONFIG = mergeConfig(DEFAULT_CONFIG, localOverride);
`;

                // 3. 提交更新到 GitHub
                await this.octokit.rest.repos.createOrUpdateFileContents({
                    owner: CONFIG.OWNER,
                    repo: CONFIG.REPO,
                    path: configPath,
                    message: '🔧 Update admin config via Admin Panel',
                    content: btoa(unescape(encodeURIComponent(newConfigContent))),
                    sha: existingSha,
                    branch: CONFIG.BRANCH
                });

                Toast.show("配置已保存！部分配置需重新部署后生效。", 'success', 5000);
                this.settingsEditing = false;

            } catch (e) {
                console.error("保存配置失败", e);
                Toast.show("保存失败: " + e.message, 'error');
            } finally {
                this.settingsSaving = false;
            }
        }
    }
});
