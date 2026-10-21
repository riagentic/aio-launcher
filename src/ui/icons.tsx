// Inline SVG icons (Lucide shapes) — currentColor, so they follow the theme.
import type { JSX } from "aio";

const svg = (body: JSX.Element, cls = ""): JSX.Element => (
  <svg
    class={cls}
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {body}
  </svg>
);

export const GearIcon = (): JSX.Element =>
  svg(
    <>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </>,
  );

export const RefreshIcon = (p: { spin?: boolean }): JSX.Element =>
  svg(
    <>
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </>,
    p.spin ? "spin" : "",
  );

export const GridIcon = (): JSX.Element =>
  svg(
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>,
  );

export const ListIcon = (): JSX.Element =>
  svg(
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </>,
  );

/** The launcher's own mark — src/icon.svg, flat. */
export const Mark = (): JSX.Element => (
  <svg
    class="mark"
    width="22"
    height="22"
    viewBox="0 0 512 512"
    aria-hidden="true"
  >
    <rect width="512" height="512" rx="112" fill="#161925" />
    <rect x="96" y="96" width="148" height="148" rx="36" fill="#38d9c0" />
    <rect x="268" y="96" width="148" height="148" rx="36" fill="#8b7bff" />
    <rect x="96" y="268" width="148" height="148" rx="36" fill="#4aa3ff" />
    <rect x="268" y="268" width="148" height="148" rx="36" fill="#ff9a52" />
    <path
      d="M312 372 L372 312 M326 312 H372 V358"
      fill="none"
      stroke="#14161f"
      stroke-width="22"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

export const BackIcon = (): JSX.Element =>
  svg(<path d="M19 12H5M12 19l-7-7 7-7" />);

export const CompactIcon = (): JSX.Element =>
  svg(
    <>
      {[4, 10.5, 17].flatMap((y) =>
        [4, 10.5, 17].map((x) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="3" height="3" rx=".6" />
        ))
      )}
    </>,
  );
