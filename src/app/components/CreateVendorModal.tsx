import { X, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { createVendor, type CreateVendorData } from '../../lib/api/vendors';

interface CreateVendorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const SERVICE_CATEGORIES = [
  { value: 'hvac', label: 'HVAC' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'appliance', label: 'Appliance Repair' },
  { value: 'general', label: 'General Maintenance' },
  { value: 'remodel', label: 'Remodeling' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'pest', label: 'Pest Control' },
  { value: 'painting', label: 'Painting' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'flooring', label: 'Flooring' },
  { value: 'security', label: 'Security Systems' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'other', label: 'Other' },
];

export function CreateVendorModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateVendorModalProps) {
  const { isDark, bg, text, border } = useThemeStyles();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<Omit<CreateVendorData, 'services'> & { services: string[] }>({
    business_name: '',
    contact_name: '',
    phone: '',
    email: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    zip: '',
    license_number: '',
    insurance_policy_number: '',
    insurance_expiry: '',
    services: [],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleServiceToggle = (service: string) => {
    setFormData(prev => ({
      ...prev,
      services: prev.services.includes(service)
        ? prev.services.filter(s => s !== service)
        : [...prev.services, service],
    }));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.business_name.trim()) newErrors.business_name = 'Business name is required';
    if (!formData.contact_name.trim()) newErrors.contact_name = 'Contact name is required';
    if (!formData.phone.trim()) newErrors.phone = 'Phone is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }
    if (!formData.address1.trim()) newErrors.address1 = 'Address is required';
    if (!formData.city.trim()) newErrors.city = 'City is required';
    if (!formData.state.trim()) newErrors.state = 'State is required';
    if (!formData.zip.trim()) newErrors.zip = 'ZIP code is required';
    if (formData.services.length === 0) newErrors.services = 'Select at least one service category';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createVendor(formData);

      if (result.success) {
        // Reset form
        setFormData({
          business_name: '',
          contact_name: '',
          phone: '',
          email: '',
          address1: '',
          address2: '',
          city: '',
          state: '',
          zip: '',
          license_number: '',
          insurance_policy_number: '',
          insurance_expiry: '',
          services: [],
        });
        setErrors({});

        // Call success callback
        if (onSuccess) {
          onSuccess();
        }

        // Close modal
        onClose();

        // Show success message
        alert('Vendor created successfully!');
      } else {
        console.error('Create vendor failed:', result.error);
        const message = result.error?.message
          ? `Failed to create vendor: ${result.error.message}`
          : 'Failed to create vendor. Please try again.';
        alert(message);
      }
    } catch (error) {
      console.error('Error creating vendor:', error);
      alert('An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;

    // Reset form when closing
    setFormData({
      business_name: '',
      contact_name: '',
      phone: '',
      email: '',
      address1: '',
      address2: '',
      city: '',
      state: '',
      zip: '',
      license_number: '',
      insurance_policy_number: '',
      insurance_expiry: '',
      services: [],
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
        className={`relative w-full max-w-3xl max-h-[90vh] overflow-y-auto ${
          isDark ? 'bg-[#1a1a1a]' : 'bg-white'
        } rounded-xl shadow-2xl`}
      >
        {/* Header */}
        <div className={`sticky top-0 flex items-center justify-between p-6 border-b ${border.default} ${bg.secondary}`}>
          <div>
            <h2 className="text-3xl font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              ADD NEW VENDOR
            </h2>
            <p className={`${text.muted} mt-1`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
              Register a new vendor for maintenance services
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className={`p-2 ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'} rounded-lg transition-colors`}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Business Information */}
          <div>
            <h3 className={`text-lg font-semibold mb-4 ${text.primary}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
              Business Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={`block text-sm font-medium mb-2 ${text.primary}`}>
                  Business Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="business_name"
                  value={formData.business_name}
                  onChange={handleChange}
                  className={`w-full px-4 py-3 ${
                    isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
                  } border rounded-lg focus:outline-none focus:border-[#ff6b35]/50 ${
                    errors.business_name ? 'border-red-500' : ''
                  }`}
                  placeholder="e.g., Cool Air HVAC Services"
                  disabled={isSubmitting}
                />
                {errors.business_name && (
                  <p className="text-red-500 text-sm mt-1">{errors.business_name}</p>
                )}
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${text.primary}`}>
                  Contact Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="contact_name"
                  value={formData.contact_name}
                  onChange={handleChange}
                  className={`w-full px-4 py-3 ${
                    isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
                  } border rounded-lg focus:outline-none focus:border-[#ff6b35]/50 ${
                    errors.contact_name ? 'border-red-500' : ''
                  }`}
                  placeholder="Primary contact person"
                  disabled={isSubmitting}
                />
                {errors.contact_name && (
                  <p className="text-red-500 text-sm mt-1">{errors.contact_name}</p>
                )}
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${text.primary}`}>
                  Phone <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className={`w-full px-4 py-3 ${
                    isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
                  } border rounded-lg focus:outline-none focus:border-[#ff6b35]/50 ${
                    errors.phone ? 'border-red-500' : ''
                  }`}
                  placeholder="(555) 123-4567"
                  disabled={isSubmitting}
                />
                {errors.phone && (
                  <p className="text-red-500 text-sm mt-1">{errors.phone}</p>
                )}
              </div>

              <div className="col-span-2">
                <label className={`block text-sm font-medium mb-2 ${text.primary}`}>
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className={`w-full px-4 py-3 ${
                    isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
                  } border rounded-lg focus:outline-none focus:border-[#ff6b35]/50 ${
                    errors.email ? 'border-red-500' : ''
                  }`}
                  placeholder="contact@vendor.com"
                  disabled={isSubmitting}
                />
                {errors.email && (
                  <p className="text-red-500 text-sm mt-1">{errors.email}</p>
                )}
              </div>
            </div>
          </div>

          {/* Address Information */}
          <div>
            <h3 className={`text-lg font-semibold mb-4 ${text.primary}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
              Address
            </h3>
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${text.primary}`}>
                  Street Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="address1"
                  value={formData.address1}
                  onChange={handleChange}
                  className={`w-full px-4 py-3 ${
                    isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
                  } border rounded-lg focus:outline-none focus:border-[#ff6b35]/50 ${
                    errors.address1 ? 'border-red-500' : ''
                  }`}
                  placeholder="123 Main Street"
                  disabled={isSubmitting}
                />
                {errors.address1 && (
                  <p className="text-red-500 text-sm mt-1">{errors.address1}</p>
                )}
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${text.primary}`}>
                  Address Line 2
                </label>
                <input
                  type="text"
                  name="address2"
                  value={formData.address2}
                  onChange={handleChange}
                  className={`w-full px-4 py-3 ${
                    isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
                  } border rounded-lg focus:outline-none focus:border-[#ff6b35]/50`}
                  placeholder="Suite, unit, etc. (optional)"
                  disabled={isSubmitting}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${text.primary}`}>
                    City <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 ${
                      isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
                    } border rounded-lg focus:outline-none focus:border-[#ff6b35]/50 ${
                      errors.city ? 'border-red-500' : ''
                    }`}
                    placeholder="City"
                    disabled={isSubmitting}
                  />
                  {errors.city && (
                    <p className="text-red-500 text-sm mt-1">{errors.city}</p>
                  )}
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${text.primary}`}>
                    State <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 ${
                      isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
                    } border rounded-lg focus:outline-none focus:border-[#ff6b35]/50 ${
                      errors.state ? 'border-red-500' : ''
                    }`}
                    placeholder="CA"
                    maxLength={2}
                    disabled={isSubmitting}
                  />
                  {errors.state && (
                    <p className="text-red-500 text-sm mt-1">{errors.state}</p>
                  )}
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${text.primary}`}>
                    ZIP Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="zip"
                    value={formData.zip}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 ${
                      isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
                    } border rounded-lg focus:outline-none focus:border-[#ff6b35]/50 ${
                      errors.zip ? 'border-red-500' : ''
                    }`}
                    placeholder="12345"
                    disabled={isSubmitting}
                  />
                  {errors.zip && (
                    <p className="text-red-500 text-sm mt-1">{errors.zip}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* License & Insurance (Optional) */}
          <div>
            <h3 className={`text-lg font-semibold mb-4 ${text.primary}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
              License & Insurance <span className="text-sm font-normal text-gray-500">(Optional)</span>
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${text.primary}`}>
                  License Number
                </label>
                <input
                  type="text"
                  name="license_number"
                  value={formData.license_number}
                  onChange={handleChange}
                  className={`w-full px-4 py-3 ${
                    isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
                  } border rounded-lg focus:outline-none focus:border-[#ff6b35]/50`}
                  placeholder="LIC-12345"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${text.primary}`}>
                  Insurance Policy Number
                </label>
                <input
                  type="text"
                  name="insurance_policy_number"
                  value={formData.insurance_policy_number}
                  onChange={handleChange}
                  className={`w-full px-4 py-3 ${
                    isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
                  } border rounded-lg focus:outline-none focus:border-[#ff6b35]/50`}
                  placeholder="INS-67890"
                  disabled={isSubmitting}
                />
              </div>

              <div className="col-span-2">
                <label className={`block text-sm font-medium mb-2 ${text.primary}`}>
                  Insurance Expiry Date
                </label>
                <input
                  type="date"
                  name="insurance_expiry"
                  value={formData.insurance_expiry}
                  onChange={handleChange}
                  className={`w-full px-4 py-3 ${
                    isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
                  } border rounded-lg focus:outline-none focus:border-[#ff6b35]/50`}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>

          {/* Service Categories */}
          <div>
            <h3 className={`text-lg font-semibold mb-4 ${text.primary}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
              Service Categories <span className="text-red-500">*</span>
            </h3>
            <p className={`text-sm ${text.muted} mb-3`}>
              Select all services this vendor provides
            </p>
            <div className="grid grid-cols-2 gap-3">
              {SERVICE_CATEGORIES.map((category) => (
                <label
                  key={category.value}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'
                  } rounded-lg cursor-pointer transition-colors border ${
                    formData.services.includes(category.value)
                      ? 'border-[#ff6b35] bg-[#ff6b35]/10'
                      : border.default
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={formData.services.includes(category.value)}
                    onChange={() => handleServiceToggle(category.value)}
                    disabled={isSubmitting}
                    className="w-4 h-4 rounded border-gray-300 text-[#ff6b35] focus:ring-[#ff6b35]"
                  />
                  <span className={`text-sm ${text.primary}`}>{category.label}</span>
                </label>
              ))}
            </div>
            {errors.services && (
              <p className="text-red-500 text-sm mt-2">{errors.services}</p>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className={`flex-1 px-6 py-3 ${
                isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'
              } rounded-lg font-medium transition-colors disabled:opacity-50`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Vendor'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
