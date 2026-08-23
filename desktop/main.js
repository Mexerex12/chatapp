const { app, BrowserWindow, Menu, systemPreferences, session } = require("electron");
const path = require("path");

// URL do frontend: em desenvolvimento aponta para o Vite dev server.
// Para empacotar como app "de verdade", rode `npm run build` no frontend
// e sirva o conteúdo de frontend/dist (ex: com um servidor estático local),
// atualizando FRONTEND_URL abaixo.
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#1e1f26",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Concede automaticamente permissão de microfone/câmera/tela para o
  // próprio app (sem isso, getUserMedia/getDisplayMedia falham no Electron).
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = ["media", "microphone", "camera", "display-capture"];
    callback(allowed.includes(permission));
  });

  win.loadURL(FRONTEND_URL);
}

app.whenReady().then(() => {
  // No macOS, solicita permissão explícita do SO para microfone/câmera.
  if (process.platform === "darwin") {
    systemPreferences.askForMediaAccess("microphone").catch(() => {});
    systemPreferences.askForMediaAccess("camera").catch(() => {});
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
