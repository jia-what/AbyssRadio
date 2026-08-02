/**
 * Stable API response shape: { code, data, msg }
 * code === 0 means success; non-zero are stable business codes.
 */

export const Err = {
  OK: 0,
  BAD_REQUEST: 40001,
  UNAUTHORIZED: 40101,
  NOT_FOUND: 40401,
  UPSTREAM: 50201,
  INTERNAL: 50001,
};

export function ok(res, data = null, msg = 'ok', httpStatus = 200) {
  return res.status(httpStatus).json({ code: Err.OK, data, msg });
}

export function fail(res, code, msg, httpStatus = 400) {
  return res.status(httpStatus).json({ code, data: null, msg });
}
