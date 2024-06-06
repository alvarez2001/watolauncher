const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { exec, spawn } = require('child_process');
const fs = require('fs-extra');
const https = require('https');
const axios = require('axios');

let mainWindow;
let minecraftLauncherPath;

const profileMasterPath = path.join(process.env.APPDATA, 'minecraft-launcher', 'profile-master');

// Versiones fijas de Minecraft y Forge
const MINECRAFT_VERSION = '1.20.1';
const FORGE_VERSION = '47.2.0';
const MODS_VERSION = '1.0.0';
const MODS_ENDPOINT = 'https://api.watofier.com/mods'; // Reemplaza esto con tu endpoint real

const possibleLauncherPaths = [
    path.join(process.env.PROGRAMFILES, 'Minecraft Launcher', 'MinecraftLauncher.exe'),
    path.join(process.env['PROGRAMFILES(X86)'], 'Minecraft Launcher', 'MinecraftLauncher.exe'),
    path.join(process.env.APPDATA, 'minecraft-launcher', 'MinecraftLauncher.exe'),
    'C:\\XboxGames\\Minecraft Launcher\\Content\\Minecraft.exe'
];

function findMinecraftLauncher() {
    for (const launcherPath of possibleLauncherPaths) {
        if (fs.existsSync(launcherPath)) {
            return launcherPath;
        }
    }
    return null;
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        resizable: false,
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // mainWindow.setMenuBarVisibility(false);
    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    mainWindow.once('ready-to-show', () => {
        autoUpdater.checkForUpdatesAndNotify();
    });
}

