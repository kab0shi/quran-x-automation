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
// Earthshine keeps the dark lunar disk visible during thin crescents.
// Illuminated area still follows the *real* astronomical phase fraction.
export function moonSvg(date, cx = 600, cy = 1316, radius = 148) {
  const phase = moonInfo(date);
  const lit = illuminatedDiscPath(cx, cy, radius, phase.illuminated, phase.waxing);
  const hash = (n) => {
    const x = Math.sin(n * 173.739 + 0.182) * 43758.5453;
    return x - Math.floor(x);
  };
  const maria = [
    [-.35,-.42,.23,.16],[-.04,-.36,.18,.20],[.26,-.24,.23,.17],
    [-.29,.02,.21,.16],[.22,.18,.17,.21],[-.07,.38,.25,.14]
  ].map(([x,y,rx,ry],i) => `<ellipse cx="${cx+x*radius}" cy="${cy+y*radius}" rx="${rx*radius}" ry="${ry*radius}" transform="rotate(${15+i*22} ${cx+x*radius} ${cy+y*radius})" fill="#151c2a" opacity=".20"/>`).join("");
  const craters = Array.from({length:270}, (_,i) => {
    const x = cx+(hash(i*2+1)*1.88-.94)*radius;
    const y = cy+(hash(i*2+2)*1.88-.94)*radius;
    const r = radius*(.008 + hash(i*5+3)*.072);
    return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="none" stroke="#111b28" stroke-width="1.3" opacity=".32"/><ellipse cx="${(x-r*.13).toFixed(2)}" cy="${(y-r*.18).toFixed(2)}" rx="${(r*.62).toFixed(2)}" ry="${(r*.49).toFixed(2)}" fill="#cad2d7" opacity=".09"/>`;
  }).join("");
  return `
  <defs>
    <radialGradient id="earthshine" cx="35%" cy="28%" r="83%">
      <stop offset="0" stop-color="#748092" stop-opacity=".83"/>
      <stop offset=".50" stop-color="#526275" stop-opacity=".84"/>
      <stop offset="1" stop-color="#293648" stop-opacity=".92"/>
    </radialGradient>
    <radialGradient id="moonlit" cx="32%" cy="24%" r="88%">
      <stop offset="0" stop-color="#fffdf2"/>
      <stop offset=".55" stop-color="#eee5d4"/>
      <stop offset="1" stop-color="#c0b4a4"/>
    </radialGradient>
    <filter id="moonHalo" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="9"/>
    </filter>
    <clipPath id="moonDisk"><circle cx="${cx}" cy="${cy}" r="${radius}"/></clipPath>
    <clipPath id="moonLit"><path d="${lit}"/></clipPath>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="${radius+8}" fill="#c7d7ed" opacity=".12" filter="url(#moonHalo)"/>
  <g clip-path="url(#moonDisk)">
    <circle cx="${cx}" cy="${cy}" r="${radius}" fill="url(#earthshine)"/>
    ${maria}
    ${craters}
    <g clip-path="url(#moonLit)">
      <circle cx="${cx}" cy="${cy}" r="${radius}" fill="url(#moonlit)" opacity=".93"/>
      ${maria}
      ${craters}
    </g>
  </g>
  <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#bac3ca" stroke-width="1.7" opacity=".39"/>
  <path d="${lit}" fill="none" stroke="#fff3d6" stroke-width="2.4" opacity=".95" clip-path="url(#moonDisk)"/>
  `;
}
