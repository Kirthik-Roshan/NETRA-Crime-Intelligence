"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
  pulseSpeed: number;
}

interface AmbientBackgroundProps {
  intensity?: "quiet" | "active";
}

function themeAccent(): [number, number, number] {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  const values = raw.split(/[\s,]+/).map(Number);
  return values.length >= 3 && values.every(Number.isFinite)
    ? [values[0], values[1], values[2]]
    : [8, 145, 178];
}

export function AmbientBackground({ intensity = "quiet" }: AmbientBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const surface = canvasRef.current;
    if (!surface) return;
    const canvasElement = surface as HTMLCanvasElement;
    const maybeContext = canvasElement.getContext("2d");
    if (!maybeContext) return;
    const context: CanvasRenderingContext2D = maybeContext;

    const root = document.documentElement;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let accent = themeAccent();
    let animationFrame = 0;
    let running = false;
    let stopped = false;
    let previousTime = 0;
    let pointerX = 0;
    let pointerY = 0;
    let pointerVisible = false;

    const active = intensity === "active";
    const connectionDistance = active ? 178 : 138;
    const speed = active ? 0.32 : 0.14;

    const reduced = () => root.dataset.motion === "reduced" || media.matches;

    function seed() {
      particles.length = 0;
      const count = active
        ? Math.min(88, Math.max(40, Math.round((width * height) / 23000)))
        : Math.min(48, Math.max(22, Math.round((width * height) / 31000)));
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: Math.cos(angle) * speed * (0.55 + Math.random() * 0.45),
          vy: Math.sin(angle) * speed * (0.55 + Math.random() * 0.45),
          radius: (active ? 1.05 : 0.8) + Math.random() * 1.1,
          phase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.0014 + Math.random() * 0.0014,
        });
      }
    }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvasElement.width = Math.round(width * ratio);
      canvasElement.height = Math.round(height * ratio);
      canvasElement.style.width = `${width}px`;
      canvasElement.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      seed();
      draw(false, performance.now(), 0);
    }

    function draw(move: boolean, time: number, frameStep: number) {
      context.clearRect(0, 0, width, height);

      if (move) {
        for (const particle of particles) {
          particle.x += particle.vx * frameStep;
          particle.y += particle.vy * frameStep;
          if (particle.x < -4) particle.x = width + 4;
          if (particle.x > width + 4) particle.x = -4;
          if (particle.y < -4) particle.y = height + 4;
          if (particle.y > height + 4) particle.y = -4;
        }
      }

      const [red, green, blue] = accent;

      if (active) {
        const sweepX = ((time * 0.075) % (width + 360)) - 180;
        context.beginPath();
        context.moveTo(sweepX, 0);
        context.lineTo(sweepX, height);
        context.strokeStyle = `rgba(${red}, ${green}, ${blue}, 0.11)`;
        context.lineWidth = 1;
        context.stroke();

        context.beginPath();
        context.moveTo(sweepX - 7, 0);
        context.lineTo(sweepX - 7, height);
        context.moveTo(sweepX + 7, 0);
        context.lineTo(sweepX + 7, height);
        context.strokeStyle = `rgba(${red}, ${green}, ${blue}, 0.035)`;
        context.stroke();
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.hypot(dx, dy);
          if (distance >= connectionDistance) continue;
          const alpha = (1 - distance / connectionDistance) * (active ? 0.2 : 0.09);
          context.beginPath();
          context.moveTo(particles[i].x, particles[i].y);
          context.lineTo(particles[j].x, particles[j].y);
          context.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
          context.lineWidth = active ? 0.8 : 0.6;
          context.stroke();

          if (active && (i * 17 + j * 31) % 29 === 0) {
            const offset = ((i * 13 + j * 19) % 100) / 100;
            const progress = (time * 0.00018 + offset) % 1;
            const signalX = particles[i].x + (particles[j].x - particles[i].x) * progress;
            const signalY = particles[i].y + (particles[j].y - particles[i].y) * progress;

            context.beginPath();
            context.arc(signalX, signalY, 4.5, 0, Math.PI * 2);
            context.fillStyle = `rgba(${red}, ${green}, ${blue}, 0.12)`;
            context.fill();
            context.beginPath();
            context.arc(signalX, signalY, 1.35, 0, Math.PI * 2);
            context.fillStyle = `rgba(${red}, ${green}, ${blue}, 0.82)`;
            context.fill();
          }
        }
      }

      for (const particle of particles) {
        const pulse = 1 + Math.sin(time * particle.pulseSpeed + particle.phase) * 0.28;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius * 3.8 * pulse, 0, Math.PI * 2);
        context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${active ? 0.12 : 0.06})`;
        context.fill();
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius * pulse, 0, Math.PI * 2);
        context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${active ? 0.58 : 0.3})`;
        context.fill();
      }

      if (active && pointerVisible) {
        for (const particle of particles) {
          const dx = particle.x - pointerX;
          const dy = particle.y - pointerY;
          const distance = Math.hypot(dx, dy);
          if (distance >= 220) continue;
          const alpha = (1 - distance / 220) * 0.24;
          context.beginPath();
          context.moveTo(pointerX, pointerY);
          context.lineTo(particle.x, particle.y);
          context.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
          context.lineWidth = 0.8;
          context.stroke();
        }

        const pointerPulse = 17 + Math.sin(time * 0.003) * 3;
        context.beginPath();
        context.arc(pointerX, pointerY, pointerPulse, 0, Math.PI * 2);
        context.strokeStyle = `rgba(${red}, ${green}, ${blue}, 0.2)`;
        context.lineWidth = 1;
        context.stroke();
      }
    }

    function tick(time: number) {
      if (stopped || reduced()) {
        running = false;
        draw(false, time, 0);
        return;
      }
      const frameStep = previousTime ? Math.min(32, time - previousTime) / (1000 / 60) : 1;
      previousTime = time;
      draw(true, time, frameStep);
      animationFrame = window.requestAnimationFrame(tick);
    }

    function syncMotion() {
      if (reduced()) {
        window.cancelAnimationFrame(animationFrame);
        running = false;
        draw(false, performance.now(), 0);
      } else if (!running) {
        running = true;
        previousTime = 0;
        animationFrame = window.requestAnimationFrame(tick);
      }
    }

    function trackPointer(event: PointerEvent) {
      pointerX = event.clientX;
      pointerY = event.clientY;
      pointerVisible = true;
    }

    function hidePointer() {
      pointerVisible = false;
    }

    const observer = new MutationObserver(() => {
      accent = themeAccent();
      syncMotion();
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme", "data-motion"] });

    resize();
    syncMotion();
    window.addEventListener("resize", resize);
    media.addEventListener("change", syncMotion);
    if (active) {
      window.addEventListener("pointermove", trackPointer, { passive: true });
      window.addEventListener("blur", hidePointer);
      document.addEventListener("mouseleave", hidePointer);
    }

    return () => {
      stopped = true;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      media.removeEventListener("change", syncMotion);
      window.removeEventListener("pointermove", trackPointer);
      window.removeEventListener("blur", hidePointer);
      document.removeEventListener("mouseleave", hidePointer);
      observer.disconnect();
    };
  }, [intensity]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-bg">
      <canvas ref={canvasRef} className={`absolute inset-0 ${intensity === "active" ? "opacity-100" : "opacity-70"}`} />
      <div
        className="absolute inset-0 opacity-[0.32]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(var(--border) / 0.32) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--border) / 0.32) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
      <div className="absolute inset-x-0 top-0 h-1 bg-accent/75" />
      <div className="absolute inset-y-0 left-[min(24vw,360px)] w-px bg-border/25" />
    </div>
  );
}
