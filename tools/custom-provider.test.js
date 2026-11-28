// Source-contract tests for the Custom (OpenAI-compatible) provider.
//
// These run without a browser. They verify that the monolith wires the new
// provider through every layer it has to touch: the Model settings pane, the
// global setting keys, the request adapter, the connection probe, the vision
// flag, the configuration guard, and the forced-globals hydration.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');

const htmlPath = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// ── Extract the real service objects from index.html ──

function inlineScripts(source) {
    const blocks = [];
    const openRe = /<script(\s[^>]*)?>/g;
    let m;
    while ((m = openRe.exec(source)) !== null) {
        const attrs = m[1] || '';
        if (/\bsrc\s*=/i.test(attrs)) continue;
        const contentStart = openRe.lastIndex;
        const closeIdx = source.indexOf('</script>', contentStart);
        if (closeIdx === -1) continue;
        blocks.push({
            js: source.slice(contentStart, closeIdx),
            sourceType: /\btype\s*=\s*["']module["']/i.test(attrs) ? 'module' : 'script'
        });
        openRe.lastIndex = closeIdx + '</script>'.length;
    }
    return blocks;
}

function findObjectExpression(ast, bindingName) {
    const stack = [ast];
    while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node.type !== 'string') continue;
        if (
            node.type === 'VariableDeclarator' &&
            node.id && node.id.name === bindingName &&
            node.init && node.init.type === 'ObjectExpression'
        ) {
            return node.init;
        }
        for (const key of Object.keys(node)) {
            if (key === 'start' || key === 'end' || key === 'loc') continue;
            const value = node[key];
            if (Array.isArray(value)) {
                value.forEach(child => {
                    if (child && typeof child.type === 'string') stack.push(child);
                });
            } else if (value && typeof value.type === 'string') {
                stack.push(value);
            }
        }
    }
    return null;
}

function extractMethodSources(bindingName, methodNames) {
    for (const block of inlineScripts(html)) {
        if (!block.js.includes(`const ${bindingName} = {`)) continue;
        const ast = acorn.parse(block.js, {
            ecmaVersion: 'latest',
            sourceType: block.sourceType,
            allowReturnOutsideFunction: true
        });
        const objectNode = findObjectExpression(ast, bindingName);
        if (!objectNode) continue;

        const sources = {};
        for (const prop of objectNode.properties) {
            if (!prop.key) continue;
            const name = prop.key.name || prop.key.value;
            if (methodNames.includes(name)) {
                sources[name] = block.js.slice(prop.start, prop.end);
            }
        }
        const missing = methodNames.filter(name => !sources[name]);
        if (missing.length) {
            throw new Error(`${bindingName} is missing methods: ${missing.join(', ')}`);
        }
        return sources;
    }
    throw new Error(`${bindingName} definition not found in index.html`);
}

const api = extractMethodSources('APIService', [
    'callAI', 'callCustom', 'testConnection', 'fetchCustomModels', '_supportsVision', 'getVisionDirections'
]);
const narrative = extractMethodSources('NarrativeController', ['_isModelConfigured']);
const app = extractMethodSources('AppController', ['bindSettingsListeners', 'switchSettingsTab']);
const stateManager = extractMethodSources('StateManager', ['loadLibrary']);

// ── Settings UI ──

test('Custom provider is offered in the AI Provider dropdown', () => {
    const selector = html.match(/<select id="api-provider-selector"[\s\S]*?<\/select>/);
    assert.ok(selector, 'api-provider-selector must exist');
    assert.match(selector[0], /<option value="custom">Custom<\/option>/);
});

test('Custom settings panel exposes URL, key, model, token, vision, and test controls', () => {
    const panel = html.match(/<div id="custom-settings">[\s\S]*?<div id="webllm-settings">/);
    assert.ok(panel, 'custom-settings panel must exist before webllm-settings');

    for (const id of [
        'custom-api-url-input',
        'custom-api-key-input',
        'custom-model-input',
        'custom-max-tokens-input',
        'custom-vision-toggle',
        'test-custom-btn',
        'custom-status-text',
        'fetch-custom-models-btn',
        'custom-model-options'
    ]) {
        assert.ok(panel[0].includes(`id="${id}"`), `custom panel must contain #${id}`);
    }

    assert.match(panel[0], /type="password"[^>]*id="custom-api-key-input"|id="custom-api-key-input"[^>]*type="password"/);
});

