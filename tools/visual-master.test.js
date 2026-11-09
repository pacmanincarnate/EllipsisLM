// Unit & Contract tests for VisualMaster immediate button loading state and error handling
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Extract VisualMaster code block from index.html
const startMarker = 'const VisualMaster = {';
const startIndex = html.indexOf(startMarker);
assert.ok(startIndex !== -1, 'VisualMaster definition must exist in index.html');

// Find closing bracket of VisualMaster
let depth = 0;
let endIndex = -1;
for (let i = startIndex; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
        depth--;
        if (depth === 0) {
            endIndex = i + 1;
            break;
        }
    }
}
assert.ok(endIndex !== -1, 'VisualMaster closing bracket must be found');
const visualMasterCode = html.slice(startIndex, endIndex);

// ── 1. SOURCE CONTRACT TESTS ──

test('VisualMaster source contract: concurrency check in triggerVisualEvent', () => {
    // triggerVisualEvent must check this.RUNTIME.isProcessing at the start
    const triggerIndex = visualMasterCode.indexOf('async triggerVisualEvent(');
    assert.ok(triggerIndex !== -1, 'triggerVisualEvent must exist');
    const triggerCode = visualMasterCode.slice(triggerIndex);
    assert.match(
        triggerCode.slice(0, 500),
        /if\s*\(\s*this\.RUNTIME\.isProcessing/,
        'triggerVisualEvent must check this.RUNTIME.isProcessing near its beginning'
    );
});

test('VisualMaster source contract: immediate button disable before APIService.callAI', () => {
    const triggerIndex = visualMasterCode.indexOf('async triggerVisualEvent(');
    const triggerCode = visualMasterCode.slice(triggerIndex);
    const callAIIndex = triggerCode.indexOf('APIService.callAI');
    assert.ok(callAIIndex !== -1, 'APIService.callAI must be called in triggerVisualEvent');

    // Finding button disablement before callAI
    const buttonDisableIndex = triggerCode.indexOf('.disabled = true');
    assert.ok(
        buttonDisableIndex !== -1 && buttonDisableIndex < callAIIndex,
        'Button must be disabled before calling APIService.callAI'
    );
});

test('VisualMaster source contract: sparkles icon and purple accent set during Phase 1', () => {
    const triggerIndex = visualMasterCode.indexOf('async triggerVisualEvent(');
    const triggerCode = visualMasterCode.slice(triggerIndex);
    const callAIIndex = triggerCode.indexOf('APIService.callAI');
    const sparklesIndex = triggerCode.indexOf('text-purple-400');
    assert.ok(
        sparklesIndex !== -1 && sparklesIndex < callAIIndex,
        'Phase 1 sparkles icon with text-purple-400 must be set before APIService.callAI'
    );
    assert.match(
        triggerCode,
        /Crafting scene prompt\.\.\./,
        'Phase 1 tooltip Crafting scene prompt... must be defined'
    );
});

test('VisualMaster source contract: APIService.callAI must be inside try block in triggerVisualEvent', () => {
    // APIService.callAI must be preceded by try { and followed by catch and finally
    const triggerIndex = visualMasterCode.indexOf('async triggerVisualEvent(');
    const triggerCode = visualMasterCode.slice(triggerIndex);
    const tryIndex = triggerCode.indexOf('try {');
    const callAIIndex = triggerCode.indexOf('APIService.callAI');
    const finallyIndex = triggerCode.indexOf('finally {');

    assert.ok(tryIndex !== -1, 'try block must exist in triggerVisualEvent');
    assert.ok(tryIndex < callAIIndex, 'APIService.callAI must be inside try block in triggerVisualEvent');
    assert.ok(callAIIndex < finallyIndex, 'APIService.callAI must be protected by finally block in triggerVisualEvent');
});

// ── 2. RUNTIME BEHAVIORAL TESTS (SANDBOXED VM) ──

function createVisualMasterSandbox() {
    const notifications = [];
    const logs = [];

    const mockBtn = {
        innerHTML: '<svg class="original-icon"></svg>',
        title: 'Generate Image',
        disabled: false,
        className: 'text-gray-400 hover:text-indigo-400 p-0.5 rounded transition-colors',
        classList: {
            classes: new Set(['text-gray-400', 'p-0.5']),
            add(...cls) { cls.forEach(c => this.classes.add(c)); },
            remove(...cls) { cls.forEach(c => this.classes.delete(c)); },
            contains(c) { return this.classes.has(c); }
        },
        closest() { return null; }
    };

    const sandbox = {
        console: {
            log: (...args) => logs.push(args.join(' ')),
            warn: (...args) => logs.push('WARN: ' + args.join(' ')),
            error: (...args) => logs.push('ERROR: ' + args.join(' '))
        },
        document: {
            querySelector: () => null,
            getElementById: () => null
        },
        setTimeout: (fn) => fn(),
        Date: { now: () => 1700000000000, toISOString: () => '2026-11-09T00:00:00.000Z' },
        Math,
        ReactiveStore: {
            state: {
                chat_history: [
                    { type: 'chat', content: 'Hello world', character_id: 'char_1' }
                ],
                characters: [{ id: 'char_1', name: 'Alice', appearance: 'Tall traveler' }]
            },
            getCharacter: () => ({ id: 'char_1', name: 'Alice' }),
            getActiveLocationCharacters: () => [],
            forceSave: async () => {}
        },
        NarrativeController: {
            getActiveParticipantIds: () => ['char_1']
        },
        UTILITY: {
            getDefaultSystemPrompts: () => ({ visual_master_base_prompt: 'System prompt' })
        },
        StateManager: {
            data: {
                globalSettings: {
                    imageGenWidth: 512,
                    imageGenHeight: 512,
                    koboldImageGenSteps: 20
                }
            }
        },
        UIManager: {
            isImageGenEnabled: () => true,
            showNotification: (msg, type) => notifications.push({ msg, type }),
            hideLoadingSpinner: () => {}
        },
        DBService: {
            saveImage: async () => {}
        },
        APIService: {
            callAI: async () => 'A dramatic scene of Alice standing at dusk'
        },
        ImageGenerationService: {
            generateImage: async () => 'fake_blob_data'
        },
        notifications,
        mockBtn
    };

    vm.createContext(sandbox);
    vm.runInContext(visualMasterCode + '\nthis.VisualMaster = VisualMaster;', sandbox);
    return sandbox;
}

test('VisualMaster runtime: phase 1 immediate state & phase 2 transition', async () => {
    const sandbox = createVisualMasterSandbox();
    let phase1Observed = false;
    let phase2Observed = false;

    // Hook APIService.callAI to verify Phase 1 button state while waiting
    sandbox.APIService.callAI = async () => {
        if (
            sandbox.mockBtn.disabled === true &&
            sandbox.mockBtn.classList.contains('cursor-wait') &&
            sandbox.mockBtn.title === 'Crafting scene prompt...' &&
            sandbox.mockBtn.innerHTML.includes('text-purple-400')
        ) {
            phase1Observed = true;
        }
        return 'Visual prompt description';
    };

    // Hook ImageGenerationService.generateImage to verify Phase 2 button state
    sandbox.ImageGenerationService.generateImage = async () => {
        if (
            sandbox.mockBtn.disabled === true &&
            sandbox.mockBtn.title === 'Generating image...' &&
            sandbox.mockBtn.innerHTML.includes('animate-spin') &&
            sandbox.mockBtn.innerHTML.includes('text-indigo-400')
        ) {
            phase2Observed = true;
        }
        return 'blob_result';
    };

    await sandbox.VisualMaster.triggerVisualEvent(0, sandbox.mockBtn);

    assert.ok(phase1Observed, 'Phase 1 loading state must be active during prompt construction');
    assert.ok(phase2Observed, 'Phase 2 loading state must be active during image generation');
    assert.equal(sandbox.mockBtn.disabled, false, 'Button must be re-enabled after completion');
    assert.equal(sandbox.mockBtn.title, 'Generate Image', 'Button title must be restored');
    assert.equal(sandbox.mockBtn.innerHTML, '<svg class="original-icon"></svg>', 'Original icon must be restored');
    assert.equal(sandbox.VisualMaster.RUNTIME.isProcessing, false, 'RUNTIME.isProcessing must be false after completion');
});

test('VisualMaster runtime: error in APIService.callAI cleanly restores button and resets isProcessing', async () => {
    const sandbox = createVisualMasterSandbox();
    sandbox.APIService.callAI = async () => {
        throw new Error('LLM connection timed out');
    };

    await sandbox.VisualMaster.triggerVisualEvent(0, sandbox.mockBtn);

    assert.equal(sandbox.mockBtn.disabled, false, 'Button must be re-enabled even after LLM error');
    assert.equal(sandbox.mockBtn.title, 'Generate Image', 'Button title must be restored after LLM error');
    assert.equal(sandbox.mockBtn.innerHTML, '<svg class="original-icon"></svg>', 'Original icon must be restored after LLM error');
    assert.equal(sandbox.mockBtn.classList.contains('cursor-wait'), false, 'cursor-wait class must be removed');
    assert.equal(sandbox.VisualMaster.RUNTIME.isProcessing, false, 'RUNTIME.isProcessing must be reset to false');
    assert.ok(
        sandbox.notifications.some(n => n.type === 'error' && n.msg.includes('LLM connection timed out')),
        'Error toast must be shown to the user'
    );
});

test('VisualMaster runtime: concurrency guard rejects duplicate calls while processing', async () => {
    const sandbox = createVisualMasterSandbox();
    sandbox.VisualMaster.RUNTIME.isProcessing = true;
    let callAICalled = false;
    sandbox.APIService.callAI = async () => {
        callAICalled = true;
        return 'description';
    };

    await sandbox.VisualMaster.triggerVisualEvent(0, sandbox.mockBtn);

    assert.equal(callAICalled, false, 'callAI must not be invoked when isProcessing is already true');
    assert.ok(
        sandbox.notifications.some(n => n.type === 'warning' && n.msg.includes('already in progress')),
        'Warning notification must inform user that visual generation is already running'
    );
});
