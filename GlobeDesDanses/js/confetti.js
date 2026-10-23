// Short confetti burst on a temporary 2D canvas, removed when the animation ends
const PARTICLE_COUNT = 160;
const DURATION_MS = 3500;
const GRAVITY = 900;
const MIN_SPEED = 300;
const MAX_SPEED = 900;
const COLORS = ['#ff8a80', '#ffd166', '#c3b1ff', '#7fd8a6', '#8ab6ff', '#ffa6d5'];

export function launchConfetti() {
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  canvas.width = window.innerWidth * pixelRatio;
  canvas.height = window.innerHeight * pixelRatio;
  document.body.appendChild(canvas);
  const context = canvas.getContext('2d');
  context.scale(pixelRatio, pixelRatio);

  // Shot upwards from the bottom centre, in a cone
  const particles = Array.from({ length: PARTICLE_COUNT }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
    const speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
    return {
      x: window.innerWidth / 2,
      y: window.innerHeight,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 6 + Math.random() * 6,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 12,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  });

  const start = performance.now();
  let last = start;
  function frame(now) {
    const dt = (now - last) / 1000;
    last = now;
    const elapsed = now - start;
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    context.globalAlpha = Math.max(0, 1 - elapsed / DURATION_MS);
    for (const p of particles) {
      p.vy += GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;
      context.save();
      context.translate(p.x, p.y);
      context.rotate(p.rotation);
      context.fillStyle = p.color;
      context.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      context.restore();
    }
    if (elapsed < DURATION_MS) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}
