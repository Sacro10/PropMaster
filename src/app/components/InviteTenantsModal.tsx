import { useEffect, useMemo, useState } from 'react';
import { X, Mail, UserPlus } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { supabase } from '../../lib/supabaseClient';
import { getCurrentAccountId } from '../../lib/api/client';
import { createTenantInvite } from '../../lib/api/tenantInvites';

interface InviteTenantsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface PropertyOption {
  id: string;
  name: string;
  units: Array<{ id: string; unit_number: string }>;
}

export function InviteTenantsModal({ isOpen, onClose, onSuccess }: InviteTenantsModalProps) {
  const { isDark, text, border } = useThemeStyles();
  const [loading, setLoading] = useState(false);
  const [loadingProperties, setLoadingProperties] = useState(false);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [formData, setFormData] = useState({
    propertyId: '',
    unitId: '',
    fullName: '',
    email: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState<boolean | null>(null);

  useEffect(() => {
    const fetchProperties = async () => {
      try {
        setLoadingProperties(true);
        const accountId = await getCurrentAccountId();
        if (!accountId) return;

        const { data, error: propertiesError } = await supabase
          .from('properties')
          .select('id, name, units(id, unit_number)')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false });

        if (propertiesError) throw propertiesError;

        const formatted = (data || []).map((property: any) => ({
          id: property.id,
          name: property.name,
          units: property.units || [],
        }));

        setProperties(formatted);
      } catch (fetchError) {
        console.error('Failed to load properties for invite:', fetchError);
        setError('Unable to load properties. Please try again.');
      } finally {
        setLoadingProperties(false);
      }
    };

    if (isOpen) {
      fetchProperties();
      setInviteLink(null);
      setEmailSent(null);
      setError(null);
    }
  }, [isOpen]);

  const selectedProperty = useMemo(
    () => properties.find((property) => property.id === formData.propertyId),
    [properties, formData.propertyId]
  );

  const availableUnits = selectedProperty?.units || [];

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'propertyId' ? { unitId: '' } : null),
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setError(null);

    if (!formData.propertyId || !formData.unitId || !formData.fullName.trim() || !formData.email.trim()) {
      setError('Please complete all required fields.');
      return;
    }

    try {
      setLoading(true);
      const response = await createTenantInvite({
        unitId: formData.unitId,
        email: formData.email.trim(),
        fullName: formData.fullName.trim(),
      });

      setInviteLink(response.inviteLink);
      setEmailSent(response.emailSent);
      if (!response.emailSent && response.emailError) {
        setError(`Invite created, but email failed: ${response.emailError}`);
      }
      setFormData((prev) => ({ ...prev, fullName: '', email: '' }));
      onSuccess?.();
    } catch (submitError) {
      console.error('Failed to send tenant invite:', submitError);
      const message = submitError instanceof Error ? submitError.message : 'Failed to send invite. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteLink) return;

    try {
      await navigator.clipboard.writeText(inviteLink);
    } catch (copyError) {
      console.error('Failed to copy invite link:', copyError);
      setError('Unable to copy invite link. Please copy it manually.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div
        className={`relative w-full max-w-xl ${
          isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white'
        } rounded-xl shadow-2xl overflow-hidden`}
      >
        <div className={`flex items-center justify-between p-6 border-b ${border.default}`}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-[#ff6b35] to-[#f7931e] rounded-lg">
              <UserPlus className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              INVITE TENANT
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`p-2 ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'} rounded-lg transition-colors`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error ? (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${text.primary}`}>Property</label>
              <select
                name="propertyId"
                value={formData.propertyId}
                onChange={handleChange}
                className={`w-full px-4 py-3 rounded-lg border ${border.default} ${
                  isDark ? 'bg-white/5 text-white' : 'bg-gray-50 text-gray-900'
                }`}
                required
                disabled={loadingProperties}
              >
                <option value="">Select property</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${text.primary}`}>Unit</label>
              <select
                name="unitId"
                value={formData.unitId}
                onChange={handleChange}
                className={`w-full px-4 py-3 rounded-lg border ${border.default} ${
                  isDark ? 'bg-white/5 text-white' : 'bg-gray-50 text-gray-900'
                }`}
                required
                disabled={!formData.propertyId}
              >
                <option value="">Select unit</option>
                {availableUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.unit_number}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${text.primary}`}>Tenant name</label>
              <input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                className={`w-full px-4 py-3 rounded-lg border ${border.default} ${
                  isDark ? 'bg-white/5 text-white' : 'bg-gray-50 text-gray-900'
                }`}
                placeholder="Alex Johnson"
                required
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${text.primary}`}>Tenant email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#ff6b35] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className={`w-full pl-10 pr-4 py-3 rounded-lg border ${border.default} ${
                    isDark ? 'bg-white/5 text-white' : 'bg-gray-50 text-gray-900'
                  }`}
                  placeholder="tenant@email.com"
                  required
                />
              </div>
            </div>
          </div>

          {inviteLink ? (
            <div className={`rounded-lg border ${border.default} ${isDark ? 'bg-white/5' : 'bg-gray-50'} p-4 space-y-3`}>
              <div>
                <p className="text-sm font-semibold" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  Invite ready to share
                </p>
                <p className={`text-xs ${text.muted}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  {emailSent ? 'Email sent to the tenant.' : 'Send this link to the tenant to complete onboarding.'}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  readOnly
                  value={inviteLink}
                  className={`flex-1 px-3 py-2 rounded-lg border ${border.default} ${
                    isDark ? 'bg-white/5 text-white' : 'bg-white text-gray-900'
                  } text-xs`}
                />
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#ff6b35] to-[#f7931e] text-sm font-medium"
                >
                  Copy Link
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 rounded-lg bg-gradient-to-r from-[#ff6b35] to-[#f7931e] font-semibold tracking-wide disabled:opacity-70"
            >
              {loading ? 'Sending...' : 'Send Invite'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 py-3 rounded-lg border ${border.default} ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
            >
              Close
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
