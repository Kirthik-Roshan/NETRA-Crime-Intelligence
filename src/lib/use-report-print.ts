"use client";
import { useEffect, useRef } from 'react';

/** Ctrl/Cmd+P on exportable workspaces prints the same report as Export PDF,
 * rather than a screenshot of navigation, inputs, collapsed answers and URLs. */
export function useReportPrint(exportPreview: () => void | Promise<void>, enabled = true) {
  const current = useRef(exportPreview);
  current.current = exportPreview;
  useEffect(() => {
    if (!enabled) return;
    const print = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'p' || event.defaultPrevented) return;
      event.preventDefault();
      void current.current();
    };
    window.addEventListener('keydown', print);
    return () => window.removeEventListener('keydown', print);
  }, [enabled]);
}
