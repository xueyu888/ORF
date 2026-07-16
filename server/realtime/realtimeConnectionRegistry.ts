type RealtimeConnectionCloser = () => void;

const realtimeConnectionClosers = new Set<RealtimeConnectionCloser>();

export function registerRealtimeConnectionCloser(close: RealtimeConnectionCloser) {
  realtimeConnectionClosers.add(close);
  return () => realtimeConnectionClosers.delete(close);
}

export function closeRealtimeConnections() {
  const connections = Array.from(realtimeConnectionClosers);
  realtimeConnectionClosers.clear();
  for (const close of connections) {
    try {
      close();
    } catch {
      // Shutdown continues for remaining streams; the HTTP server owns final socket cleanup.
    }
  }
  return connections.length;
}

export function realtimeConnectionCount() {
  return realtimeConnectionClosers.size;
}
