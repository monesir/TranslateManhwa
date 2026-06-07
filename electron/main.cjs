const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");
const { createAppApi } = require("./application/app-api.cjs");
const { createDatabase } = require("./data/database.cjs");
const { registerIpcHandlers } = require("./ipc.cjs");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let databaseHandle;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#0f1419",
    title: "Floris Manhwa Translator",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  mainWindow.removeMenu();

  if (isDev) {
    mainWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}/#/explorer`);
    if (process.env.FLORIS_OPEN_DEVTOOLS === "1") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  databaseHandle = createDatabase(app);
  const appApi = createAppApi(databaseHandle.db);
  registerIpcHandlers(appApi);

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  databaseHandle?.db?.close();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
