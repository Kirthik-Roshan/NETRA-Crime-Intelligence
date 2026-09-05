"use client";

import NextLink from "next/link";
import type { AnchorHTMLAttributes } from "react";
import { appDocumentPath } from "@/lib/auth-client";

type AppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
};

/**
 * Catalyst Web Client Hosting does not resolve route directories to their
 * exported index.html files. Use real document links in that build so the URL
 * remains reloadable; keep Next's client router for localhost and Slate.
 */
export default function AppLink({ href, ...props }: AppLinkProps) {
  if (process.env.NEXT_PUBLIC_CATALYST_WEB_CLIENT === "true") {
    return <a href={appDocumentPath(href)} {...props} />;
  }
  return <NextLink href={href} {...props} />;
}
