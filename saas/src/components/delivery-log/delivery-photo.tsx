"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import type { Delivery, Evidence } from "@/lib/types";
import { prepareDeliveryPhoto } from "@/lib/delivery-photo";
import { request } from "@/lib/client/offline";

type PhotoReplacement = { id: string; previous: Evidence; file: File };

export function Photo({
  evidence,
  thumbnail = false,
}: {
  evidence: Evidence;
  thumbnail?: boolean;
}) {
  const [error, setError] = useState(false);
  if (error)
    return (
      <span>
        {thumbnail
          ? "Photo unavailable"
          : "This photo could not be loaded. Close it and try again."}
      </span>
    );
  return (
    <img
      className={thumbnail ? "simple-thumbnail" : "simple-photo-full"}
      src={`/api/evidence/${evidence.id}`}
      alt={thumbnail ? "" : "Delivery image"}
      loading={thumbnail ? "lazy" : undefined}
      onError={() => setError(true)}
    />
  );
}
export function PhotoDialog({
  delivery,
  onClose,
  onReplaced,
}: {
  delivery: Delivery;
  onClose: () => void;
  onReplaced?: (delivery: Delivery) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const target = useRef<Evidence | null>(null);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState<PhotoReplacement | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    const element = dialog.current;
    return () => element?.close();
  }, []);

  async function replace(attempt: PhotoReplacement) {
    if (!onReplaced || saving.current) return;
    saving.current = true;
    setBusy(true);
    setRetry(null);
    setStatus("");
    setError("");
    try {
      const file = await prepareDeliveryPhoto(attempt.file);
      setRetry({ ...attempt, file });
      const form = new FormData();
      form.set("id", attempt.id);
      form.set("replaces_id", attempt.previous.id);
      form.set("kind", attempt.previous.kind);
      form.set("file", file);
      const { delivery: updated, cleanupPending } = await request<{
        delivery: Delivery;
        cleanupPending?: boolean;
      }>(`/api/deliveries/${encodeURIComponent(delivery.id)}/evidence`, {
        method: "POST",
        body: form,
      });
      onReplaced(updated);
      setRetry(null);
      setStatus(
        cleanupPending
          ? "Photo replaced. Removal of the old file will retry automatically."
          : "Photo replaced.",
      );
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Could not replace the photo. Try again.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="simple-photo-dialog"
      onCancel={onClose}
      aria-labelledby="photo-heading"
    >
      <div className="simple-panel-title">
        <h2 id="photo-heading">Delivery photo</h2>
        <button
          className="icon-button"
          aria-label="Close photo"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      {onReplaced && (
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Choose replacement photo"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            const previous = target.current;
            event.currentTarget.value = "";
            if (file && previous)
              void replace({ id: crypto.randomUUID(), previous, file });
          }}
        />
      )}
      <div aria-live="polite" role="status">
        {busy ? "Saving replacement…" : status}
      </div>
      {error && (
        <p role="alert" className="simple-help">
          {error}
        </p>
      )}
      {onReplaced &&
        !busy &&
        retry &&
        delivery.evidence.some((photo) => photo.id === retry.previous.id) && (
          <button
            type="button"
            className="secondary"
            onClick={() => void replace(retry)}
          >
            Retry replacement
          </button>
        )}
      {delivery.evidence.map((photo) => (
        <div key={photo.id}>
          {onReplaced && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                target.current = photo;
                input.current?.click();
              }}
            >
              <Upload size={18} aria-hidden="true" /> Replace photo
            </button>
          )}
          <Photo evidence={photo} />
        </div>
      ))}
      <p className="simple-help">
        Supporting image only. Physical receipt has not been established by this
        photo.
      </p>
    </dialog>
  );
}
