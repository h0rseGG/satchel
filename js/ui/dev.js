// Dev-only tools (component gallery, window.__satchel) exist on localhost only.
export const isDev = ['localhost', '127.0.0.1'].includes(location.hostname);
