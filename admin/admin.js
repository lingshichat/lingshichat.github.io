import { Auth } from './api/auth.js';
import { Cloudflare } from './api/cloudflare.js';
import { CONFIG } from './config.js';
import { Octokit } from "https://esm.sh/@octokit/rest";

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
            period: '24h'
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
            search: ''
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
        }
    },

    async mounted() {
        await this.checkLogin();
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
            // type: 'success' | 'warning' | 'error' | 'info'
            const container = document.getElementById('toast-container');
            if (!container) return;

            const icons = {
                success: 'fa-solid fa-check',
                warning: 'fa-solid fa-triangle-exclamation',
                error: 'fa-solid fa-circle-xmark',
                info: 'fa-solid fa-circle-info'
            };

            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.innerHTML = `
                <div class="toast-icon"><i class="${icons[type] || icons.info}"></i></div>
                <div class="toast-content">
                    <div class="toast-message">${message}</div>
                </div>
                <button class="toast-close"><i class="fa-solid fa-xmark"></i></button>
            `;

            // 关闭按钮
            toast.querySelector('.toast-close').onclick = () => {
                toast.classList.add('toast-exit');
                setTimeout(() => toast.remove(), 300);
            };

            container.appendChild(toast);

            // 自动消失
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.classList.add('toast-exit');
                    setTimeout(() => toast.remove(), 300);
                }
            }, duration);
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
                    this.errorMsg = 'GitHub Token 无效';
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
                    path: 'source/_posts'
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
                }

                // Mock 数据
                this.stats.tags = '12';
                this.stats.categories = '4';
                // this.stats.portals = '2'; // Moved to fetchCloudflareStatus

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

        navigateToPost() {
            window.open('/editor/', '_blank');
        },

        purgeCache() {
            this.togglePurgeCache();
        },

        openBlog() {
            window.open('/', '_blank');
        },

        async runDiagnostics() {
            const confirmDiag = confirm("⚠️ 鉴权失败 (Unauthorized)。\n\n可能是 Token 权限不足或 Zone ID 不匹配。\n是否运行自动诊断以检查 Token 状态？");
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

                alert(report);

            } catch (e) {
                console.error(e);
                alert("诊断运行出错: " + (e?.message || String(e)));
            }
        },

        formatDate(isoStr) {
            return isoStr.split('T')[0];
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
                alert("加载列表失败: " + e.message); // Explicit alert
            } finally {
                this.portalListLoading = false;
            }
        },

        async savePortal() {
            if (!this.portalPrefix || !this.portalTarget) return;
            if (this.portalLoading) return;

            this.portalLoading = true;
            const prefix = this.portalPrefix.trim();
            const target = this.portalTarget.trim();

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
                    alert(`✅ 修改已保存！`);
                } else {
                    await Cloudflare.createRedirectRule(this.cfToken, prefix, target);
                    alert(`✨ 任意门已开启！\n${prefix}.lingshichat.top -> ${target}`);
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
                alert((isEdit ? "修改失败: " : "创建失败: ") + e.message);
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
            if (!confirm(`确定要拆除通往 [${portal.target}] 的任意门吗？`)) return;

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

                alert("拆除失败: " + e.message);
                portal.deleting = false;
            }
        },

        // --- 📊 状态监控 (Monitor) ---
        async fetchMonitorData() {
            if (!this.cfToken) return;
            this.monitor.loading = true;
            try {
                const data = await Cloudflare.getZoneAnalytics(this.cfToken);
                const totals = data.totals;
                this.monitor.requests = totals.requests.all;
                this.monitor.bandwidth = this.formatBytes(totals.bandwidth.all);
                this.monitor.threats = totals.threats.all;
                this.monitor.uniques = totals.pageviews.all;
            } catch (e) {
                console.error("Monitor Load Failed", e);
            } finally {
                this.monitor.loading = false;
            }
        },

        formatBytes(bytes) {
            if (!bytes || bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
                alert("短链初始化失败: " + e.message);
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
                    const val = await Cloudflare.getKV(this.cfToken, this.kv.accountId, this.kv.namespaceId, k.name);
                    list.push({ key: k.name, value: val });
                }));
                this.kv.list = list.sort((a, b) => a.key.localeCompare(b.key));
            } catch (e) {
                alert("列表加载失败: " + e.message);
            } finally {
                this.kv.listLoading = false;
            }
        },

        async saveShortlink() {
            const key = this.kv.inputKey.trim();
            const url = this.kv.inputUrl.trim();
            if (!key || !url) return;

            this.kv.loading = true;
            try {
                await Cloudflare.putKV(this.cfToken, this.kv.accountId, this.kv.namespaceId, key, url);
                alert("✅ 短链已保存！");
                this.kv.inputKey = '';
                this.kv.inputUrl = '';
                this.kv.editingKey = null;
                await this.loadShortlinks();
            } catch (e) {
                alert("保存失败: " + e.message);
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
            if (!confirm(`确定要删除短链 [${item.key}] 吗？`)) return;
            this.kv.loading = true;
            try {
                await Cloudflare.deleteKV(this.cfToken, this.kv.accountId, this.kv.namespaceId, item.key);
                await this.loadShortlinks();
            } catch (e) {
                alert("删除失败: " + e.message);
            } finally {
                this.kv.loading = false;
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
                alert("加载文章列表失败: " + e.message);
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
                alert("GitHub 未连接，无法保存");
                return;
            }

            this.settingsSaving = true;

            try {
                // 1. 读取现有 config.js 文件获取 SHA
                const configPath = 'source/admin/config.js';
                let existingSha = null;
                let existingContent = '';

                try {
                    const { data: file } = await this.octokit.rest.repos.getContent({
                        owner: CONFIG.OWNER,
                        repo: CONFIG.REPO,
                        path: configPath
                    });
                    existingSha = file.sha;
                    existingContent = decodeURIComponent(escape(atob(file.content)));
                } catch (e) {
                    // 文件不存在，稍后创建
                    console.warn("config.js 不存在，将创建新文件");
                }

                // 2. 构造新的 config.js 内容
                // 保留原有的 Token 加密字符串
                const githubTokenMatch = existingContent.match(/GITHUB_TOKEN:\s*"([^"]*)"/);
                const cfTokenMatch = existingContent.match(/CF_TOKEN:\s*"([^"]*)"/);

                const githubToken = githubTokenMatch ? githubTokenMatch[1] : '';
                const cfToken = cfTokenMatch ? cfTokenMatch[1] : '';

                const newConfigContent = `// 🔐 管理后台配置
// 警告：不要直接在此处填入明文 Token！

export const CONFIG = {
    // GitHub Token (加密) - 用于博客文章管理
    // 请使用 tools/token-generator.html 生成
    GITHUB_TOKEN: "${githubToken}",

    // Cloudflare API Token (加密) - 用于域名/缓存/KV管理
    // 权限要求: Zone.Cache Purge, Zone.DNS, Workers KV, Zone.Page Rules, Zone.Settings
    CF_TOKEN: "${cfToken}",

    // 博客配置
    OWNER: "${this.settingsForm.OWNER}",
    REPO: "${this.settingsForm.REPO}",
    BRANCH: "${this.settingsForm.BRANCH}",

    // Cloudflare 配置
    CF_ZONE_ID: "${this.settingsForm.CF_ZONE_ID}",
    CF_ACCOUNT_ID: "${this.settingsForm.CF_ACCOUNT_ID}",
    CF_KV_ID: "${this.settingsForm.CF_KV_ID}",
};
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

                alert("✅ 配置已保存！\n\n注意：部分配置需重新部署后生效。");
                this.settingsEditing = false;

            } catch (e) {
                console.error("保存配置失败", e);
                alert("保存失败: " + e.message);
            } finally {
                this.settingsSaving = false;
            }
        }
    }
});
