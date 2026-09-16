/**
 * Where to go once there is a session, which is not always "/".
 *
 * The section a person is looking at lives in the query string, so that a
 * refresh comes back to it. A page that bounces through /auth — a session that
 * took a moment to come back, or a sign-in — left its own address behind, and
 * sending everybody to a bare "/" threw that away. For an administrator "/" is
 * the top of the client list, which is how refreshing the Forms page could
 * land you among the clients.
 *
 * Only a path within this app is honoured. `//host` is a URL somebody else
 * controls however much it looks like a path, and a remembered destination is
 * not worth an open redirect.
 */
export function returnTo(from: unknown): string {
  if (typeof from !== 'string') return '/';
  if (!from.startsWith('/') || from.startsWith('//')) return '/';
  // `/\` is the other spelling of a protocol-relative URL that some parsers take.
  if (from.startsWith('/\\')) return '/';
  return from;
}
