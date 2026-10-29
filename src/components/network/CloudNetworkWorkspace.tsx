"use client";

import { useCallback, useEffect, useState } from "react";
import type { CloudNetwork } from "@/lib/cloud-network";
import { fetchCloudNetwork } from "@/lib/cloud-network";
import { NetworkExplorer } from "./NetworkExplorer";

export function CloudNetworkWorkspace({ fallback }: { fallback: CloudNetwork }) {
  const [data, setData] = useState(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cloud = await fetchCloudNetwork(true);
      setData(cloud);
      if (!cloud.options.length) setError("No official accused profiles were returned by Cloud Scale.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The relationship service could not be reached.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <NetworkExplorer
      options={data.options}
      graphs={data.graphs}
      loading={loading}
      error={error}
      onRefresh={load}
    />
  );
}
