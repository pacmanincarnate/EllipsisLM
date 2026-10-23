/**
 * EllipsisLM Electron Main Process
 *
 * Responsibilities:
 *   1. Create the application window and load the HTML app.
 *   2. Manage the KoboldCPP child process lifecycle.
 *   3. Handle IPC requests from the renderer (via preload.js bridge).
 */
const { app, BrowserWindow, ipcMain, dialog, shell, session, clipboard } = require('electron');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const os = require('os');

// ============================================================
// CONSTANTS
// ============================================================
const HTML_FILE = path.join(__dirname, '..', 'index.html');

function getExecutableName() {
    if (process.platform === 'darwin') {
        return process.arch === 'arm64' ? 'koboldcpp-mac-arm64' : 'koboldcpp-mac-x64';
    }
    if (process.platform === 'linux') return 'koboldcpp-linux-x64';
    return 'koboldcpp.exe';
}

const EXE_NAME = getExecutableName();
const KOBOLD_URL = `https://github.com/LostRuins/koboldcpp/releases/latest/download/${EXE_NAME}`;

function getKoboldPath() {
    // 1. Check user data (downloaded version)
    const userPath = path.join(app.getPath('userData'), EXE_NAME);
    if (fs.existsSync(userPath)) return userPath;

    // 2. Check bundled resources (if packaged)
    if (app.isPackaged) {
        const bundledPath = path.join(process.resourcesPath, EXE_NAME);
        if (fs.existsSync(bundledPath)) return bundledPath;
    }

    // 3. Check dev path (next to app)
    const devPath = path.join(__dirname, '..', EXE_NAME);
    if (fs.existsSync(devPath)) return devPath;

    return userPath; // Fallback to userPath for the download target
}

// ============================================================
// DEBUG LOGGING SUBSYSTEM
// ============================================================
const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB rotation limit
const MAX_MEMORY_LOG_ENTRIES = 3000;
const memoryLogBuffer = [];

function getLogPath() {
    return path.join(app.getPath('userData'), 'debug.log');
}

function getOldLogPath() {
    return path.join(app.getPath('userData'), 'debug.old.log');
}

function sanitizeDebugText(text) {
    if (!text) return '';
    if (typeof text !== 'string') {
        try { text = JSON.stringify(text); } catch (e) { text = String(text); }
    }
    return text
        .replace(/\bAIzaSy[A-Za-z0-9_-]{33}\b/g, 'AIzaSy[REDACTED]')
        .replace(/\bsk-or-v1-[a-f0-9]{64}\b/g, 'sk-or-v1-[REDACTED]')
        .replace(/\bsk-[A-Za-z0-9]{20,}\b/g, 'sk-[REDACTED]')
        .replace(/(Authorization:\s*Bearer\s+)[A-Za-z0-9_\-\.\:]{10,}/gi, '$1[REDACTED]')
        .replace(/(Bearer\s+)[A-Za-z0-9_\-\.\:]{10,}/gi, '$1[REDACTED]')
        .replace(/("?(?:geminiApiKey|openrouterApiKey|apiKey|password|secret|token)"?\s*:\s*)"([^"]+)"/gi, '$1"[REDACTED]"');
}

