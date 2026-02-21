import { CONFIG } from './config.js';

/**
 * 缤纷云 S3 图床服务
 * 兼容 AWS S3 API
 */
export class S3Service {
    constructor() {
        this.config = CONFIG.S3_CONFIG;
        this.baseUrl = `${this.config.endpoint}/${this.config.bucket}`;
        // 如果配置了 publicUrl，使用配置的；否则使用标准 S3 URL 格式
        // 缤纷云格式: https://bucket.s3.bitiful.net
        this.publicBaseUrl = this.config.publicUrl || `https://${this.config.bucket}.s3.bitiful.net`;
    }

    /**
     * 生成 S3 兼容的签名
     * 使用 AWS Signature Version 4
     */
    async getSignatureKey(key, dateStamp, regionName, serviceName) {
        const encoder = new TextEncoder();
        
        const hmac = async (key, data) => {
            const cryptoKey = await crypto.subtle.importKey(
                'raw',
                typeof key === 'string' ? encoder.encode(key) : key,
                { name: 'HMAC', hash: 'SHA-256' },
                false,
                ['sign']
            );
            const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
            return signature;
        };

        const kDate = await hmac('AWS4' + key, dateStamp);
        const kRegion = await hmac(kDate, regionName);
        const kService = await hmac(kRegion, serviceName);
        const kSigning = await hmac(kService, 'aws4_request');
        return kSigning;
    }

    /**
     * 生成请求签名
     */
    async signRequest(method, path, headers = {}, body = '', queryString = '', precomputedBodyHash = null) {
        const now = new Date();
        const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
        const amzDate = now.toISOString().slice(0, 19).replace(/[-:]/g, '') + 'Z';
        
        const credential = `${this.config.accessKeyId}/${dateStamp}/${this.config.region}/s3/aws4_request`;
        
        // 计算 body 的 hash
        let bodyHash;
        if (precomputedBodyHash) {
            bodyHash = precomputedBodyHash;
        } else if (body instanceof ArrayBuffer) {
            bodyHash = await this.sha256ArrayBuffer(body);
        } else if (body) {
            bodyHash = await this.sha256(body);
        } else {
            bodyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
        }
        
        // 构建签名头部列表
        const signedHeadersList = ['host', 'x-amz-content-sha256', 'x-amz-date'];
        
        // 如果有 Content-Type，也需要包含在签名中
        if (headers['Content-Type']) {
            signedHeadersList.push('content-type');
        }
        
        signedHeadersList.sort(); // 按字母顺序排序
        
        const sortedHeaders = {};
        
        for (const key of signedHeadersList) {
            if (key === 'host') {
                // 缤纷云 S3 的 host 格式: bucket.s3.bitiful.net (不包含 region)
                sortedHeaders[key] = `${this.config.bucket}.s3.bitiful.net`;
            } else if (key === 'x-amz-content-sha256') {
                sortedHeaders[key] = bodyHash;
            } else if (key === 'x-amz-date') {
                sortedHeaders[key] = amzDate;
            } else if (key === 'content-type' && headers['Content-Type']) {
                sortedHeaders[key] = headers['Content-Type'];
            }
        }

        // 规范化请求
        const canonicalUri = path || '/';
        const canonicalQueryString = queryString;
        const canonicalHeaders = Object.entries(sortedHeaders)
            .map(([k, v]) => `${k}:${v}\n`)
            .join('');
        const canonicalSignedHeaders = signedHeadersList.join(';');
        
        const canonicalRequest = [
            method,
            canonicalUri,
            canonicalQueryString,
            canonicalHeaders,
            canonicalSignedHeaders,
            bodyHash
        ].join('\n');

        // 创建待签名字符串
        const algorithm = 'AWS4-HMAC-SHA256';
        const canonicalRequestHash = await this.sha256(canonicalRequest);
        const stringToSign = [
            algorithm,
            amzDate,
            `${dateStamp}/${this.config.region}/s3/aws4_request`,
            canonicalRequestHash
        ].join('\n');

        // 计算签名
        const signingKey = await this.getSignatureKey(
            this.config.secretAccessKey,
            dateStamp,
            this.config.region,
            's3'
        );
        
        const encoder = new TextEncoder();
        const signatureBuffer = await crypto.subtle.sign(
            'HMAC',
            await crypto.subtle.importKey('raw', signingKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
            encoder.encode(stringToSign)
        );
        const signature = Array.from(new Uint8Array(signatureBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        const authorizationHeader = `${algorithm} Credential=${credential}, SignedHeaders=${canonicalSignedHeaders}, Signature=${signature}`;

        return {
            authorization: authorizationHeader,
            amzDate,
            payloadHash: bodyHash,
            signedHeaders: sortedHeaders
        };
    }

    /**
     * 计算 SHA256 哈希
     */
    async sha256(message) {
        const encoder = new TextEncoder();
        const data = encoder.encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * 计算 ArrayBuffer 的 SHA256 哈希
     */
    async sha256ArrayBuffer(arrayBuffer) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * 获取存储桶中的图片列表
     */
    async listImages(maxKeys = 100) {
        // 如果未配置 S3，返回空数组
        if (!this.config.accessKeyId || !this.config.secretAccessKey) {
            console.warn('S3 未配置，请检查 config.js 中的 S3_CONFIG');
            return [];
        }

        console.log('S3 Config:', {
            endpoint: this.config.endpoint,
            bucket: this.config.bucket,
            region: this.config.region,
            hasAccessKey: !!this.config.accessKeyId,
            hasSecretKey: !!this.config.secretAccessKey
        });

        try {
            // 查询整个存储桶，不过滤前缀，这样可以看到所有图片
            const queryString = `list-type=2&max-keys=${maxKeys}`;
            const signature = await this.signRequest('GET', '/', {}, '', queryString);

            // 缤纷云 S3 的 host 格式: bucket.s3.bitiful.net (不包含 region)
            const host = `${this.config.bucket}.s3.bitiful.net`;
            const url = `https://${host}/?${queryString}`;

            console.log('Request URL:', url);
            console.log('Request Headers:', {
                'Authorization': signature.authorization.substring(0, 50) + '...',
                'x-amz-date': signature.amzDate,
                'x-amz-content-sha256': signature.payloadHash,
                'Host': host
            });

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': signature.authorization,
                    'x-amz-date': signature.amzDate,
                    'x-amz-content-sha256': signature.payloadHash,
                    'Host': host
                }
            });

            console.log('Response status:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('S3 Error Response:', errorText);
                throw new Error(`列出图片失败: ${response.status} ${response.statusText}`);
            }

            const xmlText = await response.text();
            return this.parseListObjectsResponse(xmlText);
        } catch (error) {
            console.error('列出图片失败:', error);
            throw error;
        }
    }

    /**
     * 解析 ListObjectsV2 响应
     */
    parseListObjectsResponse(xmlText) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        const contents = xmlDoc.getElementsByTagName('Contents');
        
        const images = [];
        for (let i = 0; i < contents.length; i++) {
            const content = contents[i];
            const key = content.getElementsByTagName('Key')[0]?.textContent;
            const size = content.getElementsByTagName('Size')[0]?.textContent;
            const lastModified = content.getElementsByTagName('LastModified')[0]?.textContent;
            
            if (key && this.isImageFile(key)) {
                const baseUrl = `${this.publicBaseUrl}/${key}`;
                // 使用缤纷云 CoreIX 图片处理生成缩略图
                // 200x200, cover 模式, 质量 80%, webp 格式
                const thumbnailUrl = `${baseUrl}?w=200&h=200&fit=cover&q=80&f=webp`;
                
                images.push({
                    key,
                    size: parseInt(size, 10),
                    lastModified,
                    url: baseUrl,
                    thumbnailUrl: thumbnailUrl,
                    name: key.split('/').pop()
                });
            }
        }

        // 按修改时间倒序排列
        return images.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    }

