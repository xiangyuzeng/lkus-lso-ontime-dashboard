'use client';

import { useEffect, useState } from 'react';
import type { Payload } from './types';

const DATA_URL = './data.json';
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 min — pipeline pushes ≥ daily; UI re-pulls for early pickup

export type DataStatus = 'loading' | 'ready' | 'error';

export interface DataState {
  status: DataStatus;
  payload: Payload | null;
  error?: string;
}

async function fetchPayload(): Promise<Payload> {
  // Cache-bust: the file behind ./data.json gets overwritten by the pipeline
  // push, but Vercel's CDN + the browser cache otherwise hide it.
  const url = `${DATA_URL}?ts=${Date.now()}`;
  const resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as Payload;
  if (!data?.meta?.generated_at || !Array.isArray(data.metrics) || data.metrics.length === 0) {
    throw new Error('payload missing required fields (meta.generated_at / metrics[])');
  }
  return data;
}

export function usePayload(): DataState {
  const [state, setState] = useState<DataState>({ status: 'loading', payload: null });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const data = await fetchPayload();
        if (!cancelled) setState({ status: 'ready', payload: data });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: 'error',
            payload: null,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    };

    void load();
    const id = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return state;
}
