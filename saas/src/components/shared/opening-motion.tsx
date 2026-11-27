"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./opening-motion.module.css";

const seenOpening = "dj-civils-opening-seen-v2";

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
    const fallback = window.setTimeout(dismiss, 2500);
    window.addEventListener("pointerdown", dismiss, {
      once: true,
      passive: true,
    });
    window.addEventListener("keydown", dismiss, { once: true });
    reduced.addEventListener("change", dismiss);
    return () => {
      window.clearTimeout(fallback);
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", dismiss);
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

    const reveal =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries, observer) => {
              for (const { isIntersecting, target } of entries) {
                if (!isIntersecting || reduced.matches) continue;
                target.setAttribute("data-scroll-revealed", "");
                observer.unobserve(target);
              }
            },
            { threshold: 0.15 },
          )
        : null;
    const onLayoutChange = () => {
      schedule();
      if (!reveal || reduced.matches) return;
      document
        .querySelectorAll("[data-scroll-reveal]:not([data-scroll-revealed])")
        .forEach((section) => reveal.observe(section));
    };
    const resize =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(onLayoutChange)
        : null;
    resize?.observe(document.body);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", onLayoutChange);
    reduced.addEventListener("change", onLayoutChange);
    onLayoutChange();
    return () => {
      window.cancelAnimationFrame(frame);
      resize?.disconnect();
      reveal?.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onLayoutChange);
      reduced.removeEventListener("change", onLayoutChange);
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
