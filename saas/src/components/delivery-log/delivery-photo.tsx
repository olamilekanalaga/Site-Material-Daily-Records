"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Delivery, Evidence } from "@/lib/types";

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
      onError={() => setError(true)}
    />
  );
}
export function PhotoDialog({
  delivery,
  onClose,
}: {
  delivery: Delivery;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    const element = dialog.current;
    return () => element?.close();
  }, []);
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
      {delivery.evidence.map((e) => (
        <Photo key={e.id} evidence={e} />
      ))}
      <p className="simple-help">
        Supporting image only. Physical receipt has not been established by this
        photo.
      </p>
    </dialog>
  );
}
