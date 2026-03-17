/**
 * Electron main process for the Enova Admin Panel.
 *
 * To use:
 *   1. npm install --save-dev electron
 *   2. Add "main": "src/electron/main.js" to package.json
 *   3. npx tsc src/electron/main.ts --outDir dist/electron
 *   4. npx electron dist/electron/main.js
 *
 * Or for development, build the admin panel with `npm run build`
 * then run `npx electron .` pointing to the dist/ folder.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow } = require('electron') as typeof import('electron');
const path = require('path') as typeof import('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Enova Admin Panel',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const isDev = process.env.NODE_ENV === 'development';
  const devPort = process.env.ADMIN_DEV_PORT || '3001';
  if (isDev) {
    win.loadURL(`http://localhost:${devPort}`);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
