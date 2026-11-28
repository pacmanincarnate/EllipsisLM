/**
 * E2E test for the Custom (OpenAI-compatible) provider.
 *
 * Drives the real APIService against a mock server that speaks the OpenAI
 * /v1/models and /v1/chat/completions contract, then verifies:
 *   - a bare URL is normalised to /v1/chat/completions,
 *   - SSE content and reasoning are parsed,
 *   - the Authorization header appears only when a key is set,
 *   - testConnection and fetchCustomModels work,
 *   - the explicit vision checkbox controls whether images are attached.
 */

const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..');

let lastRequest = null;
let lastModelsRequest = null;
let modelsHitCount = 0;

function startMockServer() {
    const server = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.method === 'GET' && req.url.startsWith('/v1/models')) {
            lastModelsRequest = { url: req.url, headers: req.headers };
            modelsHitCount++;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                object: 'list',
                data: [{ id: 'test-model' }, { id: 'other-model' }]
            }));
            return;
        }

        if (req.method === 'POST' && req.url.startsWith('/v1/chat/completions')) {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                let parsed = null;
                try { parsed = JSON.parse(body); } catch (e) { }
                lastRequest = { url: req.url, headers: req.headers, body: parsed };

                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                });
                res.write('data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: 'thinking ' } }] }) + '\n\n');
                res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: 'Hello ' } }] }) + '\n\n');
                res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: 'custom.' } }] }) + '\n\n');
                res.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + '\n\n');
                res.write('data: [DONE]\n\n');
                res.end();
            });
            return;
        }

        res.writeHead(404);
        res.end();
    });

    return new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => {
            resolve({ server, url: `http://127.0.0.1:${server.address().port}` });
        });
    });
}

