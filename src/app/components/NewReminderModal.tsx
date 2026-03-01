import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useCreateReminder, useUpdateReminder } from '../../lib/hooks/useCommunications';
import type { AutomatedReminder } from '../../lib/api/communicationsClient';
import type { TenantWithLease } from '../../lib/api/types';

interface NewReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  reminder?: AutomatedReminder | null;
  tenants: TenantWithLease[];
  templates: Array<{
    id: string;
    name: string;
    category: string;
    subject: string | null;
    body: string;
  }>;
}

type ReminderFormShape = {
  name: string;
  reminderType: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'custom';
  customSchedule: string;
  templateId: string;
  messageSubject: string;
  messageBody: string;
  recipientScope: 'all' | 'selected';
  recipientIds: string[];
};

export function NewReminderModal({
  isOpen,
  onClose,
  onSuccess,
  reminder,
  tenants,
  templates,
}: NewReminderModalProps) {
  const { isDark, text, border } = useThemeStyles();
  const { create, loading } = useCreateReminder();
  const { update, loading: updating } = useUpdateReminder();
  const isEditing = Boolean(reminder?.id);
  const templateOptions = templates.length > 0
    ? templates
    : [
      {
        id: 'fallback-rent-reminder',
        name: 'Rent Reminder',
        category: 'payment',
        subject: 'Rent Payment Reminder',
        body: 'This is a friendly reminder that your rent payment is due soon.',
      },
      {
        id: 'fallback-lease-renewal',
        name: 'Lease Renewal',
        category: 'lease',
        subject: 'Lease Renewal Notice',
        body: 'Your lease is coming up for renewal. Please contact us to discuss options.',
      },
      {
        id: 'fallback-maintenance-update',
        name: 'Maintenance Update',
        category: 'maintenance',
        subject: 'Maintenance Request Update',
        body: 'Your maintenance request has been updated. We will notify you with next steps.',
      },
      {
        id: 'fallback-welcome',
        name: 'Welcome Message',
        category: 'onboarding',
        subject: 'Welcome to Your New Home',
        body: 'Welcome! We are excited to have you as a tenant.',
      },
    ];

  const buildFormData = (source?: AutomatedReminder | null): ReminderFormShape => {
    const recipientFilter = (source as any)?.recipientFilter || (source as any)?.recipient_filter || {};
    const tenantIds = Array.isArray(recipientFilter.tenantIds) ? recipientFilter.tenantIds : [];

    return {
      name: source?.name || '',
      reminderType: source?.reminderType || (source as any)?.reminder_type || 'payment',
      frequency: source?.frequency || 'monthly',
      customSchedule: source?.customSchedule || (source as any)?.custom_schedule || '',
      templateId: source?.templateId || (source as any)?.template_id || '',
      messageSubject: source?.messageSubject || (source as any)?.message_subject || '',
      messageBody: source?.messageBody || (source as any)?.message_body || '',
      recipientScope: tenantIds.length > 0 ? 'selected' : 'all',
      recipientIds: tenantIds,
    };
  };

  const [formData, setFormData] = useState<ReminderFormShape>(() => buildFormData(reminder));
  const [tenantSearch, setTenantSearch] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});

  const reminderTypes = [
    { value: 'payment', label: 'Rent Payment Reminder' },
    { value: 'lease_renewal', label: 'Lease Renewal' },
    { value: 'maintenance', label: 'Maintenance Update' },
    { value: 'inspection', label: 'Property Inspection' },
    { value: 'custom', label: 'Custom Reminder' },
  ];

  const frequencies = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'custom', label: 'Custom Schedule' },
  ];

  const filteredTenants = useMemo(() => {
    const term = tenantSearch.trim().toLowerCase();
    if (!term) return tenants || [];

    return (tenants || []).filter((tenant) => {
      const searchable = [
        tenant.full_name || '',
        tenant.email || '',
        tenant.phone || '',
        tenant.unit?.unit_number || '',
        tenant.property?.name || '',
      ]
        .join(' ')
        .toLowerCase();

      return searchable.includes(term);
    });
  }, [tenantSearch, tenants]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = 'Reminder name is required';
    if (!formData.reminderType) newErrors.reminderType = 'Reminder type is required';
    if (!formData.frequency) newErrors.frequency = 'Frequency is required';
    if (formData.frequency === 'custom' && !formData.customSchedule.trim()) {
      newErrors.customSchedule = 'Custom schedule is required for custom frequency';
    }
    if (formData.recipientScope === 'selected' && formData.recipientIds.length === 0) {
      newErrors.recipients = 'Select at least one recipient';
    }
    if (!formData.messageSubject.trim()) newErrors.messageSubject = 'Subject is required';
    if (!formData.messageBody.trim()) newErrors.messageBody = 'Message body is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleTemplateChange = (templateId: string) => {
    setFormData(prev => ({ ...prev, templateId }));

    if (!templateId) {
      setFormData(prev => ({
        ...prev,
        messageSubject: '',
        messageBody: '',
      }));
      return;
    }

    const template = templateOptions.find(t => t.id === templateId);
    if (template) {
      const subject = (template as any).subject ?? (template as any).message_subject ?? '';
      const body = (template as any).body ?? (template as any).message_body ?? '';
      setFormData(prev => ({
        ...prev,
        messageSubject: subject || '',
        messageBody: body || '',
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const recipientFilter = formData.recipientScope === 'selected'
      ? { tenantIds: formData.recipientIds }
      : {};

    const basePayload = {
      name: formData.name,
      frequency: formData.frequency,
      customSchedule: formData.frequency === 'custom' ? formData.customSchedule : null,
      messageSubject: formData.messageSubject,
      messageBody: formData.messageBody,
    };

    const result = isEditing && reminder?.id
      ? await update(reminder.id, {
        ...basePayload,
        templateId: formData.templateId || null,
        recipientFilter,
      })
      : await create({
        ...basePayload,
        reminderType: formData.reminderType,
        templateId: formData.templateId || undefined,
        recipientFilter,
      });

    if (result.success) {
      // Reset form
      setFormData(buildFormData(null));
      setErrors({});

      // Call success callback
      if (onSuccess) {
        onSuccess();
      }

      // Close modal
      onClose();

      // Show success message
      alert(isEditing ? 'Automated reminder updated successfully!' : 'Automated reminder created successfully!');
    } else {
      alert(isEditing ? 'Failed to update reminder. Please try again.' : 'Failed to create reminder. Please try again.');
    }
  };

  const handleClose = () => {
    // Reset form when closing
    setFormData(buildFormData(null));
    setErrors({});
    setTenantSearch('');
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    setFormData(buildFormData(reminder));
    setErrors({});
    setTenantSearch('');
  }, [isOpen, reminder?.id]);

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
        className={`relative w-full max-w-3xl ${
          isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white'
        } border ${border.default} rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            {isEditing ? 'EDIT AUTOMATED REMINDER' : 'CREATE AUTOMATED REMINDER'}
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
          {/* Reminder Name */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${text.primary}`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              Reminder Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={`w-full px-4 py-3 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
              } border rounded-lg ${text.primary} focus:outline-none focus:border-[#ff6b35] transition-colors`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
              placeholder="e.g., Monthly Rent Reminder"
            />
            {errors.name && (
              <p className="text-red-400 text-sm mt-1">{errors.name}</p>
            )}
          </div>

          {/* Reminder Type & Frequency */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                className={`block text-sm font-medium mb-2 ${text.primary}`}
                style={{ fontFamily: 'Work Sans, sans-serif' }}
              >
                Reminder Type *
              </label>
              <select
                value={formData.reminderType}
                onChange={(e) => setFormData({ ...formData, reminderType: e.target.value })}
                disabled={isEditing}
                className={`w-full px-4 py-3 ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
                } border rounded-lg ${text.primary} focus:outline-none focus:border-[#ff6b35] transition-colors`}
                style={{ fontFamily: 'Work Sans, sans-serif' }}
              >
                {reminderTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              {errors.reminderType && (
                <p className="text-red-400 text-sm mt-1">{errors.reminderType}</p>
              )}
            </div>

            <div>
              <label
                className={`block text-sm font-medium mb-2 ${text.primary}`}
                style={{ fontFamily: 'Work Sans, sans-serif' }}
              >
                Frequency *
              </label>
              <select
                value={formData.frequency}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    frequency: e.target.value as 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'custom',
                  })
                }
                className={`w-full px-4 py-3 ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
                } border rounded-lg ${text.primary} focus:outline-none focus:border-[#ff6b35] transition-colors`}
                style={{ fontFamily: 'Work Sans, sans-serif' }}
              >
                {frequencies.map((freq) => (
                  <option key={freq.value} value={freq.value}>
                    {freq.label}
                  </option>
                ))}
              </select>
              {errors.frequency && (
                <p className="text-red-400 text-sm mt-1">{errors.frequency}</p>
              )}
            </div>
          </div>

          {/* Recipients */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${text.primary}`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              Recipients *
            </label>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={formData.recipientScope === 'all'}
                    onChange={() => setFormData({ ...formData, recipientScope: 'all', recipientIds: [] })}
                  />
                  <span>All tenants</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={formData.recipientScope === 'selected'}
                    onChange={() => setFormData({ ...formData, recipientScope: 'selected' })}
                  />
                  <span>Select tenants</span>
                </label>
              </div>

              {formData.recipientScope === 'selected' && (
                <div className={`border ${border.default} rounded-lg p-3 space-y-3`}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className={text.muted}>Selected {formData.recipientIds.length}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const allIds = (tenants || []).map((tenant) => tenant.user_id);
                          setFormData({ ...formData, recipientIds: allIds });
                        }}
                        className={`px-2 py-1 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded`}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, recipientIds: [] })}
                        className={`px-2 py-1 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded`}
                      >
                        Clear all
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={tenantSearch}
                    onChange={(e) => setTenantSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                      }
                    }}
                    placeholder="Search tenants by name or email"
                    className={`w-full px-3 py-2 ${
                      isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
                    } border rounded-lg text-sm ${text.primary} focus:outline-none focus:border-[#ff6b35] transition-colors`}
                    style={{ fontFamily: 'Work Sans, sans-serif' }}
                  />
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {filteredTenants
                      .map((tenant) => {
                        const isChecked = formData.recipientIds.includes(tenant.user_id);
                        const emailMissing = !tenant.email;
                        return (
                          <label key={tenant.user_id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...formData.recipientIds, tenant.user_id]
                                  : formData.recipientIds.filter((id) => id !== tenant.user_id);
                                setFormData({ ...formData, recipientIds: next });
                              }}
                            />
                            <span>
                              {tenant.full_name || 'Unnamed'} {tenant.email ? `(${tenant.email})` : ''}
                            </span>
                            {emailMissing && (
                              <span className="text-xs text-amber-500">No email</span>
                            )}
                          </label>
                        );
                      })}
                    {filteredTenants.length === 0 && tenantSearch.trim().length > 0 && (
                      <p className={`text-xs ${text.muted}`}>No tenants match that search.</p>
                    )}
                    {(tenants || []).length === 0 && (
                      <p className={`text-xs ${text.muted}`}>No tenants available.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
            {errors.recipients && (
              <p className="text-red-400 text-sm mt-2">{errors.recipients}</p>
            )}
          </div>

          {/* Custom Schedule (shown only if frequency is custom) */}
          {formData.frequency === 'custom' && (
            <div>
              <label
                className={`block text-sm font-medium mb-2 ${text.primary}`}
                style={{ fontFamily: 'Work Sans, sans-serif' }}
              >
                Custom Schedule (Cron Expression) *
              </label>
              <input
                type="text"
                value={formData.customSchedule}
                onChange={(e) => setFormData({ ...formData, customSchedule: e.target.value })}
                className={`w-full px-4 py-3 ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
                } border rounded-lg ${text.primary} focus:outline-none focus:border-[#ff6b35] transition-colors`}
                style={{ fontFamily: 'Work Sans, sans-serif' }}
                placeholder="e.g., 0 9 * * 1 (Every Monday at 9 AM)"
              />
              {errors.customSchedule && (
                <p className="text-red-400 text-sm mt-1">{errors.customSchedule}</p>
              )}
              <p className={`text-xs ${text.muted} mt-1`}>
                Use cron syntax: minute hour day month weekday
              </p>
            </div>
          )}

          {/* Template Selection (Optional) */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${text.primary}`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              Use Template (Optional)
            </label>
            <select
              value={formData.templateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className={`w-full px-4 py-3 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
              } border rounded-lg ${text.primary} focus:outline-none focus:border-[#ff6b35] transition-colors`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              <option value="">None - Create custom message</option>
              {templateOptions.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} ({template.category})
                </option>
              ))}
            </select>
          </div>

          {/* Message Subject */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${text.primary}`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              Message Subject *
            </label>
            <input
              type="text"
              value={formData.messageSubject}
              onChange={(e) => setFormData({ ...formData, messageSubject: e.target.value })}
              className={`w-full px-4 py-3 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
              } border rounded-lg ${text.primary} focus:outline-none focus:border-[#ff6b35] transition-colors`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
              placeholder="Rent Payment Reminder"
            />
            {errors.messageSubject && (
              <p className="text-red-400 text-sm mt-1">{errors.messageSubject}</p>
            )}
          </div>

          {/* Message Body */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${text.primary}`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              Message Body *
            </label>
            <textarea
              value={formData.messageBody}
              onChange={(e) => setFormData({ ...formData, messageBody: e.target.value })}
              rows={6}
              className={`w-full px-4 py-3 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
              } border rounded-lg ${text.primary} focus:outline-none focus:border-[#ff6b35] transition-colors resize-none`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
              placeholder="Hello, this is a reminder that your rent payment is due..."
            />
            {errors.messageBody && (
              <p className="text-red-400 text-sm mt-1">{errors.messageBody}</p>
            )}
            <p className={`text-xs ${text.muted} mt-1`}>
              Tip: You can use variables like {'{tenant_name}'}, {'{property_name}'}, {'{due_date}'}
            </p>
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
              disabled={loading || updating}
              className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              {loading || updating ? 'Saving...' : (isEditing ? 'Update Reminder' : 'Create Reminder')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