function logDebug(level = 'info', source = 'MAIN', message = '') {
    const timestamp = new Date().toISOString();
    const cleanMsg = sanitizeDebugText(message);
    const entry = `[${timestamp}] [${source.toUpperCase()}/${level.toUpperCase()}] ${cleanMsg}`;

    memoryLogBuffer.push(entry);
    if (memoryLogBuffer.length > MAX_MEMORY_LOG_ENTRIES) {
        memoryLogBuffer.shift();
    }

    try {
        const logFile = getLogPath();
        const dir = path.dirname(logFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // Rotate if exceeding max size
        if (fs.existsSync(logFile)) {
            const stat = fs.statSync(logFile);
            if (stat.size >= MAX_LOG_SIZE_BYTES) {
                const oldFile = getOldLogPath();
                try {
                    if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
                    fs.renameSync(logFile, oldFile);
                } catch (rotErr) {
                    fs.writeFileSync(logFile, '', 'utf8');
                }
            }
        }

        fs.appendFileSync(logFile, entry + '\n', 'utf8');
    } catch (e) {
        // Suppress disk write failures to never disrupt runtime
    }
}

// Intercept main process console methods for continuous log capture
const originalConsole = {
    log: console.log.bind(console),
    info: (console.info || console.log).bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
};

console.log = function (...args) {
    originalConsole.log(...args);
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    logDebug('info', 'MAIN', msg);
};

console.info = function (...args) {
    originalConsole.info(...args);
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    logDebug('info', 'MAIN', msg);
};

console.warn = function (...args) {
    originalConsole.warn(...args);
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    logDebug('warn', 'MAIN', msg);
};

console.error = function (...args) {
    originalConsole.error(...args);
    const msg = args.map(a => (a instanceof Error ? a.stack || a.message : (typeof a === 'object' ? JSON.stringify(a) : String(a)))).join(' ');
    logDebug('error', 'MAIN', msg);
};

// Global unhandled error handlers
process.on('uncaughtException', (err) => {
    logDebug('error', 'SYSTEM', `Uncaught Exception in Main: ${err ? (err.stack || err.message) : err}`);
});

process.on('unhandledRejection', (reason) => {
    logDebug('error', 'SYSTEM', `Unhandled Rejection in Main: ${reason ? (reason.stack || reason) : reason}`);
});

async function generateDiagnosticReport(clientState = {}) {
    const memTotalGB = (os.totalmem() / (1024 ** 3)).toFixed(2);
    const memFreeGB = (os.freemem() / (1024 ** 3)).toFixed(2);
    const cpus = os.cpus();
    const cpuModel = cpus && cpus[0] ? `${cpus[0].model} (${cpus.length} cores)` : `${os.cpus().length} cores`;

    const exePath = getKoboldPath();
    const exeExists = fs.existsSync(exePath);
    let exeSizeMB = 'N/A';
    if (exeExists) {
        try { exeSizeMB = (fs.statSync(exePath).size / (1024 * 1024)).toFixed(1) + ' MB'; } catch (e) {}
    }

    let localVersion = 'unknown';
    try { localVersion = await getLocalVersion(); } catch (e) {}

    // Auto-backup status
    let backupLatest = 'None';
    let backupPrev = 'None';
    try {
        const backupDir = path.join(app.getPath('userData'), 'autobackups');
        const latestFile = path.join(backupDir, 'autobackup_latest.json');
        const prevFile = path.join(backupDir, 'autobackup_previous.json');
        if (fs.existsSync(latestFile)) {
            const st = fs.statSync(latestFile);
            backupLatest = `autobackup_latest.json (${(st.size / 1024).toFixed(1)} KB, mtime: ${st.mtime.toISOString()})`;
        }
        if (fs.existsSync(prevFile)) {
            const st = fs.statSync(prevFile);
            backupPrev = `autobackup_previous.json (${(st.size / 1024).toFixed(1)} KB, mtime: ${st.mtime.toISOString()})`;
        }
    } catch (e) {}

    const meta = {
        timestamp: new Date().toISOString(),
        appVersion: app.getVersion(),
        electronVersion: process.versions.electron,
        nodeVersion: process.versions.node,
        chromeVersion: process.versions.chrome,
        platform: process.platform,
        arch: process.arch,
        osRelease: `${os.type()} ${os.release()}`,
        totalRam: `${memTotalGB} GB`,
        freeRam: `${memFreeGB} GB`,
        cpus: cpuModel,
        userDataPath: app.getPath('userData'),
        isPackaged: app.isPackaged,
        kobold: {
            exeName: EXE_NAME,
            exePath: exePath,
            exists: exeExists ? `Yes (${exeSizeMB})` : 'No',
            localVersion: localVersion,
            status: koboldStatus,
            lastLaunchOpts: lastLaunchOpts
        },
        backupLatest,
        backupPrevious: backupPrev,
        clientState: clientState || {}
    };

    // Grab recent logs
    let logs = [];
    if (memoryLogBuffer.length > 0) {
        logs = memoryLogBuffer.slice(-2000);
    } else {
        const logFile = getLogPath();
        if (fs.existsSync(logFile)) {
            try {
                const raw = fs.readFileSync(logFile, 'utf8');
                logs = raw.split('\n').filter(Boolean).slice(-2000);
            } catch (e) {}
        }
    }

    const reportLines = [
        '================================================================================',
        'ELLIPSIS LM - DEBUG & DIAGNOSTIC REPORT',
        `Generated: ${meta.timestamp}`,
        '================================================================================',
        '',
        '--- APPLICATION & RUNTIME ---',
        `App Version: ${meta.appVersion}`,
        `Electron: ${meta.electronVersion}`,
        `Node.js: ${meta.nodeVersion}`,
        `Chrome: ${meta.chromeVersion}`,
        `Platform: ${meta.platform} (${meta.arch})`,
        `OS Release: ${meta.osRelease}`,
        `Total RAM: ${meta.totalRam}`,
        `Free RAM: ${meta.freeRam}`,
        `CPU: ${meta.cpus}`,
        `User Data Path: ${meta.userDataPath}`,
        `Packaged: ${meta.isPackaged}`,
        '',
        '--- KOBOLDCPP BACKEND ---',
        `Executable Name: ${meta.kobold.exeName}`,
        `Executable Path: ${meta.kobold.exePath}`,
        `Executable Exists: ${meta.kobold.exists}`,
        `Detected Local Version: ${meta.kobold.localVersion}`,
        `Current Status: ${meta.kobold.status}`
    ];

    if (meta.kobold.lastLaunchOpts) {
        const opts = meta.kobold.lastLaunchOpts;
        let modelExists = 'unknown';
        if (opts.modelPath) {
            try {
                modelExists = fs.existsSync(opts.modelPath)
                    ? `Yes (${(fs.statSync(opts.modelPath).size / (1024 ** 3)).toFixed(2)} GB)`
                    : 'No (Path does not exist)';
            } catch (e) {
                modelExists = 'Error checking: ' + e.message;
            }
        }
        reportLines.push(
            'Last Launch Config:',
            `  - Port: ${opts.port || 5001}`,
            `  - Context Size: ${opts.contextSize || 'unknown'}`,
            `  - Model Path: ${opts.modelPath || 'none'} (Exists: ${modelExists})`,
            `  - Adapter: ${opts.chatcompletionsadapter || (opts.useJinja ? 'jinja' : 'default')}`,
            `  - Batch Size: ${opts.batchSize || 'default'}`,
            `  - Quant KV: ${opts.quantKv || 'default'}`,
            `  - GPU Layers: ${opts.gpuLayers !== undefined ? opts.gpuLayers : 'auto (-1)'}`,
            `  - Jinja Enabled: ${opts.useJinja !== undefined ? opts.useJinja : true}`,
            `  - CUDA Enabled: ${opts.useCuda !== undefined ? opts.useCuda : 'unknown'}`
        );
    }

    reportLines.push(
        '',
        '--- AUTO-BACKUP STATUS ---',
        `Latest Backup: ${meta.backupLatest}`,
        `Previous Backup: ${meta.backupPrevious}`,
        '',
        '--- CLIENT STATE (RENDERER) ---',
        `Active Provider: ${clientState.activeProvider || 'unknown'}`,
        `Active Story ID: ${clientState.activeStoryId || 'none'}`,
        `Story Count: ${clientState.storyCount !== undefined ? clientState.storyCount : 'unknown'}`,
        `Layout Mode: ${clientState.layout || 'unknown'}`,
        `Screen Resolution: ${clientState.screen || 'unknown'}`,
        `User Agent: ${clientState.userAgent || 'unknown'}`,
        '',
        '================================================================================',
        `LOG STREAM (${logs.length} entries)`,
        '================================================================================'
    );

    if (logs.length > 0) {
        logs.forEach(line => reportLines.push(sanitizeDebugText(line)));
    } else {
        reportLines.push('(No log entries recorded)');
    }

    reportLines.push(
        '================================================================================',
        'END OF REPORT',
        '================================================================================'
    );

    return reportLines.join('\n');
}

// ============================================================
// KOBOLDCPP PROCESS MANAGEMENT
// ============================================================
let koboldProcess = null;
let koboldStatus = 'stopped'; // 'stopped' | 'starting' | 'running' | 'error' | 'downloading'
let mainWindow = null;
let lastLaunchOpts = null;
let koboldDownloadProgress = 0;
let koboldDownloadVersion = null;
let managedPid = null;
let readinessPollInterval = null;

function setKoboldStatus(status) {
    if (status !== 'starting' && readinessPollInterval) {
        clearInterval(readinessPollInterval);
        readinessPollInterval = null;
    }
    koboldStatus = status;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('kobold:statusChange', status);
    }
    console.log(`[KoboldCPP] Status: ${status}`);
}

