/** An error the client should see: becomes `{ error: { code, message } }` with this status. */
export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const fail = (status, code, message) => new HttpError(status, code, message);
