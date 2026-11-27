"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./opening-motion.module.css";

const seenOpening = "dj-civils-opening-seen";

function firstVisitInTab() {
  try {
    if (sessionStorage.getItem(seenOpening)) return false;
    sessionStorage.setItem(seenOpening, "1");
  } catch {
    return false;
  }
  return true;
}

export function OpeningMotion() {
  const [show, setShow] = useState(false);
  const eligible = useRef<boolean | null>(null);
  const progress = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    eligible.current ??= !reduced.matches && firstVisitInTab();
    if (!eligible.current) return;

    setShow(true);
    const dismiss = () => setShow(false);
    const fallback = window.setTimeout(dismiss, 1100);
    window.addEventListener("pointerdown", dismiss, {
      once: true,
      passive: true,
    });
    window.addEventListener("keydown", dismiss, { once: true });
    window.addEventListener("scroll", dismiss, { once: true, passive: true });
    reduced.addEventListener("change", dismiss);
    return () => {
      window.clearTimeout(fallback);
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", dismiss);
      window.removeEventListener("scroll", dismiss);
      reduced.removeEventListener("change", dismiss);
    };
  }, []);

  useEffect(() => {
    const bar = progress.current;
    if (!bar) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let masthead: HTMLElement | null = null;
    const draw = () => {
      frame = 0;
      if (reduced.matches) {
        bar.style.transform = "";
        masthead?.style.removeProperty("--masthead-shift");
        return;
      }
      const y = Math.max(0, window.scrollY);
      const limit = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = `scaleX(${limit > 0 ? Math.min(y / limit, 1) : 0})`;
      if (!masthead?.isConnected)
        masthead = document.querySelector<HTMLElement>(
          "[data-scroll-masthead]",
        );
      masthead?.style.setProperty(
        "--masthead-shift",
        `${Math.min(26, y * 0.18)}px`,
      );
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(draw);
    };

    const resize =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(schedule)
        : null;
    resize?.observe(document.body);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    reduced.addEventListener("change", schedule);
    schedule();
    return () => {
      window.cancelAnimationFrame(frame);
      resize?.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reduced.removeEventListener("change", schedule);
      masthead?.style.removeProperty("--masthead-shift");
    };
  }, []);

  return (
    <>
      <div
        ref={progress}
        className={styles.progress}
        aria-hidden="true"
        data-scroll-progress=""
      />
      {show && (
        <div
          className={styles.opening}
          aria-hidden="true"
          data-opening-reveal=""
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) setShow(false);
          }}
        >
          <div className={styles.openingMark}>
            <img
              src="/djcu-logo.jpg"
              alt=""
              width={354}
              height={200}
              fetchPriority="high"
            />
          </div>
        </div>
      )}
    </>
  );
}