    /**
     * 检查文件是否为图片
     */
    isImageFile(filename) {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
        const lowerName = filename.toLowerCase();
        return imageExtensions.some(ext => lowerName.endsWith(ext));
    }

    /**
     * 上传文件到 S3
     */
    async uploadFile(file, onProgress = null) {
        // 如果未配置 S3，抛出错误
        if (!this.config.accessKeyId || !this.config.secretAccessKey) {
            throw new Error('S3 未配置，请检查 config.js 中的 S3_CONFIG');
        }

        const key = `${Date.now()}_${file.name}`;
        const arrayBuffer = await file.arrayBuffer();
        
        // 获取文件类型
        const contentType = file.type || 'application/octet-stream';
        
        try {
            // 计算 body hash 用于签名
            const bodyHash = await this.sha256ArrayBuffer(arrayBuffer);
            
            const signature = await this.signRequest('PUT', `/${key}`, {
                'Content-Type': contentType
            }, arrayBuffer, '', bodyHash);

            // 缤纷云 S3 的 host 格式: bucket.s3.bitiful.net (不包含 region)
            const host = `${this.config.bucket}.s3.bitiful.net`;
            const url = `https://${host}/${key}`;

            // 使用 XMLHttpRequest 以支持进度回调
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                
                if (onProgress) {
                    xhr.upload.addEventListener('progress', (e) => {
                        if (e.lengthComputable) {
                            const progress = Math.round((e.loaded / e.total) * 100);
                            onProgress(progress);
                        }
                    });
                }

                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve({
                            key,
                            url: `${this.publicBaseUrl}/${key}`,
                            name: file.name,
                            size: file.size
                        });
                    } else {
                        console.error('上传失败:', xhr.status, xhr.statusText, xhr.responseText);
                        reject(new Error(`上传失败: ${xhr.status} ${xhr.statusText}`));
                    }
                });

                xhr.addEventListener('error', (e) => {
                    console.error('网络错误:', e);
                    reject(new Error('上传过程中发生网络错误'));
                });

                xhr.open('PUT', url);
                xhr.setRequestHeader('Authorization', signature.authorization);
                xhr.setRequestHeader('x-amz-date', signature.amzDate);
                xhr.setRequestHeader('x-amz-content-sha256', signature.payloadHash);
                xhr.setRequestHeader('Content-Type', contentType);
                xhr.setRequestHeader('Host', host);
                xhr.send(arrayBuffer);
            });
        } catch (error) {
            console.error('上传失败:', error);
            throw error;
        }
    }

    /**
     * 获取图片的公开访问 URL
     */
    getImageUrl(key) {
        return `${this.publicBaseUrl}/${key}`;
    }

    /**
     * 格式化文件大小
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// 创建单例实例
export const s3Service = new S3Service();
