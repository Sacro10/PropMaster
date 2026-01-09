/**
 * React hooks for payments and rent collection
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getRecentPayments,
  getPendingPayments,
  getOwnerDisbursements,
  getCollectionStats,
  sendPaymentReminder,
  type Payment,
  type Disbursement,
} from '../api/payments';

export function useRecentPayments() {
  const [data, setData] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getRecentPayments();
      setData(result);
    } catch (err) {
      console.error('[useRecentPayments] Error fetching payments:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function usePendingPayments() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getPendingPayments();
      setData(result);
    } catch (err) {
      console.error('[usePendingPayments] Error fetching pending payments:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useOwnerDisbursements() {
  const [data, setData] = useState<Disbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getOwnerDisbursements();
      setData(result);
    } catch (err) {
      console.error('[useOwnerDisbursements] Error fetching disbursements:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useCollectionStats() {
  const [data, setData] = useState<{
    collected_this_month: number;
    collection_rate: string;
    auto_pay_enrolled: number;
    avg_collection_time: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getCollectionStats();
      setData(result);
    } catch (err) {
      console.error('[useCollectionStats] Error fetching collection stats:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useSendPaymentReminder() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const sendReminder = useCallback(async (paymentId: string) => {
    try {
      setLoading(true);
      setError(null);
      await sendPaymentReminder(paymentId);
      return { success: true };
    } catch (err) {
      console.error('[useSendPaymentReminder] Error sending reminder:', err);
      setError(err as Error);
      return { success: false, error: err as Error };
    } finally {
      setLoading(false);
    }
  }, []);

  return { sendReminder, loading, error };
}
