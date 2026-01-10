/**
 * React hooks for maintenance management
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getMaintenanceRequests,
  type MaintenanceRequestWithDetails,
  type PaginatedResponse,
} from '../api/maintenance';
import {
  getMaintenanceMetrics,
  getHVACProgramByProperty,
  getRoutingMetrics,
  assignMaintenanceRequest,
  type MaintenanceMetrics,
  type HVACProgramByProperty,
  type RoutingMetrics,
} from '../api/maintenanceMetrics';

export function useMaintenanceRequests(status?: string) {
  const [data, setData] = useState<MaintenanceRequestWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [total, setTotal] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getMaintenanceRequests({ status });
      setData(result.data);
      setTotal(result.total);
    } catch (err) {
      console.error('[useMaintenanceRequests] Error fetching requests:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, total, refetch: fetchData };
}

export function useMaintenanceMetrics() {
  const [data, setData] = useState<MaintenanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getMaintenanceMetrics();
      setData(result);
    } catch (err) {
      console.error('[useMaintenanceMetrics] Error fetching metrics:', err);
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

export function useHVACProgram() {
  const [data, setData] = useState<HVACProgramByProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getHVACProgramByProperty();
      setData(result);
    } catch (err) {
      console.error('[useHVACProgram] Error fetching HVAC program:', err);
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

export function useRoutingMetrics() {
  const [data, setData] = useState<RoutingMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getRoutingMetrics();
      setData(result);
    } catch (err) {
      console.error('[useRoutingMetrics] Error fetching routing metrics:', err);
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

export function useAssignVendor() {
  const [isAssigning, setIsAssigning] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const assign = useCallback(async (requestId: string, vendorProfileId: string) => {
    try {
      setIsAssigning(true);
      setError(null);
      await assignMaintenanceRequest(requestId, vendorProfileId);
      return { success: true };
    } catch (err) {
      console.error('[useAssignVendor] Error assigning vendor:', err);
      setError(err as Error);
      return { success: false, error: err as Error };
    } finally {
      setIsAssigning(false);
    }
  }, []);

  return { assign, isAssigning, error };
}

export function useCreateMaintenanceRequest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = useCallback(async (request: {
    unit_id: string;
    property_id: string;
    title: string;
    description: string;
    category: string;
    priority: 'low' | 'normal' | 'high' | 'emergency';
  }) => {
    try {
      setLoading(true);
      setError(null);
      const { createMaintenanceRequest } = await import('../api/maintenance');
      await createMaintenanceRequest(request);
      return { success: true };
    } catch (err) {
      console.error('[useCreateMaintenanceRequest] Error creating request:', err);
      setError(err as Error);
      return { success: false, error: err as Error };
    } finally {
      setLoading(false);
    }
  }, []);

  return { create, loading, error };
}
