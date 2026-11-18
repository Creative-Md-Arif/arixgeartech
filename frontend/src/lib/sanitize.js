/* ArixGear core — Step 3 security hardening (storefront audit).
   Both helpers defend against ADMIN-authored values: a compromised admin
   account (or a rogue subadmin with content permissions) must not be able to
   run script on customer devices — the same doctrine guides.jsx adopted in
   Task 57, now shared and hardened.

   sanitizeHtml(html) — for dangerouslySetInnerHTML sinks.
   Task 57's regex version had two bypasses, both closed here:
     1. entity encoding — `javascript&colon;` / `&#106;avascript:` decode to a
        working scheme AFTER the old regex ran → decode first via a textarea
        (RCDATA: entities resolve, tags stay literal), then sanitize.
     2. tag coverage — svg/math/base (and form) can carry loaders or hijack
        clicks; they are stripped alongside script/iframe/object/embed/style.

   safeHref(url, fallback) — for href={} and window.location sinks.
   Only http(s):, mailto:, tel:, relative (/…) and in-page (#…) links survive;
   anything else (javascript:, data:, vbscript:, unknown schemes) returns the
   fallback so a poisoned banner/link can never execute or phish. */

export function sanitizeHtml(html) {
  let out = String(html || '');
  /* 1 — decode entities first so encoded schemes/tag names can't sneak through */
  try {
    const ta = document.createElement('textarea');
    ta.innerHTML = out;
    out = ta.value;
  } catch (e) { /* non-DOM env — keep the raw string */
  }
  /* 2 — drop dangerous elements WITH their content … */
  out = out.replace(/<\s*(script|iframe|object|embed|style|svg|math|template)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  /* … and their self-closing / orphaned openers */
  out = out.replace(/<\s*\/?\s*(script|iframe|object|embed|style|link|meta|base|form|svg|math|template)[^>]*\/?\s*>/gi, '');
  /* 3 — strip inline event handlers (onclick=, onerror=, onload=…) */
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  /* 4 — neutralize script-bearing URL schemes. The check runs on each URL
     attribute value with ALL whitespace/control chars removed — browsers
     ignore embedded newlines/tabs inside a scheme (`jav&#x0A;ascript:`), so a
     contiguous-only regex would let entity-encoded variants through. */
  out = out.replace(/(href|src|action|formaction|xlink:href)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (m, attr, val) => {
    const stripped = String(val).replace(/[\s\x00-\x1f]+/g, '').toLowerCase();
    if (/^("|')?(javascript|vbscript|data):/.test(stripped)) return attr + '="#"';
    return m;
  });
  return out;
}

export function safeHref(url, fallback) {
  const u = String(url || '').trim();
  if (!u) return fallback || '/';
  if (u.startsWith('#')) return u;                       /* in-page anchor */
  if (u.startsWith('/') && !u.startsWith('//')) return u; /* internal path */
  if (/^https?:\/\//i.test(u)) return u;                 /* absolute web link */
  if (/^(mailto|tel):/i.test(u)) return u;               /* contact schemes */
  return fallback || '/';                                /* everything else — refuse */
}
