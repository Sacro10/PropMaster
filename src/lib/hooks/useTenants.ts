/**
 * React hooks for tenant management
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getTenants,
  getRentalApplications,
  getTenantScreeningMetrics,
  approveApplication,
  rejectApplication,
  type TenantWithLease,
  type RentalApplication,
  type PaginatedResponse,
} from '../api/tenants';

export function useTenants() {
  const [data, setData] = useState<TenantWithLease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [total, setTotal] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getTenants();
      setData(result.data);
      setTotal(result.total);
    } catch (err) {
      console.error('[useTenants] Error fetching tenants:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, total, refetch: fetchData };
}

export function useRentalApplications() {
  const [data, setData] = useState<RentalApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [total, setTotal] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getRentalApplications();
      setData(result.data);
      setTotal(result.total);
    } catch (err) {
      console.error('[useRentalApplications] Error fetching applications:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const approve = useCallback(async (applicationId: string) => {
    try {
      await approveApplication(applicationId);
      // Refresh data after approval
      await fetchData();
      return { success: true };
    } catch (err) {
      console.error('[useRentalApplications] Error approving application:', err);
      return { success: false, error: err as Error };
    }
  }, [fetchData]);

  const reject = useCallback(async (applicationId: string, notes?: string) => {
    try {
      await rejectApplication(applicationId, notes);
      // Refresh data after rejection
      await fetchData();
      return { success: true };
    } catch (err) {
      console.error('[useRentalApplications] Error rejecting application:', err);
      return { success: false, error: err as Error };
    }
  }, [fetchData]);

  return { data, loading, error, total, refetch: fetchData, approve, reject };
}

export interface TenantMetrics {
  avg_screening_time: number;
  acceptance_rate: number;
  ai_accuracy: number;
  eviction_rate: number;
}

export function useTenantMetrics() {
  const [data, setData] = useState<TenantMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getTenantScreeningMetrics();
      setData(result);
    } catch (err) {
      console.error('[useTenantMetrics] Error fetching metrics:', err);
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
