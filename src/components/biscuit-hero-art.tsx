/* eslint-disable @next/next/no-img-element */
/** Purely decorative artwork for the home hero. Everything here is aria-hidden and ignores the pointer. */
const PAW = (
  <>
    <ellipse cx="32" cy="42" rx="14" ry="12" /><ellipse cx="14" cy="26" rx="6" ry="8" /><ellipse cx="25" cy="14" rx="6" ry="8" /><ellipse cx="39" cy="14" rx="6" ry="8" /><ellipse cx="50" cy="26" rx="6" ry="8" />
  </>
);

export function HeroBackdrop() {
  return (
    <div className="bh-deco" aria-hidden="true">
      <svg className="bh-c tl" viewBox="0 0 300 240">
        <path d="M0 0H262C246 52 196 60 148 78C92 99 96 164 46 188C28 197 12 198 0 196Z" fill="#DCE8D8" />
        <path d="M0 228C58 232 84 196 108 152C134 104 196 112 240 88C266 74 284 46 292 0" fill="none" stroke="#B8CDB5" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <svg className="bh-c br" viewBox="0 0 640 220" preserveAspectRatio="none">
        <path d="M640 24C556 22 520 104 424 122C322 141 262 104 168 138C104 161 62 190 0 220H640Z" fill="#DCE8D8" />
        <path d="M640 88C566 90 528 152 440 164C350 176 292 152 214 178C176 191 148 206 130 220H640Z" fill="#B8CDB5" opacity=".55" />
      </svg>
      <svg className="bh-c bl" viewBox="0 0 260 110" fill="none" strokeLinecap="round">
        <path d="M-6 72C42 38 78 104 126 78C162 58 150 22 122 34C98 46 118 86 172 80" stroke="#B87556" strokeWidth="1.6" opacity=".55" />
        <path d="M196 66c-5-9-20-4-15 7 3 6 10 10 15 15 5-5 12-9 15-15 5-11-10-16-15-7Z" stroke="#B87556" strokeWidth="1.8" opacity=".7" />
      </svg>
      <svg className="bh-c dash" viewBox="0 0 300 130" fill="none">
        <path d="M4 112C70 120 98 26 168 34C226 40 224 92 296 14" stroke="#344D36" strokeWidth="1.6" strokeDasharray="2 9" strokeLinecap="round" opacity=".35" />
      </svg>
      {["p1", "p2", "p3", "p4"].map((c) => <svg key={c} className={`bh-paw ${c}`} viewBox="0 0 64 64">{PAW}</svg>)}
    </div>
  );
}

function Collar() {
  return (
    <svg viewBox="0 0 120 130">
      <path d="M60 14c29 0 50 11 50 28S89 72 60 72 10 59 10 42s21-28 50-28Z" fill="none" stroke="#344D36" strokeWidth="13" />
      <path d="M60 14c29 0 50 11 50 28S89 72 60 72 10 59 10 42s21-28 50-28Z" fill="none" stroke="#B8CDB5" strokeWidth="1.4" strokeDasharray="4 5" />
      <rect x="22" y="53" width="20" height="21" rx="4" fill="none" stroke="#C9A46A" strokeWidth="4.5" transform="rotate(14 32 63)" />
      <circle cx="68" cy="79" r="7" fill="none" stroke="#C9A46A" strokeWidth="3.5" />
      <circle cx="68" cy="105" r="21" fill="#B87556" />
      <circle cx="68" cy="105" r="17" fill="none" stroke="#EFE2D1" strokeWidth="1.2" opacity=".8" />
      <g fill="#FAF5EB"><ellipse cx="68" cy="111" rx="7" ry="6" /><circle cx="58.5" cy="102" r="3" /><circle cx="64.5" cy="96.5" r="3" /><circle cx="72" cy="96.5" r="3" /><circle cx="77.5" cy="102" r="3" /></g>
    </svg>
  );
}

function Bone() {
  const shape = "M42 30c-4-17-33-14-30 4-17 2-17 30 1 31-2 18 27 21 30 5h66c3 16 32 13 30-5 18-1 18-29 1-31 3-18-26-21-30-4Z";
  return (
    <svg viewBox="0 0 150 100">
      <defs>
        <linearGradient id="bh-plush" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#CFDFCB" /><stop offset="1" stopColor="#9DB89A" /></linearGradient>
      </defs>
      <path d={shape} fill="url(#bh-plush)" />
      <path d={shape} fill="none" stroke="#FAF5EB" strokeWidth="2" strokeDasharray="5 6" transform="translate(7.5 5) scale(.9)" />
      <g fill="#344D36" opacity=".75" transform="translate(59 34) scale(.5)">{PAW}</g>
    </svg>
  );
}

const TOYS = [["rope", "rope", 672, 360], ["plush", "plush-bone", 510, 300], ["ball", "ball", 324, 324]] as const;

/** Rendered toys come from scripts/render-hero-assets.mjs. Only the two upper items float; the rest rest on the ground. */
export function HeroAccessories() {
  return (
    <div className="bh-acc" aria-hidden="true">
      <span className="bh-item collar"><span><Collar /></span></span>
      <span className="bh-item bone"><span><Bone /></span></span>
      {TOYS.map(([name, file, width, height]) => (
        <span key={name} className={`bh-item ground ${name}`}><span><img src={`/hero/${file}.webp`} width={width} height={height} alt="" decoding="async" /></span></span>
      ))}
    </div>
  );
}
