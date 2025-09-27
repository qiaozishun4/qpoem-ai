document.getElementById('submit-btn').addEventListener('click', async function () {
    const questionInput = document.getElementById('question-input');
    const resultArea = document.getElementById('result-area');
    const submitBtn = document.getElementById('submit-btn');

    const question = questionInput.value.trim();
    if (!question) {
        displayAnswer('请输入问题');
        return;
    }

    // UI 状态
    submitBtn.disabled = true;
    const prevText = resultArea.innerText;
    displayAnswer('加载中...');

    try {
        const answer = await getAnswerFromAI(question);
        displayAnswer(answer);
    } catch (err) {
        console.error('获取答案失败:', err);
        displayAnswer('抱歉，获取答案失败：' + (err && err.message ? err.message : err));
    } finally {
        submitBtn.disabled = false;
    }
});

function getAnswerFromAI(question) {
    // 使用您提供的本地 Ollama 地址和模型名
    const ipAndPort = '51.15.221.201:11434';
    const modelName = 'llama3.2-vision:latest';
    const url = `http://${ipAndPort}/api/generate`;

    const payload = {
        model: modelName,
        prompt: question,
        // 可根据需要调整下面的参数
        // temperature: 0.2,
        // max_tokens: 1024,
    };

    return fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })
    .then(async response => {
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`请求失败，状态 ${response.status} ${response.statusText} ${text}`);
        }

        const contentType = (response.headers.get('content-type') || '').toLowerCase();

        // 如果返回是 JSON，则尽量从常见字段中提取内容
        if (contentType.includes('application/json')) {
            const data = await response.json();

            // 常见 Ollama / LLM 返回结构兼容处理（尝试多种可能的字段）
            const maybeAnswer =
                data.response ||
                data.text ||
                (data.choices && data.choices[0] && (data.choices[0].content || data.choices[0].message?.content)) ||
                (Array.isArray(data.output) && data.output.map(o => o.content || o.text || '').join('\n')) ||
                (typeof data === 'string' ? data : null);

            return maybeAnswer !== null ? maybeAnswer : JSON.stringify(data);
        } else {
            // 不是 JSON，尝试读取纯文本（部分服务会返回纯文本流）
            const text = await response.text();
            return text;
        }
    })
    .catch(err => {
        // 抛出错误到调用方以便 UI 显示
        throw err;
    });
}

function displayAnswer(answer) {
    document.getElementById('result-area').innerText = answer;
}
