// Unit & Contract tests for Story Architect background lifecycle & floating indicator
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

test('Story Architect DOM Contract: modal structure & actions', () => {
    // 1. Modal overlay must use gen-story-overlay-click so clicking outside while busy can minimize rather than silently destroy
    assert.ok(
        html.includes('data-action="gen-story-overlay-click"'),
        'gen-story-modal overlay must have data-action="gen-story-overlay-click"'
    );

    // 2. Minimize button in header
    assert.ok(
        html.includes('id="gen-story-minimize-btn"') && html.includes('data-action="gen-story-minimize"'),
        'gen-story-modal header must include minimize button with data-action="gen-story-minimize"'
    );

    // 3. Close button with gen-story-close
    assert.ok(
        html.includes('data-action="gen-story-close"'),
        'gen-story-modal must have close buttons using data-action="gen-story-close"'
    );

    // 4. Progress view includes a run in background link
    assert.ok(
        html.includes('Run in background (Minimize)'),
        'gen-story-progress-view must offer a Run in background (Minimize) action'
    );

    // 5. Floating background progress indicator widget
    assert.ok(
        html.includes('id="story-gen-floating-indicator"'),
        'DOM must include #story-gen-floating-indicator'
    );
    assert.ok(
        html.includes('id="story-gen-floating-status"'),
        '#story-gen-floating-indicator must include status element'
    );
    assert.ok(
        html.includes('id="story-gen-floating-pct"'),
        '#story-gen-floating-indicator must include percentage element'
    );
    assert.ok(
        html.includes('id="story-gen-floating-bar"'),
        '#story-gen-floating-indicator must include progress bar'
    );
    assert.ok(
        html.includes('data-action="gen-story-restore"'),
        '#story-gen-floating-indicator must support data-action="gen-story-restore"'
    );
    assert.ok(
        html.includes('data-action="gen-story-cancel"'),
        '#story-gen-floating-indicator must support data-action="gen-story-cancel"'
    );
});

test('Story Architect ActionHandler Contract: all actions registered', () => {
    const requiredActions = [
        'gen-story-overlay-click',
        'gen-story-minimize',
        'gen-story-restore',
        'gen-story-cancel',
        'gen-story-close'
    ];

    for (const act of requiredActions) {
        assert.ok(
            html.includes(`ActionHandler.register('${act}'`),
            `ActionHandler must register action: ${act}`
        );
    }
});

test('Story Architect LibraryController Methods Contract', () => {
    const requiredMethods = [
        'isGeneratingStory()',
        'updateGenProgress(',
        'showFloatingIndicator()',
        'hideFloatingIndicator()',
        'minimizeStoryGeneration()',
        'restoreStoryGeneration()',
        'handleOverlayClick()',
        'handleCloseStoryModal()',
        'cancelStoryGeneration()'
    ];

    for (const method of requiredMethods) {
        assert.ok(
            html.includes(method),
            `LibraryController must implement method: ${method}`
        );
    }
});

test('Story Architect Lifecycle Logic: re-opening while generating restores rather than wiping', () => {
    assert.ok(
        html.includes('if (this.isGeneratingStory()) {\n                    this.restoreStoryGeneration();\n                    return;\n                }') ||
        html.includes('if (this.isGeneratingStory()) {\r\n                    this.restoreStoryGeneration();\r\n                    return;\r\n                }'),
        'startNewStoryGeneration must check isGeneratingStory() and restore active generation'
    );
});