function sendKoboldLog(line) {
    logDebug('info', 'KOBOLD', line);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('kobold:log', line);
    }
}

function getVersionPath() {
    return path.join(app.getPath('userData'), 'kobold-version.json');
}

function saveLocalVersion(version) {
    try {
        fs.writeFileSync(getVersionPath(), JSON.stringify({ version, date: new Date().toISOString() }));
    } catch (e) {
        console.error('[KoboldCPP] Failed to save version metadata:', e);
    }
}

async function getLocalVersion() {
    try {
        const p = getVersionPath();
        if (fs.existsSync(p)) {
            const data = JSON.parse(fs.readFileSync(p, 'utf8'));
            return data.version || 'unknown';
        }

        // Fallback: If we have the EXE but no version JSON (e.g. from a previous manual install)
        const exePath = getKoboldPath();
        if (fs.existsSync(exePath)) {
            // Most modern versions of KoboldCPP support -v or --version
            // We'll try to capture it. If it fails, we fall back to 'unknown'.
            const result = spawnSync(exePath, ['--version'], {
                encoding: 'utf8',
                timeout: 2000,
                windowsHide: true
            });
            const output = (result.stdout || result.stderr || '').toString();
            // Look for patterns like "v1.78" or "KoboldCPP v1.78"
            const match = output.match(/v?\d+\.\d+(\.\d+)?/);
            if (match) {
                let version = match[0];
                if (!version.startsWith('v')) version = 'v' + version;
                saveLocalVersion(version); // Cache it so we don't spawn again
                return version;
            }
        }
    } catch (e) {
        console.error('[KoboldCPP] Failed to read local version:', e);
    }
    return 'unknown';
}

function isSamePath(p1, p2) {
    if (!p1 || !p2) return false;
    try {
        const norm1 = path.resolve(p1);
        const norm2 = path.resolve(p2);
        if (process.platform === 'win32') {
            return norm1.toLowerCase() === norm2.toLowerCase();
        }
        return norm1 === norm2;
    } catch (e) {
        return false;
    }
}

function isProcessAlive(pid) {
    if (!pid || isNaN(pid)) return false;
    try {
        process.kill(Number(pid), 0);
        return true;
    } catch (e) {
        return false;
    }
}

function getListeningPid(port = 5001) {
    try {
        if (process.platform === 'win32') {
            const res = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true });
            if (!res.stdout) return null;
            const lines = res.stdout.split('\n');
            for (const line of lines) {
                if (line.includes('LISTENING') && (line.includes(`:${port} `) || line.includes(`:${port}\t`))) {
                    const parts = line.trim().split(/\s+/);
                    const pid = parseInt(parts[parts.length - 1], 10);
                    if (!isNaN(pid) && pid > 0) return pid;
                }
            }
        } else {
            // macOS / Linux
            const res = spawnSync('lsof', ['-ti', `:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
            if (res.stdout) {
                const pids = res.stdout.trim().split(/\s+/).map(Number).filter(p => !isNaN(p) && p > 0);
                if (pids.length > 0) return pids[0];
            }
        }
    } catch (e) {
        console.warn(`[KoboldCPP] getListeningPid(${port}) failed:`, e.message);
    }
    return null;
}

function getProcessPath(pid) {
    if (!pid || isNaN(pid)) return '';
    try {
        if (process.platform === 'win32') {
            const res = spawnSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).Path`], {
                encoding: 'utf8',
                windowsHide: true,
                timeout: 3000
            });
            if (res.stdout) return res.stdout.trim();
        } else {
            // macOS / Linux
            const res = spawnSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8', timeout: 3000 });
            if (res.stdout && res.stdout.trim()) return res.stdout.trim();
            const argsRes = spawnSync('ps', ['-p', String(pid), '-o', 'args='], { encoding: 'utf8', timeout: 3000 });
            if (argsRes.stdout) return argsRes.stdout.trim();
        }
    } catch (e) {
        console.warn(`[KoboldCPP] getProcessPath(${pid}) failed:`, e.message);
    }
    return '';
}

function killProcessTree(pid, force = true) {
    if (!pid || isNaN(pid)) return;
    const targetPid = Number(pid);
    console.log(`[KoboldCPP] Killing process tree for PID ${targetPid} (force=${force})...`);

    if (process.platform === 'win32') {
        try {
            // /F /T kills only the target process and its child processes, leaving all other processes untouched
            spawnSync('taskkill', ['/F', '/PID', String(targetPid), '/T'], { windowsHide: true });
        } catch (e) {
            console.warn(`[KoboldCPP] taskkill failed on PID ${targetPid}:`, e.message);
        }
    } else {
        // macOS / Linux
        try {
            const getDescendants = (rootPid) => {
                const list = [];
                try {
                    const res = spawnSync('pgrep', ['-P', String(rootPid)], { encoding: 'utf8' });
                    if (res.stdout) {
                        const children = res.stdout.trim().split(/\s+/).map(Number).filter(c => !isNaN(c) && c > 0);
                        for (const c of children) {
                            list.push(c);
                            list.push(...getDescendants(c));
                        }
                    }
                } catch (e) {}
                return list;
            };

            const allPids = [...getDescendants(targetPid), targetPid].reverse();
            for (const p of allPids) {
                try {
                    process.kill(p, force ? 'SIGKILL' : 'SIGTERM');
                } catch (e) {}
            }

            if (!force) {
                setTimeout(() => {
                    for (const p of allPids) {
                        try {
                            if (isProcessAlive(p)) process.kill(p, 'SIGKILL');
                        } catch (e) {}
                    }
                }, 1200);
            }
        } catch (e) {
            console.warn(`[KoboldCPP] Unix killProcessTree failed on PID ${targetPid}:`, e.message);
        }
    }
}

