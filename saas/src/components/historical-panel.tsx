"use client";
import { useState } from "react";
import type { Bootstrap } from "@/lib/types";
import { request } from "@/lib/offline";
import { Badge } from "./ledger-app";
export function HistoricalPanel({
  data,
  site,
  onUpdate,
}: {
  data: Bootstrap;
  site: string;
  onUpdate: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="panel form-panel">
      <h2>Reported aggregate tallies</h2>
      <p>
        Unverified historical summaries are excluded from digital delivery
        counts and accepted quantities.
      </p>
      <div className="notice">
        Fictional demonstration only. Original notebooks have not been imported.
        No vehicles, arrival times or tickets have been inferred from tally
        counts.
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {data.historical
        .filter((h) => h.site_id === site)
        .map((h) => (
          <div className="history-item" key={h.id}>
            <strong>
              {h.date} ·{" "}
              {data.materials.find((m) => m.id === h.material_id)?.name}
            </strong>
            <span>{h.reported_count} reported arrivals</span>
            <Badge status={h.confidence} />
            <p>
              {h.notes} · Source: {h.source_reference}
            </p>
            {data.actor.role === "company_admin" && (
              <details>
                <summary>Review or correct summary</summary>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    setBusy(true);
                    setError("");
                    try {
                      await request("/api/admin", {
                        method: "POST",
                        body: JSON.stringify({
                          action: "historical",
                          id: h.id,
                          site_id: h.site_id,
                          date: f.get("date"),
                          material_id: f.get("material_id"),
                          reported_count: Number(f.get("reported_count")),
                          source_reference: f.get("source_reference"),
                          confidence: f.get("confidence"),
                          notes: f.get("notes"),
                        }),
                      });
                      await onUpdate();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <div className="form-grid">
                    <label>
                      Summary date
                      <input
                        type="date"
                        name="date"
                        defaultValue={h.date}
                        required
                      />
                    </label>
                    <label>
                      Reported count
                      <input
                        type="number"
                        name="reported_count"
                        defaultValue={h.reported_count}
                        min="0"
                        step="1"
                        required
                      />
                    </label>
                    <label>
                      Summary material
                      <select name="material_id" defaultValue={h.material_id}>
                        {data.materials.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Review status
                      <select name="confidence" defaultValue={h.confidence}>
                        {["Unreviewed", "Uncertain", "Reviewed"].map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Source reference
                      <input
                        name="source_reference"
                        defaultValue={h.source_reference}
                        required
                        maxLength={200}
                      />
                    </label>
                    <label>
                      Review notes
                      <textarea
                        name="notes"
                        defaultValue={h.notes}
                        maxLength={2000}
                        required
                      />
                    </label>
                  </div>
                  <button className="secondary" disabled={busy}>
                    Save reviewed summary
                  </button>
                </form>
              </details>
            )}
          </div>
        ))}
    </section>
  );
}
