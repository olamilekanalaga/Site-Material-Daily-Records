"use client";

import { useEffect, useRef } from "react";
import styles from "./opening-motion.module.css";

export function OpeningSplash() {
  return (
    <div
      className={styles.opening}
      role="status"
      aria-label="Loading workspace"
      data-opening-reveal=""
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
  );
}

export function ScrollMotion() {
  const progress = useRef<HTMLDivElement>(null);

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
    <div
      ref={progress}
      className={styles.progress}
      aria-hidden="true"
      data-scroll-progress=""
    />
  );
}
