"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import type { AnchorHTMLAttributes, MouseEvent } from "react";
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
    return <CatalystAppLink href={href} {...props} />;
  }
  return <NextLink href={href} {...props} />;
}

function CatalystAppLink({ href, onClick, target, ...props }: AppLinkProps) {
  const router = useRouter();

  const navigate = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented || event.button !== 0 || target === "_blank" ||
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
    ) return;

    event.preventDefault();
    router.push(href);

    // Preserve Catalyst's reload-safe document URL without reloading the
    // authenticated application shell during ordinary sidebar navigation.
    window.setTimeout(() => {
      window.history.replaceState(window.history.state, "", appDocumentPath(href));
    }, 0);
  };

  return <a href={appDocumentPath(href)} target={target} onClick={navigate} {...props} />;
}
