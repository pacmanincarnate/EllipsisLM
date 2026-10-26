/**
 * Mock KoboldCPP Backend Server
 * 
 * High-fidelity, zero-dependency mock for KoboldCPP's HTTP API.
 * Emulates:
 *   - GET  /api/v1/model
 *   - POST /api/v1/generate
 *   - POST /v1/chat/completions
 *   - GET  /api/extra/generate/check
 *   - POST /api/extra/abort
 * 
 * Supports fault-injection / chaos testing (e.g. failing chat completions
 * to verify fallback to /api/v1/generate, out-of-memory errors, streaming polling).
 */

const http = require('http');

class MockKoboldServer {
    constructor(options = {}) {
        this.port = options.port || 5001;
        this.modelName = options.modelName || 'TheDrummer_Orion-26B-A4B-v1.1-Q4_K_M.gguf';
        this.server = null;
        this.lastRequest = null;
        this.chaos = {
            errorOnChatCompletions: false,
            simulateOOM: false,
            delayMs: 0
        };
        this.customResponse = null;
        this.activeStream = null;
        this.lastCompletedText = '';
    }

    start() {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => this.handleRequest(req, res));
            this.server.listen(this.port, '127.0.0.1', () => {
                console.log(`[MockKoboldServer] Running at http://127.0.0.1:${this.port}`);
                resolve(this.port);
            });
            this.server.on('error', reject);
        });
    }

    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    this.server = null;
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    setChaos(chaosOpts = {}) {
        this.chaos = { ...this.chaos, ...chaosOpts };
    }

    setNextResponse(response) {
        this.customResponse = response;
    }

    reset() {
        this.lastRequest = null;
        this.customResponse = null;
        this.activeStream = null;
        this.lastCompletedText = '';
        this.chaos = {
            errorOnChatCompletions: false,
            simulateOOM: false,
            delayMs: 0
        };
    }

    async handleRequest(req, res) {
        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const url = new URL(req.url, `http://${req.headers.host}`);
        const pathname = url.pathname;

        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            let parsedBody = null;
            if (body) {
                try {
                    parsedBody = JSON.parse(body);
                } catch (e) {
                    parsedBody = body;
                }
            }

            this.lastRequest = {
                method: req.method,
                pathname,
                headers: req.headers,
                body: parsedBody
            };

            if (this.chaos.delayMs > 0) {
                await new Promise(r => setTimeout(r, this.chaos.delayMs));
            }

            // Route dispatch
            if (pathname === '/api/v1/model' && req.method === 'GET') {
                return this.handleModel(res);
            }
            if (pathname === '/v1/models' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ object: 'list', data: [{ id: this.modelName, object: 'model' }] }));
                return;
            }
            if (pathname === '/api/v1/generate' && req.method === 'POST') {
                return this.handleGenerate(parsedBody, res);
            }
            if (pathname === '/v1/chat/completions' && req.method === 'POST') {
                return this.handleChatCompletions(parsedBody, res);
            }
            if (pathname === '/api/extra/generate/check' && req.method === 'GET') {
                return this.handleGenerateCheck(res);
            }
            if (pathname === '/api/extra/abort' && req.method === 'POST') {
                return this.handleAbort(res);
            }

            // Test control routes
            if (pathname === '/__mock/reset' && req.method === 'POST') {
                this.reset();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
                return;
            }
            if (pathname === '/__mock/last_request' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(this.lastRequest));
                return;
            }

            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Not found: ${pathname}` }));
        });
    }

    handleModel(res) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ result: this.modelName }));
    }

    handleGenerate(body, res) {
        if (this.chaos.simulateOOM) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'CUDA error: out of memory' } }));
            return;
        }

        const promptText = (body && typeof body.prompt === 'string') ? body.prompt : '';
        const stopSequences = (body && Array.isArray(body.stop_sequence)) ? body.stop_sequence : [];

        let outputText = 'This is a simulated response from KoboldCPP.';
        if (this.customResponse) {
            if (typeof this.customResponse === 'string') {
                outputText = this.customResponse;
            } else {
                const thinking = this.customResponse.thinking ? `<think>${this.customResponse.thinking}</think>` : '';
                outputText = thinking + (this.customResponse.text || '');
            }
            this.customResponse = null;
        } else if (promptText.includes('JSON')) {
            outputText = '```json\n{"status": "ok", "message": "Structured output from local model"}\n```';
        } else {
            outputText = `*The character pauses, considering the situation.* "Indeed," they replied softly.`;
        }

        // Initialize streaming state if this endpoint is being used for polling check
        this.activeStream = {
            fullText: outputText,
            currentIdx: 0,
            chunks: this.splitIntoChunks(outputText, 4),
            chunkIdx: 0,
            stopSequences,
            aborted: false
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            results: [{ text: outputText }]
        }));
    }

    handleChatCompletions(body, res) {
        if (this.chaos.simulateOOM) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'CUDA error: out of memory' } }));
            return;
        }
        if (this.chaos.errorOnChatCompletions) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Endpoint /v1/chat/completions not supported on this Kobold build' } }));
            return;
        }

        let content = 'Simulated Jinja response from KoboldCPP.';
        let reasoning = '';

        if (this.customResponse) {
            if (typeof this.customResponse === 'string') {
                content = this.customResponse;
            } else {
                content = this.customResponse.text || content;
                reasoning = this.customResponse.thinking || '';
            }
            this.customResponse = null;
        } else {
            reasoning = 'Analyzing local context and user dialogue turn.';
            content = '*Looking across the room, the speaker nods.* "All local systems are operating as expected."';
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            id: 'chatcmpl-mock-kobold',
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: 'koboldcpp',
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content,
                    reasoning_content: reasoning
                },
                finish_reason: 'stop'
            }],
            usage: {
                prompt_tokens: 32,
                completion_tokens: 18,
                total_tokens: 50
            }
        }));
    }

    handleGenerateCheck(res) {
        if (!this.activeStream) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ done: true, results: [{ text: this.lastCompletedText || '' }] }));
            return;
        }

        if (this.activeStream.aborted) {
            this.lastCompletedText = this.activeStream.currentText || '';
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ done: true, results: [{ text: this.lastCompletedText }] }));
            this.activeStream = null;
            return;
        }

        // Deliver next chunk
        this.activeStream.chunkIdx++;
        const currentChunks = this.activeStream.chunks.slice(0, this.activeStream.chunkIdx);
        let textSoFar = currentChunks.join('');
        this.activeStream.currentText = textSoFar;

        const isDone = this.activeStream.chunkIdx >= this.activeStream.chunks.length;
        if (isDone) {
            this.lastCompletedText = textSoFar;
            this.activeStream = null;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            done: isDone,
            results: [{ text: textSoFar }]
        }));
    }

    handleAbort(res) {
        if (this.activeStream) {
            this.activeStream.aborted = true;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
    }

    splitIntoChunks(str, numChunks = 4) {
        if (!str) return [''];
        const chunkSize = Math.max(1, Math.ceil(str.length / numChunks));
        const chunks = [];
        for (let i = 0; i < str.length; i += chunkSize) {
            chunks.push(str.slice(i, i + chunkSize));
        }
        return chunks;
    }
}

// Allow CLI execution: `node tools/mock-kobold-server.js --port 5001`
if (require.main === module) {
    const args = process.argv.slice(2);
    let port = 5001;
    const portIdx = args.indexOf('--port');
    if (portIdx !== -1 && args[portIdx + 1]) {
        port = parseInt(args[portIdx + 1], 10) || 5001;
    }

    const server = new MockKoboldServer({ port });
    server.start().then(() => {
        console.log(`Mock KoboldCPP listening on http://127.0.0.1:${port}`);
    }).catch(err => {
        console.error('Failed to start mock server:', err);
        process.exit(1);
    });

    process.on('SIGINT', () => {
        server.stop().then(() => process.exit(0));
    });
}

module.exports = MockKoboldServer;
