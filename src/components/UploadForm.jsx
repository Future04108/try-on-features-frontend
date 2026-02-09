import React from "react";

export default function UploadForm({
  personFile,
  clothingFile,
  denoise,
  onChangePerson,
  onChangeClothing,
  onChangeDenoise,
  onGenerate,
  isSubmitting,
}) {
  const canGenerate = !!personFile && !!clothingFile && !isSubmitting;

  return (
    <section className="card">
      <div className="card-header">
        <div className="card-title">Inputs</div>
        <div className="card-subtitle">Upload two images, pick denoise, generate.</div>
      </div>

      <div className="grid2">
        <div className="field">
          <label className="label">Upload Person Image (JPG/PNG)</label>
          <input
            className="input"
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => onChangePerson(e.target.files?.[0] || null)}
            disabled={isSubmitting}
          />
          {personFile ? <div className="hint">Selected: {personFile.name}</div> : <div className="hint">No file</div>}
        </div>

        <div className="field">
          <label className="label">Upload Clothing Item (JPG/PNG)</label>
          <input
            className="input"
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => onChangeClothing(e.target.files?.[0] || null)}
            disabled={isSubmitting}
          />
          {clothingFile ? (
            <div className="hint">Selected: {clothingFile.name}</div>
          ) : (
            <div className="hint">No file</div>
          )}
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label className="label">Denoise Level</label>
          <div className="segmented">
            {[0.5, 0.65, 0.75].map((v) => (
              <label key={v} className={`seg-item ${denoise === v ? "active" : ""}`}>
                <input
                  type="radio"
                  name="denoise"
                  value={v}
                  checked={denoise === v}
                  onChange={() => onChangeDenoise(v)}
                  disabled={isSubmitting}
                />
                {v.toFixed(2)}
              </label>
            ))}
          </div>
          <div className="hint">
            0.50 preserves more; 0.75 changes more (riskier). Default is 0.65.
          </div>
        </div>

        <div className="actions">
          <button className="btn" onClick={onGenerate} disabled={!canGenerate}>
            {isSubmitting ? "Submitting..." : "Generate"}
          </button>
        </div>
      </div>
    </section>
  );
}


