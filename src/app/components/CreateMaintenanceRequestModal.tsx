import { X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useCreateMaintenanceRequest } from '../../lib/hooks/useMaintenance';
import { supabase } from '../../lib/supabaseClient';
import { createEmergencyRequest, getEmergencySupportConfig } from '../../lib/api/maintenanceMetrics';
import { getCurrentAccountId } from '../../lib/api/client';

interface CreateMaintenanceRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  emergencyMode?: boolean;
}

interface PropertyUnit {
  id: string;
  property_id: string;
  property_name: string;
  unit_number: string;
  address: string;
}

const MAINTENANCE_CATEGORIES = [
  'hvac',
  'plumbing',
  'electrical',
  'appliance',
  'general',
  'remodel',
  'landscaping',
  'pest',
  'painting',
  'roofing',
  'flooring',
  'security',
] as const;

const PRIORITIES = [
  { value: 'low', label: 'Low', description: 'Can wait, no immediate impact' },
  { value: 'normal', label: 'Normal', description: 'Standard maintenance request' },
  { value: 'high', label: 'High', description: 'Needs attention soon' },
  { value: 'emergency', label: 'Emergency', description: 'Urgent, requires immediate action' },
] as const;

type EmergencyChannel = 'pagerduty' | 'opsgenie' | 'twilio' | 'slack' | 'email' | 'webhook';

const EMERGENCY_CHANNELS: Array<{ value: EmergencyChannel; label: string; helper: string }> = [
  { value: 'pagerduty', label: 'PagerDuty', helper: 'Triggers an on-call incident' },
  { value: 'opsgenie', label: 'Opsgenie', helper: 'Creates a P1 alert' },
  { value: 'twilio', label: 'SMS (Twilio)', helper: 'Sends SMS to on-call number' },
  { value: 'slack', label: 'Slack', helper: 'Posts to emergency channel' },
  { value: 'email', label: 'Email', helper: 'Sends to emergency email' },
  { value: 'webhook', label: 'Webhook', helper: 'Calls custom emergency endpoint' },
];

const DEFAULT_EMERGENCY_CHANNELS: EmergencyChannel[] = EMERGENCY_CHANNELS.map((channel) => channel.value);

