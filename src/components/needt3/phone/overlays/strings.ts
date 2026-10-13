/**
 * The overlay copy, read from the prototype's extracted strings
 * (docs/port/prototype/port/strings/en.json) so it is never retyped. Fragments
 * the prototype built from pieces ("Overdue — this was due" + a date +
 * ". Move it or let it go.") stay fragments here.
 */
import strings from "../../../../../docs/port/prototype/port/strings/en.json";

const o = strings["phone-overlays.jsx"];
const sheet = strings["paywall-sheet.jsx"];
const mod = strings["paywall.jsx"];

export const task = o.PkTaskSheet;
export const pick = o.PICK;
export const composer = o.PkComposer;
export const composerPick = o.POV_PICK;
export const ask = o.PkAsk;
export const prio = o.POV_PRIO;
export const snack = o.PkSnack;
export const event = o.PkEventSheet;

export const pwPlans = sheet.PwPlans;
export const pwFree = sheet.PwFreeLine;
export const pwFeatures = sheet.PwFeatures;
export const pwCta = sheet.pwCtaFor;
export const pwStatus = sheet.PwStatus;
export const pwFeature = sheet.PwFeatureLine;
export const pwScene = sheet.PwScene;
export const pwModule = mod._module;
export const pkPaywall = o.PkPaywall;

/** "Moved to Trash" (the screens host's toast after Delete task). */
export const movedToTrash =
  strings["mobile-v2-plates.jsx"].V2pScreens.moved_to_trash;
/** The drop toast's bare form (phone-tasks.jsx ptkDropWrite). */
export const moved = strings["phone-tasks.jsx"].ptkDropWrite.moved;
