const { app, BrowserWindow, protocol, shell, session } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { createAppApi } = require("./application/app-api.cjs");
const { PAGE_CACHE_HOST } = require("./data/chapter-page-store.cjs");
const { COVER_CACHE_HOST, COVER_CACHE_SCHEME } = require("./data/cover-cache.cjs");
const { createDatabase } = require("./data/database.cjs");
const { registerIpcHandlers } = require("./ipc.cjs");
const {
  applyElectronRuntimePaths,
  applyRuntimeEnvironment,
  getRuntimePaths,
} = require("./runtime-paths.cjs");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let databaseHandle;
const runtimePaths = applyRuntimeEnvironment(getRuntimePaths());
applyElectronRuntimePaths(app, runtimePaths);

protocol.registerSchemesAsPrivileged([
  {
    scheme: COVER_CACHE_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
]);

function installImageRequestHeaders() {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ["*://*.2xstorage.com/*"] },
    (details, callback) => {
      details.requestHeaders.Referer = "https://www.mangabats.com/";
      callback({ requestHeaders: details.requestHeaders });
    },
  );
}

function imageContentType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".webp":
      return "image/webp";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".avif":
      return "image/avif";
    default:
      return "application/octet-stream";
  }
}

function installCacheProtocol(workspacePath) {
  const coversPath = path.resolve(workspacePath, "cache", "covers");
  const workspaceRoot = path.resolve(workspacePath);

  protocol.handle(COVER_CACHE_SCHEME, async (request) => {
    try {
      const requestUrl = new URL(request.url);
      const hostRoot =
        requestUrl.hostname === COVER_CACHE_HOST
          ? coversPath
          : requestUrl.hostname === PAGE_CACHE_HOST
            ? workspaceRoot
            : null;

      if (!hostRoot) {
        return new Response("Not found", { status: 404 });
      }

      const pathParts = requestUrl.pathname
        .split("/")
        .filter(Boolean)
        .map((part) => decodeURIComponent(part));

      if (
        pathParts.length === 0 ||
        pathParts.some(
          (part) => !part || part === "." || part === ".." || part.includes("/") || part.includes("\\"),
        )
      ) {
        return new Response("Bad cache path", { status: 400 });
      }

      const filePath = path.resolve(hostRoot, ...pathParts);
      const rootWithSeparator = hostRoot.endsWith(path.sep) ? hostRoot : `${hostRoot}${path.sep}`;
      if (!filePath.toLowerCase().startsWith(rootWithSeparator.toLowerCase())) {
        return new Response("Forbidden", { status: 403 });
      }

      if (!fs.existsSync(filePath)) {
        return new Response("Not found", { status: 404 });
      }

      const bytes = await fs.promises.readFile(filePath);
      return new Response(bytes, {
        headers: {
          "Content-Type": imageContentType(filePath),
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch {
      return new Response("Bad cache request", { status: 400 });
    }
  });
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#000000",
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

app.whenReady().then(async () => {
  databaseHandle = createDatabase(app);
  installCacheProtocol(databaseHandle.workspacePath);

  const appApi = createAppApi(databaseHandle.db, { workspacePath: databaseHandle.workspacePath });
  registerIpcHandlers(appApi);
  installImageRequestHeaders();

  try {
    await appApi.cacheLibraryCovers();
  } catch (error) {
    console.warn("Library cover cache warmup failed", error);
  }

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
