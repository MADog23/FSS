import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';

export function useForecast(horizon, scenarioOverlays = null) {
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Serialize overlays for a stable dependency comparison. Two different
  // calls that both resolve to "[]" (e.g. scenario toggled off) are
  // intentionally treated as equivalent — but when overlays go from
  // empty to non-empty (or vice versa) this string changes, which is
  // what actually drives the refetch.
  const overlaysKey = JSON.stringify(scenarioOverlays || []);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let result;
      const overlays = scenarioOverlays || [];
      if (overlays.length > 0) {
        result = await api.simulate({ horizonDays: horizon, overlays });
      } else {
        result = await api.getForecast(horizon);
      }
      setForecast(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizon, overlaysKey]);

  useEffect(() => { run(); }, [run]);

  return { forecast, loading, error, refresh: run };
}
