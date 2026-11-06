export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`djcu-brand${compact ? " djcu-brand-compact" : ""}`}>
      <div className="djcu-logo-surface">
        {/* Preserve the supplied company artwork, including its original background. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/djcu-logo.jpg"
          width={354}
          height={200}
          alt="DJ Civils Ltd — Enabling, Groundworks, Civil Engineering"
        />
      </div>
      <div className="djcu-wordmark">
        <strong>DJ CIVILS</strong>
        <span>Traffic Marshal Unit</span>
      </div>
    </div>
  );
}
