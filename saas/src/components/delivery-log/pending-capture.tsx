"use client";

import { useEffect, useState } from "react";
import { completeCapture, readCapture } from "@/lib/client/simple-drafts";
import type { Delivery } from "@/lib/types";

export function PendingCapture({
  draftKey,
  onSaved,
}: {
  draftKey: string;
  onSaved: (delivery: Delivery) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<{
    message: string;
    retry?: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;
    let running = false;
    async function resume() {
      if (running) return;
      running = true;
      try {
        const draft = await readCapture(draftKey);
        if (!active || !draft) return;
        setNotice({ message: "Finishing the save from this device…" });
        const saved = await completeCapture(draft);
        if (!active) return;
        onSaved(saved);
        setNotice({
          message:
            saved.direction === "OUT" && saved.selected_category === "Hire"
              ? "Hire return saved."
              : "Record saved.",
        });
      } catch (problem) {
        if (active)
          setNotice({
            message:
              problem instanceof Error
                ? problem.message
                : "The pending save could not be completed.",
            retry: true,
          });
      } finally {
        running = false;
      }
    }
    void resume();
    window.addEventListener("online", resume);
    return () => {
      active = false;
      window.removeEventListener("online", resume);
    };
  }, [attempt, draftKey, onSaved]);

  if (!notice) return null;
  return (
    <div className={notice.retry ? "simple-error" : "simple-success"}>
      <p role={notice.retry ? "alert" : "status"}>{notice.message}</p>
      {notice.retry && (
        <button
          type="button"
          className="text-button"
          onClick={() => setAttempt((previous) => previous + 1)}
        >
          Retry save
        </button>
      )}
    </div>
  );
}
