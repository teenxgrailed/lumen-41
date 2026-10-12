"use client";

import type { ReactNode } from "react";

import { Art, type ArtName } from "../menu/Art";

/**
 * The place's picture (or a "+" button), the title and one quiet line
 * (places.jsx `PlaceHeader`).
 * //todo: Templates and Shared open on a painted-sky banner (`PlSceneHeader`
 * + `PxSky`, scenes.jsx 1–1465); the sky engine is not ported yet, so they
 * use this plain header, which is what the prototype falls back to too.
 */
export function PlaceHeader({
  art,
  title,
  meta,
  actions,
  add,
}: {
  art: ArtName;
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  add?: ReactNode;
}) {
  return (
    <header className="pl-place-header-row">
      {add ?? <Art name={art} size={30} />}
      <h1 className="pl-place-header-text" title={title}>
        {title}
      </h1>
      {meta ? <span className="pl-place-header-text-2">{meta}</span> : null}
      <span className="pl-place-header-row-2">{actions}</span>
    </header>
  );
}
