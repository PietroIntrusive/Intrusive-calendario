/* Tiny SVG avatar generator — solid-color tiles with initials.
   Keeps the demo self-contained, no external CDN. */
window.avatar = function avatar(name, hue = 0, sat = 0) {
    const initials = name.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
    const bg = `hsl(${hue} ${sat}% 22%)`;
    const fg = '#f2f2f2';
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64' width='64' height='64'>
        <rect width='64' height='64' fill='${bg}'/>
        <text x='32' y='40' font-family='Bebas Neue, Barlow Condensed, sans-serif' font-size='28' fill='${fg}' text-anchor='middle' letter-spacing='1'>${initials}</text>
    </svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
};
