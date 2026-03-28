type ActionIconName =
  | "back"
  | "refresh"
  | "admin"
  | "analytics"
  | "home"
  | "jobs"
  | "workflow"
  | "ba"
  | "dev"
  | "reviewer"
  | "clock"
  | "bot"
  | "check"
  | "money"
  | "team"
  | "activity"
  | "warning"
  | "open"
  | "add"
  | "start"
  | "submit"
  | "artifacts"
  | "notifications"
  | "sun"
  | "moon"
  | "system"
  | "chevron-down";

type ActionIconProps = {
  name: ActionIconName;
  className?: string;
};

export function ActionIcon({ name, className }: ActionIconProps) {
  if (name === "back") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <path d="M7 3 2.5 8 7 13" />
        <path d="M3 8h10.5" />
      </svg>
    );
  }
  if (name === "refresh") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <path d="M13.5 6.5A5.5 5.5 0 0 0 4 3.5" />
        <path d="M13 2.5v4h-4" />
        <path d="M2.5 9.5A5.5 5.5 0 0 0 12 12.5" />
        <path d="M3 13.5v-4h4" />
      </svg>
    );
  }
  if (name === "admin") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 1.75v2.1M8 12.15v2.1M1.75 8h2.1M12.15 8h2.1" />
        <path d="m3.2 3.2 1.5 1.5m5.6 5.6 1.5 1.5M12.8 3.2l-1.5 1.5m-5.6 5.6-1.5 1.5" />
        <circle cx="8" cy="8" r="2.6" />
      </svg>
    );
  }
  if (name === "analytics") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2 13.5h12" />
        <path d="M4 12V8.8M8 12V5.6M12 12V3.5" />
      </svg>
    );
  }
  if (name === "home") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <path d="m2.5 7 5.5-4.5L13.5 7" />
        <path d="M4 6.5v6h8v-6" />
      </svg>
    );
  }
  if (name === "jobs") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2.5" y="3" width="11" height="10" rx="1.8" />
        <path d="M5 1.75v2.1M11 1.75v2.1M2.5 6h11" />
      </svg>
    );
  }
  if (name === "workflow") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="2.5" width="4" height="4" rx="1" />
        <rect x="10" y="2.5" width="4" height="4" rx="1" />
        <rect x="6" y="9.5" width="4" height="4" rx="1" />
        <path d="M6 4.5h4M8 6.5v3" />
      </svg>
    );
  }
  if (name === "ba") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="5" r="2.4" />
        <path d="M3.5 13c.7-2 2.5-3.25 4.5-3.25S11.8 11 12.5 13" />
        <path d="M11.75 3.25h2M12.75 2.25v2" />
      </svg>
    );
  }
  if (name === "dev") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <path d="m5.5 4-3 4 3 4M10.5 4l3 4-3 4M9 2.75 7 13.25" />
      </svg>
    );
  }
  if (name === "reviewer") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3 2.5h7l3 3v8H3z" />
        <path d="M10 2.5v3h3" />
        <path d="m5.5 10 1.5 1.5 3-3.5" />
      </svg>
    );
  }
  if (name === "clock") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="5.5" />
        <path d="M8 4.75v3.5l2.25 1.5" />
      </svg>
    );
  }
  if (name === "bot") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <rect x="3" y="4.5" width="10" height="7.5" rx="2" />
        <path d="M8 2v2.5M5.5 8h0M10.5 8h0M6 10h4" />
      </svg>
    );
  }
  if (name === "check") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="5.75" />
        <path d="m5.25 8.25 1.8 1.8 3.7-4.1" />
      </svg>
    );
  }
  if (name === "money") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="3.25" width="12" height="9.5" rx="1.5" />
        <circle cx="8" cy="8" r="2.1" />
        <path d="M4 5.25h0M12 10.75h0" />
      </svg>
    );
  }
  if (name === "team") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="5.25" cy="6" r="1.75" />
        <circle cx="10.75" cy="6" r="1.75" />
        <path d="M2.75 12c.45-1.7 1.6-2.75 3-2.75S8.3 10.3 8.75 12M7.25 12c.45-1.7 1.6-2.75 3-2.75s2.55 1.05 3 2.75" />
      </svg>
    );
  }
  if (name === "activity") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2 8h2.5l1.5-3 2 6 1.75-4H14" />
      </svg>
    );
  }
  if (name === "warning") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 2.25 14 13H2L8 2.25Z" />
        <path d="M8 6v3.5M8 11.75h0" />
      </svg>
    );
  }
  if (name === "open") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <path d="M6 3h7v7" />
        <path d="M13 3 7.5 8.5" />
        <path d="M13 9.5v2.25A1.25 1.25 0 0 1 11.75 13h-7.5A1.25 1.25 0 0 1 3 11.75v-7.5A1.25 1.25 0 0 1 4.25 3H6.5" />
      </svg>
    );
  }
  if (name === "add") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 3v10M3 8h10" />
      </svg>
    );
  }
  if (name === "start") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <path d="M5 3.5v9l7-4.5-7-4.5Z" />
      </svg>
    );
  }
  if (name === "submit") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2 8h9.5" />
        <path d="m8.5 3.5 4 4.5-4 4.5" />
      </svg>
    );
  }
  if (name === "artifacts") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2.5 4.5h11v7h-11z" />
        <path d="M2.5 7.5h11" />
        <path d="M5.25 10h1.5M9.25 10h1.5" />
      </svg>
    );
  }
  if (name === "notifications") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 2.5a3.5 3.5 0 0 0-3.5 3.5v1.4c0 .6-.18 1.18-.52 1.67L2.8 10.75h10.4L12.02 9.06A3.05 3.05 0 0 1 11.5 7.4V6A3.5 3.5 0 0 0 8 2.5Z" />
        <path d="M6.2 12.5a1.8 1.8 0 0 0 3.6 0" />
      </svg>
    );
  }
  if (name === "sun") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="2.6" />
        <path d="M8 1.75v1.8M8 12.45v1.8M1.75 8h1.8M12.45 8h1.8" />
        <path d="m3.1 3.1 1.3 1.3m6.2 6.2 1.3 1.3M12.9 3.1l-1.3 1.3m-6.2 6.2-1.3 1.3" />
      </svg>
    );
  }
  if (name === "moon") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <path d="M10.9 2.2A5.9 5.9 0 1 0 13.8 11 5 5 0 0 1 10.9 2.2Z" />
      </svg>
    );
  }
  if (name === "system") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="3" width="12" height="8.5" rx="1.6" />
        <path d="M5.25 13.25h5.5M8 11.5v1.75" />
      </svg>
    );
  }
  if (name === "chevron-down") {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 6 8 10 12 6" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 4.5h11v7h-11z" />
      <path d="M2.5 7.5h11" />
    </svg>
  );
}
