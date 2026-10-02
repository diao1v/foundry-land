import { useCallback, useEffect, useRef, useState } from "react";
import { getJson } from "./api";

const EVERY_MS = 2000;

// Fetch now, then every 2 s while keepPolling(data) is true. On error: keep the last data, retry.
export function usePoll<T>(url: string, keepPolling: (data: T) => boolean = () => true) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [run, setRun] = useState(0);
  const keep = useRef(keepPolling);
  keep.current = keepPolling;

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const d = await getJson<T>(url);
        if (stopped) return;
        setData(d);
        setError(undefined);
        if (keep.current(d)) timer = setTimeout(tick, EVERY_MS);
      } catch (e) {
        if (stopped) return;
        setError(e as Error);
        if ((e as { status?: number }).status !== 404) timer = setTimeout(tick, EVERY_MS);
      }
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [url, run]);

  const refresh = useCallback(() => setRun((n) => n + 1), []);
  return { data, error, refresh };
}
