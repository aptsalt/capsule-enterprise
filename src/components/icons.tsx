// CAPSULE — shared monochrome line-icon set.
// One coherent family: viewBox 0 0 17 17, stroke=currentColor, strokeWidth 1.3,
// fill none. Used to replace every emoji/unicode glyph in the chrome so the app
// reads as one neutral gray icon weight + the single blue accent (8090 restraint).

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 17 17"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="7.3" cy="7.3" r="4.3" />
    <path d="M10.6 10.6 14 14" />
  </Svg>
);

export const ExportIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.5 2.5v8" />
    <path d="M5.3 5.7 8.5 2.5l3.2 3.2" />
    <path d="M3 11v2.5h11V11" />
  </Svg>
);

export const ShareIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12.5" cy="4" r="1.9" />
    <circle cx="4.5" cy="8.5" r="1.9" />
    <circle cx="12.5" cy="13" r="1.9" />
    <path d="M6.2 7.5 10.8 5M6.2 9.5 10.8 12" />
  </Svg>
);

export const HistoryIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 8.5a6 6 0 1 0 1.9-4.4M2.4 2v2.4h2.4" />
    <path d="M8.5 5.2V8.6l2.3 1.4" />
  </Svg>
);

export const CommentIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 4.2a1.5 1.5 0 0 1 1.5-1.5h9a1.5 1.5 0 0 1 1.5 1.5v5.1a1.5 1.5 0 0 1-1.5 1.5H6.5L3.5 13v-2.7H4a1.5 1.5 0 0 1-1.5-1.5Z" />
  </Svg>
);

export const SendIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.5 13V4M5.2 7.3 8.5 4l3.3 3.3" />
  </Svg>
);

export const SparkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.5 2.2 9.9 6l3.8 1.4-3.8 1.4-1.4 3.8-1.4-3.8L3.3 7.4 7.1 6Z" />
  </Svg>
);

export const GearIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8.5" cy="8.5" r="2.2" />
    <path d="M8.5 2.2v1.8M8.5 13v1.8M2.2 8.5H4M13 8.5h1.8M4.1 4.1l1.3 1.3M11.6 11.6l1.3 1.3M12.9 4.1l-1.3 1.3M5.4 11.6l-1.3 1.3" />
  </Svg>
);

export const LinkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 10.2 10.2 7M6.3 8.7 4.6 10.4a2.4 2.4 0 0 0 3.4 3.4l1.7-1.7M10.7 8.3l1.7-1.7a2.4 2.4 0 0 0-3.4-3.4L7.3 4.9" />
  </Svg>
);

export const ReloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.3 7.2a5 5 0 1 0 .3 3M13.6 3.4v3.6H10" />
  </Svg>
);

export const BrainIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="3.5" cy="4" r="1.9" />
    <circle cx="13" cy="8" r="1.9" />
    <circle cx="5" cy="12.5" r="1.9" />
    <path d="M5.2 5 11.2 7M11.4 9.4 6.6 11.4" />
  </Svg>
);

export const DocIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="2" width="10" height="13" rx="1.6" />
    <path d="M6 6h5M6 8.6h5M6 11.2h3" />
  </Svg>
);

export const GraphIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="3.5" cy="3.5" r="2.2" />
    <circle cx="13" cy="8" r="2.2" />
    <circle cx="5" cy="13.5" r="2.2" />
    <path d="M5.5 4.7 11 6.9M11 9.8 6.6 12" />
  </Svg>
);

export const CapsuleIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="5.2" width="12" height="6.6" rx="3.3" />
    <path d="M8.5 5.2v6.6" />
  </Svg>
);
