import { CONFIG } from '../config.js';

export const Cloudflare = {
    // 基础 API 地址 (使用 CORS 代理绕过浏览器限制)
    API_BASE: 'https://corsproxy.io/?https://api.cloudflare.com/client/v4',

    /**
     * 获取 Zone ID (如果未配置，尝试自动获取)
     * 但必须有 Token。此处简化为直接从 Config 获取。
     */
    get zoneId() {
        return CONFIG.CF_ZONE_ID;
    },

    /**
     * 通用 Fetch 方法
     * @param {string} endpoint API 路径 (不含 Base)
     * @param {string} token 解密后的 CF Token
     * @param {object} options fetch 选项
     */
    async request(endpoint, token, options = {}) {
        if (!token) throw new Error("Missing Cloudflare Token");
        if (!this.zoneId) throw new Error("Missing Cloudflare Zone ID");

        const url = `${this.API_BASE}${endpoint}`;

        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        };

        const res = await fetch(url, { ...options, headers });
        const data = await res.json();

        if (!data.success) {
            const msg = data.errors?.[0]?.message || JSON.stringify(data.errors) || 'Unknown Cloudflare Error';
            throw new Error(msg);
        }

        return data.result;
    },

    // --- 1. 🧹 强制刷新 ---
    async purgeCache(token) {
        return this.request(`/zones/${this.zoneId}/purge_cache`, token, {
            method: 'POST',
            body: JSON.stringify({ purge_everything: true })
        });
    },

    // --- 2. 🚧 调试模式 ---
    async getDevMode(token) {
        return this.request(`/zones/${this.zoneId}/settings/development_mode`, token);
    },

    async setDevMode(token, value) {
        // value: "on" or "off"
        return this.request(`/zones/${this.zoneId}/settings/development_mode`, token, {
            method: 'PATCH',
            body: JSON.stringify({ value })
        });
    },

    // --- 3. 🛡️ 紧急防御 (Under Attack) ---
    async getSecurityLevel(token) {
        return this.request(`/zones/${this.zoneId}/settings/security_level`, token);
    },

    async setSecurityLevel(token, value) {
        // value: "under_attack" (开启), "medium" (关闭/默认)
        return this.request(`/zones/${this.zoneId}/settings/security_level`, token, {
            method: 'PATCH',
            body: JSON.stringify({ value })
        });
    },

    // --- 4. 🖼️ 防盗链护盾 (Scrape Shield) ---
    async getHotlinkProtection(token) {
        return this.request(`/zones/${this.zoneId}/settings/hotlink_protection`, token);
    },

    async setHotlinkProtection(token, value) {
        // value: "on" | "off"
        return this.request(`/zones/${this.zoneId}/settings/hotlink_protection`, token, {
            method: 'PATCH',
            body: JSON.stringify({ value })
        });
    },

    // --- 5. 🗺️ DNS 管理 (Portal Phase 1) ---
    async getDNSRecords(token, name) {
        // name: e.g. "tv.lingshichat.top"
        let url = `/zones/${this.zoneId}/dns_records?type=A`;
        if (name) url += `&name=${encodeURIComponent(name)}`;
        return this.request(url, token);
    },

    async createDNSRecord(token, name, content = "192.0.2.1") {
        return this.request(`/zones/${this.zoneId}/dns_records`, token, {
            method: 'POST',
            body: JSON.stringify({
                type: 'A',
                name: name,
                content: content,
                ttl: 1, // Auto
                proxied: true // 必须开启代理，Redirect Rules 才能生效
            })
        });
    },

    async deleteDNSRecord(token, recordId) {
        return this.request(`/zones/${this.zoneId}/dns_records/${recordId}`, token, {
            method: 'DELETE'
        });
    },

    // --- 6. 🔀 重定向规则 (Portal Phase 2 - Single Redirect) ---
    // 文档: https://developers.cloudflare.com/ruleset-engine/rulesets-api/

    // 获取入口规则集 (Entry Point Ruleset)
    async getZoneRulesets(token) {
        return this.request(`/zones/${this.zoneId}/rulesets`, token);
    },

    // 获取或创建用于 "Single Redirect" 的规则集
    async getRedirectRulesetId(token) {
        const rulesets = await this.getZoneRulesets(token);
        // 查找 phase = "http_request_dynamic_redirect" 且 kind = "zone"
        const found = rulesets.find(r => r.phase === 'http_request_dynamic_redirect' && r.kind === 'zone');
        if (found) return found.id;

        // 如果不存在，需要创建 (通常控制台创建过一次就会有，但API也能建)
        // 为安全起见，我们假设用户如果在控制台都没开过，可能需要先引导。
        // 但通常 createRule 时如果是第一次，Cloudflare 会自动处理规则集？不，API 需要指定 ruleset_id。
        // 尝试新建一个规则集
        const newSet = await this.request(`/zones/${this.zoneId}/rulesets`, token, {
            method: 'POST',
            body: JSON.stringify({
                kind: 'zone',
                name: 'Default Zone Redirects',
                phase: 'http_request_dynamic_redirect'
            })
        });
        return newSet.id;
    },

    async getRedirectRules(token) {
        // Remove try-catch to allow UI to handle specific API errors
        // If the ruleset doesn't exist, getRedirectRulesetId might throw or create it.
        const rulesetId = await this.getRedirectRulesetId(token);
        const res = await this.request(`/zones/${this.zoneId}/rulesets/${rulesetId}`, token);
        return res.rules || [];
    },

    async createRedirectRule(token, name, targetUrl) {
        const rulesetId = await this.getRedirectRulesetId(token);

        // 构造规则对象
        // 这里的 name 是规则名，expression 是匹配条件
        const domain = `${name}.lingshichat.top`; // 假设都在主域下

        const rulePayload = {
            description: `Portal: ${name} -> ${targetUrl}`,
            expression: `(http.host eq "${domain}")`,
            action: "redirect",
            action_parameters: {
                from_value: {
                    status_code: 302, // 临时重定向，方便随时改
                    target_url: {
                        value: targetUrl
                    },
                    preserve_query_string: true
                }
            },
            enabled: true
        };

        return this.request(`/zones/${this.zoneId}/rulesets/${rulesetId}/rules`, token, {
            method: 'POST',
            body: JSON.stringify(rulePayload)
        });
    },

    async updateRedirectRule(token, ruleId, { prefix, target }) {
        const rulesetId = await this.getRedirectRulesetId(token);
        const domain = `${prefix}.lingshichat.top`;

        const rulePayload = {
            description: `Portal: ${prefix} -> ${target}`,
            expression: `(http.host eq "${domain}")`,
            action: "redirect",
            action_parameters: {
                from_value: {
                    status_code: 302,
                    target_url: {
                        value: target
                    },
                    preserve_query_string: true
                }
            },
            enabled: true
        };

        return this.request(`/zones/${this.zoneId}/rulesets/${rulesetId}/rules/${ruleId}`, token, {
            method: 'PATCH',
            body: JSON.stringify(rulePayload)
        });
    },

    async deleteRedirectRule(token, ruleId) {
        const rulesetId = await this.getRedirectRulesetId(token);
        return this.request(`/zones/${this.zoneId}/rulesets/${rulesetId}/rules/${ruleId}`, token, {
            method: 'DELETE'
        });
    },

    // --- 调试工具 ---
    async getZones(token) {
        // 不依赖 CONFIG.CF_ZONE_ID
        const url = `${this.API_BASE}/zones`;
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
        const res = await fetch(url, { headers });
        const data = await res.json();
        if (!data.success) {
            const msg = data.errors?.[0]?.message || JSON.stringify(data.errors) || 'Unknown Cloudflare Error';
            throw new Error(msg);
        }
        return data.result;
    },

    async verifyToken(token) {
        const url = `${this.API_BASE}/user/tokens/verify`;
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
        const res = await fetch(url, { headers });
        const data = await res.json();
        return data.result; // should have status: "active"
    },

    // --- Helper: Get Account ID ---
    async getAccountId(token) {
        if (!token) throw new Error("Missing Token");
        // 获取 Zone 详情，其中包含 Account ID
        const data = await this.request(`/zones/${this.zoneId}`, token);
        return data.account.id;
    },

    // --- Phase 4: 🔗 短链 (Workers KV) ---

    // 1. 获取/创建 Namespace
    async listNamespaces(token, accountId) {
        // GET accounts/:account_identifier/storage/kv/namespaces
        const url = `/accounts/${accountId}/storage/kv/namespaces`;
        return this.request(url, token);
    },

    async createNamespace(token, accountId, title) {
        const url = `/accounts/${accountId}/storage/kv/namespaces`;
        return this.request(url, token, {
            method: 'POST',
            body: JSON.stringify({ title })
        });
    },

    // 2. Key 操作
    async listKVKeys(token, accountId, namespaceId, prefix = '') {
        // GET accounts/:account_identifier/storage/kv/namespaces/:namespace_identifier/keys
        let url = `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/keys?limit=1000`;
        if (prefix) url += `&prefix=${encodeURIComponent(prefix)}`;
        return this.request(url, token);
    },

    async getKV(token, accountId, namespaceId, key) {
        const url = `${this.API_BASE}/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${key}`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return null;
        return res.text();
    },

    // 3. Value 操作 (注意：Value API 返回非 JSON 结构，需特殊处理)
    async putKV(token, accountId, namespaceId, key, value, metadata = {}) {
        // PUT accounts/:account_identifier/storage/kv/namespaces/:namespace_identifier/values/:key_name
        // 注意：这是写入，需要用 fetch 原生处理，因为 API_BASE 可能是 proxy
        const url = `${this.API_BASE}/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${key}`;
        // Header 中可能需要 metadata
        // Cloudflare KV metadata is passed via multipart or distinct header? 
        // 简单 KV 写入直接 body 放 value。Metadata 较复杂，暂时只存 value (target url).

        const res = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: value
        });

        const data = await res.json();
        if (!data.success) {
            const msg = data.errors?.[0]?.message || 'KV Put Failed';
            throw new Error(msg);
        }
        return data.result;
    },

    async deleteKV(token, accountId, namespaceId, key) {
        const url = `/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${key}`;
        return this.request(url, token, { method: 'DELETE' });
    },

    // --- Phase 5: 📈 状态监控 (GraphQL Analytics API) ---
    async getZoneAnalytics(token) {
        // 使用 GraphQL API 获取过去 24 小时的统计
        // 旧的 /analytics/dashboard 已被弃用
        const now = new Date();
        const since = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

        const query = `
            query ZoneAnalytics($zoneTag: String!, $since: Time!, $until: Time!) {
                viewer {
                    zones(filter: {zoneTag: $zoneTag}) {
                        httpRequests1dGroups(limit: 1, filter: {date_geq: $since, date_leq: $until}) {
                            sum {
                                requests
                                bytes
                                threats
                                pageViews
                            }
                            uniq {
                                uniques
                            }
                        }
                    }
                }
            }
        `;

        const variables = {
            zoneTag: this.zoneId,
            since: since.toISOString().split('T')[0],
            until: now.toISOString().split('T')[0]
        };

        const url = `${this.API_BASE}/graphql`;

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query, variables })
        });

        const data = await res.json();

        if (data.errors && data.errors.length > 0) {
            throw new Error(data.errors[0].message || 'GraphQL Error');
        }

        // 解析 GraphQL 响应并转换为原始格式
        const zones = data.data?.viewer?.zones || [];
        if (zones.length === 0 || !zones[0].httpRequests1dGroups || zones[0].httpRequests1dGroups.length === 0) {
            // 返回默认值结构
            return {
                totals: {
                    requests: { all: 0 },
                    bandwidth: { all: 0 },
                    threats: { all: 0 },
                    pageviews: { all: 0 },
                    uniques: { all: 0 }
                }
            };
        }

        const group = zones[0].httpRequests1dGroups[0];

        return {
            totals: {
                requests: { all: group.sum.requests || 0 },
                bandwidth: { all: group.sum.bytes || 0 },
                threats: { all: group.sum.threats || 0 },
                pageviews: { all: group.sum.pageViews || 0 },
                uniques: { all: group.uniq.uniques || 0 }
            }
        };
    }
};
