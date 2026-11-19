/**
 * How the update button reaches the app's four update routes. Apps with their
 * own API helper pass a transport of their own; `fetchTransport` covers the
 * usual case.
 */

export type UpdatesAction = "status" | "check" | "install" | "channel";

export type UpdatesRequest = {
  action: UpdatesAction;
  /** JSON body of a POST (`check`, `install`, `channel`); none for `status`. */
  body?: unknown;
  signal?: AbortSignal;
};

/** The status code and the JSON body of an answer (null: none, or not JSON). */
export type UpdatesAnswer = { status: number; data: unknown };

export type UpdatesTransport = {
  /**
   * Sends one request. Resolves with every answer the route gave, errors
   * included. Throws `SignedOutError` when a sign-in page answered in place
   * of the route (a redirect, or a web page instead of JSON), and whatever a
   * failed request throws (network errors, aborts).
   */
  request(request: UpdatesRequest): Promise<UpdatesAnswer>;
};

/** A sign-in page answered in place of the route: the session ended. */
export class SignedOutError extends Error {
  constructor(message = "Sign in again to continue.") {
    super(message);
    this.name = "SignedOutError";
  }
}

export type FetchTransportOptions = {
  /**
   * The status route; the others are `<url>/check`, `<url>/install` and
   * `<url>/channel`. Example: "/api/admin/updates", or "/admin/updates/" for
   * Django (a trailing slash carries over to every route).
   */
  url: string;
  /** Extra headers of every request, e.g. a CSRF token. */
  headers?: () => Record<string, string>;
};

/** The URL of an action: `url` for status, else `url/<action>`, keeping a trailing slash. */
export function actionUrl(url: string, action: UpdatesAction): string {
  if (action === "status") return url;
  const slash = url.endsWith("/");
  return `${slash ? url.slice(0, -1) : url}/${action}${slash ? "/" : ""}`;
}

async function readJson(response: Response): Promise<{ text: string; data: unknown }> {
  const text = await response.text();
  try {
    return { text, data: text ? JSON.parse(text) : null };
  } catch {
    return { text, data: null };
  }
}

/**
 * Calls the routes with `fetch` on the page's own origin and session, without
 * following redirects (a redirect means a sign-in page). A 202 keeps its status
 * when its body fails; a 200 that is a web page is a sign-in page.
 */
export function fetchTransport(options: FetchTransportOptions): UpdatesTransport {
  return {
    async request({ action, body, signal }) {
      const response = await fetch(actionUrl(options.url, action), {
        method: action === "status" ? "GET" : "POST",
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...options.headers?.(),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual",
        signal,
      });
      if (
        response.type === "opaqueredirect" ||
        response.redirected ||
        (response.status >= 300 && response.status < 400)
      ) {
        throw new SignedOutError();
      }
      // A 202 took the request, whatever happens to its body; any other answer whose body fails
      // throws that error (a timeout stays a timeout).
      const { text, data } = await readJson(response).catch((error: unknown) => {
        if (response.status !== 202) throw error;
        return { text: "", data: null };
      });
      const html = /html/i.test(response.headers.get("content-type") ?? "") || /^\s*</.test(text);
      if (response.status === 200 && data === null && html) throw new SignedOutError();
      return { status: response.status, data };
    },
  };
}

/** The value of a cookie of the page, e.g. Django's `csrftoken`; null when it is not set. */
export function readCookie(name: string): string | null {
  for (const part of document.cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}
