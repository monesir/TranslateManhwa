const DEFAULT_TIMEOUT_MS = 20000;

async function fetchJson(url, options = {}) {
  const {
    headers,
    sourceName = "Source",
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${sourceName} fetch failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`${sourceName} fetch timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  fetchJson,
};
