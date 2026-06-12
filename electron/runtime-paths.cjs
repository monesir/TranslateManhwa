const fs = require("node:fs");
const path = require("node:path");

const APP_USER_DATA_DIRNAME = "floris-manhwa-translator";
const REPO_ROOT = path.resolve(__dirname, "..");

function resolveRuntimePath(envName, fallbackRelativePath) {
  const override = process.env[envName];
  return path.resolve(override && override.trim() ? override : path.join(REPO_ROOT, fallbackRelativePath));
}

function getRuntimePaths() {
  const workspacePath = resolveRuntimePath("FLORIS_WORKSPACE_PATH", ".workspace");
  const cacheRoot = resolveRuntimePath("FLORIS_CACHE_ROOT", ".cache");
  const modelsRoot = resolveRuntimePath("FLORIS_MODELS_ROOT", ".models");
  const tempRoot = resolveRuntimePath("FLORIS_TEMP_ROOT", path.join(".cache", "tmp"));
  const pythonCacheRoot = path.join(cacheRoot, "python");
  const huggingFaceHome = path.join(modelsRoot, "huggingface");

  return {
    appUserDataDirname: APP_USER_DATA_DIRNAME,
    cacheRoot,
    crashDumpsPath: path.join(cacheRoot, "electron", "crashDumps"),
    doctrCacheDir: path.join(modelsRoot, "doctr"),
    easyOcrModulePath: path.join(modelsRoot, "easyocr"),
    electronSessionDataPath: path.join(cacheRoot, "electron", "sessionData"),
    electronUserDataPath: path.join(cacheRoot, "electron", "userData"),
    huggingFaceHome,
    huggingFaceHubCache: path.join(huggingFaceHome, "hub"),
    logsPath: path.join(cacheRoot, "electron", "logs"),
    mangaOcrHome: path.join(modelsRoot, "manga-ocr"),
    modelsRoot,
    paddleHome: path.join(modelsRoot, "paddle"),
    paddleOcrHome: path.join(modelsRoot, "paddleocr"),
    pipCacheDir: path.join(pythonCacheRoot, "pip"),
    pythonCacheRoot,
    repoRoot: REPO_ROOT,
    tempRoot,
    tessdataPath: path.join(modelsRoot, "tessdata"),
    torchHome: path.join(modelsRoot, "torch"),
    workspacePath,
    xdgCacheHome: pythonCacheRoot,
  };
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
  return directoryPath;
}

function ensureRuntimeDirectories(paths = getRuntimePaths()) {
  [
    paths.workspacePath,
    paths.cacheRoot,
    paths.tempRoot,
    paths.pythonCacheRoot,
    paths.pipCacheDir,
    paths.modelsRoot,
    paths.huggingFaceHome,
    paths.huggingFaceHubCache,
    paths.torchHome,
    paths.paddleHome,
    paths.paddleOcrHome,
    paths.easyOcrModulePath,
    paths.doctrCacheDir,
    paths.mangaOcrHome,
    paths.tessdataPath,
    paths.electronUserDataPath,
    paths.electronSessionDataPath,
    paths.logsPath,
    paths.crashDumpsPath,
  ].forEach(ensureDirectory);
  return paths;
}

