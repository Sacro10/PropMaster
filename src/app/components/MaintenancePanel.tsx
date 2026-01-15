import { Wrench, CircleCheck, Activity, Bell, ListFilter, RefreshCw, AlertTriangle, CheckCircle, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useHasFeature } from '../hooks/usePlanGating';
import { FeatureGate, LockedFeatureCard } from './UpgradeCTA';
import { useMaintenanceRequests, useMaintenanceMetrics, useHVACProgram, useRoutingMetrics, useAssignVendor } from '../../lib/hooks/useMaintenance';
import {
  getAvailableVendors,
  getHVACVendors,
  logActivity,
  createUnitHVACStatus,
  getUnitHVACStatus,
  getPropertyHVACStatusSummary,
  type HVACVendorOption,
  type HVACStatusEntry,
  type HVACUnitStatusSummary,
} from '../../lib/api/maintenanceMetrics';
import { updateMaintenanceRequestStatus, deleteMaintenanceRequest } from '../../lib/api/maintenance';
import { LoadingPage } from './LoadingSpinner';
import { ErrorState } from './ErrorBoundary';
import { formatRelativeTime, formatDisplayDate } from '../../lib/utils/dateHelpers';
import { CreateMaintenanceRequestModal } from './CreateMaintenanceRequestModal';
import { CreateVendorModal } from './CreateVendorModal';
import { getCurrentAccountId } from '../../lib/api/client';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

type HVACUnitOption = {
  id: string;
  unit_number: string | null;
  hvac_filter_size?: string | null;
};

type HVACPropertyOption = {
  id: string;
  name: string;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  units?: HVACUnitOption[] | null;
};