function fetchKoboldApiVersion(port = 5001) {
    return new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${port}/api/extra/version`, { timeout: 1500 }, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                return resolve(null);
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json);
                } catch (e) {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => {
            req.destroy();
            resolve(null);
        });
    });
}

async function getDetailedKoboldStatus(port = 5001) {
    const targetPort = port || (lastLaunchOpts && lastLaunchOpts.port) || 5001;
    const managedExe = getKoboldPath();
    const localVer = await getLocalVersion();

    // 1. Is tracked process alive?
    if (koboldProcess && !koboldProcess.killed && isProcessAlive(koboldProcess.pid)) {
        return {
            status: koboldStatus,
            type: 'managed',
            isManaged: true,
            version: localVer,
            localVersion: localVer,
            pid: koboldProcess.pid,
            port: targetPort,
            exePath: managedExe
        };
    }

    // 2. Check if a process is listening on the port
    const listeningPid = getListeningPid(targetPort);
    if (listeningPid) {
        const procPath = getProcessPath(listeningPid);
        if (isSamePath(procPath, managedExe)) {
            // Orphan managed instance — adopt it!
            managedPid = listeningPid;
            if (koboldStatus !== 'running') setKoboldStatus('running');
            return {
                status: 'running',
                type: 'managed',
                isManaged: true,
                version: localVer,
                localVersion: localVer,
                pid: listeningPid,
                port: targetPort,
                exePath: managedExe
            };
        } else {
            // External process!
            const apiInfo = await fetchKoboldApiVersion(targetPort);
            return {
                status: 'external_running',
                type: 'external',
                isManaged: false,
                version: (apiInfo && apiInfo.version) ? `v${apiInfo.version}` : 'External',
                flavor: (apiInfo && apiInfo.flavor) || '',
                localVersion: localVer,
                pid: listeningPid,
                port: targetPort,
                exePath: procPath || 'External Process'
            };
        }
    }

    // 3. Not listening on port
    if (koboldStatus === 'downloading') {
        return {
            status: 'downloading',
            type: 'none',
            isManaged: false,
            version: null,
            localVersion: localVer,
            pid: null,
            port: targetPort,
            exePath: managedExe
        };
    }

    if (koboldStatus !== 'stopped') setKoboldStatus('stopped');
    return {
        status: 'stopped',
        type: 'none',
        isManaged: false,
        version: null,
        localVersion: localVer,
        pid: null,
        port: targetPort,
        exePath: managedExe
    };
}

async function getLatestVersion() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: '/repos/LostRuins/koboldcpp/releases/latest',
            headers: { 'User-Agent': 'EllipsisLM-Desktop' }
        };

        https.get(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`GitHub API returned status ${res.statusCode}`));
                }
                try {
                    const json = JSON.parse(body);
                    if (!json || !json.tag_name) {
                        return reject(new Error('Invalid GitHub response structure (missing tag_name)'));
                    }
                    resolve(json.tag_name); // e.g. "v1.78"
                } catch (e) {
                    reject(new Error('Failed to parse GitHub response'));
                }
            });
        }).on('error', (err) => {
            koboldDownloadProgress = 0;
            koboldDownloadVersion = null;
            reject(new Error('Network error reaching GitHub: ' + err.message));
        });
    });
}

function downloadKobold(opts = {}) {
    if (koboldStatus === 'downloading') {
        sendKoboldLog('[WARN] Download is already in progress.');
        return;
    }

    const { targetVersion = 'latest' } = opts;
    const url = targetVersion === 'latest'
        ? KOBOLD_URL
        : `https://github.com/LostRuins/koboldcpp/releases/download/${targetVersion}/${EXE_NAME}`;

    const exePath = path.join(app.getPath('userData'), EXE_NAME);
    const tempPath = exePath + '.tmp';
    const wasRunning = koboldProcess !== null || koboldStatus === 'running';

    koboldDownloadProgress = 0;
    koboldDownloadVersion = targetVersion;

    // Remove any stale temp file from a previous aborted download
    if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (e) {
            console.warn('[KoboldCPP] Could not delete old temp file:', e.message);
        }
    }

    setKoboldStatus('downloading');

    async function executeDownload(versionToRecord) {
        koboldDownloadVersion = versionToRecord || targetVersion;
        sendKoboldLog(`[INFO] Preparing to download KoboldCPP ${versionToRecord}...`);
        get(url, versionToRecord);
    }

    if (targetVersion === 'latest') {
        getLatestVersion()
            .then(v => executeDownload(v))
            .catch(() => executeDownload('latest'));
    } else {
        executeDownload(targetVersion);
    }

    function get(downloadUrl, versionToRecord) {
        https.get(downloadUrl, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                get(res.headers.location, versionToRecord);
                return;
            }
            if (res.statusCode !== 200) {
                res.resume();
                setKoboldStatus('error');
                sendKoboldLog(`[ERROR] Download failed (Status ${res.statusCode})`);
                return;
            }

            const file = fs.createWriteStream(tempPath);
            const totalSize = parseInt(res.headers['content-length'], 10);
            let downloadedSize = 0;

            file.on('error', (err) => {
                koboldDownloadProgress = 0;
                koboldDownloadVersion = null;
                setKoboldStatus('error');
                sendKoboldLog(`[ERROR] Disk write error: ${err.message}`);
                try { file.close(); } catch (e) {}
                if (fs.existsSync(tempPath)) {
                    try { fs.unlinkSync(tempPath); } catch (e) {}
                }
            });

            res.on('data', (chunk) => {
                downloadedSize += chunk.length;
                file.write(chunk);
                if (totalSize) {
                    koboldDownloadProgress = Math.min(100, (downloadedSize / totalSize) * 100);
                }
                if (totalSize && mainWindow && !mainWindow.isDestroyed()) {
                    const progress = (downloadedSize / totalSize) * 100;
                    mainWindow.webContents.send('kobold:downloadProgress', progress);
                }
            });

            res.on('error', (err) => {
                koboldDownloadProgress = 0;
                koboldDownloadVersion = null;
                setKoboldStatus('error');
                sendKoboldLog(`[ERROR] Network stream error: ${err.message}`);
                try { file.close(); } catch (e) {}
                if (fs.existsSync(tempPath)) {
                    try { fs.unlinkSync(tempPath); } catch (e) {}
                }
            });

            res.on('end', () => {
                file.end(() => {
                    file.close(() => {
                        if (process.platform !== 'win32') {
                            try { fs.chmodSync(tempPath, 0o755); } catch (e) { console.error('[KoboldCPP] Failed to set permissions:', e); }
                        }

                        // If Kobold is currently running, terminate it before swapping
                        if (wasRunning || koboldProcess) {
                            sendKoboldLog('[INFO] Download complete. Stopping active instance for version swap...');
                            stopKobold(true);
                        }

                        const doSwap = (retryCount = 0) => {
                            fs.rename(tempPath, exePath, async (err) => {
                                if (err) {
                                    if ((err.code === 'EPERM' || err.code === 'EBUSY') && retryCount < 20) {
                                        if (retryCount === 0) {
                                            sendKoboldLog('[INFO] Swapping versions...');
                                            stopKobold(true);
                                        } else if (retryCount === 10) {
                                            stopKobold(true);
                                        }
                                        setTimeout(() => doSwap(retryCount + 1), 500);
                                    } else {
                                        setKoboldStatus('error');
                                        sendKoboldLog(`[ERROR] Move failed: ${err.message}`);
                                    }
                                } else {
                                    finalizeUpdate(opts, versionToRecord);
                                }
                            });
                        };

                        doSwap();
                    });
                });
            });

            async function finalizeUpdate(updateOpts, version) {
                if (version && version !== 'latest') {
                    saveLocalVersion(version);
                    sendKoboldLog(`[INFO] Version ${version} installed.`);
                } else {
                    try {
                        const latest = await getLatestVersion();
                        saveLocalVersion(latest);
                        sendKoboldLog(`[INFO] Version ${latest} installed.`);
                    } catch (e) {
                        console.warn('[KoboldCPP] Could not verify version after download.');
                    }
                }
                sendKoboldLog('[INFO] Download complete!');
                koboldDownloadProgress = 100;
                setTimeout(() => {
                    koboldDownloadProgress = 0;
                    koboldDownloadVersion = null;
                }, 3000);
                const shouldStart = wasRunning || (opts && (opts.contextSize || opts.modelPath));
                if (shouldStart) {
                    sendKoboldLog('[INFO] Starting KoboldCPP...');
                    startKobold(lastLaunchOpts || updateOpts);
                } else {
                    setKoboldStatus('stopped');
                }
            }
        }).on('error', (err) => {
            setKoboldStatus('error');
            sendKoboldLog(`[ERROR] Network error: ${err.message}`);
            if (fs.existsSync(tempPath)) {
                try { fs.unlinkSync(tempPath); } catch (e) {}
            }
        });
    }
}

