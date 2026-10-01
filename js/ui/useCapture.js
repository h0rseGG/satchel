import { useState, useEffect } from 'preact/hooks';
import { subscribeCapture } from '../data/captureStore.js';
import { reportError } from './app/toasts.js';

// Names, types, tag counts and the search index, shared by every screen and kept
// up to date incrementally (data/captureStore.js). null until entities have loaded.
export function useCapture() {
  const [cap, setCap] = useState(null);
  useEffect(() => subscribeCapture(setCap, reportError), []);
  return cap;
}
