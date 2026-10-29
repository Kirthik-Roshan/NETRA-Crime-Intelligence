"use client";

import { useEffect, useRef } from "react";
import styles from "./login.module.css";

// Coordinates align with the junctions in the reference backdrop (1672 x 941).
const JUNCTIONS = [
  [774, 212],
  [932, 214],
  [701, 368],
  [941, 542],
  [744, 576],
  [848, 698],
  [841, 325],
  [820, 519],
  [980, 654],
  [823, 414],
  [741, 295],
  [947, 343],
  [898, 394],
  [1040, 409],
  [773, 459],
  [652, 285],
  [644, 180],
  [599, 115],
  [750, 69],
  [511, 54],
  [1115, 507],
  [1115, 657],
  [1006, 744],
  [889, 780],
  [1078, 815],
];
const EDGES = [
  [0, 1],
  [0, 6],
  [0, 10],
  [0, 18],
  [1, 6],
  [1, 11],
  [2, 10],
  [2, 9],
  [2, 14],
  [2, 15],
  [3, 4],
  [3, 7],
  [3, 8],
  [3, 9],
  [3, 12],
  [3, 20],
  [4, 5],
  [4, 7],
  [5, 8],
  [5, 22],
  [5, 23],
  [6, 9],
  [6, 10],
  [6, 11],
  [7, 9],
  [7, 14],
  [8, 21],
  [8, 22],
  [9, 12],
  [11, 12],
  [11, 13],
  [12, 13],
  [13, 20],
  [15, 16],
  [16, 17],
  [17, 18],
  [17, 19],
  [18, 19],
  [20, 21],
  [21, 24],
];

const PERIMETER = Array.from({ length: 48 }, (_, index) => {
  const column = index % 12;
  const row = Math.floor(index / 12);
  return [
    35 + column * 145 + Math.sin(index * 2.1) * 38,
    80 + row * 235 + Math.cos(index * 1.7) * 48,
  ];
});
const NODES = [...JUNCTIONS, ...PERIMETER];
const CONNECTIONS = [...EDGES];
PERIMETER.forEach((point, offset) => {
  const from = JUNCTIONS.length + offset;
  NODES.map((other, to) => ({
    to,
    distance: Math.hypot(point[0] - other[0], point[1] - other[1]),
  }))
    .filter(({ to, distance }) => to !== from && distance < 250)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .forEach(({ to }) => {
      if (
        !CONNECTIONS.some(
          ([a, b]) => (a === from && b === to) || (a === to && b === from),
        )
      )
        CONNECTIONS.push([from, to]);
    });
});

export function LoginNetwork() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const surface = canvas.current;
    const context = surface?.getContext("2d");
    if (!surface || !context) return;
    const element = surface;
    const ctx = context;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;
    const pointer = { x: 0, y: 0, active: false };
    const positions = NODES.map(() => ({ x: 0, y: 0 }));
    let width = 0;
    let height = 0;
    let frame = 0;
    let lastDraw = 0;
    let stopped = false;
    const reduced = () =>
      preference.matches || root.dataset.motion === "reduced";

    function draw(time: number) {
      ctx.clearRect(0, 0, width, height);
      const animate = !reduced();
      positions.forEach((position, index) => {
        const x = (NODES[index][0] * width) / 1672;
        const y = (NODES[index][1] * height) / 941;
        const dx = x - pointer.x;
        const dy = y - pointer.y;
        const distance = Math.hypot(dx, dy);
        const influence =
          animate && pointer.active ? Math.max(0, 1 - distance / 240) : 0;
        const amplitude = index < 10 ? 5 : 13;
        const driftX = animate
          ? Math.sin(time * 0.0007 + index * 1.7) * amplitude
          : 0;
        const driftY = animate
          ? Math.cos(time * 0.00055 + index * 1.3) * amplitude
          : 0;
        position.x += (x + dx * influence * 0.12 + driftX - position.x) * 0.13;
        position.y += (y + dy * influence * 0.12 + driftY - position.y) * 0.13;
      });

      CONNECTIONS.forEach(([from, to], index) => {
        const a = positions[from];
        const b = positions[to];
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle =
          index < EDGES.length
            ? "rgba(0, 137, 235, 0.24)"
            : "rgba(0, 137, 235, 0.13)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
        if (animate && index % 2 === 0) {
          const progress = (time * 0.00015 + index * 0.17) % 1;
          const x = a.x + (b.x - a.x) * progress;
          const y = a.y + (b.y - a.y) * progress;
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
          ctx.shadowBlur = 8;
          ctx.shadowColor = "#008fff";
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      });

      positions.forEach((position, index) => {
        const pulse = animate
          ? (Math.sin(time * 0.0024 + index * 0.9) + 1) / 2
          : 0.5;
        const red = [0, 6, 7, 8].includes(index);
        const color = red ? "247, 86, 117" : "0, 144, 255";
        const prominent = index < 10;
        ctx.beginPath();
        ctx.arc(
          position.x,
          position.y,
          (prominent ? 6 : 3) + pulse * 5,
          0,
          Math.PI * 2,
        );
        ctx.strokeStyle = `rgba(${color}, ${0.15 + pulse * 0.35})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(
          position.x,
          position.y,
          prominent ? 3 + pulse : 1.5 + pulse,
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = `rgba(${color}, ${0.35 + pulse * 0.6})`;
        ctx.fill();
        if (
          animate &&
          pointer.active &&
          Math.hypot(position.x - pointer.x, position.y - pointer.y) < 200
        ) {
          ctx.beginPath();
          ctx.moveTo(pointer.x, pointer.y);
          ctx.lineTo(position.x, position.y);
          ctx.strokeStyle = "rgba(0, 137, 235, 0.28)";
          ctx.stroke();
        }
      });
    }

    function tick(time: number) {
      if (stopped || document.hidden || reduced()) {
        frame = 0;
        return;
      }
      if (time - lastDraw >= 30) {
        draw(time);
        lastDraw = time;
      }
      frame = requestAnimationFrame(tick);
    }
    function syncMotion() {
      cancelAnimationFrame(frame);
      frame = 0;
      if (reduced()) draw(0);
      else if (!document.hidden) frame = requestAnimationFrame(tick);
    }
    function resize() {
      const bounds = element.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const ratio = Math.min(devicePixelRatio || 1, innerWidth < 700 ? 1 : 1.5);
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      positions.forEach((position, index) => {
        position.x = (NODES[index][0] * width) / 1672;
        position.y = (NODES[index][1] * height) / 941;
      });
      draw(0);
    }
    function move(event: PointerEvent) {
      if (event.pointerType === "touch" || reduced()) return;
      const bounds = element.getBoundingClientRect();
      pointer.x = event.clientX - bounds.left;
      pointer.y = event.clientY - bounds.top;
      pointer.active = true;
    }
    function leave() {
      pointer.active = false;
    }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(element);
    const motionObserver = new MutationObserver(syncMotion);
    motionObserver.observe(root, {
      attributes: true,
      attributeFilter: ["data-motion"],
    });
    resize();
    syncMotion();
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("blur", leave);
    document.addEventListener("mouseleave", leave);
    document.addEventListener("visibilitychange", syncMotion);
    preference.addEventListener("change", syncMotion);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      motionObserver.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("blur", leave);
      document.removeEventListener("mouseleave", leave);
      document.removeEventListener("visibilitychange", syncMotion);
      preference.removeEventListener("change", syncMotion);
    };
  }, []);

  return (
    <canvas
      ref={canvas}
      className={styles.network}
      data-login-network
      aria-hidden="true"
    />
  );
}
