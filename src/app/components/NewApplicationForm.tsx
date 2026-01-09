import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';

interface NewApplicationFormProps {
  onClose: () => void;
  onSubmit: (data: ApplicationFormData) => Promise<void>;
}

export interface ApplicationFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  unitId: string;
  moveInDate: string;
  monthlyIncome: number;
  currentEmployer: string;
  currentAddress: string;
}

export function NewApplicationForm({ onClose, onSubmit }: NewApplicationFormProps) {
  const { isDark, bg, text, border } = useThemeStyles();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [units, setUnits] = useState<any[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(true);
  const [formData, setFormData] = useState<ApplicationFormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    unitId: '',
    moveInDate: '',
    monthlyIncome: 0,
    currentEmployer: '',
    currentAddress: '',
  });

  // Load available units
  useEffect(() => {
    async function loadUnits() {
      try {
        // This would call your API to get available units
        // For now using placeholder
        setUnits([]);
      } catch (error) {
        console.error('Failed to load units:', error);
      } finally {
        setLoadingUnits(false);
      }
    }
    loadUnits();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'monthlyIncome' ? parseFloat(value) || 0 : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      onClose();
    } catch (error) {
      console.error('Failed to submit application:', error);
      alert('Failed to submit application. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValid =
    formData.firstName &&
    formData.lastName &&
    formData.email &&
    formData.phone &&
    formData.unitId &&
    formData.moveInDate &&
    formData.monthlyIncome > 0 &&
    formData.currentEmployer &&
    formData.currentAddress;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className={`relative w-full max-w-2xl max-h-[90vh] overflow-y-auto ${
          isDark ? 'bg-[#0f1523]' : 'bg-white'
        } rounded-xl shadow-2xl border ${border.default}`}
      >
        {/* Header */}
        <div className={`sticky top-0 flex items-center justify-between p-6 border-b ${border.default} ${bg.secondary}`}>
          <div>
            <h2 className="text-3xl font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              NEW RENTAL APPLICATION
            </h2>
            <p className={`${text.muted} mt-1`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
              Submit a new tenant application
            </p>
          </div>
          <button
            onClick={onClose}
            className={`p-2 ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'} rounded-lg transition-colors`}
            disabled={isSubmitting}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Personal Information */}
          <div>
            <h3 className="text-lg font-bold mb-4" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              PERSONAL INFORMATION
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm ${text.muted} mb-2`}>
                  First Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  required
                  className={`w-full px-4 py-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} border ${border.default} rounded-lg focus:outline-none focus:border-[#ff6b35]/50`}
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                />
              </div>

              <div>
                <label className={`block text-sm ${text.muted} mb-2`}>
                  Last Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                  className={`w-full px-4 py-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} border ${border.default} rounded-lg focus:outline-none focus:border-[#ff6b35]/50`}
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                />
              </div>

              <div>
                <label className={`block text-sm ${text.muted} mb-2`}>
                  Email <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className={`w-full px-4 py-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} border ${border.default} rounded-lg focus:outline-none focus:border-[#ff6b35]/50`}
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                />
              </div>

              <div>
                <label className={`block text-sm ${text.muted} mb-2`}>
                  Phone <span className="text-red-400">*</span>
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                  className={`w-full px-4 py-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} border ${border.default} rounded-lg focus:outline-none focus:border-[#ff6b35]/50`}
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                />
              </div>
            </div>
          </div>

          {/* Property Information */}
          <div>
            <h3 className="text-lg font-bold mb-4" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              PROPERTY INFORMATION
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm ${text.muted} mb-2`}>
                  Unit <span className="text-red-400">*</span>
                </label>
                <select
                  name="unitId"
                  value={formData.unitId}
                  onChange={handleChange}
                  required
                  disabled={loadingUnits}
                  className={`w-full px-4 py-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} border ${border.default} rounded-lg focus:outline-none focus:border-[#ff6b35]/50`}
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                >
                  <option value="">Select a unit</option>
                  {units.map(unit => (
                    <option key={unit.id} value={unit.id}>
                      {unit.property?.name} - Unit {unit.unit_number}
                    </option>
                  ))}
                </select>
                {loadingUnits && (
                  <p className={`text-xs ${text.muted} mt-1`}>Loading units...</p>
                )}
              </div>

              <div>
                <label className={`block text-sm ${text.muted} mb-2`}>
                  Desired Move-in Date <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  name="moveInDate"
                  value={formData.moveInDate}
                  onChange={handleChange}
                  required
                  min={new Date().toISOString().split('T')[0]}
                  className={`w-full px-4 py-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} border ${border.default} rounded-lg focus:outline-none focus:border-[#ff6b35]/50`}
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                />
              </div>
            </div>
          </div>

          {/* Financial Information */}
          <div>
            <h3 className="text-lg font-bold mb-4" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              FINANCIAL INFORMATION
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm ${text.muted} mb-2`}>
                  Monthly Income <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  name="monthlyIncome"
                  value={formData.monthlyIncome || ''}
                  onChange={handleChange}
                  required
                  min="0"
                  step="0.01"
                  className={`w-full px-4 py-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} border ${border.default} rounded-lg focus:outline-none focus:border-[#ff6b35]/50`}
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                />
              </div>

              <div>
                <label className={`block text-sm ${text.muted} mb-2`}>
                  Current Employer <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  name="currentEmployer"
                  value={formData.currentEmployer}
                  onChange={handleChange}
                  required
                  className={`w-full px-4 py-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} border ${border.default} rounded-lg focus:outline-none focus:border-[#ff6b35]/50`}
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                />
              </div>
            </div>
          </div>

          {/* Current Address */}
          <div>
            <label className={`block text-sm ${text.muted} mb-2`}>
              Current Address <span className="text-red-400">*</span>
            </label>
            <textarea
              name="currentAddress"
              value={formData.currentAddress}
              onChange={handleChange}
              required
              rows={3}
              className={`w-full px-4 py-3 ${isDark ? 'bg-white/5' : 'bg-gray-50'} border ${border.default} rounded-lg focus:outline-none focus:border-[#ff6b35]/50 resize-none`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={`px-6 py-3 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} rounded-lg font-medium transition-colors`}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !isValid}
              className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmitting ? 'Submitting...' : 'Submit Application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