export function CreateMaintenanceRequestModal({
  isOpen,
  onClose,
  onSuccess,
  emergencyMode = false,
}: CreateMaintenanceRequestModalProps) {
  const { isDark, text, border } = useThemeStyles();
  const { create, loading } = useCreateMaintenanceRequest();
  const [emergencyLoading, setEmergencyLoading] = useState(false);

  const getDefaultFormData = (isEmergency: boolean) => ({
    unit_id: '',
    property_id: '',
    title: '',
    description: '',
    category: 'general' as typeof MAINTENANCE_CATEGORIES[number],
    priority: (isEmergency ? 'emergency' : 'normal') as 'low' | 'normal' | 'high' | 'emergency',
  });

  const [formData, setFormData] = useState(getDefaultFormData(emergencyMode));

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [availableUnits, setAvailableUnits] = useState<PropertyUnit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(true);
  const [emergencyChannels, setEmergencyChannels] = useState<EmergencyChannel[]>(DEFAULT_EMERGENCY_CHANNELS);

  // Fetch available properties and units
  useEffect(() => {
    const fetchUnits = async () => {
      try {
        setLoadingUnits(true);

        const accountId = await getCurrentAccountId();
        if (!accountId) return;

        // Fetch all units with their properties
        const { data: units, error } = await supabase
          .from('units')
          .select(`
            id,
            unit_number,
            property_id,
            properties!inner (
              id,
              name,
              address1,
              city,
              state,
              zip,
              account_id
            )
          `)
          .eq('properties.account_id', accountId)
          .order('unit_number', { ascending: true });

        if (error) {
          console.error('Error fetching units:', error);
          return;
        }

        const formattedUnits: PropertyUnit[] = (units || []).map((unit: any) => ({
          id: unit.id,
          property_id: unit.property_id,
          property_name: unit.properties.name,
          unit_number: unit.unit_number,
          address: `${unit.properties.address1}, ${unit.properties.city}, ${unit.properties.state}`,
        }));

        setAvailableUnits(formattedUnits);
      } catch (error) {
        console.error('Error fetching units:', error);
      } finally {
        setLoadingUnits(false);
      }
    };

    if (isOpen) {
      fetchUnits();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setFormData(getDefaultFormData(emergencyMode));
      setErrors({});
      setEmergencyChannels(DEFAULT_EMERGENCY_CHANNELS);
    }
  }, [isOpen, emergencyMode]);

  useEffect(() => {
    if (!isOpen || !emergencyMode) return;

    const loadConfig = async () => {
      try {
        const config = await getEmergencySupportConfig();
        if (Array.isArray(config.notificationChannels) && config.notificationChannels.length > 0) {
          setEmergencyChannels(config.notificationChannels as EmergencyChannel[]);
        }
      } catch (error) {
        console.error('Failed to load emergency config:', error);
      }
    };

    loadConfig();
  }, [isOpen, emergencyMode]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.unit_id) newErrors.unit_id = 'Please select a unit';
    if (!formData.title.trim()) newErrors.title = 'Title is required';
    if (!formData.description.trim()) newErrors.description = 'Description is required';
    if (!formData.category) newErrors.category = 'Category is required';
    if (!formData.priority) newErrors.priority = 'Priority is required';
    if (emergencyMode && emergencyChannels.length === 0) {
      newErrors.notificationChannels = 'Select at least one notification channel';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const result = emergencyMode
      ? await (async () => {
          try {
            setEmergencyLoading(true);
            const response = await createEmergencyRequest({
              title: formData.title,
              description: formData.description,
              category: formData.category,
              unitId: formData.unit_id,
              notificationChannels: emergencyChannels,
            });
            return { success: true, response };
          } catch (error) {
            return { success: false, error };
          } finally {
            setEmergencyLoading(false);
          }
        })()
      : await create(formData);

    if (result.success) {
      // Reset form
      setFormData(getDefaultFormData(emergencyMode));
      setErrors({});

      // Call success callback
      if (onSuccess) {
        onSuccess();
      }

      // Close modal
      onClose();

      // Show success message
      if (emergencyMode && result.response?.notifications) {
        const failed = result.response.notifications.filter((notification: any) => !notification.sent);
        if (failed.length > 0) {
          const failedList = failed.map((notification: any) => notification.channel).join(', ');
          alert(`Emergency request created. Notifications failed for: ${failedList}`);
        } else {
          alert('Emergency request created and notifications sent!');
        }
      } else {
        alert(emergencyMode ? 'Emergency request created successfully!' : 'Maintenance request created successfully!');
      }
    } else {
      alert(emergencyMode ? 'Failed to create emergency request. Please try again.' : 'Failed to create maintenance request. Please try again.');
    }
  };

  const handleClose = () => {
    // Reset form when closing
    setFormData(getDefaultFormData(emergencyMode));
    setErrors({});
    onClose();
  };

  const handleUnitChange = (unitId: string) => {
    const selectedUnit = availableUnits.find(u => u.id === unitId);
    setFormData({
      ...formData,
      unit_id: unitId,
      property_id: selectedUnit?.property_id || '',
    });
  };

  const toggleEmergencyChannel = (channel: EmergencyChannel) => {
    setEmergencyChannels((prev) =>
      prev.includes(channel)
        ? prev.filter((item) => item !== channel)
        : [...prev, channel]
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-2xl ${
          isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white'
        } border ${border.default} rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            {emergencyMode ? 'CREATE EMERGENCY REQUEST' : 'CREATE MAINTENANCE REQUEST'}
          </h2>
          <button
            onClick={handleClose}
            className={`p-2 ${
              isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'
            } rounded-lg transition-colors`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Unit Selection */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${text.primary}`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              Property / Unit *
            </label>
            {loadingUnits ? (
              <div className={`w-full px-4 py-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} border ${border.default} rounded-lg`}>
                <p className={`text-sm ${text.muted}`}>Loading units...</p>
              </div>
            ) : (
              <select
                value={formData.unit_id}
                onChange={(e) => handleUnitChange(e.target.value)}
                className={`w-full px-4 py-3 ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
                } border rounded-lg ${text.primary} focus:outline-none focus:border-[#ff6b35] transition-colors`}
                style={{ fontFamily: 'Work Sans, sans-serif' }}
              >
                <option value="">Select a unit...</option>
                {availableUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.property_name} - Unit {unit.unit_number} ({unit.address})
                  </option>
                ))}
              </select>
            )}
            {errors.unit_id && (
              <p className="text-red-400 text-sm mt-1">{errors.unit_id}</p>
            )}
          </div>

          {/* Title */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${text.primary}`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className={`w-full px-4 py-3 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
              } border rounded-lg ${text.primary} focus:outline-none focus:border-[#ff6b35] transition-colors`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
              placeholder="e.g., Leaking faucet in kitchen"
            />
            {errors.title && (
              <p className="text-red-400 text-sm mt-1">{errors.title}</p>
            )}
          </div>

          {/* Category */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${text.primary}`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              Category *
            </label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value as typeof MAINTENANCE_CATEGORIES[number] })}
              className={`w-full px-4 py-3 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
              } border rounded-lg ${text.primary} focus:outline-none focus:border-[#ff6b35] transition-colors`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              {MAINTENANCE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </option>
              ))}
            </select>
            {errors.category && (
              <p className="text-red-400 text-sm mt-1">{errors.category}</p>
            )}
          </div>

          {/* Priority */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${text.primary}`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              Priority *
            </label>
            {emergencyMode ? (
              <div className="px-4 py-3 rounded-lg border bg-gradient-to-r from-[#ff6b35] to-[#f7931e] border-[#ff6b35] text-white font-semibold">
                Emergency - Urgent, requires immediate action
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {PRIORITIES.map((priority) => (
                  <button
                    key={priority.value}
                    type="button"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        priority: priority.value as 'low' | 'normal' | 'high' | 'emergency',
                      })
                    }
                    className={`px-4 py-3 rounded-lg border transition-all text-left ${
                      formData.priority === priority.value
                        ? 'bg-gradient-to-r from-[#ff6b35] to-[#f7931e] border-[#ff6b35] text-white font-semibold'
                        : isDark
                        ? 'bg-white/5 border-white/10 hover:bg-white/10'
                        : 'bg-gray-50 border-gray-300 hover:bg-gray-100'
                    }`}
                    style={{ fontFamily: 'Work Sans, sans-serif' }}
                  >
                    <div className="font-semibold mb-1">{priority.label}</div>
                    <div className={`text-xs ${formData.priority === priority.value ? 'text-white/80' : text.muted}`}>
                      {priority.description}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {errors.priority && (
              <p className="text-red-400 text-sm mt-1">{errors.priority}</p>
            )}
          </div>

          {emergencyMode && (
            <div>
              <label
                className={`block text-sm font-medium mb-2 ${text.primary}`}
                style={{ fontFamily: 'Work Sans, sans-serif' }}
              >
                Notify via *
              </label>
              <div className="grid grid-cols-2 gap-3">
                {EMERGENCY_CHANNELS.map((channel) => (
                  <button
                    key={channel.value}
                    type="button"
                    onClick={() => toggleEmergencyChannel(channel.value)}
                    className={`px-4 py-3 rounded-lg border transition-all text-left ${
                      emergencyChannels.includes(channel.value)
                        ? 'bg-gradient-to-r from-[#ff6b35] to-[#f7931e] border-[#ff6b35] text-white font-semibold'
                        : isDark
                        ? 'bg-white/5 border-white/10 hover:bg-white/10'
                        : 'bg-gray-50 border-gray-300 hover:bg-gray-100'
                    }`}
                    style={{ fontFamily: 'Work Sans, sans-serif' }}
                  >
                    <div className="font-semibold mb-1">{channel.label}</div>
                    <div className={`text-xs ${emergencyChannels.includes(channel.value) ? 'text-white/80' : text.muted}`}>
                      {channel.helper}
                    </div>
                  </button>
                ))}
              </div>
              {errors.notificationChannels && (
                <p className="text-red-400 text-sm mt-1">{errors.notificationChannels}</p>
              )}
              <p className={`text-xs mt-2 ${text.muted}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                Unconfigured channels will be skipped and reported.
              </p>
            </div>
          )}

          {/* Description */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${text.primary}`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              Description *
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className={`w-full px-4 py-3 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
              } border rounded-lg ${text.primary} focus:outline-none focus:border-[#ff6b35] transition-colors resize-none`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
              placeholder="Please provide details about the issue..."
            />
            {errors.description && (
              <p className="text-red-400 text-sm mt-1">{errors.description}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={handleClose}
              className={`px-6 py-3 ${
                isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'
              } rounded-lg font-medium transition-colors`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={emergencyMode ? emergencyLoading : loading}
              className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              {(emergencyMode ? emergencyLoading : loading) ? 'Creating...' : (emergencyMode ? 'Create Emergency Request' : 'Create Request')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
