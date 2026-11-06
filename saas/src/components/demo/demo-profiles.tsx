"use client";

import { demoProfiles, type DemoProfileId } from "@/lib/demo/profiles";

export function DemoProfiles({
  onSelect,
}: {
  onSelect?: (profile: DemoProfileId) => void;
}) {
  return (
    <div className="demo-profiles" aria-label="Traffic marshal demo profiles">
      {demoProfiles.map((profile) => {
        const content = (
          <>
            <span className="demo-profile-square" aria-hidden="true">
              {profile.initials}
            </span>
            <span className="demo-profile-name">{profile.name}</span>
          </>
        );
        return onSelect ? (
          <button
            type="button"
            className="demo-profile"
            key={profile.id}
            onClick={() => onSelect(profile.id)}
          >
            {content}
          </button>
        ) : (
          <a
            className="demo-profile"
            key={profile.id}
            href={`/demo?marshal=${profile.id}`}
          >
            {content}
          </a>
        );
      })}
    </div>
  );
}
