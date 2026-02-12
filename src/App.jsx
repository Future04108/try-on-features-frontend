import React, { useMemo, useState } from "react";
import UploadForm from "./components/UploadForm.jsx";
import ResultDisplay from "./components/ResultDisplay.jsx";
import { config } from "./config.js";
import imageCompression from "browser-image-compression";

// Basic Auth for Caddy on Vast.ai
const BASIC_AUTH_USERNAME = "vastai";
const BASIC_AUTH_PASSWORD =
  "c286f00a74bb4f653659b287cbf8cc206f0fdd4413365c1fd082f622a82bc76f";

function buildAuthHeader() {
  const token = btoa(`${BASIC_AUTH_USERNAME}:${BASIC_AUTH_PASSWORD}`);
  return `Basic ${token}`;
}

function fetchWithTimeout(url, options = {}, timeoutMs = config.backendTimeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    clearTimeout(id);
  });
}

export default function App() {
  const [personFile, setPersonFile] = useState(null);
  const [clothingFile, setClothingFile] = useState(null);
  const [denoise, setDenoise] = useState(0.65);

  const [job, setJob] = useState(null); // { id, status, progress, message, result_url }
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [showRetry, setShowRetry] = useState(false);

  const personPreview = useMemo(
    () => (personFile ? URL.createObjectURL(personFile) : null),
    [personFile]
  );
  const clothingPreview = useMemo(
    () => (clothingFile ? URL.createObjectURL(clothingFile) : null),
    [clothingFile]
  );

  async function compressImage(file, label) {
    if (!file) return null;
    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
      initialQuality: 0.8,
    };
    console.log(`[compress] Compressing ${label}:`, {
      name: file.name,
      size: file.size,
    });
    const compressed = await imageCompression(file, options);
    console.log(`[compress] Done ${label}:`, {
      name: compressed.name,
      size: compressed.size,
    });
    return compressed;
  }

  async function startGenerate() {
    if (!personFile || !clothingFile) {
      setError("Please select both person and clothing images.");
      return;
    }

    setError("");
    setJob(null);
    setShowRetry(false);
    setIsSubmitting(true);
    setStatusMessage("Uploading images...");

    try {
      // 1) Compress images on client
      const [compressedPerson, compressedClothing] = await Promise.all([
        compressImage(personFile, "person_image"),
        compressImage(clothingFile, "clothing_image"),
      ]);

      // 2) Prepare FormData
      const fd = new FormData();
      fd.append("person_image", compressedPerson || personFile);
      fd.append("clothing_image", compressedClothing || clothingFile);
      fd.append("denoise_level", String(denoise));

      const url = config.apiUrl("generate");
      const options = {
        method: "POST",
        headers: {
          Authorization: buildAuthHeader(),
        },
        body: fd,
      };

      console.log("Sending FormData request:", { url, options });

      setStatusMessage("Uploading images to server...");
      let resp = await fetchWithTimeout(url, options);

      let data = null;

      if (!resp.ok) {
        try {
          data = await resp.json();
        } catch {
          throw new Error(`Server error: ${resp.status} ${resp.statusText}`);
        }
      } else {
        data = await resp.json();
      }

      // 3) Handle python-multipart fallback (JSON base64) if needed
      if (!resp.ok) {
        const msg = (data?.detail || "").toString().toLowerCase();
        const shouldFallback =
          resp.status === 415 || msg.includes("python-multipart");

        if (shouldFallback) {
          console.log("Falling back to JSON base64 encoding");
          setStatusMessage("Encoding images...");

          const personB64 = await fileToDataUrl(compressedPerson || personFile);
          const clothingB64 = await fileToDataUrl(
            compressedClothing || clothingFile
          );

          const jsonUrl = config.apiUrl("generate");
          const jsonOptions = {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: buildAuthHeader(),
            },
            body: JSON.stringify({
              denoise_level: denoise,
              person_image_b64: personB64,
              clothing_image_b64: clothingB64,
            }),
          };

          console.log("Sending JSON fallback request:", {
            url: jsonUrl,
            options: jsonOptions,
          });

          setStatusMessage("Uploading JSON images to server...");
          resp = await fetchWithTimeout(jsonUrl, jsonOptions);

          data = await resp.json();
          if (!resp.ok) {
            throw new Error(data?.detail || "Generate failed");
          }
        } else {
          throw new Error(data?.detail || "Generate failed");
        }
      }

      setStatusMessage("Generating result...");
      const jobId = data.job_id;
      await pollJob(jobId);
      setStatusMessage("");
    } catch (e) {
      console.error("Generate error:", e);
      const msg = e?.message || String(e);

      if (e.name === "AbortError") {
        setError(
          "Request timed out (over 2 minutes). Try smaller images or a more stable connection."
        );
      } else if (
        msg.includes("Failed to fetch") ||
        msg.includes("ERR_CONNECTION_REFUSED") ||
        msg.includes("ERR_EMPTY_RESPONSE")
      ) {
        setError(
          "Connection failed - check your internet connection or try smaller images. You can click Retry."
        );
      } else if (
        msg.toLowerCase().includes("unauthorized") ||
        msg.includes("401")
      ) {
        setError(
          "Unauthorized by Caddy (401). Please verify the Basic Auth credentials."
        );
      } else {
        setError(msg);
      }

      setShowRetry(true);
      setStatusMessage("");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function pollJob(jobId) {
    const started = Date.now();

    while (true) {
      const url = config.apiUrl(`jobs/${jobId}`);
      const options = {
        headers: {
          Authorization: buildAuthHeader(),
        },
      };
      console.log("Polling job:", { url, options });

      const resp = await fetchWithTimeout(url, options, 30000); // 30s per poll
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail || "Job status failed");

      setJob(data);

      if (data.status === "succeeded") return;
      if (data.status === "failed")
        throw new Error(data.message || "Generation failed");

      if (Date.now() - started > 180_000)
        throw new Error("Timed out waiting for generation");

      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  const handleRetry = () => {
    setShowRetry(false);
    startGenerate();
  };

  return (
    <div className="page">
      <header className="header">
        <div className="brand">
          <div className="logo">VTO</div>
          <div>
            <div className="title">Virtual Try-On</div>
            <div className="subtitle">
              Upload person + garment • SDXL Forge inpaint
            </div>
          </div>
        </div>
      </header>

      <main className="container">
        <UploadForm
          personFile={personFile}
          clothingFile={clothingFile}
          denoise={denoise}
          onChangePerson={setPersonFile}
          onChangeClothing={setClothingFile}
          onChangeDenoise={setDenoise}
          onGenerate={startGenerate}
          isSubmitting={isSubmitting}
        />

        {(error || statusMessage) && (
          <div className="alert alert-error">
            <div className="alert-title">
              {error ? "Error" : "Status"}
            </div>
            <div className="alert-body">
              {error && <div>{error}</div>}
              {statusMessage && (
                <div style={{ marginTop: 4 }}>{statusMessage}</div>
              )}
              {isSubmitting && (
                <div style={{ marginTop: 4, fontSize: "0.9em" }}>
                  Uploading / generating... please wait (up to 2 minutes).
                </div>
              )}
              {showRetry && (
                <button
                  className="btn"
                  style={{ marginTop: 8 }}
                  onClick={handleRetry}
                  disabled={isSubmitting}
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        )}

        <ResultDisplay
          personPreview={personPreview}
          clothingPreview={clothingPreview}
          job={job}
          isSubmitting={isSubmitting}
        />
      </main>

      <footer className="footer">
        <span>
          Tip: best results with a clear torso view and a flat garment photo.
        </span>
      </footer>
    </div>
  );
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("Failed to read file"));
    r.readAsDataURL(file);
  });
}