(async () => {
    let browser = null;
    let server = null;
    let passed = 0;
    let failed = 0;

    const check = (name, condition, detail) => {
        if (condition) {
            console.log(`  ✓ PASS: ${name}`);
            passed++;
        } else {
            console.error(`  ✗ FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
            failed++;
        }
    };

    try {
        const mock = await startMockServer();
        server = mock.server;
        const mockUrl = mock.url;
        console.log(`[Custom Provider E2E] Mock server listening on ${mockUrl}`);

        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.addInitScript(() => localStorage.setItem('onboarding_dismissed', 'true'));
        await page.goto('file://' + path.join(REPO_ROOT, 'index.html'));
        await page.waitForTimeout(4000);
        await page.reload();
        await page.waitForTimeout(3000);

        const configure = (patch) => page.evaluate((values) => {
            Object.assign(ReactiveStore.state, values);
        }, patch);

        const runCallAI = () => page.evaluate(async () => {
            try {
                const text = await APIService.callAI('hello', false, null, true);
                return { ok: true, text };
            } catch (e) {
                return { ok: false, message: e.message };
            }
        });

        // 1. Bare URL is normalised and streamed content is parsed.
        lastRequest = null;
        await configure({
            apiProvider: 'custom',
            customApiUrl: mockUrl,
            customApiKey: '',
            customModel: 'test-model',
            customMaxTokens: 4096,
            customSupportsVision: false
        });
        const first = await runCallAI();
        check('callAI returns the streamed custom response', first.ok && first.text === 'Hello custom.', JSON.stringify(first));
        check('bare URL is normalised to /v1/chat/completions', lastRequest && lastRequest.url === '/v1/chat/completions', lastRequest && lastRequest.url);
        check('request uses the configured model', lastRequest && lastRequest.body && lastRequest.body.model === 'test-model', lastRequest && lastRequest.body && lastRequest.body.model);
        check('request asks for a stream', lastRequest && lastRequest.body && lastRequest.body.stream === true);
        check('request uses the configured max tokens', lastRequest && lastRequest.body && lastRequest.body.max_tokens === 4096, lastRequest && lastRequest.body && lastRequest.body.max_tokens);
        check('no Authorization header without a key', lastRequest && !lastRequest.headers.authorization);

        // 2. A key adds the Bearer header.
        lastRequest = null;
        await configure({ customApiKey: 'secret-key' });
        await runCallAI();
        check('keyed request sends Authorization: Bearer', lastRequest && lastRequest.headers.authorization === 'Bearer secret-key', lastRequest && lastRequest.headers.authorization);

        // 3. A full endpoint URL is accepted unchanged.
        lastRequest = null;
        await configure({ customApiUrl: `${mockUrl}/v1/chat/completions`, customApiKey: '' });
        await runCallAI();
        check('full chat-completions URL is accepted', lastRequest && lastRequest.url === '/v1/chat/completions', lastRequest && lastRequest.url);

        // 4. Connection probe and model listing.
        const connected = await page.evaluate((url) =>
            APIService.testConnection('custom', { customApiUrl: url, customApiKey: '' }), mockUrl);
        check('testConnection reports the endpoint online', connected === true);

        const models = await page.evaluate((url) =>
            APIService.fetchCustomModels(url, ''), mockUrl);
        check('fetchCustomModels returns model IDs',
            Array.isArray(models) && models.includes('test-model') && models.includes('other-model'),
            JSON.stringify(models));
        check('models probe hits /v1/models', lastModelsRequest && lastModelsRequest.url === '/v1/models', lastModelsRequest && lastModelsRequest.url);

        // 5. Vision is opt-in: off means no image parts, on means image_url parts.
        const callWithImage = (vision) => page.evaluate(async ({ url, supportsVision }) => {
            Object.assign(ReactiveStore.state, {
                apiProvider: 'custom',
                customApiUrl: url,
                customApiKey: '',
                customModel: 'test-model',
                customMaxTokens: 4096,
                customSupportsVision: supportsVision
            });
            return APIService.callCustom(
                { text: 'describe this', images: [{ mimeType: 'image/png', data: 'AAAA' }] },
                null,
                false,
                {}
            );
        }, { url: mockUrl, supportsVision: vision });

        lastRequest = null;
        await callWithImage(false);
        const offContent = lastRequest && lastRequest.body && lastRequest.body.messages[0].content;
        check('vision off keeps content as plain text', typeof offContent === 'string', typeof offContent);

        lastRequest = null;
        await callWithImage(true);
        const onContent = lastRequest && lastRequest.body && lastRequest.body.messages[0].content;
        const hasImagePart = Array.isArray(onContent) && onContent.some(part => part && part.type === 'image_url');
        check('vision on attaches image_url content parts', hasImagePart, JSON.stringify(onContent));

        // 6. Regression: the desktop app-update UI must not short-circuit the
        //    Model-tab wiring. In Electron, switchSettingsTab took the
        //    electronBridge branch and skipped every model-tab handler, so the
        //    Fetch Models and Test Connection buttons did nothing at all.
        await page.evaluate((url) => {
            StateManager.data.globalSettings.apiProvider = 'custom';
            StateManager.data.globalSettings.customApiUrl = url;
            StateManager.data.globalSettings.customApiKey = '';
            StateManager.data.globalSettings.customModel = 'test-model';
            window.electronBridge = window.electronBridge || {};
            AppController.setApiProvider('custom');
            AppController.switchSettingsTab('model');
        }, mockUrl);

        const wiring = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('#fetch-custom-models-btn'));
            const visible = buttons.find(b => b.offsetParent) || buttons[0];
            return { count: buttons.length, hasOnclick: !!(visible && visible.onclick) };
        });
        check('Fetch Models stays wired when the Electron bridge is present', wiring.hasOnclick, JSON.stringify(wiring));

        const hitsBefore = modelsHitCount;
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('#fetch-custom-models-btn'));
            const visible = buttons.find(b => b.offsetParent) || buttons[0];
            if (visible) visible.click();
        });
        await page.waitForTimeout(600);
        check('Fetch Models still probes /v1/models with the Electron bridge present',
            modelsHitCount > hitsBefore, `${hitsBefore} -> ${modelsHitCount}`);

    } catch (e) {
        console.error('[Custom Provider E2E] Fatal:', e);
        failed++;
    } finally {
        if (browser) await browser.close().catch(() => { });
        if (server) server.close();
    }

    console.log(`\n[Custom Provider E2E Summary] Passed: ${passed} | Failed: ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
})();
