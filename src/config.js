// API Configuration / base URL selection.

// Priority:
// 1. If VITE_USE_NGROK === 'true' and VITE_NGROK_URL is set → use that
// 2. Else if VITE_API_BASE_URL is set → use that
// 3. Else fallback to Vast.ai Caddy URL (port 25147)

function normalizeBaseUrl(url) {
  if (!url) return "";
  return url.replace(/\/+$/, ""); // strip trailing slashes
}

const useNgrok = import.meta.env.VITE_USE_NGROK === "true";
const envNgrokUrl = normalizeBaseUrl(import.meta.env.VITE_NGROK_URL);
const envBaseUrl = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);

let API_BASE_URL;

if (useNgrok && envNgrokUrl) {
  API_BASE_URL = envNgrokUrl;
} else if (envBaseUrl) {
  API_BASE_URL = envBaseUrl;
} else {
  // Default to Vast.ai public IP: Caddy on 25147
  API_BASE_URL = "http://74.48.78.46:25147";
}

export const config = {
  apiBaseUrl: API_BASE_URL,
  apiUrl: (path) => {
    const clean = path.startsWith("/") ? path.slice(1) : path;
    return `${API_BASE_URL}/${clean}`;
  },
  resultsUrl: (path) => {
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    const clean = path.startsWith("/") ? path.slice(1) : path;
    return `${API_BASE_URL}/${clean}`;
  },
};