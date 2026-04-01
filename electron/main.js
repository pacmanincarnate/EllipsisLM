/**
 * EllipsisLM Electron Main Process
 *
 * Responsibilities:
 *   1. Create the application window and load the HTML app.
 *   2. Manage the KoboldCPP child process lifecycle.
 *   3. Handle IPC requests from the renderer (via preload.js bridge).
 */
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');

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
// KOBOLDCPP PROCESS MANAGEMENT
// ============================================================
let koboldProcess = null;
let koboldStatus = 'stopped'; // 'stopped' | 'starting' | 'running' | 'error' | 'downloading'
let mainWindow = null;

function setKoboldStatus(status) {
    koboldStatus = status;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('kobold:statusChange', status);
    }
    console.log(`[KoboldCPP] Status: ${status}`);
}

function sendKoboldLog(line) {
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
            reject(new Error('Network error reaching GitHub: ' + err.message));
        });
    });
}

function downloadKobold(opts) {
    const { targetVersion = 'latest' } = opts;
    const url = targetVersion === 'latest' 
        ? KOBOLD_URL 
        : `https://github.com/LostRuins/koboldcpp/releases/download/${targetVersion}/${EXE_NAME}`;

    const exePath = path.join(app.getPath('userData'), EXE_NAME);
    const tempPath = exePath + '.tmp';
    
    setKoboldStatus('downloading');
    
    async function executeDownload(versionToRecord) {
        sendKoboldLog(`[INFO] Preparing to download KoboldCPP ${versionToRecord}...`);
        get(url, versionToRecord);
    }

    if (targetVersion === 'latest') {
        getLatestVersion().then(v => executeDownload(v)).catch(() => executeDownload('latest'));
    } else {
        executeDownload(targetVersion);
    }

    function get(downloadUrl, versionToRecord) {
        https.get(downloadUrl, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                get(res.headers.location, versionToRecord);
                return;
            }
            if (res.statusCode !== 200) {
                setKoboldStatus('error');
                sendKoboldLog(`[ERROR] Download failed (Status ${res.statusCode})`);
                return;
            }
            
            const file = fs.createWriteStream(tempPath);
            const totalSize = parseInt(res.headers['content-length'], 10);
            let downloadedSize = 0;

            res.on('data', (chunk) => {
                downloadedSize += chunk.length;
                file.write(chunk);
                if (totalSize && mainWindow && !mainWindow.isDestroyed()) {
                    const progress = (downloadedSize / totalSize) * 100;
                    mainWindow.webContents.send('kobold:downloadProgress', progress);
                }
            });

            res.on('end', () => {
                file.end(() => {
                    if (process.platform !== 'win32') {
                        try { fs.chmodSync(tempPath, 0o755); } catch(e) { console.error('[KoboldCPP] Failed to set permissions:', e); }
                    }
                    fs.rename(tempPath, exePath, async (err) => {
                        if (err) {
                            // On Windows, rename fails if the EXE is running. 
                            // This is expected for an update while roleplaying.
                            if (err.code === 'EPERM' || err.code === 'EBUSY') {
                                sendKoboldLog('[INFO] Download complete. Swapping versions...');
                                
                                // Perform a more aggressive kill to unlock the file
                                stopKobold(true); 
                                
                                // Wait a moment for the OS to release the file handle
                                let retries = 0;
                                const tryRename = setInterval(() => {
                                    fs.rename(tempPath, exePath, async (renameErr) => {
                                        if (!renameErr) {
                                            clearInterval(tryRename);
                                            finalizeUpdate(opts);
                                        } else if (++retries > 20) { // 10 seconds timeout
                                            clearInterval(tryRename);
                                            setKoboldStatus('error');
                                            sendKoboldLog(`[ERROR] Version swap timed out: ${renameErr.message}`);
                                        } else if (retries === 10) {
                                            // Halfway through retries, try one more aggressive force-kill
                                            stopKobold(true);
                                        }
                                    });
                                }, 500);
                            } else {
                                setKoboldStatus('error');
                                sendKoboldLog(`[ERROR] Move failed: ${err.message}`);
                            }
                        } else {
                            finalizeUpdate(opts, versionToRecord);
                        }
                    });
                });
            });

            async function finalizeUpdate(updateOpts, version) {
                if (version && version !== 'latest') {
                    saveLocalVersion(version);
                    sendKoboldLog(`[INFO] Version ${version} installed.`);
                } else {
                    // Fallback if we somehow don't have a specific version string
                    try {
                        const latest = await getLatestVersion();
                        saveLocalVersion(latest);
                        sendKoboldLog(`[INFO] Version ${latest} installed.`);
                    } catch (e) {
                        console.warn('[KoboldCPP] Could not verify version after download.');
                    }
                }
                sendKoboldLog('[INFO] Download complete!');
                startKobold(updateOpts);
            }
        }).on('error', (err) => {
            setKoboldStatus('error');
            sendKoboldLog(`[ERROR] Network error: ${err.message}`);
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        });
    }

    get(url);
}

