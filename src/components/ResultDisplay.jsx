import React, { useMemo, useState } from "react";
import { config } from "../config.js";

function Spinner({ label }) {
  return (
    <div className="spinner">
      <div className="spinner-ring" />
      <div className="spinner-text">{label}</div>
    </div>
  );
}

function ZoomModal({ src, onClose }) {
  if (!src) return null;
  return (
    <div className="modal-backdrop" onClick={onClose} role="button" tabIndex={0}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Result (zoom)</div>
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="modal-body">
          <img className="modal-img" src={src} alt="Zoomed result" />
        </div>
      </div>
    </div>
  );
}

export default function ResultDisplay({ personPreview, clothingPreview, job, isSubmitting }) {
  const [zoomSrc, setZoomSrc] = useState("");

  const resultUrl = useMemo(() => {
    if (!job?.result_url) return "";
    // Convert relative URL to absolute URL if needed
    return config.resultsUrl(job.result_url);
  }, [job]);
  const statusLabel = useMemo(() => {
    if (!job) return "";
    const pct = Math.round((job.progress || 0) * 100);
    return `${job.status} • ${pct}% • ${job.message || ""}`.trim();
  }, [job]);

  return (
    <section className="card">
      <div className="card-header">
        <div className="card-title">Preview & Result</div>
        <div className="card-subtitle">Inspect quality; click result to zoom.</div>
      </div>

      <div className="grid2">
        <div className="preview">
          <div className="preview-title">Person</div>
          <div className="preview-box">
            {personPreview ? <img src={personPreview} alt="Person preview" /> : <div className="empty">No image</div>}
          </div>
        </div>

        <div className="preview">
          <div className="preview-title">Clothing</div>
          <div className="preview-box">
            {clothingPreview ? (
              <img src={clothingPreview} alt="Clothing preview" />
            ) : (
              <div className="empty">No image</div>
            )}
          </div>
        </div>
      </div>

      <div className="result">
        <div className="result-header">
          <div className="preview-title">Generated Result</div>
          {job ? <div className="pill">{statusLabel}</div> : null}
        </div>

        <div className="result-box">
          {isSubmitting && !job ? <Spinner label="Starting job..." /> : null}
          {job && job.status !== "succeeded" ? <Spinner label={job.message || "Generating..."} /> : null}
          {job && job.status === "succeeded" && resultUrl ? (
            <>
              <img
                className="result-img"
                src={resultUrl}
                alt="Try-on result"
                onClick={() => setZoomSrc(resultUrl)}
                role="button"
              />
              <div className="result-actions">
                <a className="btn btn-ghost" href={resultUrl} download>
                  Download PNG
                </a>
                <button className="btn btn-ghost" onClick={() => setZoomSrc(resultUrl)}>
                  Zoom
                </button>
              </div>
            </>
          ) : null}
          {!job ? <div className="empty">Generate to see the output here.</div> : null}
        </div>
      </div>

      <ZoomModal src={zoomSrc} onClose={() => setZoomSrc("")} />
    </section>
  );
}


