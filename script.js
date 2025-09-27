// script.js - 与本地 Ollama (http://51.15.221.201:11434) 交互的前端逻辑
// 模型：llama3.2-vision:latest
// 说明：不包含任何 API Key。浏览器直接请求可能遇到 CORS，请优先考虑后端代理。

document.addEventListener('DOMContentLoaded', () => {
    const submitBtn = document.getElementById('submit-btn');
    const questionInput = document.getElementById('question-input');
    const resultArea = document.getElementById('result-area');

    submitBtn.addEventListener('click', async () => {
        const question = questionInput.value.trim();
        if (!question) {
            displayAnswer('请输入问题');
            return;
        }

        submitBtn.disabled = true;
        const prev = resultArea.innerText;
        displayAnswer('加载中...');

        try {
            const answer = await getAnswerFromAI(question, { stream: false });
            displayAnswer(answer);
        } catch (err) {
            console.error('获取答案失败:', err);
            displayAnswer('抱歉，获取答案失败：' + (err && err.message ? err.message : err));
        } finally {
            submitBtn.disabled = false;
        }
    });
});

/**
 * 调用本地 Ollama 服务获取答案（非流式，默认）
 * @param {string} question - 用户问题
 * @param {{stream?: boolean}} options - 可选，是否流式
 * @returns {Promise<string>} - 返回提取后的文本答案
 */
async function getAnswerFromAI(question, options = { stream: false }) {
    const ipAndPort = '51.15.221.201:11434';
    const modelName = 'llama3.2:latest';
    const url = `http://${ipAndPort}/api/generate`;

    // 尝试使用 OpenAI-like 的 messages 格式，同时也保留 prompt 兼容字段
    const payload = {
        model: modelName,
        stream: !!options.stream,
        messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: question }
        ],
        // 根据需要可打开/调整下面参数
        // temperature: 0.2,
        // max_tokens: 1024,
    };

    // 非流式请求
    if (!payload.stream) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            // 注意：浏览器端可能触发 CORS；生产环境建议走后端代理
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`请求失败 ${res.status} ${res.statusText} ${text}`);
        }

        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('application/json')) {
            const data = await res.json();
            // 尝试从多种常见字段提取回答
            const maybeAnswer =
                data.response ||
                data.text ||
                (data.choices && data.choices[0] && (data.choices[0].text || data.choices[0].message?.content)) ||
                (Array.isArray(data.output) && data.output.map(o => o.content || o.text || '').join('\n')) ||
                (typeof data === 'string' ? data : null);

            return maybeAnswer !== null ? maybeAnswer : JSON.stringify(data);
        } else {
            // 非 JSON，直接返回文本
            return await res.text();
        }
    }

    // 如果需要流式返回（stream: true），尝试以通用方式读取并拼接文本块
    // 注意：不同服务器流格式不同，可能是 SSE（"data: {...}"）或纯 JSON chunk 等，
    // 下面是一个通用且宽容的实现，可以按实际返回格式调整。
    const streamRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!streamRes.ok) {
        const text = await streamRes.text().catch(() => '');
        throw new Error(`请求失败 ${streamRes.status} ${streamRes.statusText} ${text}`);
    }

    if (!streamRes.body) {
        // 无 body，退回到非流式解析
        const txt = await streamRes.text();
        return txt;
    }

    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let done = false;
    let buffer = '';
    let collected = '';

    while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
            buffer += decoder.decode(value, { stream: true });

            // 常见分割策略：按行处理 SSE 风格或 chunk 风格
            const parts = buffer.split(/\r?\n/);
            buffer = parts.pop(); // 留下未完整的一段

            for (const line of parts) {
                const trimmed = line.trim();
                if (trimmed === '' || trimmed === 'data: [DONE]') continue;

                // 去掉可能的 "data:" 前缀
                const withoutPrefix = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;

                // 尝试解析 JSON；若失败则当作纯文本片段
                try {
                    const parsed = JSON.parse(withoutPrefix);
                    const chunkText =
                        parsed.delta?.content ||
                        parsed.choices?.[0]?.delta?.content ||
                        parsed.text ||
                        parsed.content ||
                        parsed.response ||
                        '';
                    if (chunkText) {
                        collected += chunkText;
                    }
                } catch (e) {
                    // 不是 JSON，直接拼接
                    collected += withoutPrefix;
                }
            }
        }
    }

    // 处理剩余 buffer
    if (buffer && buffer.trim()) {
        const last = buffer.trim();
        try {
            const parsed = JSON.parse(last);
            const finalText =
                parsed.delta?.content ||
                parsed.choices?.[0]?.delta?.content ||
                parsed.text ||
                parsed.content ||
                parsed.response ||
                '';
            collected += finalText || last;
        } catch {
            collected += last;
        }
    }

    return collected;
}

/**
 * 在页面上展示答案
 * @param {string} answer
 */
function displayAnswer(answer) {
    const el = document.getElementById('result-area');
    if (!el) return;
    el.innerText = answer;
}
