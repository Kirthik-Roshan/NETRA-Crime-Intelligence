"use client";

import { useEffect, useState } from "react";
import type { CloudNetwork } from "@/lib/cloud-network";
import { fetchCloudNetwork } from "@/lib/cloud-network";
import { NetworkExplorer } from "./NetworkExplorer";

export function CloudNetworkWorkspace({ fallback }: { fallback: CloudNetwork }) {
  const [data, setData] = useState(fallback);
  useEffect(() => {
    fetchCloudNetwork().then((cloud) => {
      if (cloud.options.length && cloud.graphs.top?.edges.length) setData(cloud);
    }).catch(() => undefined);
  }, []);
  return <NetworkExplorer options={data.options} graphs={data.graphs} />;
}
