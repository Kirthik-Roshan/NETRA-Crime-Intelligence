"use client";
import { useEffect, useRef } from "react";

const PARTICLE_COUNT = 60;
const CONNECT_DIST = 140;
const SPEED = 0.3;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  pulse: number;
  pulseSpeed: number;
}

export function AmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let animId = 0;
    const particles: Particle[] = [];

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = w;
      canvas!.height = h;
    }

    function seed() {
      particles.length = 0;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const angle = Math.random() * Math.PI * 2;
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: Math.cos(angle) * SPEED * (0.4 + Math.random() * 0.6),
          vy: Math.sin(angle) * SPEED * (0.4 + Math.random() * 0.6),
          r: 1 + Math.random() * 1.5,
          pulse: Math.random() * Math.PI * 2,
          pulseSpeed: 0.01 + Math.random() * 0.02,
        });
      }
    }

    function tick() {
      ctx!.clearRect(0, 0, w, h);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.pulse += p.pulseSpeed;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECT_DIST) {
            const alpha = (1 - dist / CONNECT_DIST) * 0.15;
            ctx!.beginPath();
            ctx!.moveTo(particles[i].x, particles[i].y);
            ctx!.lineTo(particles[j].x, particles[j].y);
            ctx!.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
            ctx!.lineWidth = 0.5;
            ctx!.stroke();
          }
        }
      }

      for (const p of particles) {
        const glow = 0.3 + Math.sin(p.pulse) * 0.2;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r * 2.5, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(56, 189, 248, ${glow * 0.15})`;
        ctx!.fill();

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(56, 189, 248, ${glow})`;
        ctx!.fill();
      }

      animId = requestAnimationFrame(tick);
    }

    resize();
    seed();
    tick();
    window.addEventListener("resize", () => { resize(); seed(); });

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" style={{ background: "rgb(var(--bg))" }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-70" />
      <div
        className="absolute inset-0 opacity-[0.25]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(var(--border) / 0.5) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--border) / 0.5) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse at 50% 0%, #000 40%, transparent 92%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 0%, #000 40%, transparent 92%)",
        }}
      />
      <div
        className="absolute inset-x-0 top-0 h-64"
        style={{ background: "linear-gradient(to bottom, rgb(var(--elevated) / 0.35), transparent)" }}
      />
    </div>
  );
}
