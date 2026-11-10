import * as Astronomy from "astronomy-engine";

// Astronomical phase for the actual publication instant (not a Hijri-date guess).
// phase_fraction is the sunlit share of the apparent disk, in [0, 1].
export function moonInfo(date) {
  const instant = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(instant.getTime())) throw new Error("Date lunaire invalide");
  const illuminated = Astronomy.Illumination(Astronomy.Body.Moon, instant).phase_fraction;
  const angle = Astronomy.MoonPhase(instant);
  return { illuminated, percent: Math.round(illuminated * 100), waxing: angle < 180, angle };
}

function pointsForArc(cx, cy, radius, multiplier, reverse = false) {
  const points = [];
  for (let i = 0; i <= 100; i += 1) {
    const t = reverse ? Math.PI - Math.PI * i / 100 : Math.PI * i / 100;
    const y = cy - radius * Math.cos(t);
    const x = cx + radius * Math.sin(t) * multiplier;
    points.push([x, y]);
  }
  return points;
}

export function illuminatedDiscPath(cx, cy, radius, fraction, waxing) {
  const f = Math.max(0, Math.min(1, fraction));
  const outer = pointsForArc(cx, cy, radius, waxing ? 1 : -1);
  // A projected terminator ellipse: f=0 new, f=0.5 half, f=1 full.
  const inner = pointsForArc(cx, cy, radius, waxing ? (1 - 2*f) : (2*f - 1), true);
  return [...outer, ...inner].map(([x,y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ") + " Z";
}

// Procedural gray-silver lunar surface and accurate phase silhouette.
// Only the illuminated portion is bright. Northern-hemisphere orientation
// (waxing right, waning left), not a full parallactic rotation model.
export function moonSvg(date, cx = 600, cy = 1305, radius = 118) {
  const phase = moonInfo(date);
  const lit = illuminatedDiscPath(cx, cy, radius, phase.illuminated, phase.waxing);
  const texture = Array.from({ length: 200 }, (_, i) => {
    const u = (Math.sin((i+1)*52.618) * 43758.5453) % 1;
    const v = (Math.sin((i+1)*17.413) * 28762.7182) % 1;
    const x = cx + (u - Math.trunc(u) - .5) * 2.1*radius;
    const y = cy + (v - Math.trunc(v) - .5) * 2.1*radius;
    const r = 2 + ((i*37)%13);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="none" stroke="#3a3940" stroke-width="1.3" opacity=".24"/><circle cx="${(x-1).toFixed(1)}" cy="${(y-1).toFixed(1)}" r="${r*.58}" fill="#7d756b" opacity=".15"/>`;
  }).join("");
  return `
    <defs>
      <radialGradient id="qamar-silver" cx="35%" cy="30%" r="80%">
        <stop offset="0" stop-color="#fff8e8"/>
        <stop offset=".55" stop-color="#ddd0b9"/>
        <stop offset="1" stop-color="#a89a85"/>
      </radialGradient>
      <radialGradient id="qamar-shadow" cx="35%" cy="30%" r="90%">
        <stop offset="0" stop-color="#a3aabd" stop-opacity=".20"/>
        <stop offset="1" stop-color="#394659" stop-opacity=".04"/>
      </radialGradient>
      <filter id="qamar-glow" x="-75%" y="-75%" width="250%" height="250%">
        <feGaussianBlur stdDeviation="12"/>
      </filter>
      <clipPath id="qamar-lit"><path d="${lit}"/></clipPath>
      <clipPath id="qamar-disk"><circle cx="${cx}" cy="${cy}" r="${radius}"/></clipPath>
    </defs>
    <circle cx="${cx}" cy="${cy}" r="${radius}" fill="url(#qamar-shadow)" />
    <path d="${lit}" fill="#d8ceb9" opacity=".25" filter="url(#qamar-glow)"/>
    <g clip-path="url(#qamar-disk)">
      <g clip-path="url(#qamar-lit)">
        <circle cx="${cx}" cy="${cy}" r="${radius}" fill="url(#qamar-silver)"/>
        ${texture}
      </g>
    </g>`;
}
