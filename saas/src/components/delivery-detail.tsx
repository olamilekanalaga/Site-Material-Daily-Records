"use client";
import { useEffect, useRef, useState } from "react";
import { X, ShieldCheck } from "lucide-react";
import type { Bootstrap, Delivery, ReviewInput, Unit } from "@/lib/types";
import { request } from "@/lib/offline";
import { quantity } from "@/lib/reporting";
import { Badge } from "./ledger-app";
export function DeliveryDetail({
  delivery: d,
  data,
  onClose,
  onReviewed,
  onCorrect,
}: {
  delivery: Delivery;
  data: Bootstrap;
  onClose: () => void;
  onReviewed: () => Promise<void>;
  onCorrect: (d: Delivery) => void;
}) {
  const [decision, setDecision] = useState<ReviewInput["decision"]>("Accepted"),
    [accepted, setAccepted] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    const el = dialog.current;
    return () => el?.close();
  }, []);
  const reviewable =
    data.actor.role === "supervisor" &&
    data.actor.id !== d.created_by &&
    ["Submitted", "Under Review", "Flagged"].includes(d.status);
  const duplicate =
    !!d.ticket_number &&
    data.deliveries.some(
      (other) =>
        other.id !== d.id &&
        other.site_id === d.site_id &&
        other.supplier_id === d.supplier_id &&
        other.ticket_number.trim().toLowerCase() ===
          d.ticket_number.trim().toLowerCase(),
    );
  return (
    <dialog ref={dialog} className="record-dialog" onCancel={onClose}>
      <div className="dialog-header">
        <div>
          <div className="eyebrow">DELIVERY RECORD</div>
          <h2>DL-{d.id.slice(0, 8).toUpperCase()}</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close delivery"
        >
          <X />
        </button>
      </div>
      <div className="dialog-body">
        <div className="status-line">
          <Badge status={d.status} />
          <span className="soft-tag">Commercial: {d.commercial_status}</span>
        </div>
        <dl className="detail-grid">
          <div>
            <dt>Material</dt>
            <dd>{data.materials.find((m) => m.id === d.material_id)?.name}</dd>
          </div>
          <div>
            <dt>Supplier</dt>
            <dd>
              {data.suppliers.find((s) => s.id === d.supplier_id)?.name ||
                "Missing"}
            </dd>
          </div>
          <div>
            <dt>Vehicle</dt>
            <dd>{d.vehicle || "Missing"}</dd>
          </div>
          <div>
            <dt>Ticket reference</dt>
            <dd>{d.ticket_number || "Missing"}</dd>
          </div>
          <div>
            <dt>Ticket quantity (original claim)</dt>
            <dd>{quantity(d.ticket_quantity, d.ticket_unit)}</dd>
          </div>
          <div>
            <dt>Accepted quantity</dt>
            <dd>{quantity(d.accepted_quantity, d.accepted_unit)}</dd>
          </div>
          <div>
            <dt>Gate employee</dt>
            <dd>{d.creator_name}</dd>
          </div>
          <div>
            <dt>Arrival (site time)</dt>
            <dd>
              {new Date(d.arrival_at).toLocaleString("en-GB", {
                timeZone:
                  data.sites.find((s) => s.id === d.site_id)?.timezone || "UTC",
              })}
            </dd>
          </div>
          <div>
            <dt>Recorded on server</dt>
            <dd>{new Date(d.created_at).toLocaleString("en-GB")}</dd>
          </div>
          <div>
            <dt>Submitted</dt>
            <dd>
              {d.submitted_at
                ? new Date(d.submitted_at).toLocaleString("en-GB")
                : "Not submitted"}
            </dd>
          </div>
        </dl>
        {duplicate && (
          <div className="notice danger">
            Duplicate ticket warning: this supplier ticket number appears on
            another record at this site. Investigate before acceptance.
          </div>
        )}
        <h3>Gate notes</h3>
        <p className="note-block">{d.notes || "No additional notes."}</p>
        <h3>Private supporting evidence</h3>
        <p className="muted">
          A photographed ticket is evidence of a document, not independent proof
          of arrival.
        </p>
        <div className="evidence-gallery">
          {d.evidence.map((e) => (
            <a
              key={e.id}
              href={`/api/evidence/${e.id}`}
              target="_blank"
              rel="noreferrer"
            >
              <img
                src={`/api/evidence/${e.id}`}
                alt={`${e.kind} evidence: ${e.name}`}
              />
              <span>
                {e.kind} · {e.name}
              </span>
            </a>
          ))}
        </div>
        {!d.evidence.length && (
          <p className="note-block">No photographs attached.</p>
        )}
        <h3>Review history</h3>
        {d.reviews.map((r) => (
          <div className="review-history" key={r.id}>
            <Badge status={r.decision} />
            <p>{r.reason || "Review started"}</p>
            <small>
              {r.reviewer_name} ·{" "}
              {new Date(r.created_at).toLocaleString("en-GB")}
              {r.accepted_quantity !== null
                ? ` · ${quantity(r.accepted_quantity, r.accepted_unit)} accepted`
                : ""}
            </small>
          </div>
        ))}
        {!d.reviews.length && (
          <p className="muted">No supervisor decision yet.</p>
        )}
        {d.created_by === data.actor.id &&
          ["Draft", "Arrived", "Correction Requested"].includes(d.status) && (
            <button className="secondary" onClick={() => onCorrect(d)}>
              Edit and resubmit record
            </button>
          )}
        {data.actor.id === d.created_by && data.actor.role === "supervisor" && (
          <p className="notice">
            An independent supervisor must review your own arrival.
          </p>
        )}
        {reviewable && (
          <form
            className="review-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await request(`/api/deliveries/${d.id}/review`, {
                  method: "POST",
                  body: JSON.stringify({
                    decision,
                    reason,
                    accepted_quantity:
                      decision === "Accepted" ? Number(accepted) : null,
                    accepted_unit:
                      decision === "Accepted" ? d.ticket_unit : null,
                    version: d.version,
                  }),
                });
                await onReviewed();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h3>
              <ShieldCheck size={20} /> Supervisor receipt decision
            </h3>
            <label>
              Decision
              <select
                value={decision}
                onChange={(e) =>
                  setDecision(e.target.value as ReviewInput["decision"])
                }
              >
                {[
                  "Under Review",
                  "Accepted",
                  "Rejected",
                  "Flagged",
                  "Correction Requested",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            {decision === "Accepted" && (
              <>
                <label>
                  Accepted quantity
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.001"
                    max="999999999"
                    step="0.001"
                    required
                    value={accepted}
                    onChange={(e) => setAccepted(e.target.value)}
                  />
                </label>
                <p className="muted">
                  Unit: {d.ticket_unit as Unit}. No automatic conversions.
                  Ticket quantity stays unchanged.
                </p>
                <label className="checkbox-label">
                  <input type="checkbox" required />I independently confirm
                  physical receipt of this delivery.
                </label>
              </>
            )}
            <label>
              Reason / supporting notes
              <textarea
                required={decision !== "Under Review"}
                minLength={decision !== "Under Review" ? 3 : undefined}
                maxLength={2000}
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "Saving…" : "Save decision"}
            </button>
          </form>
        )}
      </div>
    </dialog>
  );
}
