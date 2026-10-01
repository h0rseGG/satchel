// Session mode (device-level).
import { getMeta, setMeta } from './meta.js';
import { startSession, endSession } from '../core/session.js';
import { isoNow } from '../core/model.js';

export async function setSession(on, { now = isoNow() } = {}) {
  await setMeta('session', on ? startSession(now) : endSession(now));
}

export const getSession = () => getMeta('session');