function startKobold(opts = {}) {
    console.log('[KoboldCPP] Launch request received.');
    if (opts && Object.keys(opts).length > 0) {
        lastLaunchOpts = { ...opts };
    }

    const {
        modelPath = '',
        contextSize = 20480,
        port = 5001,
        useCuda = true,
        gpuLayers = -1,
        quantKv = 'q8_0',
        batchSize = 512,
        chatcompletionsadapter = 'AutoGuess',
        useJinja = true,
        autoFit = false,
        defaultgenamt = 2048,
        autofitpadding = 1024,
    } = opts;

    if (koboldProcess && !koboldProcess.killed && isProcessAlive(koboldProcess.pid)) {
        console.warn('[KoboldCPP] Already running.');
        setKoboldStatus('running');
        return;
    }

    const exePath = getKoboldPath();
    if (!fs.existsSync(exePath)) {
        console.log('[KoboldCPP] Binary not found. Starting download flow.');
        downloadKobold(opts);
        return;
    }

    // Pre-flight port check: prevent binding conflicts and process corruption
    const listeningPid = getListeningPid(port);
    if (listeningPid) {
        const procPath = getProcessPath(listeningPid);
        if (isSamePath(procPath, exePath)) {
            sendKoboldLog(`[INFO] Managed KoboldCPP is already running on port ${port} (PID ${listeningPid}). Re-attaching.`);
            managedPid = listeningPid;
            setKoboldStatus('running');
            return;
        } else {
            const errLog = `[ERROR] Port ${port} is occupied by an external process (PID ${listeningPid}: ${procPath || 'External'}). Stop the external process or use a different port.`;
            sendKoboldLog(errLog);
            setKoboldStatus('error');
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('kobold:portConflict', {
                    port,
                    pid: listeningPid,
                    exePath: procPath || 'External Process'
                });
            }
            return;
        }
    }

    console.log(`[KoboldCPP] Starting managed binary at: ${exePath}`);

    // Build CLI args — model is optional; user may load one from the KoboldCPP UI
    const args = [];
    if (useCuda) {
        if (process.platform === 'darwin') {
            // Apple Silicon and Intel Macs use Metal for GPU acceleration
            args.push('--usemetal');
        } else {
            // Windows/Linux use CUDA (NVIDIA) with optimized parameters
            args.push('--usecuda', 'normal', '0');
        }
    }

    // Automated offloading: --gpulayers -1 offloads layers safely up to GPU VRAM limits
    if (gpuLayers !== undefined && gpuLayers !== null) {
        args.push('--gpulayers', String(gpuLayers));
    } else {
        args.push('--gpulayers', '-1');
    }

    // Forced sub-layer autofit (llama.cpp regex tensor splitting) is disabled by default
    // to prevent crashes on MoE and modern models
    if (autoFit) args.push('--autofit');

    args.push('--contextsize', String(contextSize));
    args.push('--batchsize', String(batchSize));
    let normalizedQuantKv = 'q8_0';
    if (quantKv === 1 || quantKv === '1' || quantKv === 'q4' || quantKv === 'q4_0') {
        normalizedQuantKv = 'q4_0';
    } else if (quantKv === 0 || quantKv === '0' || quantKv === 'f16') {
        normalizedQuantKv = 'f16';
    } else if (quantKv === 'bf16') {
        normalizedQuantKv = 'bf16';
    } else if (quantKv === 'q5_1') {
        normalizedQuantKv = 'q5_1';
    } else {
        normalizedQuantKv = 'q8_0';
    }
    args.push('--quantkv', normalizedQuantKv);
    args.push('--port', String(port));
    if (useJinja) {
        args.push('--jinja');
        args.push('--jinjathink', 'default');
    }
    if (chatcompletionsadapter && chatcompletionsadapter !== 'None') {
        args.push('--chatcompletionsadapter', String(chatcompletionsadapter));
    }
    args.push('--defaultgenamt', String(defaultgenamt));
    args.push('--autofitpadding', String(autofitpadding));
    args.push('--skiplauncher');

    if (modelPath && fs.existsSync(modelPath)) {
        args.push('--model', modelPath);
    }

    console.log(`[KoboldCPP] Spawning: ${exePath} ${args.join(' ')}`);
    setKoboldStatus('starting');

    koboldProcess = spawn(exePath, args, {
        cwd: path.dirname(exePath),
        windowsHide: true // Don't open a console window
    });

    if (koboldProcess && koboldProcess.pid) {
        managedPid = koboldProcess.pid;
    }

    const archErrorRegex = /(?:unknown model architecture:?\s*['"]?([a-zA-Z0-9_\-\.]+)['"]?|error loading model architecture|failed to load model|unrecognized arguments:\s*--jinja)/i;
    function checkLineForIncompatibility(line) {
        const match = line.match(archErrorRegex);
        if (match && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('kobold:incompatibleModel', {
                log: line,
                arch: match[1] || ''
            });
        }
    }

    const isReadyLine = (line) => {
        return line.includes('Please connect to') ||
               line.includes('KCPP server listening') ||
               line.includes('Load Text Model OK') ||
               line.includes('KoboldCpp is ready') ||
               line.includes('Starting Kobold API on port');
    };

    koboldProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(Boolean);
        lines.forEach(line => {
            sendKoboldLog(line);
            checkLineForIncompatibility(line);
            // Detect when KoboldCPP is ready (it logs "Please connect to custom endpoint")
            if (koboldStatus === 'starting' && isReadyLine(line)) {
                setKoboldStatus('running');
            }
        });
    });

    koboldProcess.stderr.on('data', (data) => {
        const lines = data.toString().split('\n').filter(Boolean);
        lines.forEach(line => {
            sendKoboldLog(`[STDERR] ${line}`);
            if (koboldStatus === 'starting' && isReadyLine(line)) {
                setKoboldStatus('running');
            }
            checkLineForIncompatibility(line);
        });
    });

    // Active polling fallback: check HTTP /api/extra/version until ready
    if (readinessPollInterval) {
        clearInterval(readinessPollInterval);
        readinessPollInterval = null;
    }
    readinessPollInterval = setInterval(async () => {
        if (koboldStatus !== 'starting') {
            clearInterval(readinessPollInterval);
            readinessPollInterval = null;
            return;
        }
        const ver = await fetchKoboldApiVersion(port);
        if (ver) {
            clearInterval(readinessPollInterval);
            readinessPollInterval = null;
            if (koboldStatus === 'starting') {
                sendKoboldLog(`[INFO] KoboldCPP server is online and responding at port ${port}.`);
                setKoboldStatus('running');
            }
        }
    }, 750);

    koboldProcess.on('close', (code) => {
        if (readinessPollInterval) {
            clearInterval(readinessPollInterval);
            readinessPollInterval = null;
        }
        const wasStarting = (koboldStatus === 'starting');
        console.log(`[KoboldCPP] Process exited with code ${code}`);
        koboldProcess = null;
        managedPid = null;
        if (wasStarting && code !== 0) {
            sendKoboldLog(`[ERROR] KoboldCPP exited unexpectedly with code ${code}. Check the logs above for details.`);
            setKoboldStatus('error');
        } else {
            setKoboldStatus('stopped');
        }
    });

    koboldProcess.on('error', (err) => {
        console.error('[KoboldCPP] Spawn error:', err);
        koboldProcess = null;
        managedPid = null;
        setKoboldStatus('error');
        sendKoboldLog(`[ERROR] Failed to start: ${err.message}`);
    });
}