export function MaintenancePanel() {
  const { isDark, bg, text, border } = useThemeStyles();
  const { user, profile } = useAuth();
  const [assigningRequestId, setAssigningRequestId] = useState<string | null>(null);
  const [availableVendors, setAvailableVendors] = useState<any[]>([]);
  const [isLoadingVendors, setIsLoadingVendors] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);
  const [showAllRequests, setShowAllRequests] = useState(false);
  const [selectedPriority, setSelectedPriority] = useState<'all' | 'emergency' | 'high' | 'normal' | 'low'>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'open' | 'submitted' | 'reviewed' | 'assigned' | 'scheduled' | 'in_progress' | 'completed' | 'closed' | 'cancelled'>('all');
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [statusUpdateError, setStatusUpdateError] = useState<{ id: string; message: string } | null>(null);
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);
  const [showHVACOptions, setShowHVACOptions] = useState(false);
  const [selectedHVACOption, setSelectedHVACOption] = useState<'replacement' | 'delivery' | 'status' | 'filter_delivery' | null>(null);
  const [hvacProperties, setHvacProperties] = useState<HVACPropertyOption[]>([]);
  const [hvacPropertiesLoading, setHvacPropertiesLoading] = useState(false);
  const [hvacPropertiesError, setHvacPropertiesError] = useState<string | null>(null);
  const [hvacVendors, setHvacVendors] = useState<HVACVendorOption[]>([]);
  const [hvacVendorsLoading, setHvacVendorsLoading] = useState(false);
  const [hvacVendorsError, setHvacVendorsError] = useState<string | null>(null);
  const [replacementRadiusMiles, setReplacementRadiusMiles] = useState(40);
  const [deliveryRadiusMiles, setDeliveryRadiusMiles] = useState(40);
  const [filterRadiusMiles, setFilterRadiusMiles] = useState(30);
  const [hvacStatusHistory, setHvacStatusHistory] = useState<HVACStatusEntry[]>([]);
  const [hvacStatusLoading, setHvacStatusLoading] = useState(false);
  const [hvacStatusError, setHvacStatusError] = useState<string | null>(null);
  const [hvacPropertyStatus, setHvacPropertyStatus] = useState<HVACUnitStatusSummary[]>([]);
  const [hvacPropertyStatusLoading, setHvacPropertyStatusLoading] = useState(false);
  const [hvacPropertyStatusError, setHvacPropertyStatusError] = useState<string | null>(null);
  const [replacementForm, setReplacementForm] = useState({
    propertyId: '',
    unitId: '',
    reason: '',
    preferredDate: '',
    budget: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    vendorId: '',
    vendorEmailOverride: '',
  });
  const [deliveryForm, setDeliveryForm] = useState({
    propertyId: '',
    unitId: '',
    equipmentType: '',
    quantity: '1',
    neededBy: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    vendorId: '',
    vendorEmailOverride: '',
  });
  const [statusForm, setStatusForm] = useState({
    propertyId: '',
    unitId: '',
    condition: 'good',
    lastServiced: '',
    notes: '',
  });
  const [filterDeliveryForm, setFilterDeliveryForm] = useState({
    propertyId: '',
    startDate: '',
    filterType: 'standard',
    quantity: '1',
    notes: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    vendorId: '',
    vendorEmailOverride: '',
  });
  const { assign, isAssigning } = useAssignVendor();

  // Feature checks for plan gating
  const maintenanceRouting = useHasFeature('maintenance_routing');
  const hvacFilterProgram = useHasFeature('hvac_filter_program');
  const emergencySupport = useHasFeature('emergency_support_24_7');

  // Fetch data
  const { data: requests, loading: requestsLoading, error: requestsError, refetch: refetchRequests } = useMaintenanceRequests();
  const { data: metrics, loading: metricsLoading, error: metricsError, refetch: refetchMetrics } = useMaintenanceMetrics();
  const { data: hvacProgram, loading: hvacLoading, refetch: refetchHVACProgram } = useHVACProgram();
  const { data: routingMetrics } = useRoutingMetrics();

  useEffect(() => {
    if (!profile && !user) return;
    const name = profile?.full_name || user?.user_metadata?.full_name || '';
    const email = profile?.email || user?.email || '';
    const phone = profile?.phone || '';

    setReplacementForm((prev) => ({
      ...prev,
      contactName: prev.contactName || name,
      contactEmail: prev.contactEmail || email,
      contactPhone: prev.contactPhone || phone,
    }));
    setDeliveryForm((prev) => ({
      ...prev,
      contactName: prev.contactName || name,
      contactEmail: prev.contactEmail || email,
      contactPhone: prev.contactPhone || phone,
    }));
    setFilterDeliveryForm((prev) => ({
      ...prev,
      contactName: prev.contactName || name,
      contactEmail: prev.contactEmail || email,
      contactPhone: prev.contactPhone || phone,
    }));
  }, [profile, user]);

  const formatPropertyAddress = (property?: HVACPropertyOption | null) => {
    if (!property) return 'Unknown Address';
    const parts = [property.address1, property.address2].filter(Boolean);
    const cityStateZip = [property.city, property.state, property.zip].filter(Boolean).join(' ');
    if (cityStateZip) parts.push(cityStateZip);
    return parts.join(', ');
  };

  const getPropertyById = (propertyId: string) => hvacProperties.find((property) => property.id === propertyId);
  const getUnitById = (property: HVACPropertyOption | undefined, unitId: string) =>
    property?.units?.find((unit) => unit.id === unitId);
  const getExternalVendorEmailCache = () => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = window.localStorage.getItem('hvacExternalVendorEmails');
      return stored ? (JSON.parse(stored) as Record<string, string>) : {};
    } catch (error) {
      console.warn('[MaintenancePanel] Failed to read external vendor email cache:', error);
      return {};
    }
  };

  const setExternalVendorEmailCache = (placeId: string, email: string) => {
    if (typeof window === 'undefined') return;
    try {
      const cache = getExternalVendorEmailCache();
      cache[placeId] = email;
      window.localStorage.setItem('hvacExternalVendorEmails', JSON.stringify(cache));
    } catch (error) {
      console.warn('[MaintenancePanel] Failed to write external vendor email cache:', error);
    }
  };

  const hydrateExternalVendorEmails = (vendors: HVACVendorOption[]) => {
    const cache = getExternalVendorEmailCache();
    return vendors.map((vendor) => {
      if (vendor.source !== 'nominatim' || vendor.email) {
        return vendor;
      }
      const cachedEmail = cache[vendor.id];
      if (!cachedEmail) return vendor;
      return { ...vendor, email: cachedEmail };
    });
  };

  useEffect(() => {
    if (!showHVACOptions) return;

    let isActive = true;
    const loadProperties = async () => {
      setHvacPropertiesLoading(true);
      setHvacPropertiesError(null);
      try {
        const accountId = await getCurrentAccountId();
        if (!accountId) {
          throw new Error('No account ID found');
        }

        const { data, error } = await supabase
          .from('properties')
          .select('id, name, address1, address2, city, state, zip, units(id, unit_number, hvac_filter_size)')
          .eq('account_id', accountId)
          .order('name', { ascending: true });

        if (error) {
          throw error;
        }

        if (isActive) {
          setHvacProperties((data as HVACPropertyOption[]) || []);
        }
      } catch (error) {
        console.error('[MaintenancePanel] Error fetching properties:', error);
        if (isActive) {
          setHvacPropertiesError('Failed to load properties. Please try again.');
        }
      } finally {
        if (isActive) {
          setHvacPropertiesLoading(false);
        }
      }
    };

    loadProperties();
    return () => {
      isActive = false;
    };
  }, [showHVACOptions]);

  useEffect(() => {
    const propertyId =
      selectedHVACOption === 'replacement'
        ? replacementForm.propertyId
        : selectedHVACOption === 'delivery'
          ? deliveryForm.propertyId
          : selectedHVACOption === 'filter_delivery'
            ? filterDeliveryForm.propertyId
            : '';
    const radiusMiles =
      selectedHVACOption === 'replacement'
        ? replacementRadiusMiles
        : selectedHVACOption === 'delivery'
          ? deliveryRadiusMiles
          : selectedHVACOption === 'filter_delivery'
            ? filterRadiusMiles
            : undefined;

    if (
      !propertyId ||
      (selectedHVACOption !== 'replacement' &&
        selectedHVACOption !== 'delivery' &&
        selectedHVACOption !== 'filter_delivery')
    ) {
      setHvacVendors([]);
      setHvacVendorsError(null);
      return;
    }

    let isActive = true;
    const loadVendors = async () => {
      setHvacVendorsLoading(true);
      setHvacVendorsError(null);
      try {
        const vendors = await getHVACVendors(propertyId, radiusMiles, true);
        if (isActive) {
          setHvacVendors(hydrateExternalVendorEmails(vendors || []));
        }
      } catch (error) {
        console.error('[MaintenancePanel] Error fetching HVAC vendors:', error);
        if (isActive) {
          setHvacVendors([]);
          setHvacVendorsError('Failed to load HVAC vendors. Please try again.');
        }
      } finally {
        if (isActive) {
          setHvacVendorsLoading(false);
        }
      }
    };

    loadVendors();
    return () => {
      isActive = false;
    };
  }, [
    selectedHVACOption,
    replacementForm.propertyId,
    deliveryForm.propertyId,
    filterDeliveryForm.propertyId,
    replacementRadiusMiles,
    deliveryRadiusMiles,
    filterRadiusMiles,
  ]);

  useEffect(() => {
    if (selectedHVACOption !== 'status' || !statusForm.unitId) {
      setHvacStatusHistory([]);
      setHvacStatusError(null);
      return;
    }

    let isActive = true;
    const loadStatus = async () => {
      setHvacStatusLoading(true);
      setHvacStatusError(null);
      try {
        const history = await getUnitHVACStatus(statusForm.unitId, 5);
        if (isActive) {
          setHvacStatusHistory(history);
        }
      } catch (error) {
        console.error('[MaintenancePanel] Error fetching HVAC status history:', error);
        if (isActive) {
          setHvacStatusHistory([]);
          setHvacStatusError('Failed to load HVAC status history.');
        }
      } finally {
        if (isActive) {
          setHvacStatusLoading(false);
        }
      }
    };

    loadStatus();
    return () => {
      isActive = false;
    };
  }, [selectedHVACOption, statusForm.unitId]);

  useEffect(() => {
    if (selectedHVACOption !== 'status' || !statusForm.propertyId) {
      setHvacPropertyStatus([]);
      setHvacPropertyStatusError(null);
      return;
    }

    let isActive = true;
    const loadPropertyStatus = async () => {
      setHvacPropertyStatusLoading(true);
      setHvacPropertyStatusError(null);
      try {
        const summary = await getPropertyHVACStatusSummary(statusForm.propertyId);
        if (isActive) {
          setHvacPropertyStatus(summary);
        }
      } catch (error) {
        console.error('[MaintenancePanel] Error fetching HVAC property status:', error);
        if (isActive) {
          setHvacPropertyStatus([]);
          setHvacPropertyStatusError('Failed to load property HVAC status.');
        }
      } finally {
        if (isActive) {
          setHvacPropertyStatusLoading(false);
        }
      }
    };

    loadPropertyStatus();
    return () => {
      isActive = false;
    };
  }, [selectedHVACOption, statusForm.propertyId]);

  // Show loading state
  if (requestsLoading || metricsLoading) {
    return <LoadingPage />;
  }

  // Show error state
  if (requestsError || metricsError) {
    return <ErrorState error={requestsError || metricsError} retry={refetchRequests} />;
  }

  // Handle vendor assignment
  const handleAssignClick = async (requestId: string) => {
    setAssigningRequestId(requestId);
    setAssignError(null);
    setIsLoadingVendors(true);
    try {
      const vendors = await getAvailableVendors(requestId);
      setAvailableVendors(vendors);
    } catch (error) {
      console.error('Failed to load vendors:', error);
      setAvailableVendors([]);
      setAssignError('Failed to load vendors. Please try again.');
    } finally {
      setIsLoadingVendors(false);
    }
  };

  const handleDeleteRequest = async (request: any) => {
    const title = request?.title || 'this request';
    const confirmed = confirm(`Delete ${title}? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      setDeletingRequestId(request.id);
      await deleteMaintenanceRequest(request.id);
      await refetchRequests();
      await refetchMetrics();
    } catch (error) {
      console.error('Failed to delete maintenance request:', error);
      alert('Failed to delete maintenance request. Please try again.');
    } finally {
      setDeletingRequestId(null);
    }
  };

  const handleVendorSelect = async (vendorId: string) => {
    if (!assigningRequestId) return;

    const vendor = availableVendors.find((v) => v.id === vendorId);
    if (!vendor?.email) {
      setAssignError('Vendor email is missing. Add an email to the vendor profile.');
      return;
    }

    const request = requests.find((r) => r.id === assigningRequestId);
    const propertyDisplay = request?.property && request?.unit
      ? `${request.property.name} #${request.unit.unit_number}`
      : request?.property?.name || 'Unknown Property';
    const requestedAt = request?.requested_at
      ? formatDisplayDate(request.requested_at, 'MMM d, yyyy h:mm a')
      : 'N/A';
    const subject = `Maintenance Request: ${request?.title || assigningRequestId}`;
    const body = [
      `You have been assigned a maintenance request.`,
      '',
      `Request ID: ${assigningRequestId}`,
      `Title: ${request?.title || 'N/A'}`,
      `Property: ${propertyDisplay}`,
      `Priority: ${request?.priority || 'normal'}`,
      `Category: ${request?.category || 'general'}`,
      `Reported: ${requestedAt}`,
      `Description: ${request?.description || 'N/A'}`,
    ].join('\n');
    const mailto = `mailto:${encodeURIComponent(vendor.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;

    const result = await assign(assigningRequestId, vendorId);
    if (result.success) {
      setAssigningRequestId(null);
      setAvailableVendors([]);
      refetchRequests();
      refetchMetrics();
      setAssignError(null);
    } else {
      setAssignError(result.error?.message || 'Failed to assign vendor. Please try again.');
    }
  };

  const handleHVACOptionSelect = (option: 'replacement' | 'delivery' | 'status' | 'filter_delivery') => {
    setSelectedHVACOption(option);
  };

  const handleHVACReplacementSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!replacementForm.propertyId || !replacementForm.unitId || !replacementForm.vendorId) {
      alert('Please select a property, unit, and vendor.');
      return;
    }

    const property = getPropertyById(replacementForm.propertyId);
    const unit = getUnitById(property, replacementForm.unitId);
    const vendor = hvacVendors.find((v) => v.id === replacementForm.vendorId);
    const vendorEmail = vendor?.email || replacementForm.vendorEmailOverride;

    if (!vendorEmail) {
      alert('Vendor email is missing. Please enter one or choose a different vendor.');
      return;
    }

    if (vendor?.source === 'nominatim' && replacementForm.vendorEmailOverride) {
      setExternalVendorEmailCache(vendor.id, replacementForm.vendorEmailOverride);
    }

    const unitLabel = unit?.unit_number ? `Unit ${unit.unit_number}` : 'Unit';
    const subject = `HVAC Replacement Request - ${property?.name || 'Property'}`;
    const body = [
      'HVAC Replacement Request',
      '',
      `Property: ${property?.name || 'Unknown Property'}`,
      `Address: ${formatPropertyAddress(property)}`,
      `Unit: ${unitLabel}`,
      `Reason: ${replacementForm.reason || 'N/A'}`,
      `Preferred Date: ${replacementForm.preferredDate || 'Flexible'}`,
      `Budget: ${replacementForm.budget || 'Not specified'}`,
      '',
      `Contact Name: ${replacementForm.contactName || 'N/A'}`,
      `Contact Email: ${replacementForm.contactEmail || 'N/A'}`,
      `Contact Phone: ${replacementForm.contactPhone || 'N/A'}`,
    ].join('\n');

    window.location.href = `mailto:${encodeURIComponent(vendorEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    try {
      await logActivity({
        eventType: 'hvac_replacement_request',
        summary: `HVAC replacement requested for ${property?.name || 'property'} ${unitLabel}`,
        entityType: 'unit',
        entityId: replacementForm.unitId,
        metadata: {
          propertyId: replacementForm.propertyId,
          vendorId: replacementForm.vendorId,
        },
      });
    } catch (error) {
      console.error('[MaintenancePanel] Failed to log HVAC replacement activity:', error);
    }

    setReplacementForm({
      propertyId: '',
      unitId: '',
      reason: '',
      preferredDate: '',
      budget: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      vendorId: '',
      vendorEmailOverride: '',
    });
  };

  const handleHVACDeliverySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!deliveryForm.propertyId || !deliveryForm.unitId || !deliveryForm.vendorId) {
      alert('Please select a property, unit, and vendor.');
      return;
    }

    const property = getPropertyById(deliveryForm.propertyId);
    const unit = getUnitById(property, deliveryForm.unitId);
    const vendor = hvacVendors.find((v) => v.id === deliveryForm.vendorId);
    const vendorEmail = vendor?.email || deliveryForm.vendorEmailOverride;

    if (!vendorEmail) {
      alert('Vendor email is missing. Please enter one or choose a different vendor.');
      return;
    }

    if (vendor?.source === 'nominatim' && deliveryForm.vendorEmailOverride) {
      setExternalVendorEmailCache(vendor.id, deliveryForm.vendorEmailOverride);
    }

    const unitLabel = unit?.unit_number ? `Unit ${unit.unit_number}` : 'Unit';
    const subject = `HVAC Delivery Request - ${property?.name || 'Property'}`;
    const body = [
      'HVAC Delivery Request',
      '',
      `Property: ${property?.name || 'Unknown Property'}`,
      `Address: ${formatPropertyAddress(property)}`,
      `Unit: ${unitLabel}`,
      `Equipment Type: ${deliveryForm.equipmentType || 'N/A'}`,
      `Quantity: ${deliveryForm.quantity || '1'}`,
      `Needed By: ${deliveryForm.neededBy || 'Flexible'}`,
      '',
      `Contact Name: ${deliveryForm.contactName || 'N/A'}`,
      `Contact Email: ${deliveryForm.contactEmail || 'N/A'}`,
      `Contact Phone: ${deliveryForm.contactPhone || 'N/A'}`,
    ].join('\n');

    window.location.href = `mailto:${encodeURIComponent(vendorEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    try {
      await logActivity({
        eventType: 'hvac_delivery_request',
        summary: `HVAC delivery requested for ${property?.name || 'property'} ${unitLabel}`,
        entityType: 'unit',
        entityId: deliveryForm.unitId,
        metadata: {
          propertyId: deliveryForm.propertyId,
          vendorId: deliveryForm.vendorId,
        },
      });
    } catch (error) {
      console.error('[MaintenancePanel] Failed to log HVAC delivery activity:', error);
    }

    setDeliveryForm({
      propertyId: '',
      unitId: '',
      equipmentType: '',
      quantity: '1',
      neededBy: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      vendorId: '',
      vendorEmailOverride: '',
    });
  };

  const handleHVACStatusSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!statusForm.propertyId || !statusForm.unitId) {
      alert('Please select a property and unit.');
      return;
    }

    const property = getPropertyById(statusForm.propertyId);
    const unit = getUnitById(property, statusForm.unitId);
    const unitLabel = unit?.unit_number ? `Unit ${unit.unit_number}` : 'Unit';

    try {
      await createUnitHVACStatus({
        unitId: statusForm.unitId,
        condition: statusForm.condition as 'good' | 'monitor' | 'service' | 'replace',
        lastServicedDate: statusForm.lastServiced || null,
        notes: statusForm.notes || null,
      });
      const history = await getUnitHVACStatus(statusForm.unitId, 5);
      setHvacStatusHistory(history);
      if (statusForm.propertyId) {
        const summary = await getPropertyHVACStatusSummary(statusForm.propertyId);
        setHvacPropertyStatus(summary);
      }
    } catch (error) {
      console.error('[MaintenancePanel] Failed to log HVAC status:', error);
      alert('Failed to log HVAC status. Please try again.');
      return;
    }

    setStatusForm({
      propertyId: '',
      unitId: '',
      condition: 'good',
      lastServiced: '',
      notes: '',
    });
  };

  const handleHVACFilterDeliverySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!filterDeliveryForm.propertyId || !filterDeliveryForm.vendorId) {
      alert('Please select a property and vendor.');
      return;
    }

    const property = getPropertyById(filterDeliveryForm.propertyId);
    const vendor = hvacVendors.find((v) => v.id === filterDeliveryForm.vendorId);
    const vendorEmail = vendor?.email || filterDeliveryForm.vendorEmailOverride;
    const eligibleUnits = (property?.units || []).filter((unit) => unit.hvac_filter_size);

    if (!property || eligibleUnits.length === 0) {
      alert('No HVAC-equipped units found for this property.');
      return;
    }

    if (!vendorEmail) {
      alert('Vendor email is missing. Please enter one or choose a different vendor.');
      return;
    }

    if (vendor?.source === 'nominatim' && filterDeliveryForm.vendorEmailOverride) {
      setExternalVendorEmailCache(vendor.id, filterDeliveryForm.vendorEmailOverride);
    }

    const startDate = filterDeliveryForm.startDate
      ? new Date(filterDeliveryForm.startDate)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const nextDelivery = startDate.toISOString().split('T')[0];
    const annualExpiresOn = new Date(startDate);
    annualExpiresOn.setFullYear(annualExpiresOn.getFullYear() + 1);
    const annualExpiresDate = annualExpiresOn.toISOString().split('T')[0];

    try {
      const accountId = await getCurrentAccountId();
      if (!accountId) {
        throw new Error('No account ID found');
      }

      const subscriptions = eligibleUnits.map((unit) => ({
        account_id: accountId,
        unit_id: unit.id,
        filter_size: unit.hvac_filter_size || 'standard',
        filter_type: filterDeliveryForm.filterType,
        quantity: Number(filterDeliveryForm.quantity || 1),
        frequency: 'monthly',
        next_delivery_date: nextDelivery,
        annual_expires_on: annualExpiresDate,
        annual_renewal_reminder_sent_at: null,
        status: 'active',
      }));

      const { error } = await supabase.from('hvac_filter_subscriptions').insert(subscriptions);
      if (error) {
        throw error;
      }

      const unitLines = eligibleUnits
        .map((unit) => `- ${unit.unit_number ? `Unit ${unit.unit_number}` : unit.id.slice(0, 6)} | Filter size: ${unit.hvac_filter_size}`)
        .join('\n');
      const subject = `HVAC Filter Delivery Setup - ${property.name}`;
      const body = [
        'HVAC Filter Delivery Setup (Monthly)',
        '',
        `Property: ${property.name}`,
        `Address: ${formatPropertyAddress(property)}`,
        `Start Date: ${nextDelivery}`,
        `Annual Renewal Due: ${annualExpiresDate}`,
        `Filter Type: ${filterDeliveryForm.filterType}`,
        `Quantity per unit: ${filterDeliveryForm.quantity}`,
        '',
        'Units included:',
        unitLines,
        '',
        `Notes: ${filterDeliveryForm.notes || 'N/A'}`,
        '',
        `Contact Name: ${filterDeliveryForm.contactName || 'N/A'}`,
        `Contact Email: ${filterDeliveryForm.contactEmail || 'N/A'}`,
        `Contact Phone: ${filterDeliveryForm.contactPhone || 'N/A'}`,
        '',
        'Reminder: Annual renewal required to continue the program.',
      ].join('\n');

      window.location.href = `mailto:${encodeURIComponent(vendorEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

      await logActivity({
        eventType: 'hvac_filter_delivery_setup',
        summary: `HVAC filter delivery setup for ${property.name} (${eligibleUnits.length} units)`,
        entityType: 'property',
        entityId: property.id,
        metadata: {
          vendorId: filterDeliveryForm.vendorId,
          units: eligibleUnits.length,
          nextDelivery,
          annualRenewalRequired: true,
        },
      });

      refetchHVACProgram();
    } catch (error) {
      console.error('[MaintenancePanel] Failed to set up HVAC filter delivery:', error);
      alert('Failed to set up HVAC filter delivery. Please try again.');
      return;
    }

    setFilterDeliveryForm({
      propertyId: '',
      startDate: '',
      filterType: 'standard',
      quantity: '1',
      notes: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      vendorId: '',
      vendorEmailOverride: '',
    });
  };

  // Handle emergency request
  const handleEmergencyClick = () => {
    setIsEmergencyModalOpen(true);
  };

  const handleStatusChange = async (requestId: string, status: string) => {
    setUpdatingStatusId(requestId);
    setStatusUpdateError(null);
    try {
      await updateMaintenanceRequestStatus(requestId, status);
      await refetchRequests();
      await refetchMetrics();
    } catch (error) {
      console.error('Failed to update status:', error);
      setStatusUpdateError({ id: requestId, message: 'Failed to update status. Please try again.' });
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const filteredRequests = selectedPriority === 'all'
    ? requests
    : requests.filter((request) => request.priority === selectedPriority);

  const fullyFilteredRequests = selectedStatus === 'all'
    ? filteredRequests
    : filteredRequests.filter((request) => request.status === selectedStatus);

  const maintenanceStatusOptions = [
    { value: 'open', label: 'Open' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'reviewed', label: 'Reviewed' },
    { value: 'assigned', label: 'Assigned' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'closed', label: 'Closed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const formInputClass = `w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 ${
    isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
  }`;

  const maintenanceStats = metrics ? [
    { label: 'Active Requests', value: metrics.active_requests.toString(), change: '0%', icon: Wrench },
    { label: 'Avg. Response Time', value: `${metrics.avg_response_time_hours} hrs`, change: '0%', icon: Activity },
    { label: 'Completion Rate', value: `${metrics.completion_rate}%`, change: '0%', icon: CheckCircle },
    { label: 'Emergency Support', value: metrics.emergency_support_status, change: metrics.emergency_support_status === '24/7' ? 'Active' : 'Limited', icon: Bell },
  ] : [];

  const selectedReplacementVendor = hvacVendors.find((vendor) => vendor.id === replacementForm.vendorId) || null;
  const selectedDeliveryVendor = hvacVendors.find((vendor) => vendor.id === deliveryForm.vendorId) || null;
  const selectedFilterVendor = hvacVendors.find((vendor) => vendor.id === filterDeliveryForm.vendorId) || null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            MAINTENANCE & REMODEL
          </h2>
          <p className={text.muted} style={{ fontFamily: 'Work Sans, sans-serif' }}>
            Advanced maintenance management with smart routing and 24/7 emergency support
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={refetchRequests}
            className={`px-4 py-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg transition-colors flex items-center gap-2`}
            title="Refresh data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsVendorModalOpen(true)}
            className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform"
          >
            + Add Vendor
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform"
          >
            + Create Request
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-6">
        {maintenanceStats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 ${isDark ? 'bg-white/5' : 'bg-gray-100'} rounded-lg`}>
                  <Icon className="w-4 h-4 text-[#ff6b35]" />
                </div>
                <p className={`text-sm ${text.muted}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  {stat.label}
                </p>
              </div>
              <div className="flex items-end justify-between">
                <p className="text-3xl font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  {stat.value}
                </p>
                <span className={`text-sm ${stat.change.includes('Active') || stat.change.includes('+') ? 'text-emerald-400' : stat.change.includes('-') ? 'text-red-400' : 'text-gray-400'}`}>
                  {stat.change}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Maintenance Requests */}
        <div className={`col-span-2 ${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              MAINTENANCE REQUESTS
            </h3>
            <div className="flex items-center gap-3">
              <select
                value={selectedPriority}
                onChange={(event) => {
                  setSelectedPriority(event.target.value as typeof selectedPriority);
                  setShowAllRequests(false);
                }}
                className={`px-4 py-2 ${isDark ? 'bg-white/5' : 'bg-gray-50'} border ${border.default} rounded-lg text-sm focus:outline-none focus:border-[#ff6b35]/50`}
              >
                <option value="all">All Priorities</option>
                <option value="emergency">Emergency</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
              <select
                value={selectedStatus}
                onChange={(event) => {
                  setSelectedStatus(event.target.value as typeof selectedStatus);
                  setShowAllRequests(false);
                }}
                className={`px-4 py-2 ${isDark ? 'bg-white/5' : 'bg-gray-50'} border ${border.default} rounded-lg text-sm focus:outline-none focus:border-[#ff6b35]/50`}
              >
                <option value="all">All Statuses</option>
                {maintenanceStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  setSelectedPriority('all');
                  setSelectedStatus('all');
                  setShowAllRequests(false);
                }}
                className={`px-4 py-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} border ${border.default} rounded-lg text-sm transition-colors`}
              >
                Clear Filters
              </button>
              <button className={`p-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-lg transition-colors`}>
                <ListFilter className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {fullyFilteredRequests.length === 0 ? (
              <div className="text-center py-12">
                <Wrench className={`w-12 h-12 ${text.muted} mx-auto mb-4`} />
                <p className={`${text.muted} mb-2`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  No maintenance requests
                </p>
                <p className={`text-sm ${text.inactive}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  All systems running smoothly
                </p>
              </div>
            ) : (
              fullyFilteredRequests.slice(0, showAllRequests ? fullyFilteredRequests.length : 5).map((request) => {
                const propertyDisplay = request.property && request.unit
                  ? `${request.property.name} #${request.unit.unit_number}`
                  : request.property?.name || 'Unknown';
                const vendorName = request.assignment?.vendor?.business_name;

                return (
                  <div
                    key={request.id}
                    className={`p-4 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-lg transition-all border ${border.default} hover:border-[#ff6b35]/50`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`text-sm ${text.inactive}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                            #{request.id.substring(0, 8)}
                          </span>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              request.priority === 'emergency'
                                ? 'bg-red-500/20 text-red-400'
                                : request.priority === 'high'
                                ? 'bg-orange-500/20 text-orange-400'
                                : request.priority === 'normal'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-blue-500/20 text-blue-400'
                            }`}
                          >
                            {request.priority.toUpperCase()}
                          </span>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              request.status === 'completed'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : request.status === 'in_progress'
                                ? 'bg-blue-500/20 text-blue-400'
                                : request.status === 'assigned'
                                ? 'bg-purple-500/20 text-purple-400'
                                : request.status === 'scheduled'
                                ? 'bg-cyan-500/20 text-cyan-400'
                                : 'bg-white/20 text-white/60'
                            }`}
                          >
                            {request.status.replace('_', ' ').toUpperCase()}
                          </span>
                          <select
                            value={request.status}
                            onChange={(event) => handleStatusChange(request.id, event.target.value)}
                            disabled={updatingStatusId === request.id}
                            className={`px-2 py-1 ${isDark ? 'bg-white/10' : 'bg-white'} border ${border.default} rounded-md text-xs focus:outline-none focus:border-[#ff6b35]/50`}
                          >
                            {maintenanceStatusOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleDeleteRequest(request)}
                            disabled={deletingRequestId === request.id}
                            className={`p-2 rounded-lg transition-colors ${
                              isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-white hover:bg-gray-100'
                            } ${deletingRequestId === request.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title="Delete maintenance request"
                          >
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </button>
                        </div>
                        {statusUpdateError?.id === request.id && (
                          <p className="text-xs text-red-400 mb-2">{statusUpdateError.message}</p>
                        )}
                        <p className="font-medium mb-2" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                          {request.title}
                        </p>
                        <div className={`flex items-center gap-4 text-sm ${text.muted}`}>
                          <span>{propertyDisplay}</span>
                          <span>•</span>
                          <span>{formatRelativeTime(request.requested_at)}</span>
                        </div>
                      </div>

                      <div className="text-right ml-4">
                        {vendorName ? (
                          <>
                            <p className={`text-sm ${text.muted} mb-1`}>Technician</p>
                            <p className="text-sm font-medium mb-1">{vendorName}</p>
                            {request.scheduled_for && (
                              <p className="text-xs text-[#ff6b35]">
                                ETA: {formatDisplayDate(request.scheduled_for, 'MMM d, h:mm a')}
                              </p>
                            )}
                          </>
                        ) : (
                          <>
                            {assigningRequestId === request.id ? (
                              <div className={`p-3 ${isDark ? 'bg-white/10' : 'bg-gray-100'} rounded-lg min-w-[200px]`}>
                                <p className="text-xs mb-2">Select Vendor:</p>
                                {isLoadingVendors ? (
                                  <p className="text-xs text-gray-400">Loading vendors...</p>
                                ) : availableVendors.length === 0 ? (
                                  <p className="text-xs text-gray-400">No vendors available.</p>
                                ) : (
                                  <div className="space-y-1 max-h-32 overflow-y-auto">
                                    {availableVendors.map((vendor) => (
                                      <button
                                        key={vendor.id}
                                        onClick={() => handleVendorSelect(vendor.id)}
                                        disabled={isAssigning}
                                        className={`w-full text-left p-2 ${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-200'} rounded text-xs transition-colors`}
                                      >
                                        {vendor.businessName}
                                        <span className="text-xs text-gray-400 ml-1">★{vendor.rating}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {assignError && (
                                  <p className="mt-2 text-xs text-red-400">{assignError}</p>
                                )}
                                <button
                                  onClick={() => setAssigningRequestId(null)}
                                  className="mt-2 text-xs text-gray-400 hover:text-gray-300"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAssignClick(request.id)}
                                className="px-4 py-2 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg text-sm font-medium hover:scale-105 transition-transform"
                              >
                                Assign
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {fullyFilteredRequests.length > 5 && (
            <button 
              onClick={() => setShowAllRequests(!showAllRequests)}
              className={`w-full mt-4 py-3 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg text-sm font-medium transition-colors`}
            >
              {showAllRequests ? 'Show Less' : 'View All Requests'}
            </button>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* HVAC Filter Program - Gated by Premium (hvac_filter_program) */}
          <FeatureGate
            feature="hvac_filter_program"
            hasAccess={hvacFilterProgram.hasAccess}
            loading={hvacFilterProgram.loading}
            fallback={
              <LockedFeatureCard
                name="HVAC Filter Program"
                description="Automated monthly filter delivery for all your properties"
                icon={<Activity className="w-6 h-6" />}
                feature="hvac_filter_program"
              />
            }
          >
            <div className={`relative overflow-hidden ${isDark ? 'bg-gradient-to-br from-[#171c31] via-[#12182a] to-[#0c1220] shadow-[0_20px_60px_rgba(0,0,0,0.45)]' : 'bg-white shadow-md'} border ${border.default} rounded-2xl p-7`}>
              {isDark && (
                <div
                  className="pointer-events-none absolute inset-0 opacity-40"
                  style={{
                    backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(16,185,129,0.12), transparent 55%), radial-gradient(circle at 90% 10%, rgba(14,165,233,0.12), transparent 45%), linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
                    backgroundSize: '100% 100%, 100% 100%, 28px 28px, 28px 28px',
                    backgroundPosition: 'center, center, -1px -1px, -1px -1px',
                  }}
                />
              )}
              <div className="relative z-10">
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-3 bg-gradient-to-br from-[#10b981] to-[#06b6d4] rounded-2xl shadow-[0_8px_24px_rgba(16,185,129,0.35)]">
                    <Activity className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl tracking-wide" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                      HVAC FILTER PROGRAM
                    </h3>
                    <p className={`text-sm ${text.secondary}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      Monthly tenant filter delivery program
                    </p>
                  </div>
                </div>

                {hvacLoading ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className={`p-4 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-xl animate-pulse`}>
                        <div className="h-4 bg-white/10 rounded w-1/2 mb-2"></div>
                        <div className="h-3 bg-white/10 rounded w-3/4"></div>
                      </div>
                    ))}
                  </div>
                ) : hvacProgram.length === 0 ? (
                  <div className="text-center py-10">
                    <p className={`text-sm ${text.muted}`}>No active HVAC subscriptions</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      {hvacProgram.map((property) => (
                        <div
                          key={property.property_id}
                          className={`p-4 ${isDark ? 'bg-white/5 backdrop-blur-sm' : 'bg-gray-50'} rounded-2xl border ${border.default}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <p className="font-semibold text-sm tracking-wide" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                              {property.property_name}
                            </p>
                            <span className={`text-xs ${text.muted}`}>
                              {property.unit_count} enrolled
                              {typeof property.total_units === 'number' ? ` / ${property.total_units} total` : ''}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className={text.muted}>
                              Next delivery: {property.next_delivery ? formatDisplayDate(property.next_delivery, 'MMM d') : 'Not scheduled'}
                            </span>
                            <span className="text-emerald-400 font-semibold">{property.total_filters} filters</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className={`mt-5 p-4 ${isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'} border border-emerald-500/30 rounded-2xl`}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className={`text-base ${isDark ? 'text-emerald-300' : 'text-emerald-700'} mb-1 font-semibold`}>
                            {hvacProgram.reduce((sum, p) => sum + p.total_filters, 0)} filters scheduled
                          </p>
                          <p className={`text-sm ${text.muted}`}>
                            Across {hvacProgram.length} properties
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            const nextState = !showHVACOptions;
                            setShowHVACOptions(nextState);
                            if (!nextState) {
                              setSelectedHVACOption(null);
                            }
                          }}
                          className={`px-4 py-2 ${isDark ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200' : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700'} rounded-xl text-sm font-semibold transition-colors`}
                        >
                          HVAC Options
                        </button>
                      </div>

                      {showHVACOptions && (
                        <div className="mt-4 space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {[
                              { label: 'HVAC Replacement', value: 'replacement' as const },
                              { label: 'HVAC Delivery', value: 'delivery' as const },
                              { label: 'HVAC Status', value: 'status' as const },
                              { label: 'HVAC Filter Delivery', value: 'filter_delivery' as const },
                            ].map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => handleHVACOptionSelect(option.value)}
                                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                                  selectedHVACOption === option.value
                                    ? isDark
                                      ? 'bg-emerald-500/40 text-emerald-100'
                                      : 'bg-emerald-200 text-emerald-800'
                                    : isDark
                                      ? 'bg-white/5 text-emerald-100 hover:bg-white/10'
                                      : 'bg-white text-emerald-700 hover:bg-emerald-100'
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>

                          {hvacPropertiesLoading && (
                            <p className={`text-xs ${text.muted}`}>Loading properties...</p>
                          )}
                          {hvacPropertiesError && (
                            <p className="text-xs text-red-400">{hvacPropertiesError}</p>
                          )}

                          {selectedHVACOption === 'replacement' && (
                            <form onSubmit={handleHVACReplacementSubmit} className="space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Property</label>
                                  <select
                                    value={replacementForm.propertyId}
                                    onChange={(event) => {
                                      const propertyId = event.target.value;
                                      setReplacementForm((prev) => ({
                                        ...prev,
                                        propertyId,
                                        unitId: '',
                                        vendorId: '',
                                      }));
                                    }}
                                    className={formInputClass}
                                  >
                                    <option value="">Select property</option>
                                    {hvacProperties.map((property) => (
                                      <option key={property.id} value={property.id}>
                                        {property.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Unit</label>
                                  <select
                                    value={replacementForm.unitId}
                                    onChange={(event) => setReplacementForm((prev) => ({ ...prev, unitId: event.target.value }))}
                                    className={formInputClass}
                                    disabled={!replacementForm.propertyId}
                                  >
                                    <option value="">Select unit</option>
                                    {(getPropertyById(replacementForm.propertyId)?.units || []).map((unit) => (
                                      <option key={unit.id} value={unit.id}>
                                        {unit.unit_number ? `Unit ${unit.unit_number}` : `Unit ${unit.id.slice(0, 6)}`}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              <div>
                                <label className={`text-xs ${text.muted}`}>Replacement Reason</label>
                                <textarea
                                  value={replacementForm.reason}
                                  onChange={(event) => setReplacementForm((prev) => ({ ...prev, reason: event.target.value }))}
                                  className={formInputClass}
                                  rows={2}
                                  placeholder="Describe the issue or reason for replacement"
                                />
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Preferred Date</label>
                                  <input
                                    type="date"
                                    value={replacementForm.preferredDate}
                                    onChange={(event) => setReplacementForm((prev) => ({ ...prev, preferredDate: event.target.value }))}
                                    className={formInputClass}
                                  />
                                </div>
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Budget Range</label>
                                  <input
                                    type="text"
                                    value={replacementForm.budget}
                                    onChange={(event) => setReplacementForm((prev) => ({ ...prev, budget: event.target.value }))}
                                    className={formInputClass}
                                    placeholder="e.g., $5k - $8k"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Contact Name</label>
                                  <input
                                    type="text"
                                    value={replacementForm.contactName}
                                    onChange={(event) => setReplacementForm((prev) => ({ ...prev, contactName: event.target.value }))}
                                    className={formInputClass}
                                    placeholder="Primary contact"
                                  />
                                </div>
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Contact Email</label>
                                  <input
                                    type="email"
                                    value={replacementForm.contactEmail}
                                    onChange={(event) => setReplacementForm((prev) => ({ ...prev, contactEmail: event.target.value }))}
                                    className={formInputClass}
                                    placeholder="name@example.com"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Contact Phone</label>
                                  <input
                                    type="tel"
                                    value={replacementForm.contactPhone}
                                    onChange={(event) => setReplacementForm((prev) => ({ ...prev, contactPhone: event.target.value }))}
                                    className={formInputClass}
                                    placeholder="(555) 123-4567"
                                  />
                                </div>
                                <div>
                                  <label className={`text-xs ${text.muted}`}>HVAC Vendor (within {replacementRadiusMiles} miles)</label>
                                  <select
                                    value={replacementForm.vendorId}
                                    onChange={(event) => setReplacementForm((prev) => ({ ...prev, vendorId: event.target.value }))}
                                    className={formInputClass}
                                    disabled={!replacementForm.propertyId || hvacVendorsLoading}
                                  >
                                    <option value="">Select vendor</option>
                                    {hvacVendors.map((vendor) => (
                                      <option key={vendor.id} value={vendor.id}>
                                        {vendor.businessName}{vendor.source === 'nominatim' ? ' (OSM)' : ''}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              {selectedReplacementVendor && !selectedReplacementVendor.email && (
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Vendor Email (required for email)</label>
                                  <input
                                    type="email"
                                    value={replacementForm.vendorEmailOverride}
                                    onChange={(event) => setReplacementForm((prev) => ({ ...prev, vendorEmailOverride: event.target.value }))}
                                    className={formInputClass}
                                    placeholder="vendor@example.com"
                                  />
                                  {(selectedReplacementVendor.phone || selectedReplacementVendor.website) && (
                                    <p className={`text-xs ${text.muted} mt-1`}>
                                      {selectedReplacementVendor.phone ? `Phone: ${selectedReplacementVendor.phone}` : ''}
                                      {selectedReplacementVendor.phone && selectedReplacementVendor.website ? ' • ' : ''}
                                      {selectedReplacementVendor.website ? `Website: ${selectedReplacementVendor.website}` : ''}
                                    </p>
                                  )}
                                  {selectedReplacementVendor.address && (
                                    <p className={`text-xs ${text.muted} mt-1`}>{selectedReplacementVendor.address}</p>
                                  )}
                                </div>
                              )}

                              <div>
                                <label className={`text-xs ${text.muted}`}>Search Radius (miles)</label>
                                <input
                                  type="number"
                                  min="5"
                                  max="200"
                                  value={replacementRadiusMiles}
                                  onChange={(event) => setReplacementRadiusMiles(Number(event.target.value))}
                                  className={formInputClass}
                                />
                              </div>

                              {hvacVendorsLoading && (
                                <p className={`text-xs ${text.muted}`}>Loading nearby HVAC vendors...</p>
                              )}
                              {hvacVendorsError && (
                                <p className="text-xs text-red-400">{hvacVendorsError}</p>
                              )}
                              {!hvacVendorsLoading && !hvacVendorsError && replacementForm.propertyId && hvacVendors.length === 0 && (
                                <p className={`text-xs ${text.muted}`}>No HVAC vendors found within {replacementRadiusMiles} miles.</p>
                              )}

                              <button
                                type="submit"
                                className={`w-full py-2 ${isDark ? 'bg-emerald-500/30 hover:bg-emerald-500/40 text-emerald-100' : 'bg-emerald-200 hover:bg-emerald-300 text-emerald-800'} rounded-lg text-sm font-semibold transition-colors`}
                              >
                                Send Replacement Request
                              </button>
                            </form>
                          )}

                          {selectedHVACOption === 'delivery' && (
                            <form onSubmit={handleHVACDeliverySubmit} className="space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Property</label>
                                  <select
                                    value={deliveryForm.propertyId}
                                    onChange={(event) => {
                                      const propertyId = event.target.value;
                                      setDeliveryForm((prev) => ({
                                        ...prev,
                                        propertyId,
                                        unitId: '',
                                        vendorId: '',
                                      }));
                                    }}
                                    className={formInputClass}
                                  >
                                    <option value="">Select property</option>
                                    {hvacProperties.map((property) => (
                                      <option key={property.id} value={property.id}>
                                        {property.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Unit</label>
                                  <select
                                    value={deliveryForm.unitId}
                                    onChange={(event) => setDeliveryForm((prev) => ({ ...prev, unitId: event.target.value }))}
                                    className={formInputClass}
                                    disabled={!deliveryForm.propertyId}
                                  >
                                    <option value="">Select unit</option>
                                    {(getPropertyById(deliveryForm.propertyId)?.units || []).map((unit) => (
                                      <option key={unit.id} value={unit.id}>
                                        {unit.unit_number ? `Unit ${unit.unit_number}` : `Unit ${unit.id.slice(0, 6)}`}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Equipment Type</label>
                                  <input
                                    type="text"
                                    value={deliveryForm.equipmentType}
                                    onChange={(event) => setDeliveryForm((prev) => ({ ...prev, equipmentType: event.target.value }))}
                                    className={formInputClass}
                                    placeholder="e.g., 2.5 ton split system"
                                  />
                                </div>
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Quantity</label>
                                  <input
                                    type="number"
                                    min="1"
                                    value={deliveryForm.quantity}
                                    onChange={(event) => setDeliveryForm((prev) => ({ ...prev, quantity: event.target.value }))}
                                    className={formInputClass}
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Needed By</label>
                                  <input
                                    type="date"
                                    value={deliveryForm.neededBy}
                                    onChange={(event) => setDeliveryForm((prev) => ({ ...prev, neededBy: event.target.value }))}
                                    className={formInputClass}
                                  />
                                </div>
                                <div>
                                  <label className={`text-xs ${text.muted}`}>HVAC Vendor (within {deliveryRadiusMiles} miles)</label>
                                  <select
                                    value={deliveryForm.vendorId}
                                    onChange={(event) => setDeliveryForm((prev) => ({ ...prev, vendorId: event.target.value }))}
                                    className={formInputClass}
                                    disabled={!deliveryForm.propertyId || hvacVendorsLoading}
                                  >
                                    <option value="">Select vendor</option>
                                    {hvacVendors.map((vendor) => (
                                      <option key={vendor.id} value={vendor.id}>
                                        {vendor.businessName}{vendor.source === 'nominatim' ? ' (OSM)' : ''}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              {selectedDeliveryVendor && !selectedDeliveryVendor.email && (
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Vendor Email (required for email)</label>
                                  <input
                                    type="email"
                                    value={deliveryForm.vendorEmailOverride}
                                    onChange={(event) => setDeliveryForm((prev) => ({ ...prev, vendorEmailOverride: event.target.value }))}
                                    className={formInputClass}
                                    placeholder="vendor@example.com"
                                  />
                                  {(selectedDeliveryVendor.phone || selectedDeliveryVendor.website) && (
                                    <p className={`text-xs ${text.muted} mt-1`}>
                                      {selectedDeliveryVendor.phone ? `Phone: ${selectedDeliveryVendor.phone}` : ''}
                                      {selectedDeliveryVendor.phone && selectedDeliveryVendor.website ? ' • ' : ''}
                                      {selectedDeliveryVendor.website ? `Website: ${selectedDeliveryVendor.website}` : ''}
                                    </p>
                                  )}
                                  {selectedDeliveryVendor.address && (
                                    <p className={`text-xs ${text.muted} mt-1`}>{selectedDeliveryVendor.address}</p>
                                  )}
                                </div>
                              )}

                              <div>
                                <label className={`text-xs ${text.muted}`}>Search Radius (miles)</label>
                                <input
                                  type="number"
                                  min="5"
                                  max="200"
                                  value={deliveryRadiusMiles}
                                  onChange={(event) => setDeliveryRadiusMiles(Number(event.target.value))}
                                  className={formInputClass}
                                />
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Contact Name</label>
                                  <input
                                    type="text"
                                    value={deliveryForm.contactName}
                                    onChange={(event) => setDeliveryForm((prev) => ({ ...prev, contactName: event.target.value }))}
                                    className={formInputClass}
                                    placeholder="Primary contact"
                                  />
                                </div>
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Contact Email</label>
                                  <input
                                    type="email"
                                    value={deliveryForm.contactEmail}
                                    onChange={(event) => setDeliveryForm((prev) => ({ ...prev, contactEmail: event.target.value }))}
                                    className={formInputClass}
                                    placeholder="name@example.com"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className={`text-xs ${text.muted}`}>Contact Phone</label>
                                <input
                                  type="tel"
                                  value={deliveryForm.contactPhone}
                                  onChange={(event) => setDeliveryForm((prev) => ({ ...prev, contactPhone: event.target.value }))}
                                  className={formInputClass}
                                  placeholder="(555) 123-4567"
                                />
                              </div>

                              {hvacVendorsLoading && (
                                <p className={`text-xs ${text.muted}`}>Loading nearby HVAC vendors...</p>
                              )}
                              {hvacVendorsError && (
                                <p className="text-xs text-red-400">{hvacVendorsError}</p>
                              )}
                              {!hvacVendorsLoading && !hvacVendorsError && deliveryForm.propertyId && hvacVendors.length === 0 && (
                                <p className={`text-xs ${text.muted}`}>No HVAC vendors found within {deliveryRadiusMiles} miles.</p>
                              )}

                              <button
                                type="submit"
                                className={`w-full py-2 ${isDark ? 'bg-emerald-500/30 hover:bg-emerald-500/40 text-emerald-100' : 'bg-emerald-200 hover:bg-emerald-300 text-emerald-800'} rounded-lg text-sm font-semibold transition-colors`}
                              >
                                Send Delivery Request
                              </button>
                            </form>
                          )}

                          {selectedHVACOption === 'status' && (
                            <form onSubmit={handleHVACStatusSubmit} className="space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Property</label>
                                  <select
                                    value={statusForm.propertyId}
                                    onChange={(event) => {
                                      const propertyId = event.target.value;
                                      setStatusForm((prev) => ({
                                        ...prev,
                                        propertyId,
                                        unitId: '',
                                      }));
                                    }}
                                    className={formInputClass}
                                  >
                                    <option value="">Select property</option>
                                    {hvacProperties.map((property) => (
                                      <option key={property.id} value={property.id}>
                                        {property.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Unit</label>
                                  <select
                                    value={statusForm.unitId}
                                    onChange={(event) => setStatusForm((prev) => ({ ...prev, unitId: event.target.value }))}
                                    className={formInputClass}
                                    disabled={!statusForm.propertyId}
                                  >
                                    <option value="">Select unit</option>
                                    {(getPropertyById(statusForm.propertyId)?.units || []).map((unit) => (
                                      <option key={unit.id} value={unit.id}>
                                        {unit.unit_number ? `Unit ${unit.unit_number}` : `Unit ${unit.id.slice(0, 6)}`}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Condition</label>
                                  <select
                                    value={statusForm.condition}
                                    onChange={(event) => setStatusForm((prev) => ({ ...prev, condition: event.target.value }))}
                                    className={formInputClass}
                                  >
                                    <option value="good">Good</option>
                                    <option value="monitor">Monitor</option>
                                    <option value="service">Needs Service</option>
                                    <option value="replace">Replace</option>
                                  </select>
                                </div>
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Last Serviced</label>
                                  <input
                                    type="date"
                                    value={statusForm.lastServiced}
                                    onChange={(event) => setStatusForm((prev) => ({ ...prev, lastServiced: event.target.value }))}
                                    className={formInputClass}
                                  />
                                </div>
                              </div>

                              <div>
                                <label className={`text-xs ${text.muted}`}>Notes</label>
                                <textarea
                                  value={statusForm.notes}
                                  onChange={(event) => setStatusForm((prev) => ({ ...prev, notes: event.target.value }))}
                                  className={formInputClass}
                                  rows={2}
                                  placeholder="Add inspection notes"
                                />
                              </div>

                              <div className={`p-3 rounded-lg border ${border.default} ${isDark ? 'bg-white/5' : 'bg-white'}`}>
                                <p className={`text-xs font-semibold ${text.muted} mb-2`}>Property HVAC Status Overview</p>
                                {hvacPropertyStatusLoading && (
                                  <p className={`text-xs ${text.muted}`}>Loading property HVAC status...</p>
                                )}
                                {hvacPropertyStatusError && (
                                  <p className="text-xs text-red-400">{hvacPropertyStatusError}</p>
                                )}
                                {!hvacPropertyStatusLoading && !hvacPropertyStatusError && hvacPropertyStatus.length === 0 && (
                                  <p className={`text-xs ${text.muted}`}>No HVAC status recorded for this property yet.</p>
                                )}
                                {!hvacPropertyStatusLoading && !hvacPropertyStatusError && hvacPropertyStatus.length > 0 && (
                                  <div className="space-y-2">
                                    {hvacPropertyStatus.map((entry) => (
                                      <div key={entry.unitId} className="text-xs flex items-center justify-between gap-2">
                                        <span className="font-semibold">
                                          {entry.unitNumber ? `Unit ${entry.unitNumber}` : entry.unitId.slice(0, 6)}
                                        </span>
                                        <span className={text.muted}>
                                          {entry.condition ? entry.condition.toUpperCase() : 'NO STATUS'}
                                        </span>
                                        <span className={text.muted}>
                                          {entry.lastUpdatedAt ? formatDisplayDate(entry.lastUpdatedAt, 'MMM d, yyyy') : 'N/A'}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className={`p-3 rounded-lg border ${border.default} ${isDark ? 'bg-white/5' : 'bg-white'}`}>
                                <p className={`text-xs font-semibold ${text.muted} mb-2`}>Recent HVAC Status (Selected Unit)</p>
                                {hvacStatusLoading && (
                                  <p className={`text-xs ${text.muted}`}>Loading status history...</p>
                                )}
                                {hvacStatusError && (
                                  <p className="text-xs text-red-400">{hvacStatusError}</p>
                                )}
                                {!hvacStatusLoading && !hvacStatusError && hvacStatusHistory.length === 0 && (
                                  <p className={`text-xs ${text.muted}`}>No status checks recorded yet.</p>
                                )}
                                {!hvacStatusLoading && !hvacStatusError && hvacStatusHistory.length > 0 && (
                                  <div className="space-y-2">
                                    {hvacStatusHistory.map((entry) => (
                                      <div key={entry.id} className="text-xs">
                                        <div className="flex items-center justify-between">
                                          <span className="font-semibold">{entry.condition.toUpperCase()}</span>
                                          <span className={text.muted}>{formatDisplayDate(entry.createdAt, 'MMM d, yyyy')}</span>
                                        </div>
                                        <div className={text.muted}>
                                          {entry.lastServicedDate ? `Last serviced: ${formatDisplayDate(entry.lastServicedDate, 'MMM d, yyyy')}` : 'Last serviced: N/A'}
                                        </div>
                                        {entry.notes && (
                                          <div className={text.muted}>{entry.notes}</div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <button
                                type="submit"
                                className={`w-full py-2 ${isDark ? 'bg-emerald-500/30 hover:bg-emerald-500/40 text-emerald-100' : 'bg-emerald-200 hover:bg-emerald-300 text-emerald-800'} rounded-lg text-sm font-semibold transition-colors`}
                              >
                                Save HVAC Status
                              </button>
                            </form>
                          )}

                          {selectedHVACOption === 'filter_delivery' && (
                            <form onSubmit={handleHVACFilterDeliverySubmit} className="space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Property (HVAC installed)</label>
                                  <select
                                    value={filterDeliveryForm.propertyId}
                                    onChange={(event) => {
                                      const propertyId = event.target.value;
                                      setFilterDeliveryForm((prev) => ({
                                        ...prev,
                                        propertyId,
                                        vendorId: '',
                                      }));
                                    }}
                                    className={formInputClass}
                                  >
                                    <option value="">Select property</option>
                                    {hvacProperties
                                      .filter((property) => (property.units || []).some((unit) => unit.hvac_filter_size))
                                      .map((property) => (
                                        <option key={property.id} value={property.id}>
                                          {property.name}
                                        </option>
                                      ))}
                                  </select>
                                </div>
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Start Date</label>
                                  <input
                                    type="date"
                                    value={filterDeliveryForm.startDate}
                                    onChange={(event) => setFilterDeliveryForm((prev) => ({ ...prev, startDate: event.target.value }))}
                                    className={formInputClass}
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Filter Type</label>
                                  <select
                                    value={filterDeliveryForm.filterType}
                                    onChange={(event) => setFilterDeliveryForm((prev) => ({ ...prev, filterType: event.target.value }))}
                                    className={formInputClass}
                                  >
                                    <option value="standard">Standard</option>
                                    <option value="pleated">Pleated</option>
                                    <option value="hepa">HEPA</option>
                                    <option value="allergen">Allergen</option>
                                  </select>
                                </div>
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Quantity per Unit</label>
                                  <input
                                    type="number"
                                    min="1"
                                    value={filterDeliveryForm.quantity}
                                    onChange={(event) => setFilterDeliveryForm((prev) => ({ ...prev, quantity: event.target.value }))}
                                    className={formInputClass}
                                  />
                                </div>
                                <div>
                                  <label className={`text-xs ${text.muted}`}>HVAC Vendor (within {filterRadiusMiles} miles)</label>
                                  <select
                                    value={filterDeliveryForm.vendorId}
                                    onChange={(event) => setFilterDeliveryForm((prev) => ({ ...prev, vendorId: event.target.value }))}
                                    className={formInputClass}
                                    disabled={!filterDeliveryForm.propertyId || hvacVendorsLoading}
                                  >
                                    <option value="">Select vendor</option>
                                    {hvacVendors.map((vendor) => (
                                      <option key={vendor.id} value={vendor.id}>
                                        {vendor.businessName}{vendor.source === 'nominatim' ? ' (OSM)' : ''}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              {selectedFilterVendor && !selectedFilterVendor.email && (
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Vendor Email (required for email)</label>
                                  <input
                                    type="email"
                                    value={filterDeliveryForm.vendorEmailOverride}
                                    onChange={(event) => setFilterDeliveryForm((prev) => ({ ...prev, vendorEmailOverride: event.target.value }))}
                                    className={formInputClass}
                                    placeholder="vendor@example.com"
                                  />
                                  {(selectedFilterVendor.phone || selectedFilterVendor.website) && (
                                    <p className={`text-xs ${text.muted} mt-1`}>
                                      {selectedFilterVendor.phone ? `Phone: ${selectedFilterVendor.phone}` : ''}
                                      {selectedFilterVendor.phone && selectedFilterVendor.website ? ' • ' : ''}
                                      {selectedFilterVendor.website ? `Website: ${selectedFilterVendor.website}` : ''}
                                    </p>
                                  )}
                                  {selectedFilterVendor.address && (
                                    <p className={`text-xs ${text.muted} mt-1`}>{selectedFilterVendor.address}</p>
                                  )}
                                </div>
                              )}

                              <div>
                                <label className={`text-xs ${text.muted}`}>Search Radius (miles)</label>
                                <input
                                  type="number"
                                  min="5"
                                  max="200"
                                  value={filterRadiusMiles}
                                  onChange={(event) => setFilterRadiusMiles(Number(event.target.value))}
                                  className={formInputClass}
                                />
                              </div>

                              <div>
                                <label className={`text-xs ${text.muted}`}>Notes</label>
                                <textarea
                                  value={filterDeliveryForm.notes}
                                  onChange={(event) => setFilterDeliveryForm((prev) => ({ ...prev, notes: event.target.value }))}
                                  className={formInputClass}
                                  rows={2}
                                  placeholder="Any special delivery or billing notes"
                                />
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Contact Name</label>
                                  <input
                                    type="text"
                                    value={filterDeliveryForm.contactName}
                                    onChange={(event) => setFilterDeliveryForm((prev) => ({ ...prev, contactName: event.target.value }))}
                                    className={formInputClass}
                                    placeholder="Primary contact"
                                  />
                                </div>
                                <div>
                                  <label className={`text-xs ${text.muted}`}>Contact Email</label>
                                  <input
                                    type="email"
                                    value={filterDeliveryForm.contactEmail}
                                    onChange={(event) => setFilterDeliveryForm((prev) => ({ ...prev, contactEmail: event.target.value }))}
                                    className={formInputClass}
                                    placeholder="name@example.com"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className={`text-xs ${text.muted}`}>Contact Phone</label>
                                <input
                                  type="tel"
                                  value={filterDeliveryForm.contactPhone}
                                  onChange={(event) => setFilterDeliveryForm((prev) => ({ ...prev, contactPhone: event.target.value }))}
                                  className={formInputClass}
                                  placeholder="(555) 123-4567"
                                />
                              </div>

                              {hvacVendorsLoading && (
                                <p className={`text-xs ${text.muted}`}>Loading nearby HVAC vendors...</p>
                              )}
                              {hvacVendorsError && (
                                <p className="text-xs text-red-400">{hvacVendorsError}</p>
                              )}
                              {!hvacVendorsLoading && !hvacVendorsError && filterDeliveryForm.propertyId && hvacVendors.length === 0 && (
                                <p className={`text-xs ${text.muted}`}>No HVAC vendors found within {filterRadiusMiles} miles.</p>
                              )}

                              <p className={`text-xs ${text.muted}`}>
                                This setup must be renewed annually to keep the monthly deliveries active.
                              </p>

                              <button
                                type="submit"
                                className={`w-full py-2 ${isDark ? 'bg-emerald-500/30 hover:bg-emerald-500/40 text-emerald-100' : 'bg-emerald-200 hover:bg-emerald-300 text-emerald-800'} rounded-lg text-sm font-semibold transition-colors`}
                              >
                                Set Up Monthly Filter Delivery
                              </button>
                            </form>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </FeatureGate>

          {/* Emergency Support - Gated by Premium (emergency_support_24_7) */}
          <FeatureGate
            feature="emergency_support_24_7"
            hasAccess={emergencySupport.hasAccess}
            loading={emergencySupport.loading}
            fallback={
              <LockedFeatureCard
                name="24/7 Emergency Support"
                description="Round-the-clock emergency response for urgent maintenance"
                icon={<Bell className="w-6 h-6" />}
                feature="emergency_support_24_7"
              />
            }
          >
            <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-gradient-to-br from-[#ef4444] to-[#dc2626] rounded-lg">
                  <Bell className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  24/7 EMERGENCY
                </h3>
              </div>

              <div className={`p-4 ${isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'} border border-emerald-500/20 rounded-lg mb-4`}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                  <p className="font-medium text-emerald-400">System Active</p>
                </div>
                <p className={`text-sm ${text.muted}`}>Round-the-clock emergency response team standing by</p>
              </div>

              <div className="space-y-3">
                {metrics && metrics.recent_emergency_count > 0 && (
                  <div className={`p-4 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                    <p className={`text-sm ${text.muted} mb-1`}>Recent Emergency Requests</p>
                    <p className="text-2xl font-bold text-[#ff6b35]" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                      {metrics.recent_emergency_count}
                    </p>
                    <p className={`text-xs ${text.inactive}`}>Last 24 hours</p>
                  </div>
                )}

                <button
                  onClick={handleEmergencyClick}
                  className={`w-full py-3 ${isDark ? 'bg-red-500/20 hover:bg-red-500/30' : 'bg-red-50 hover:bg-red-100'} border border-red-500/30 text-red-400 rounded-lg font-medium transition-colors flex items-center justify-center gap-2`}
                >
                  <AlertTriangle className="w-4 h-4" />
                  Create Emergency Request
                </button>
              </div>

              {maintenanceRouting.hasAccess && routingMetrics && (
                <div className="space-y-3">
                  <p className={`text-sm ${text.muted} font-medium`}>Smart Routing Metrics</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                      <p className={`text-xs ${text.inactive} mb-1`}>Assignment Rate</p>
                      <p className="text-lg font-bold text-emerald-400">{routingMetrics.assignment_rate}%</p>
                    </div>
                    <div className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg`}>
                      <p className={`text-xs ${text.inactive} mb-1`}>Avg Response</p>
                      <p className="text-lg font-bold text-emerald-400">{routingMetrics.avg_acceptance_time_hours}h</p>
                    </div>
                    <div className={`p-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg col-span-2`}>
                      <p className={`text-xs ${text.inactive} mb-1`}>Routing Efficiency</p>
                      <p className="text-lg font-bold text-emerald-400">{routingMetrics.vendor_utilization_rate}%</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </FeatureGate>
        </div>
      </div>

      {/* Create Maintenance Request Modal */}
      <CreateMaintenanceRequestModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          refetchRequests();
          refetchMetrics();
        }}
      />

      {/* Create Emergency Request Modal */}
      <CreateMaintenanceRequestModal
        isOpen={isEmergencyModalOpen}
        onClose={() => setIsEmergencyModalOpen(false)}
        onSuccess={() => {
          refetchRequests();
          refetchMetrics();
        }}
        emergencyMode
      />

      {/* Create Vendor Modal */}
      <CreateVendorModal
        isOpen={isVendorModalOpen}
        onClose={() => setIsVendorModalOpen(false)}
        onSuccess={() => {
          // Optionally refresh vendor list or show success message
          console.log('Vendor created successfully');
        }}
      />
    </div>
  );
}
