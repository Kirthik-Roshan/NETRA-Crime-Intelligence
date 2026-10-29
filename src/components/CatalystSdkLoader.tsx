"use client";

import { useEffect } from "react";

const SDK_ID = "netra-catalyst-sdk";
const INIT_ID = "netra-catalyst-init";
const SDK_URL = "https://static.zohocdn.com/catalyst/sdk/js/4.6.2/catalystWebSDK.js";

type CatalystWindow = Window & { __netraCatalystReady?: boolean };

function reportCatalystFailure(stage: string) {
  window.dispatchEvent(new CustomEvent("netra:catalyst-error", { detail: { stage } }));
}

function markCatalystReady(script: HTMLScriptElement) {
  script.dataset.netraLoaded = "true";
  (window as CatalystWindow).__netraCatalystReady = true;
  window.dispatchEvent(new Event("netra:catalyst-ready"));
}

/** Load Catalyst's hosted authentication scripts only inside a Web Client build. */
export function CatalystSdkLoader() {
  useEffect(() => {
    const hostedBuild = process.env.NEXT_PUBLIC_CATALYST_WEB_CLIENT === "true";
    const catalystHost = window.location.hostname.endsWith(".catalystserverless.in");
    if (!hostedBuild && !catalystHost) return;

    if (catalystHost && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/app/netra-static-sw.js", { scope: "/app/" }).catch(() => undefined);
    }

    const loadInit = () => {
      const existingInit = document.getElementById(INIT_ID) as HTMLScriptElement | null;
      if (existingInit) {
        if (existingInit.dataset.netraLoaded === "true") {
          (window as CatalystWindow).__netraCatalystReady = true;
        } else {
          existingInit.addEventListener("load", () => markCatalystReady(existingInit), { once: true });
        }
        return;
      }
      const init = document.createElement("script");
      init.id = INIT_ID;
      init.src = "/__catalyst/sdk/init.js";
      init.defer = true;
      init.addEventListener("load", () => markCatalystReady(init), { once: true });
      init.addEventListener("error", () => reportCatalystFailure("initialization"), { once: true });
      document.head.appendChild(init);
    };

    const existing = document.getElementById(SDK_ID) as HTMLScriptElement | null;
    if (existing) {
      if ((window as Window & { catalyst?: unknown }).catalyst) loadInit();
      else existing.addEventListener("load", loadInit, { once: true });
      return;
    }

    const sdk = document.createElement("script");
    sdk.id = SDK_ID;
    sdk.src = SDK_URL;
    sdk.defer = true;
    sdk.addEventListener("load", loadInit, { once: true });
    sdk.addEventListener("error", () => reportCatalystFailure("web-sdk"), { once: true });
    document.head.appendChild(sdk);
  }, []);

  return null;
}
