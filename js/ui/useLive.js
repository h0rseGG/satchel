import { useState, useEffect } from 'preact/hooks';
import { observe } from '../data/live.js';
import { reportError } from './app/toasts.js';

// The latest result of a database query; re-renders when the data changes.
export function useLive(querier, deps = [], initial = undefined) {
  const [value, setValue] = useState(initial);
  useEffect(() => observe(querier, setValue, reportError), deps);
  return value;
}
