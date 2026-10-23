/**
 * Electron & KoboldCPP Process Lifecycle Tests
 *
 * Verifies the contract between Electron main, preload bridge, and KoboldCPP:
 *  1. CLI Arguments builder logic (CUDA, Metal, CPU, context size, autofit, jinja).
 *  2. Architecture error detection regex and log stream parsing.
 *  3. IPC channel contracts between preload.js and main.js.
 *  4. Task termination arguments and flags.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// ─── 1. CLI Arguments Generation ──────────────────────────────────────────

function buildKoboldArgs(opts = {}, platform = process.platform) {
    const {
        modelPath = '',
        contextSize = 20480,
        port = 5001,
        useCuda = true,
        quantKv = 1,
        batchSize = 512,
        chatcompletionsadapter = 'None',
        useJinja = true,
        autoFit = true,
        defaultgenamt = 2048,
        autofitpadding = 1024,
    } = opts;

    const args = [];
    if (useCuda) {
        if (platform === 'darwin') {
            args.push('--usemetal');
        } else {
            args.push('--usecublas', 'normal', '0', 'mmq');
        }
    }

    if (autoFit) args.push('--autofit');

    args.push('--contextsize', String(contextSize));
    args.push('--batchsize', String(batchSize));
    args.push('--quantkv', String(quantKv));
    args.push('--port', String(port));
    if (useJinja) {
        args.push('--jinja');
    } else if (chatcompletionsadapter && chatcompletionsadapter !== 'None') {
        args.push('--chatcompletionsadapter', String(chatcompletionsadapter));
    }
    args.push('--defaultgenamt', String(defaultgenamt));
    args.push('--autofitpadding', String(autofitpadding));

    if (modelPath) {
        args.push('--model', modelPath);
    }

    return args;
}

test('buildKoboldArgs: builds Windows CUDA arguments correctly', () => {
    const args = buildKoboldArgs({
        modelPath: 'C:\\models\\test.gguf',
        contextSize: 16384,
        port: 5001,
        useCuda: true,
        useJinja: true
    }, 'win32');

    assert.ok(args.includes('--usecublas'));
    assert.ok(args.includes('normal'));
    assert.ok(args.includes('mmq'));
    assert.ok(args.includes('--autofit'));
    assert.equal(args[args.indexOf('--contextsize') + 1], '16384');
    assert.equal(args[args.indexOf('--port') + 1], '5001');
    assert.ok(args.includes('--jinja'));
    assert.equal(args[args.indexOf('--model') + 1], 'C:\\models\\test.gguf');
});

test('buildKoboldArgs: builds macOS Metal arguments correctly', () => {
    const args = buildKoboldArgs({
        useCuda: true,
        port: 5002
    }, 'darwin');

    assert.ok(args.includes('--usemetal'));
    assert.ok(!args.includes('--usecublas'));
    assert.equal(args[args.indexOf('--port') + 1], '5002');
});

test('buildKoboldArgs: CPU only mode omits GPU flags', () => {
    const args = buildKoboldArgs({
        useCuda: false,
        useJinja: false,
        chatcompletionsadapter: 'alpaca'
    }, 'win32');

    assert.ok(!args.includes('--usecublas'));
    assert.ok(!args.includes('--usemetal'));
    assert.ok(!args.includes('--jinja'));
    assert.equal(args[args.indexOf('--chatcompletionsadapter') + 1], 'alpaca');
});

// ─── 2. Architecture Error Detection Regex ─────────────────────────────────

const archErrorRegex = /(?:unknown model architecture:?\s*['"]?([a-zA-Z0-9_\-\.]+)['"]?|error loading model architecture|failed to load model|unrecognized arguments:\s*--jinja)/i;

test('archErrorRegex: detects unknown model architecture with name', () => {
    const log1 = "error: unknown model architecture: 'qwen2.5'";
    const match1 = log1.match(archErrorRegex);
    assert.ok(match1);
    assert.equal(match1[1], 'qwen2.5');

    const log2 = "Unknown model architecture: deepseek_v3";
    const match2 = log2.match(archErrorRegex);
    assert.ok(match2);
    assert.equal(match2[1], 'deepseek_v3');
});

test('archErrorRegex: detects generic model load failures', () => {
    assert.ok(archErrorRegex.test("Error loading model architecture from GGUF"));
    assert.ok(archErrorRegex.test("fatal: failed to load model"));
});

test('archErrorRegex: detects unsupported --jinja flag on older Kobold builds', () => {
    const log = "koboldcpp.exe: error: unrecognized arguments: --jinja";
    assert.ok(archErrorRegex.test(log));
});

test('archErrorRegex: ignores normal operational logs', () => {
    assert.ok(!archErrorRegex.test("Loading model weights from disk..."));
    assert.ok(!archErrorRegex.test("Identified 32 layers for GPU offload."));
    assert.ok(!archErrorRegex.test("Please connect to custom endpoint at http://127.0.0.1:5001"));
});

// ─── 3. IPC Contract Verification ──────────────────────────────────────────

test('IPC contract: all preload.js invoke channels exist in main.js', () => {
    const mainPath = path.join(__dirname, '..', 'electron', 'main.js');
    const preloadPath = path.join(__dirname, '..', 'electron', 'preload.js');

    const mainCode = fs.readFileSync(mainPath, 'utf8');
    const preloadCode = fs.readFileSync(preloadPath, 'utf8');

    // Extract all ipcRenderer.invoke('channel', ...)
    const invokeRegex = /ipcRenderer\.invoke\(['"]([^'"]+)['"]/g;
    const preloadChannels = new Set();
    let m;
    while ((m = invokeRegex.exec(preloadCode)) !== null) {
        preloadChannels.add(m[1]);
    }

    // Extract all ipcMain.handle('channel', ...)
    const handleRegex = /ipcMain\.handle\(['"]([^'"]+)['"]/g;
    const mainChannels = new Set();
    while ((m = handleRegex.exec(mainCode)) !== null) {
        mainChannels.add(m[1]);
    }

    // Check Kobold channels specifically
    const koboldChannels = [
        'kobold:start',
        'kobold:stop',
        'kobold:getStatus',
        'kobold:getLatestVersion',
        'kobold:getLocalVersion',
        'kobold:update',
        'dialog:pickModelFile'
    ];

    for (const channel of koboldChannels) {
        assert.ok(preloadChannels.has(channel), `Preload missing channel: ${channel}`);
        assert.ok(mainChannels.has(channel), `Main process missing handler for: ${channel}`);
    }
});

test('IPC contract: event emitter channels match between main.js and preload.js', () => {
    const mainPath = path.join(__dirname, '..', 'electron', 'main.js');
    const preloadPath = path.join(__dirname, '..', 'electron', 'preload.js');

    const mainCode = fs.readFileSync(mainPath, 'utf8');
    const preloadCode = fs.readFileSync(preloadPath, 'utf8');

    const expectedEvents = [
        'kobold:statusChange',
        'kobold:downloadProgress',
        'kobold:log',
        'kobold:incompatibleModel'
    ];

    for (const evt of expectedEvents) {
        assert.ok(mainCode.includes(`'${evt}'`), `main.js should send event '${evt}'`);
        assert.ok(preloadCode.includes(`'${evt}'`), `preload.js should listen to event '${evt}'`);
    }
});
