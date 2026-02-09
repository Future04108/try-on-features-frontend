import React, { useMemo, useState } from "react";
import UploadForm from "./components/UploadForm.jsx";
import ResultDisplay from "./components/ResultDisplay.jsx";

export default function App() {
  const [personFile, setPersonFile] = useState(null);
  const [clothingFile, setClothingFile] = useState(null);
  const [denoise, setDenoise] = useState(0.65);

  const [job, setJob] = useState(null); // { id, status, progress, message, result_url }
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const personPreview = useMemo(() => (personFile ? URL.createObjectURL(personFile) : null), [personFile]);
  const clothingPreview = useMemo(() => (clothingFile ? URL.createObjectURL(clothingFile) : null), [clothingFile]);

  async function startGenerate() {
    setError("");
    setJob(null);
    setIsSubmitting(true);

    try {
      // Preferred: multipart/form-data (matches client requirement). If backend lacks python-multipart,
      // it will return a clear error; we auto-fallback to JSON base64.
      let resp = null;
      let data = null;

      try {
        const fd = new FormData();
        fd.append("person_image", personFile);
        fd.append("clothing_image", clothingFile);
        fd.append("denoise_level", String(denoise));
        resp = await fetch("/api/generate", { method: "POST", body: fd });
        data = await resp.json();
      } catch {
        // ignore; fallback below
      }

      if (!resp || !resp.ok) {
        const msg = data?.detail || "";
        const shouldFallback =
          !resp ||
          resp.status === 415 ||
          (resp.status === 400 && msg.toLowerCase().includes("python-multipart"));

        if (!shouldFallback) throw new Error(msg || "Generate failed");

        const personB64 = await fileToDataUrl(personFile);
        const clothingB64 = await fileToDataUrl(clothingFile);
        resp = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            denoise_level: denoise,
            person_image_b64: personB64,
            clothing_image_b64: clothingB64,
          }),
        });
        data = await resp.json();
        if (!resp.ok) throw new Error(data?.detail || "Generate failed");
      }

      const jobId = data.job_id;
      await pollJob(jobId);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function pollJob(jobId) {
    const started = Date.now();
    let last = null;

    while (true) {
      const resp = await fetch(`/api/jobs/${jobId}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail || "Job status failed");

      last = data;
      setJob(data);

      if (data.status === "succeeded") return;
      if (data.status === "failed") throw new Error(data.message || "Generation failed");

      // timeout safety (3 minutes)
      if (Date.now() - started > 180_000) throw new Error("Timed out waiting for generation");
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
            <div className="subtitle">Upload person + garment • SDXL Forge inpaint</div>
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
        <span>Tip: best results with a clear torso view and a flat garment photo.</span>
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


