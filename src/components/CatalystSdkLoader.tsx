"use client";

import { useEffect } from "react";

const SDK_ID = "netra-catalyst-sdk";
const INIT_ID = "netra-catalyst-init";
const SDK_URL = "https://static.zohocdn.com/catalyst/sdk/js/4.6.1/catalystWebSDK.js";

/** Load Catalyst's hosted authentication scripts only inside a Web Client build. */
export function CatalystSdkLoader() {
  useEffect(() => {
    const hostedBuild = process.env.NEXT_PUBLIC_CATALYST_WEB_CLIENT === "true";
    const catalystHost = window.location.hostname.endsWith(".catalystserverless.in");
    if (!hostedBuild && !catalystHost) return;

    const loadInit = () => {
      if (document.getElementById(INIT_ID)) return;
      const init = document.createElement("script");
      init.id = INIT_ID;
      init.src = "/__catalyst/sdk/init.js";
      init.defer = true;
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
    document.head.appendChild(sdk);
  }, []);

  return null;
}