/**
 * Stops running KoboldCPP process.
 * If target === 'external' and opts.pid is provided, terminates that specific external PID.
 * Otherwise, stops ONLY ELM's managed local install (and its process tree).
 * Never uses blanket image killing (e.g. taskkill /IM koboldcpp.exe), preventing accidental
 * termination of unrelated KoboldCPP instances running on the user's system.
 */
function stopKobold(opts = false) {
    const isForce = typeof opts === 'boolean' ? opts : (opts && opts.force !== undefined ? !!opts.force : true);
    const target = (typeof opts === 'object' && opts && opts.target) || 'managed';
    const specificPid = (typeof opts === 'object' && opts && opts.pid) ? Number(opts.pid) : null;

    console.log(`[KoboldCPP] Stop requested: target=${target}, pid=${specificPid || 'auto'}, force=${isForce}`);

    if (target === 'external' && specificPid) {
        killProcessTree(specificPid, true);
        sendKoboldLog(`[INFO] Terminated external process (PID ${specificPid}).`);
        setKoboldStatus('stopped');
        return { success: true };
    }

    // Stop managed instance
    let targetPid = (koboldProcess && koboldProcess.pid) ? koboldProcess.pid : managedPid;

    // If not tracked in memory, check if our managed binary is currently bound to port
    if (!targetPid) {
        const managedExe = getKoboldPath();
        const listeningPid = getListeningPid(lastLaunchOpts?.port || 5001);
        if (listeningPid) {
            const procPath = getProcessPath(listeningPid);
            if (isSamePath(procPath, managedExe)) {
                targetPid = listeningPid;
                console.log(`[KoboldCPP] Found orphan managed process at PID ${targetPid} to stop.`);
            }
        }
    }

    if (targetPid) {
        console.log(`[KoboldCPP] Stopping managed process tree (PID ${targetPid})...`);
        killProcessTree(targetPid, true);
        sendKoboldLog(`[INFO] Stopped managed KoboldCPP (PID ${targetPid}).`);
    } else if (koboldProcess) {
        try { koboldProcess.kill('SIGTERM'); } catch (e) {}
    }

    koboldProcess = null;
    managedPid = null;
    setKoboldStatus('stopped');
    return { success: true };
}

// ============================================================
// IPC HANDLERS
// ============================================================
ipcMain.handle('kobold:start', (_event, opts) => startKobold(opts));
ipcMain.handle('kobold:stop', (_event, opts) => stopKobold(opts));
ipcMain.handle('kobold:getStatus', () => koboldStatus);
ipcMain.handle('kobold:getDetailedStatus', (_event, port) => getDetailedKoboldStatus(port));
ipcMain.handle('kobold:getDownloadProgress', () => ({
    status: koboldStatus,
    progress: koboldDownloadProgress,
    version: koboldDownloadVersion
}));
ipcMain.handle('kobold:getLatestVersion', () => getLatestVersion());
ipcMain.handle('kobold:getLocalVersion', () => getLocalVersion());
ipcMain.handle('kobold:update', (_event, version) => downloadKobold({ targetVersion: version }));