function runtimeEnvVariables(paths = getRuntimePaths()) {
  return {
    DOCTR_CACHE_DIR: paths.doctrCacheDir,
    EASYOCR_MODULE_PATH: paths.easyOcrModulePath,
    FLORIS_CACHE_ROOT: paths.cacheRoot,
    FLORIS_MODELS_ROOT: paths.modelsRoot,
    FLORIS_OCR_CACHE_ROOT: path.join(paths.cacheRoot, "ocr"),
    FLORIS_TEMP_ROOT: paths.tempRoot,
    FLORIS_TESSDATA_DIR: paths.tessdataPath,
    FLORIS_WORKSPACE_PATH: paths.workspacePath,
    HF_HOME: paths.huggingFaceHome,
    HF_HUB_CACHE: paths.huggingFaceHubCache,
    HF_DATASETS_CACHE: path.join(paths.huggingFaceHome, "datasets"),
    HUGGINGFACE_HUB_CACHE: paths.huggingFaceHubCache,
    MANGA_OCR_HOME: paths.mangaOcrHome,
    MPLCONFIGDIR: path.join(paths.pythonCacheRoot, "matplotlib"),
    NUMBA_CACHE_DIR: path.join(paths.pythonCacheRoot, "numba"),
    PADDLE_HOME: paths.paddleHome,
    PADDLEOCR_HOME: paths.paddleOcrHome,
    PIP_CACHE_DIR: paths.pipCacheDir,
    TEMP: paths.tempRoot,
    TESSDATA_PREFIX: paths.tessdataPath,
    TMP: paths.tempRoot,
    TORCH_HOME: paths.torchHome,
    TRANSFORMERS_CACHE: paths.huggingFaceHubCache,
    XDG_CACHE_HOME: paths.xdgCacheHome,
  };
}

function applyRuntimeEnvironment(paths = getRuntimePaths()) {
  ensureRuntimeDirectories(paths);
  Object.assign(process.env, runtimeEnvVariables(paths));
  return paths;
}

function pythonRuntimeEnv(baseEnv = process.env, paths = getRuntimePaths()) {
  return {
    ...baseEnv,
    ...runtimeEnvVariables(paths),
  };
}

function setElectronPath(app, name, directoryPath) {
  try {
    ensureDirectory(directoryPath);
    app.setPath(name, directoryPath);
    return true;
  } catch {
    return false;
  }
}

function applyElectronRuntimePaths(app, paths = getRuntimePaths()) {
  ensureRuntimeDirectories(paths);
  return {
    crashDumps: setElectronPath(app, "crashDumps", paths.crashDumpsPath),
    logs: setElectronPath(app, "logs", paths.logsPath),
    sessionData: setElectronPath(app, "sessionData", paths.electronSessionDataPath),
    temp: setElectronPath(app, "temp", paths.tempRoot),
    userData: setElectronPath(app, "userData", paths.electronUserDataPath),
  };
}

function legacyWorkspacePath(app) {
  try {
    return path.join(app.getPath("appData"), APP_USER_DATA_DIRNAME, "workspace");
  } catch {
    return null;
  }
}

function samePath(first, second) {
  if (!first || !second) return false;
  return path.resolve(first).toLowerCase() === path.resolve(second).toLowerCase();
}

function directoryIsEmpty(directoryPath) {
  try {
    return fs.readdirSync(directoryPath).length === 0;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
}

function shouldMigrateWorkspace(legacyPath, workspacePath) {
  if (!legacyPath || samePath(legacyPath, workspacePath)) return false;
  if (!fs.existsSync(path.join(legacyPath, "floris.db"))) return false;
  if (fs.existsSync(path.join(workspacePath, "floris.db"))) return false;
  return directoryIsEmpty(workspacePath);
}

function ensureWorkspaceAtLocalPath(app, paths = getRuntimePaths()) {
  ensureDirectory(path.dirname(paths.workspacePath));
  const legacyPath = legacyWorkspacePath(app);
  let migratedFrom = null;

  if (shouldMigrateWorkspace(legacyPath, paths.workspacePath)) {
    fs.cpSync(legacyPath, paths.workspacePath, {
      errorOnExist: false,
      force: false,
      recursive: true,
    });
    migratedFrom = legacyPath;
  }

  ensureDirectory(paths.workspacePath);
  return {
    migratedFrom,
    workspacePath: paths.workspacePath,
  };
}

module.exports = {
  APP_USER_DATA_DIRNAME,
  applyElectronRuntimePaths,
  applyRuntimeEnvironment,
  ensureRuntimeDirectories,
  ensureWorkspaceAtLocalPath,
  getRuntimePaths,
  pythonRuntimeEnv,
  runtimeEnvVariables,
};
