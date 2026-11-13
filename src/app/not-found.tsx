"use client";

import { useEffect } from "react";

import Link from "next/link";

import { PublicScope } from "@/components/needt3/states/PublicScope";

import { getAppVersion, getVersionHref } from "@/lib/version";

export default function NotFound() {
  useEffect(() => {
    document.title = "404 - Page Not Found";
  }, []);

  return (
    <PublicScope>
      <div className="pub-center">
        <div className="pub-card is-small">
          <h1 className="pub-card-title">404 - Page Not Found</h1>
          <p className="pub-lead">
            The page you&apos;re looking for doesn&apos;t exist or has been
            moved.
          </p>
          <div className="pub-actions">
            <Link href="/" className="nx-btn nx-btn-primary">
              Return Home
            </Link>
          </div>
          <a
            href={getVersionHref()}
            target="_blank"
            rel="noopener noreferrer"
            title="What changed in this version"
            className="pub-version"
          >
            v{getAppVersion()}
          </a>
        </div>
      </div>
    </PublicScope>
  );
}