ipcMain.handle('app:getLatestVersion', async () => {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: '/repos/pacmanincarnate/EllipsisLM/releases/latest',
            headers: { 'User-Agent': 'EllipsisLM-Desktop' }
        };
        https.get(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode === 404) {
                    return reject(new Error('No releases found on GitHub.'));
                }
                if (res.statusCode !== 200) {
                    return reject(new Error(`GitHub API returned status ${res.statusCode}`));
                }
                try {
                    const json = JSON.parse(body);
                    if (!json || !json.tag_name) {
                        return reject(new Error('Invalid GitHub response structure (missing tag_name)'));
                    }
                    const assets = Array.isArray(json.assets)
                        ? json.assets.map(a => ({ name: a.name, url: a.browser_download_url }))
                        : [];

                    resolve({
                        version: json.tag_name,
                        notes: json.body || '',
                        assets: assets
                    });
                } catch (e) {
                    console.error('[AppUpdate] Parse error:', body);
                    reject(new Error('Failed to parse GitHub response'));
                }
            });
        }).on('error', (err) => {
            reject(new Error('Network error reaching GitHub: ' + err.message));
        });
    });
});

let appUpdateDownloader = null;
ipcMain.handle('app:downloadUpdate', async (_event, url) => {
    const tempDir = app.getPath('temp');
    const ext = process.platform === 'darwin' ? '.dmg' : '.exe';
    const installerPath = path.join(tempDir, `EllipsisLM_Setup_Update${ext}`);

    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(installerPath);

        function get(downloadUrl) {
            https.get(downloadUrl, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    get(res.headers.location); return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`Download failed: ${res.statusCode}`)); return;
                }

                const totalSize = parseInt(res.headers['content-length'], 10);
                let downloadedSize = 0;

                res.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    file.write(chunk);
                    if (totalSize && mainWindow) {
                        mainWindow.webContents.send('app:updateProgress', (downloadedSize / totalSize) * 100);
                    }
                });

                res.on('end', () => {
                    file.end(() => resolve(installerPath));
                });
            }).on('error', (err) => {
                fs.unlink(installerPath, () => { });
                reject(err);
            });
        }
        get(url);
    });
});

ipcMain.handle('app:applyUpdate', (_event, installerPath) => {
    console.log('[AppUpdate] Launching installer:', installerPath);

    if (process.platform === 'darwin') {
        shell.openPath(installerPath);
        app.quit();
    } else {
        const installer = spawn(installerPath, [], {
            detached: true,
            stdio: 'ignore'
        });
        installer.unref();
        app.quit();
    }
});

ipcMain.handle('dialog:pickModelFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select GGUF Model File',
        filters: [
            { name: 'GGUF Model', extensions: ['gguf'] },
            { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
    });
    return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('app:getResourcePath', (_event, filename) => {
    return app.isPackaged
        ? path.join(process.resourcesPath, filename)
        : path.join(__dirname, '..', filename);
});

ipcMain.handle('app:getVersion', () => app.getVersion());

ipcMain.handle('app:scrapeUrl', async (_event, url) => {
    return new Promise((resolve) => {
        let hiddenWindow = new BrowserWindow({
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });

        let isResolved = false;
        const cleanup = () => {
            if (!hiddenWindow.isDestroyed()) hiddenWindow.close();
        };

        const checkData = async () => {
            if (isResolved || hiddenWindow.isDestroyed()) return;
            try {
                const nextDataStr = await hiddenWindow.webContents.executeJavaScript(`
                    (function() {
                        const script = document.getElementById('__NEXT_DATA__');
                        if (script) return script.textContent;
                        return null;
                    })()
                `);
                if (nextDataStr) {
                    isResolved = true;
                    try {
                        const data = JSON.parse(nextDataStr);
                        resolve({ success: true, data });
                    } catch (e) {
                        resolve({ success: false, error: 'Failed to parse JSON data from page.' });
                    }
                    cleanup();
                }
            } catch (e) {}
        };

        hiddenWindow.webContents.on('did-finish-load', () => {
            checkData();
            setTimeout(checkData, 2000);
            setTimeout(checkData, 5000);
            setTimeout(checkData, 8000);
            
            // Timeout after 15 seconds
            setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    resolve({ success: false, error: 'Timeout waiting for page data. Page format may have changed or Cloudflare blocked the request.' });
                    cleanup();
                }
            }, 15000);
        });

        hiddenWindow.loadURL(url).catch(e => {
            if (!isResolved) {
                isResolved = true;
                resolve({ success: false, error: e.message });
                cleanup();
            }
        });
    });
});

