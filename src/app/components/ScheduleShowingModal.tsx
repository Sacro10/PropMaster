import { X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useCreateShowing } from '../../lib/hooks/useShowings';

interface ScheduleShowingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  preSelectedUnitId?: string;
  availableUnits: Array<{
    id: string;
    name: string;
    rent: string;
    beds: number;
    baths: number;
  }>;
}

export function ScheduleShowingModal({
  isOpen,
  onClose,
  onSuccess,
  preSelectedUnitId,
  availableUnits,
}: ScheduleShowingModalProps) {
  const { isDark, text, border } = useThemeStyles();
  const { create, loading } = useCreateShowing();

  const [formData, setFormData] = useState({
    unit_id: preSelectedUnitId || '',
    visitor_name: '',
    visitor_email: '',
    visitor_phone: '',
    showing_date: '',
    showing_type: 'agent_assisted' as 'self_guided' | 'agent_assisted' | 'virtual',
    notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const getLocalDateTimeValue = (date: Date) => {
    const pad = (value: number) => value.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}`;
  };

  // Update unit_id when preSelectedUnitId changes
  useEffect(() => {
    if (preSelectedUnitId) {
      setFormData(prev => ({ ...prev, unit_id: preSelectedUnitId }));
    }
  }, [preSelectedUnitId]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.unit_id) newErrors.unit_id = 'Please select a property';
    if (!formData.visitor_name.trim()) newErrors.visitor_name = 'Visitor name is required';
    if (!formData.visitor_email.trim()) {
      newErrors.visitor_email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.visitor_email)) {
      newErrors.visitor_email = 'Invalid email format';
    }
    if (!formData.showing_date) newErrors.showing_date = 'Date and time is required';

    // Validate showing date is in the future
    if (formData.showing_date) {
      const selectedDate = new Date(formData.showing_date);
      const now = new Date();
      if (selectedDate <= now) {
        newErrors.showing_date = 'Showing date must be in the future';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const result = await create({
      ...formData,
      showing_date: new Date(formData.showing_date).toISOString(),
    });

    if (result.success) {
      // Reset form
      setFormData({
        unit_id: '',
        visitor_name: '',
        visitor_email: '',
        visitor_phone: '',
        showing_date: '',
        showing_type: 'agent_assisted',
        notes: '',
      });
      setErrors({});

      // Call success callback
      if (onSuccess) {
        onSuccess();
      }

      // Close modal
      onClose();

      // Show success message
      alert('Showing scheduled successfully!');
    } else {
      alert('Failed to schedule showing. Please try again.');
    }
  };

  const handleClose = () => {
    // Reset form when closing
    setFormData({
      unit_id: preSelectedUnitId || '',
      visitor_name: '',
      visitor_email: '',
      visitor_phone: '',
      showing_date: '',
      showing_type: 'agent_assisted',
      notes: '',
    });
    setErrors({});
    onClose();
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
            SCHEDULE SHOWING
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
          {/* Property Selection */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${text.primary}`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              Property / Unit *
            </label>
            <select
              value={formData.unit_id}
              onChange={(e) => setFormData({ ...formData, unit_id: e.target.value })}
              className={`w-full px-4 py-3 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
              } border rounded-lg ${text.primary} focus:outline-none focus:border-[#ff6b35] transition-colors`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              <option value="">Select a property...</option>
              {availableUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name} - {unit.rent} ({unit.beds}bd/{unit.baths}ba)
                </option>
              ))}
            </select>
            {errors.unit_id && (
              <p className="text-red-400 text-sm mt-1">{errors.unit_id}</p>
            )}
          </div>

          {/* Showing Type */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${text.primary}`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              Showing Type *
            </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { value: 'self_guided', label: 'Self-Guided' },
                { value: 'agent_assisted', label: 'Agent-Assisted' },
                { value: 'virtual', label: 'Virtual' },
              ].map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      showing_type: type.value as 'self_guided' | 'agent_assisted' | 'virtual',
                    })
                  }
                  className={`px-4 py-3 rounded-lg border transition-all ${
                    formData.showing_type === type.value
                      ? 'bg-gradient-to-r from-[#ff6b35] to-[#f7931e] border-[#ff6b35] text-white font-semibold'
                      : isDark
                      ? 'bg-white/5 border-white/10 hover:bg-white/10'
                      : 'bg-gray-50 border-gray-300 hover:bg-gray-100'
                  }`}
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Visitor Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                className={`block text-sm font-medium mb-2 ${text.primary}`}
                style={{ fontFamily: 'Work Sans, sans-serif' }}
              >
                Visitor Name *
              </label>
              <input
                type="text"
                value={formData.visitor_name}
                onChange={(e) => setFormData({ ...formData, visitor_name: e.target.value })}
                className={`w-full px-4 py-3 ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
                } border rounded-lg ${text.primary} focus:outline-none focus:border-[#ff6b35] transition-colors`}
                style={{ fontFamily: 'Work Sans, sans-serif' }}
                placeholder="John Doe"
              />
              {errors.visitor_name && (
                <p className="text-red-400 text-sm mt-1">{errors.visitor_name}</p>
              )}
            </div>

            <div>
              <label
                className={`block text-sm font-medium mb-2 ${text.primary}`}
                style={{ fontFamily: 'Work Sans, sans-serif' }}
              >
                Email *
              </label>
              <input
                type="email"
                value={formData.visitor_email}
                onChange={(e) => setFormData({ ...formData, visitor_email: e.target.value })}
                className={`w-full px-4 py-3 ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
                } border rounded-lg ${text.primary} focus:outline-none focus:border-[#ff6b35] transition-colors`}
                style={{ fontFamily: 'Work Sans, sans-serif' }}
                placeholder="john@example.com"
              />
              {errors.visitor_email && (
                <p className="text-red-400 text-sm mt-1">{errors.visitor_email}</p>
              )}
            </div>
          </div>

          <div>
            <label
              className={`block text-sm font-medium mb-2 ${text.primary}`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              Phone Number (Optional)
            </label>
            <input
              type="tel"
              value={formData.visitor_phone}
              onChange={(e) => setFormData({ ...formData, visitor_phone: e.target.value })}
              className={`w-full px-4 py-3 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
              } border rounded-lg ${text.primary} focus:outline-none focus:border-[#ff6b35] transition-colors`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
              placeholder="(555) 123-4567"
            />
          </div>

          {/* Date & Time */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${text.primary}`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              Date & Time *
            </label>
            <input
              type="datetime-local"
              value={formData.showing_date}
              onChange={(e) => setFormData({ ...formData, showing_date: e.target.value })}
              className={`w-full px-4 py-3 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
              } border rounded-lg ${text.primary} focus:outline-none focus:border-[#ff6b35] transition-colors`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
              min={getLocalDateTimeValue(new Date())}
            />
            {errors.showing_date && (
              <p className="text-red-400 text-sm mt-1">{errors.showing_date}</p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${text.primary}`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              Notes (Optional)
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className={`w-full px-4 py-3 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
              } border rounded-lg ${text.primary} focus:outline-none focus:border-[#ff6b35] transition-colors resize-none`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
              placeholder="Any special requirements or notes..."
            />
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
              disabled={loading}
              className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              {loading ? 'Scheduling...' : 'Schedule Showing'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
