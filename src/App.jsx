import React, { useMemo, useState } from "react";
import UploadForm from "./components/UploadForm.jsx";
import ResultDisplay from "./components/ResultDisplay.jsx";
import { config } from "./config.js";

// Basic Auth for Caddy on Vast.ai
const BASIC_AUTH_USERNAME = "vastai";
const BASIC_AUTH_PASSWORD =
  "c286f00a74bb4f653659b287cbf8cc206f0fdd4413365c1fd082f622a82bc76f";

function buildAuthHeader() {
  const token = btoa(`${BASIC_AUTH_USERNAME}:${BASIC_AUTH_PASSWORD}`);
  return `Basic ${token}`;
}

export default function App() {
  const [personFile, setPersonFile] = useState(null);
  const [clothingFile, setClothingFile] = useState(null);
  const [denoise, setDenoise] = useState(0.65);

  const [job, setJob] = useState(null); // { id, status, progress, message, result_url }
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const personPreview = useMemo(
    () => (personFile ? URL.createObjectURL(personFile) : null),
    [personFile]
  );
  const clothingPreview = useMemo(
    () => (clothingFile ? URL.createObjectURL(clothingFile) : null),
    [clothingFile]
  );

  async function startGenerate() {
    setError("");
    setJob(null);
    setIsSubmitting(true);

    try {
      let resp = null;
      let data = null;

      try {
        const fd = new FormData();
        fd.append("person_image", personFile);
        fd.append("clothing_image", clothingFile);
        fd.append("denoise_level", String(denoise));

        const url = config.apiUrl("generate");
        const options = {
          method: "POST",
          headers: {
            Authorization: buildAuthHeader(),
          },
          body: fd, // don't set Content-Type manually, browser handles it
        };

        console.log("Sending FormData request:", { url, options });
        resp = await fetch(url, options);

        if (!resp.ok) {
          try {
            data = await resp.json();
          } catch {
            throw new Error(`Server error: ${resp.status} ${resp.statusText}`);
          }
        } else {
          data = await resp.json();
        }
      } catch (fetchError) {
        // If server responded with 400 that mentions python-multipart → fallback to JSON base64
        if (resp && resp.status === 400) {
          try {
            data = await resp.json();
            const msg = data?.detail || "";
            if (
              msg.toLowerCase().includes("python-multipart") ||
              resp.status === 415
            ) {
              console.log("Falling back to JSON base64 encoding");
              const personB64 = await fileToDataUrl(personFile);
              const clothingB64 = await fileToDataUrl(clothingFile);
              const url = config.apiUrl("generate");
              const options = {
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
              console.log("Sending JSON fallback request:", { url, options });
              resp = await fetch(url, options);
              if (!resp.ok) {
                data = await resp.json();
                throw new Error(data?.detail || "Generate failed");
              }
              data = await resp.json();
            } else {
              throw new Error(msg || "Generate failed");
            }
          } catch (jsonError) {
            throw new Error(
              jsonError?.message || "Failed to parse server response"
            );
          }
        } else {
          // Pure network error
          const msg = fetchError?.message || "Network error";
          console.error("Network error during generate:", fetchError);
          throw new Error(
            `Failed to fetch. Please check if the server is running and accessible. (${msg})`
          );
        }
      }

      if (!resp || !resp.ok) {
        throw new Error(data?.detail || "Generate failed");
      }

      const jobId = data.job_id;
      await pollJob(jobId);
    } catch (e) {
      console.error("Generate error:", e);
      const msg = e?.message || String(e);
      if (msg.toLowerCase().includes("unauthorized") || msg.includes("401")) {
        setError(
          "Unauthorized by Caddy (401). Please verify the Basic Auth credentials."
        );
      } else {
        setError(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function pollJob(jobId) {
    const started = Date.now();
    let last = null;

    while (true) {
      const url = config.apiUrl(`jobs/${jobId}`);
      const options = {
        headers: {
          Authorization: buildAuthHeader(),
        },
      };
      console.log("Polling job:", { url, options });

      const resp = await fetch(url, options);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail || "Job status failed");

      last = data;
      setJob(data);

      if (data.status === "succeeded") return;
      if (data.status === "failed")
        throw new Error(data.message || "Generation failed");

      if (Date.now() - started > 180_000)
        throw new Error("Timed out waiting for generation");
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

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

        {error ? (
          <div className="alert alert-error">
            <div className="alert-title">Error</div>
            <div className="alert-body">{error}</div>
          </div>
        ) : null}

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