// ============================================================
// NATIVE AUTO-BACKUP IPC HANDLERS
// ============================================================
ipcMain.handle('backup:saveNative', async (_event, payload) => {
    try {
        if (!payload || typeof payload !== 'object') return { success: false, error: 'Invalid payload' };
        const backupDir = path.join(app.getPath('userData'), 'autobackups');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

        const latestPath = path.join(backupDir, 'autobackup_latest.json');
        const prevPath = path.join(backupDir, 'autobackup_previous.json');
        const tempPath = path.join(backupDir, 'autobackup_latest.json.tmp');

        // Roll previous backup if latest exists
        if (fs.existsSync(latestPath)) {
            try {
                fs.copyFileSync(latestPath, prevPath);
            } catch (e) {
                console.warn('[AutoBackup] Failed to copy previous backup:', e);
            }
        }

        // Atomic write via temp file
        const dataStr = JSON.stringify(payload);
        fs.writeFileSync(tempPath, dataStr, 'utf8');
        fs.renameSync(tempPath, latestPath);

        return { success: true, timestamp: payload.timestamp || new Date().toISOString(), bytes: dataStr.length };
    } catch (e) {
        console.error('[AutoBackup] Native save error:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('backup:loadNative', async () => {
    try {
        const backupDir = path.join(app.getPath('userData'), 'autobackups');
        const latestPath = path.join(backupDir, 'autobackup_latest.json');
        const prevPath = path.join(backupDir, 'autobackup_previous.json');

        let targetPath = null;
        if (fs.existsSync(latestPath)) targetPath = latestPath;
        else if (fs.existsSync(prevPath)) targetPath = prevPath;

        if (!targetPath) return { success: false, error: 'No native backup file found.' };

        try {
            const raw = fs.readFileSync(targetPath, 'utf8');
            const data = JSON.parse(raw);
            return { success: true, data, source: path.basename(targetPath) };
        } catch (parseErr) {
            console.warn(`[AutoBackup] ${targetPath} corrupted, attempting fallback...`);
            if (targetPath === latestPath && fs.existsSync(prevPath)) {
                const rawPrev = fs.readFileSync(prevPath, 'utf8');
                const dataPrev = JSON.parse(rawPrev);
                return { success: true, data: dataPrev, source: 'autobackup_previous.json' };
            }
            throw parseErr;
        }
    } catch (e) {
        console.error('[AutoBackup] Native load error:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('backup:getInfo', async () => {
    try {
        const backupDir = path.join(app.getPath('userData'), 'autobackups');
        const latestPath = path.join(backupDir, 'autobackup_latest.json');
        const prevPath = path.join(backupDir, 'autobackup_previous.json');

        const info = { latest: null, previous: null };
        if (fs.existsSync(latestPath)) {
            const stat = fs.statSync(latestPath);
            info.latest = { mtime: stat.mtime.toISOString(), sizeBytes: stat.size };
        }
        if (fs.existsSync(prevPath)) {
            const stat = fs.statSync(prevPath);
            info.previous = { mtime: stat.mtime.toISOString(), sizeBytes: stat.size };
        }
        return { success: true, info };
    } catch (e) {
        return { success: false, error: e.message };
    }
});
// ============================================================
// DEBUG LOGGING IPC HANDLERS
// ============================================================
ipcMain.handle('debug:copyLog', async (_event, clientState) => {
    try {
        const report = await generateDiagnosticReport(clientState);
        clipboard.writeText(report);
        const lines = report.split('\n').length;
        const sizeKB = (Buffer.byteLength(report, 'utf8') / 1024).toFixed(1);
        logDebug('info', 'DEBUG', `Diagnostic log copied to clipboard (${lines} lines, ${sizeKB} KB)`);
        return { success: true, lines, sizeKB, logPath: getLogPath() };
    } catch (e) {
        logDebug('error', 'DEBUG', `Failed to copy debug log: ${e.message}`);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('debug:getLog', async (_event, clientState) => {
    try {
        const report = await generateDiagnosticReport(clientState);
        const lines = report.split('\n').length;
        const sizeKB = (Buffer.byteLength(report, 'utf8') / 1024).toFixed(1);
        return { success: true, report, lines, sizeKB, logPath: getLogPath() };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('debug:openLogFile', async () => {
    try {
        const logFile = getLogPath();
        if (!fs.existsSync(logFile)) {
            fs.writeFileSync(logFile, `[${new Date().toISOString()}] [SYSTEM/INFO] Log initialized.\n`, 'utf8');
        }
        shell.showItemInFolder(logFile);
        return { success: true, logPath: logFile };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('debug:clearLog', async () => {
    try {
        memoryLogBuffer.length = 0;
        const logFile = getLogPath();
        if (fs.existsSync(logFile)) {
            fs.writeFileSync(logFile, `[${new Date().toISOString()}] [SYSTEM/INFO] Log cleared by user.\n`, 'utf8');
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('debug:log', (_event, { level = 'info', message = '', source = 'RENDERER' } = {}) => {
    logDebug(level, source, message);
    return { success: true };
});

// ============================================================
// WINDOW CREATION
// ============================================================
function createWindow() {
    // Intercept outgoing requests to AI Dungeon's Firebase Auth and GraphQL API
    // and spoof the Referer/Origin headers so Google/Firebase permits the request.
    session.defaultSession.webRequest.onBeforeSendHeaders(
        { urls: [
            'https://identitytoolkit.googleapis.com/*',
            'https://api.aidungeon.com/*'
        ] },
        (details, callback) => {
            details.requestHeaders['Referer'] = 'https://play.aidungeon.com/';
            details.requestHeaders['Origin'] = 'https://play.aidungeon.com';
            callback({ requestHeaders: details.requestHeaders });
        }
    );

    // Ensure local endpoints (e.g. ComfyUI at 127.0.0.1:8188 or localhost)
    // are not blocked by CORS in desktop Electron even if launched without --enable-cors-header.
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const url = details.url;
        if (url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:')) {
            const responseHeaders = Object.assign({}, details.responseHeaders);
            responseHeaders['Access-Control-Allow-Origin'] = ['*'];
            responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, OPTIONS'];
            responseHeaders['Access-Control-Allow-Headers'] = ['*'];
            return callback({ responseHeaders });
        }
        callback({ responseHeaders: details.responseHeaders });
    });

    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        title: 'EllipsisLM',
        backgroundColor: '#111827', // Match app background to prevent flash
        show: false,               // Don't show until ready-to-show fires
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,  // Security: renderer can't access Node
            nodeIntegration: false,  // Security: no direct Node in renderer
            // Allow file:// IndexedDB — Electron supports this natively
            webSecurity: true,
            allowRunningInsecureContent: false
        }
    });

    // Capture renderer console messages into debug log
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        const levelStr = level === 3 ? 'error' : (level === 2 ? 'warn' : 'info');
        const src = sourceId ? path.basename(sourceId) : 'index.html';
        logDebug(levelStr, 'RENDERER', `${message} (${src}:${line})`);
    });

    mainWindow.webContents.on('render-process-gone', (event, details) => {
        logDebug('error', 'RENDERER', `Renderer process gone: reason=${details.reason}, exitCode=${details.exitCode}`);
    });

    mainWindow.webContents.on('unresponsive', () => {
        logDebug('warn', 'RENDERER', 'Main window became unresponsive.');
    });

    mainWindow.webContents.on('responsive', () => {
        logDebug('info', 'RENDERER', 'Main window became responsive again.');
    });

    // Load the single HTML file directly from disk
    mainWindow.loadFile(HTML_FILE);

    // Show window as soon as it's painted (no white flash)
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Open DevTools in development mode
    if (!app.isPackaged) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    // Handle external links — open in system browser, not Electron
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ============================================================
// APP LIFECYCLE
// ============================================================
app.whenReady().then(() => {
    logDebug('info', 'SYSTEM', `EllipsisLM starting - Version: ${app.getVersion()}, Platform: ${process.platform} (${process.arch})`);
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    // Force-kill KoboldCPP before exit to ensure no orphans
    stopKobold(true);
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    stopKobold(true);
});