app.on('ready', async () => {
    createWindow();
    await createProfileMaster();
    minecraftLauncherPath = findMinecraftLauncher();
    mainWindow.webContents.send('loading', 'Verificando Launcher');
    if (!minecraftLauncherPath) {
        console.error('Minecraft launcher not found.');
    } else {
        const forgeInstalled = await isForgeInstalled();
        if (!forgeInstalled) {
            mainWindow.webContents.send('loading', 'Instalando Forge, Por favor espere...');
            await installForgeAuto();
        }
    }
    await handleMods();
    mainWindow.webContents.send('loading-complete');
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

async function createProfileMaster() {
    try {
        await fs.ensureDir(profileMasterPath);
        await fs.ensureDir(path.join(profileMasterPath, 'mods'));
        await fs.ensureDir(path.join(profileMasterPath, 'shaderpacks'));
        await fs.ensureDir(path.join(profileMasterPath, 'resourcepacks'));
        await fs.ensureDir(path.join(profileMasterPath, 'config'));
    } catch (error) {
        console.error(`Failed to create profile-master: ${error.message}`);
    }
}

async function isForgeInstalled() {
    const forgeVersionDir = path.join(profileMasterPath, 'versions', `${MINECRAFT_VERSION}-forge-${FORGE_VERSION}`);
    return fs.existsSync(forgeVersionDir);
}

async function installForgeAuto() {
    try {
        if (!minecraftLauncherPath) {
            throw new Error('Minecraft launcher not found.');
        }

        mainWindow.webContents.send('loading', 'Instalando Forge, Por favor espere...');

        // Open Minecraft to initialize necessary files
        await openMinecraft();

        const forgeInstallerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${MINECRAFT_VERSION}-${FORGE_VERSION}/forge-${MINECRAFT_VERSION}-${FORGE_VERSION}-installer.jar`;
        const installerPath = path.join(profileMasterPath, `forge-${MINECRAFT_VERSION}-${FORGE_VERSION}-installer.jar`);

        await downloadFile(forgeInstallerUrl, installerPath);
        await installForge(installerPath, profileMasterPath);

        mainWindow.webContents.send('loading', 'Forge instalado correctamente');
    } catch (error) {
        mainWindow.webContents.send('loading', `Fallo al instalar Forge: ${error.message}`);
    }
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const download = (url) => {
            https.get(new URL(url), (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    // Handle redirection
                    const redirectUrl = response.headers.location.startsWith('http') ? response.headers.location : new URL(response.headers.location, url).href;
                    download(redirectUrl);
                } else if (response.statusCode !== 200) {
                    return reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
                } else {
                    response.pipe(file);
                    file.on('finish', () => file.close(resolve));
                }
            }).on('error', (err) => {
                fs.unlink(dest, () => reject(err));
            });
        };
        download(url);
    });
}

function openMinecraft() {
    return new Promise((resolve, reject) => {
        const command = `"${minecraftLauncherPath}" --workDir "${profileMasterPath}"`;

        const minecraftProcess = spawn(command, [], { shell: true });

        minecraftProcess.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
        });

        minecraftProcess.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
        });

        setTimeout(() => {
            minecraftProcess.kill();
            setTimeout(() => {
                exec(`taskkill /F /IM "Minecraft.exe"`, (err) => {
                    if (err) {
                        console.error(`Failed to forcefully kill Minecraft process: ${err.message}`);
                    } else {
                        console.log('Minecraft process killed after initialization.');
                    }
                    resolve();
                });
            }, 2000);
        }, 2000);
    });
}

function installForge(installerPath, profilePath) {
    return new Promise((resolve, reject) => {
        mainWindow.webContents.send('loading', 'Instalando Forge, Por favor espere...');
        const absoluteInstallerPath = path.resolve(installerPath);
        const absoluteProfilePath = path.resolve(profilePath);
        const command = `java -jar "${absoluteInstallerPath}" --installClient "${absoluteProfilePath}"`;

        console.log(`Executing command: ${command}`);

        exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => { // Aumentar el tamaño del buffer a 10MB
            if (error) {
                console.error(`Error executing command: ${command}`);
                console.error(`Error message: ${stderr || error.message}`);
                return reject(new Error(`Failed to install Forge: ${stderr || error.message}`));
            }
            console.log(`Forge installed successfully: ${stdout}`);
            mainWindow.webContents.send('loading-complete');
            resolve(stdout);
        });
    });
}

async function handleMods() {
    try {
        mainWindow.webContents.send('loading', 'Chequeando si el waton del ryaco metio mas mods...');
        const response = await axios.get(MODS_ENDPOINT);
        const data = response.data;
        const modsPath = path.join(profileMasterPath, 'mods');
        await fs.ensureDir(modsPath);

        const modsVersionFile = path.join(profileMasterPath, 'mods-version.json');
        let installedMods = { version: '', mods: [] };

        if (fs.existsSync(modsVersionFile)) {
            installedMods = await fs.readJson(modsVersionFile);
        }

        const installedModsMap = new Map(installedMods.mods.map(mod => [mod.name, mod]));

        if (installedMods.version !== data.version) {
            // Lista de nombres de archivos de mods desde el endpoint
            const modFilesFromEndpoint = data.mods.map(mod => `${mod.name}.jar`);
            // Eliminar archivos extra que no están en el endpoint
            const currentModFiles = await fs.readdir(modsPath);
            for (const file of currentModFiles) {
                if (!modFilesFromEndpoint.includes(file)) {
                    await fs.remove(path.join(modsPath, file));
                }
            }

            mainWindow.webContents.send('loading', 'Actualizando, ha ryaco le dio por meter mas mods...');
            for (const mod of data.mods) {
                const installedMod = installedModsMap.get(mod.name);
                if (!installedMod || installedMod.version !== mod.version) {
                    const modPath = path.join(modsPath, `${mod.name}.jar`);
                    await downloadFile(mod.url, modPath);
                }
            }

            await fs.writeJson(modsVersionFile, { version: data.version, mods: data.mods }, { spaces: 2 });
        }

        mainWindow.webContents.send('loading', 'Mods actualizados correctamente');
        
    } catch (error) {
        mainWindow.webContents.send('loading', `Failed to handle mods: ${error.message}`);
    }
}

ipcMain.on('launch-minecraft', (event) => {
    if (!minecraftLauncherPath) {
        event.sender.send('launch-error', 'Launcher no encontrado.');
        return;
    }
    
    const profileGameDir = profileMasterPath;

    const command = `"${minecraftLauncherPath}" --workDir "${profileGameDir}"`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error lanzando Minecraft: ${error.message}`);
            console.error(`stderr: ${stderr}`);
            console.error(`stdout: ${stdout}`);
            event.sender.send('launch-error', `Fallo al lanzar el launcher: ${error.message}`);
            return;
        }
        console.log(`Minecraft launched successfully: ${stdout}`);
        event.sender.send('launch-success', 'Launcher lanzado con exito.');
    });
});

ipcMain.on('minimize-window', () => {
    mainWindow.minimize();
});

ipcMain.on('close-window', () => {
    mainWindow.close();
});

autoUpdater.on('update-available', () => {
    log.info('Update available.');
    mainWindow.webContents.send('update-available');
});

autoUpdater.on('update-downloaded', () => {
    log.info('Update downloaded.');
    mainWindow.webContents.send('update-downloaded');
});

ipcMain.on('restart-app', () => {
    autoUpdater.quitAndInstall();
});   