test('Model tab binds the custom fields and shows the panel only for the custom provider', () => {
    assert.match(app.bindSettingsListeners, /custom-api-url-input/);
    assert.match(app.bindSettingsListeners, /custom-api-key-input/);
    assert.match(app.bindSettingsListeners, /custom-model-input/);
    assert.match(app.bindSettingsListeners, /custom-max-tokens-input/);
    assert.match(app.bindSettingsListeners, /custom-vision-toggle/);
    assert.match(app.bindSettingsListeners, /customSupportsVision/);
    assert.match(app.bindSettingsListeners, /currentProvider === 'custom'/);
    assert.match(app.bindSettingsListeners, /customSettings/);
});

test('MODEL_SETTING_KEYS marks the custom settings as global', () => {
    for (const key of [
        'customApiUrl', 'customApiKey', 'customModel', 'customMaxTokens', 'customSupportsVision'
    ]) {
        assert.ok(html.includes(`'${key}'`), `MODEL_SETTING_KEYS must include ${key}`);
    }
});

test('loadLibrary forces custom provider settings from global settings', () => {
    assert.match(stateManager.loadLibrary, /customApiUrl: this\.data\.globalSettings\.customApiUrl/);
    assert.match(stateManager.loadLibrary, /customApiKey: this\.data\.globalSettings\.customApiKey/);
    assert.match(stateManager.loadLibrary, /customModel: this\.data\.globalSettings\.customModel/);
});

test('the desktop app-update UI does not short-circuit the Model-tab wiring', () => {
    // switchSettingsTab used to be
    //   if (electronBridge && renderAppUpdateUI) renderAppUpdateUI();
    //   else if (tabName === 'model') { ...wire buttons... }
    // so in Electron every Model-tab button (Fetch Models, Test Connection,
    // LM Studio test, Gemini models, TTS) was left unbound.
    assert.doesNotMatch(app.switchSettingsTab, /renderAppUpdateUI\(\);\s*\}\s*else\s+if/);
    assert.match(app.switchSettingsTab, /renderAppUpdateUI\(\);\s*\}\s*if\s*\(tabName === 'personas'\)/);
});

// ── Request adapter ──

test('callAI routes the custom provider to callCustom', () => {
    assert.match(api.callAI, /provider === 'custom'/);
    assert.match(api.callAI, /this\.callCustom\(/);
});

test('callCustom normalises the endpoint and streams through the two-phase timeout', () => {
    assert.match(api.callCustom, /resolveOpenAICompatibleEndpoint/);
    assert.match(api.callCustom, /customModel/);
    assert.match(api.callCustom, /stream:\s*true/);
    assert.match(api.callCustom, /firstToken:\s*true/);
    assert.match(api.callCustom, /Custom API Error/);
});

test('callCustom sends an Authorization header only when a key is configured', () => {
    assert.match(api.callCustom, /customApiKey/);
    assert.match(api.callCustom, /Authorization/);
    // The header must be built conditionally, not unconditionally.
    assert.match(api.callCustom, /if\s*\([^)]*apiKey[^)]*\)\s*\{[\s\S]{0,160}Authorization/);
});

test('callCustom honours the explicit vision flag before attaching images', () => {
    assert.match(api.callCustom, /customSupportsVision/);
    assert.match(api.callCustom, /image_url/);
});

test('testConnection and fetchCustomModels probe the /models endpoint', () => {
    assert.match(api.testConnection, /provider === 'custom'/);
    assert.match(api.testConnection, /resolveOpenAICompatibleBaseUrl/);
    assert.match(api.fetchCustomModels, /resolveOpenAICompatibleBaseUrl/);
    assert.match(api.fetchCustomModels, /\/models/);
});

test('_supportsVision reads the explicit custom vision flag', () => {
    assert.match(api._supportsVision, /provider === 'custom'/);
    assert.match(api._supportsVision, /customSupportsVision/);
});

test('getVisionDirections explains the custom vision checkbox', () => {
    assert.match(api.getVisionDirections, /case 'custom'/);
    assert.match(api.getVisionDirections, /supports image input/i);
});

test('_isModelConfigured requires a custom URL and model, but not a key', () => {
    assert.match(narrative._isModelConfigured, /s\.apiProvider === 'custom'/);
    const branch = narrative._isModelConfigured.match(/if\s*\(s\.apiProvider === 'custom'\)\s*\{[\s\S]*?\}/);
    assert.ok(branch, 'custom branch must exist');
    assert.match(branch[0], /customApiUrl/);
    assert.match(branch[0], /customModel/);
    assert.doesNotMatch(branch[0], /customApiKey/);
});
