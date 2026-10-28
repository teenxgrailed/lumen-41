"use client";

import { Component } from "react";

import { pkScrollY } from "../kit/scroll";
import { pageMotionCaptureIfNone, placeKeyOf } from "./pageMotion";
import { scrollPopRecent, scrollRemember } from "./scrollMemory";

/**
 * The last look at the old page. `getSnapshotBeforeUpdate` is the one hook
 * React runs after it has decided on the new route and before it touches the
 * DOM, so the outgoing page is still on screen and still at its scroll offset
 * (Next scrolls to the top in a layout effect, after this). Two jobs:
 *
 *  - remember the offset of the path being left, for the way back;
 *  - when the move was not a tap of ours (a button that calls the router, a
 *    redirect) and no copy of the page exists yet, take one, so the new page
 *    never slides in over bare ground.
 *
 * Back/Forward is left alone for both: the browser has already moved the URL
 * (and perhaps the scroll) by now.
 */
export class PageSnapshot extends Component<{ pathname: string }> {
  getSnapshotBeforeUpdate(prev: { pathname: string }) {
    const now = this.props.pathname;
    if (prev.pathname === now) return null;
    try {
      if (!scrollPopRecent(performance.now()))
        scrollRemember(prev.pathname, pkScrollY());
      if (
        placeKeyOf(prev.pathname) &&
        placeKeyOf(prev.pathname) !== placeKeyOf(now)
      )
        pageMotionCaptureIfNone();
    } catch {
      /* the motion is a courtesy: never let it break a navigation */
    }
    return null;
  }

  componentDidUpdate() {
    /* required by React next to getSnapshotBeforeUpdate */
  }

  render() {
    return null;
  }
}
