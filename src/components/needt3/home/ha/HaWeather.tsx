export interface HaWx {
  /** The weather emoji. */
  ic?: string;
  /** "12°" */
  t?: string;
  /** "light rain" */
  d?: string;
  /** "10:00": the first event of the day, when there is one. */
  first?: string;
}

/**
 * 9 - weather and the first event on one line: under the brief on the phone,
 * top right on desktop. Whichever half is known is shown, nothing is shown for
 * neither. There is no "leave by": Needt has no real travel time.
 */
export function HaWeather({ wx }: { wx: HaWx | null | undefined }) {
  if (!wx || (!wx.t && !wx.first)) return null;
  return (
    <div className="ha-wx" data-ha-wx="">
      {wx.t ? (
        <>
          {wx.ic ? (
            <span className="ha-wx-ic" aria-hidden="true">
              {wx.ic}
            </span>
          ) : null}
          <b>{wx.t}</b>
          {wx.d}
        </>
      ) : null}
      {wx.t && wx.first ? <i /> : null}
      {wx.first ? <>first event {wx.first}</> : null}
    </div>
  );
}
