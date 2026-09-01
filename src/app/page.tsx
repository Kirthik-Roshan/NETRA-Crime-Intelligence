"use client";
import { useEffect } from "react";
import { getClientUser, replaceAppRoute } from "@/lib/auth-client";

// Static entry point: bounce to the workspace or the login screen based on the
// client-side session (there is no server session in the static build).
export default function Home() {
  useEffect(() => {
    void getClientUser()
      .then((user) => replaceAppRoute(user ? "/dashboard" : "/login"))
      .catch(() => replaceAppRoute("/login"));
  }, []);
  return null;
}
