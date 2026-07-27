"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getClientUser } from "@/lib/auth-client";

// Static entry point: bounce to the workspace or the login screen based on the
// client-side session (there is no server session in the static build).
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(getClientUser() ? "/dashboard" : "/login");
  }, [router]);
  return null;
}
