import { FiExternalLink } from "react-icons/fi";

import { ArtGenerate, ArtPassword, ArtSecurity } from "./ICloudGuideArt";
import { strings } from "./strings";

export const APPLE_ACCOUNT_URL = "https://account.apple.com";
export const APPLE_HELP_URL = "https://support.apple.com/en-us/102654";

/** Which sketch sits under which step (0-based); the rest have none. */
const ART: Record<number, () => React.JSX.Element> = {
  1: ArtSecurity,
  2: ArtGenerate,
  3: ArtPassword,
};

/**
 * Numbered steps for getting an Apple app-specific password, with a button to
 * open the Apple Account page in a new tab, three schematic sketches, and the
 * notes people ask about: revoking, what Needt reads, what to check when it
 * fails. Same guide as docs/help/connect-icloud.md.
 */
export function ICloudGuide() {
  return (
    <section
      className="cn-guide"
      data-cn-guide=""
      aria-label={strings.guideTitle}
    >
      <span className="cn-guide-title">{strings.guideTitle}</span>
      <ol className="cn-guide-steps">
        {strings.guideSteps.map((text, i) => {
          const Art = ART[i];
          return (
            <li key={text} data-cn-guide-step="">
              <span>{text}</span>
              {i === 0 ? (
                <a
                  className="nx-btn nx-btn-text cn-guide-open"
                  href={APPLE_ACCOUNT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cn-guide-open=""
                >
                  {strings.guideOpen}
                  <FiExternalLink size={13} aria-hidden />
                </a>
              ) : null}
              {Art ? <Art /> : null}
            </li>
          );
        })}
      </ol>
      <span className="cn-meta">{strings.guideRevoke}</span>
      <span className="cn-meta" data-cn-guide-reads="">
        {strings.guideReads}
      </span>
      <details className="cn-guide-trouble">
        <summary>{strings.guideTroubleTitle}</summary>
        <ul>
          {strings.guideTrouble.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </details>
      <a
        className="cn-guide-link"
        href={APPLE_HELP_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        {strings.guideHelp}
      </a>
    </section>
  );
}
