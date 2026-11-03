type SentryEventLike = {
  event_id?: string;
  timestamp?: number;
  start_timestamp?: number;
  level?: unknown;
  platform?: string;
  logger?: string;
  release?: string;
  dist?: string;
  environment?: string;
  type?: unknown;
  tags?: Record<string, unknown>;
  debug_meta?: { images?: Array<SentryDebugImageLike> };
  exception?: {
    values?: Array<{
      type?: string;
      module?: string;
      mechanism?: { type?: string; handled?: boolean };
      stacktrace?: { frames?: Array<SentryFrameLike> };
    }>;
  };
};

/**
 * A debug image links a bundle to its uploaded source map by id. It holds a
 * build file path and a build id, nothing about a person.
 */
type SentryDebugImageLike = {
  type?: string;
  debug_id?: string;
  code_file?: string;
};

/** The only part of Sentry's event hint that is read. */
type SentryHintLike = { originalException?: unknown };

/**
 * A stack frame as Sentry models it. Only the fields naming our own source are
 * copied forward; `vars` in particular is never carried, because local
 * variables are where a user's data would be sitting.
 */
type SentryFrameLike = {
  filename?: string;
  abs_path?: string;
  function?: string;
  module?: string;
  lineno?: number;
  colno?: number;
  in_app?: boolean;
};

type SentrySpanLike = {
  data: unknown;
  span_id: string;
  start_timestamp: number;
  trace_id: string;
  timestamp?: number;
  op?: string;
  status?: string;
  origin?: string;
};

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as T;
}

/**
 * Drops a `?query` and `#hash` from a frame path. In the browser a frame's
 * filename can be the page URL itself (inline scripts), and a reset or invite
 * page carries its token there. Origin and path stay, which is what source map
 * lookup matches on.
 */
function stripQueryAndHash(path: string | undefined): string | undefined {
  if (path === undefined) return undefined;
  const cut = path.search(/[?#]/);
  return cut === -1 ? path : path.slice(0, cut);
}

function scrubFrame(frame: SentryFrameLike): SentryFrameLike {
  return omitUndefined({
    filename: stripQueryAndHash(frame.filename),
    abs_path: stripQueryAndHash(frame.abs_path),
    function: frame.function,
    module: frame.module,
    lineno: frame.lineno,
    colno: frame.colno,
    in_app: frame.in_app,
  });
}

function scrubDebugImage(image: SentryDebugImageLike): SentryDebugImageLike {
  return omitUndefined({
    type: image.type,
    debug_id: image.debug_id,
    code_file: image.code_file,
  });
}

const ERROR_CODE = /^[A-Z][A-Z0-9_]{1,63}$/;
const ERROR_CLASS_NAME = /^[A-Z][A-Za-z0-9]{2,63}$/;

/**
 * A short identifier for the error, or undefined. It is taken from a string
 * `code` (HubError and similar) or from a class `name` other than "Error", and
 * only when it has the shape of an identifier. A message cannot pass: it has
 * spaces, lower case words or punctuation, so data cannot ride along.
 */
export function safeErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const { code, name } = error as { code?: unknown; name?: unknown };
  if (typeof code === "string" && ERROR_CODE.test(code)) return code;
  if (
    typeof name === "string" &&
    name !== "Error" &&
    ERROR_CLASS_NAME.test(name)
  ) {
    return name;
  }
  return undefined;
}

/**
 * Keep error events useful for triage without exporting request, page, mail,
 * token, or account data to a third-party service.
 *
 * Stack frames are carried because they name our own source — file, function,
 * line — and an exception type on its own cannot be acted on. `debug_meta`
 * (build ids and bundle paths) is carried so Sentry can match the frames to the
 * uploaded source maps; without it every frame stays minified. An `error_code`
 * tag is added from the original error when it is a bare identifier. The exception's
 * `value` and the event `message` are still dropped: those are written by our
 * code and by libraries, and either can quote the data that caused the error.
 */
export function scrubSentryEvent<T extends SentryEventLike>(
  event: T,
  hint?: SentryHintLike
): T {
  const service = event.tags?.service;
  const tags = omitUndefined({
    service: typeof service === "string" ? service : undefined,
    error_code: safeErrorCode(hint?.originalException),
  });

  return omitUndefined({
    event_id: event.event_id,
    timestamp: event.timestamp,
    start_timestamp: event.start_timestamp,
    level: event.level,
    platform: event.platform,
    logger: event.logger,
    release: event.release,
    dist: event.dist,
    environment: event.environment,
    type: event.type,
    tags: Object.keys(tags).length > 0 ? tags : undefined,
    debug_meta: event.debug_meta?.images
      ? { images: event.debug_meta.images.map(scrubDebugImage) }
      : undefined,
    exception: event.exception?.values
      ? {
          values: event.exception.values.map((value) =>
            omitUndefined({
              type: value.type,
              module: value.module,
              mechanism: value.mechanism
                ? omitUndefined({
                    type: value.mechanism.type,
                    handled: value.mechanism.handled,
                  })
                : undefined,
              stacktrace: value.stacktrace?.frames
                ? { frames: value.stacktrace.frames.map(scrubFrame) }
                : undefined,
            })
          ),
        }
      : undefined,
  }) as T;
}

/** Drop all breadcrumb payloads rather than attempting to classify user data. */
export function dropSentryBreadcrumb(): null {
  return null;
}

/** Remove trace names, attributes, links, and measurements before export. */
export function scrubSentrySpan<T extends SentrySpanLike>(span: T): T {
  return omitUndefined({
    data: {},
    span_id: span.span_id,
    start_timestamp: span.start_timestamp,
    trace_id: span.trace_id,
    timestamp: span.timestamp,
    op: span.op,
    status: span.status,
    origin: span.origin,
  }) as T;
}