function startKobold(opts = {}) {
    console.log('[KoboldCPP] Launch request received.');
    if (koboldProcess) {
        console.warn('[KoboldCPP] Already running.');
        return;
    }

    const exePath = getKoboldPath();
    if (!fs.existsSync(exePath)) {
        console.log('[KoboldCPP] Binary not found. Starting download flow.');
        downloadKobold(opts);
        return;
    }
    console.log(`[KoboldCPP] Starting binary at: ${exePath}`);

    const {
        modelPath = '',
        contextSize = 18432,
        port = 5001,
        useCuda = true,
        quantKv = 1
    } = opts;

    // Build CLI args — model is optional; user may load one from the KoboldCPP UI
    const args = [];
    if (useCuda) {
        if (process.platform === 'darwin') {
            // Apple Silicon and Intel Macs use Metal for GPU acceleration
            args.push('--usemetal');
        } else {
            // Windows/Linux use CUDA (NVIDIA)
            args.push('--usecublas');
        }
    }
    args.push('--contextsize', String(contextSize));
    args.push('--quantkv', String(quantKv));
    args.push('--port', String(port));
    if (modelPath && fs.existsSync(modelPath)) {
        args.push('--model', modelPath);
    }

    console.log(`[KoboldCPP] Spawning: ${exePath} ${args.join(' ')}`);
    setKoboldStatus('starting');

    koboldProcess = spawn(exePath, args, {
        cwd: path.dirname(exePath),
        windowsHide: true // Don't open a console window
    });

    koboldProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(Boolean);
        lines.forEach(line => {
            sendKoboldLog(line);
            // Detect when KoboldCPP is ready (it logs "Please connect to custom endpoint")
            if (koboldStatus === 'starting' && line.includes('Please connect to')) {
                setKoboldStatus('running');
            }
        });
    });

    koboldProcess.stderr.on('data', (data) => {
        const lines = data.toString().split('\n').filter(Boolean);
        lines.forEach(line => sendKoboldLog(`[STDERR] ${line}`));
    });

    koboldProcess.on('close', (code) => {
        console.log(`[KoboldCPP] Process exited with code ${code}`);
        koboldProcess = null;
        setKoboldStatus('stopped');
    });

    koboldProcess.on('error', (err) => {
        console.error('[KoboldCPP] Spawn error:', err);
        koboldProcess = null;
        setKoboldStatus('error');
        sendKoboldLog(`[ERROR] Failed to start: ${err.message}`);
    });
}

/**
 * Stops any running KoboldCPP process.
 * @param {boolean} force - If true, uses taskkill on Windows to ensure the file is unlocked.
 */
function stopKobold(force = false) {
    if (force && process.platform === 'win32') {
        console.log('[KoboldCPP] Performing force-kill on koboldcpp.exe...');
        try {
            if (koboldProcess && koboldProcess.pid) {
                // Kill by PID for precision
                spawnSync('taskkill', ['/F', '/PID', String(koboldProcess.pid), '/T'], { windowsHide: true });
            } else {
                // Fallback: Kill by image name to ensure no orphans are left
                spawnSync('taskkill', ['/F', '/IM', EXE_NAME, '/T'], { windowsHide: true });
            }
        } catch (e) {
            console.warn('[KoboldCPP] taskkill failed:', e.message);
        }
    }

    if (!koboldProcess) return;
    
    console.log('[KoboldCPP] Stopping tracked process...');
    try {
        koboldProcess.kill('SIGTERM');
        // Give it a moment to die gracefully if not forced
        if (!force) {
            setTimeout(() => {
                if (koboldProcess) {
                    try { koboldProcess.kill('SIGKILL'); } catch (e) {}
                    koboldProcess = null;
                }
            }, 3000);
        } else {
            koboldProcess = null;
        }
    } catch (e) {
        console.warn('[KoboldCPP] Error killing process:', e.message);
        koboldProcess = null;
    }
}

// ============================================================
// IPC HANDLERS
// ============================================================
ipcMain.handle('kobold:start', (_event, opts) => startKobold(opts));
ipcMain.handle('kobold:stop', () => stopKobold());
ipcMain.handle('kobold:getStatus', () => koboldStatus);
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
                fs.unlink(installerPath, () => {});
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

// ============================================================
// WINDOW CREATION
// ============================================================
function createWindow() {
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
