import { useState } from 'react';
import { X, Loader2, Building2, MapPin } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentAccountId } from '@/lib/api/client';

interface AddPropertyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type PropertyTypeValue = 'residential' | 'commercial' | 'mixed';

interface PropertyFormData {
  name: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  propertyType: PropertyTypeValue;
  totalUnits: string;
  defaultRent: string;
  unitNumbers: string;
}

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

const PROPERTY_TYPES: Array<{ label: string; value: PropertyTypeValue }> = [
  { label: 'Residential', value: 'residential' },
  { label: 'Commercial', value: 'commercial' },
  { label: 'Mixed Use', value: 'mixed' },
];

export function AddPropertyModal({ isOpen, onClose, onSuccess }: AddPropertyModalProps) {
  const { isDark, text, border } = useThemeStyles();
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState<PropertyFormData>({
    name: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    zip: '',
    country: 'USA',
    propertyType: 'residential',
    totalUnits: '1',
    defaultRent: '',
    unitNumbers: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError(null);

    try {
      const accountId = await getCurrentAccountId();
      if (!accountId) {
        throw new Error('No account found');
      }

      const totalUnits = Math.max(1, Number(formData.totalUnits) || 1);
      const defaultRent = Number(formData.defaultRent) || 0;
      const unitNumbers = formData.unitNumbers
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      const uniqueUnitNumbers = new Set(unitNumbers);

      if (unitNumbers.length !== uniqueUnitNumbers.size) {
        setFormError('Unit numbers must be unique.');
        return;
      }

      if (unitNumbers.length > totalUnits) {
        setFormError('Unit numbers count cannot exceed total units.');
        return;
      }
      const { data: property, error } = await supabase
        .from('properties')
        .insert({
          account_id: accountId,
          name: formData.name,
          address1: formData.address1,
          address2: formData.address2 || null,
          city: formData.city,
          state: formData.state,
          zip: formData.zip,
          country: formData.country,
          property_type: formData.propertyType,
          total_units: totalUnits,
        })
        .select('id')
        .single();

      if (error) throw error;

      if (property?.id) {
        const unitsToCreate = Array.from({ length: totalUnits }, (_, index) => ({
          account_id: accountId,
          property_id: property.id,
          unit_number: unitNumbers[index] || String(index + 1),
          rent_amount: defaultRent,
        }));

        const { error: unitsError } = await supabase
          .from('units')
          .insert(unitsToCreate);

        if (unitsError) {
          console.error('Error creating units:', unitsError);
          alert('Property created, but units failed to create. You can add units manually.');
        }
      }

      // Reset form
      setFormData({
        name: '',
        address1: '',
        address2: '',
        city: '',
        state: '',
        zip: '',
        country: 'USA',
        propertyType: 'residential',
        totalUnits: '1',
        defaultRent: '',
        unitNumbers: '',
      });
      setFormError(null);

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error creating property:', error);
      alert('Failed to create property. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-2xl ${
          isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white'
        } rounded-xl shadow-2xl overflow-hidden`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${border.default}`}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-[#ff6b35] to-[#f7931e] rounded-lg">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              ADD NEW PROPERTY
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`p-2 ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'} rounded-lg transition-colors`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {formError ? (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {formError}
            </div>
          ) : null}
          {/* Property Name */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${text.primary}`}>
              Property Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="e.g., Sunset Apartments"
              className={`w-full px-4 py-3 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
              } border rounded-lg focus:outline-none focus:border-[#ff6b35]/50`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            />
          </div>

          {/* Property Type */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${text.primary}`}>
              Property Type <span className="text-red-400">*</span>
            </label>
            <select
              name="propertyType"
              value={formData.propertyType}
              onChange={handleChange}
              required
              className={`w-full px-4 py-3 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
              } border rounded-lg focus:outline-none focus:border-[#ff6b35]/50`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              {PROPERTY_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>

          {/* Address Line 1 */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${text.primary}`}>
              Address Line 1 <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                name="address1"
                value={formData.address1}
                onChange={handleChange}
                required
                placeholder="123 Main Street"
                className={`w-full pl-11 pr-4 py-3 ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
                } border rounded-lg focus:outline-none focus:border-[#ff6b35]/50`}
                style={{ fontFamily: 'Work Sans, sans-serif' }}
              />
            </div>
          </div>

          {/* Address Line 2 */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${text.primary}`}>
              Address Line 2 <span className={`text-xs ${text.muted}`}>(Optional)</span>
            </label>
            <input
              type="text"
              name="address2"
              value={formData.address2}
              onChange={handleChange}
              placeholder="Suite, Unit, Building, etc."
              className={`w-full px-4 py-3 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
              } border rounded-lg focus:outline-none focus:border-[#ff6b35]/50`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            />
          </div>

          {/* City, State, ZIP */}
          <div className="grid grid-cols-6 gap-4">
            <div className="col-span-3">
              <label className={`block text-sm font-medium mb-2 ${text.primary}`}>
                City <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                required
                placeholder="San Francisco"
                className={`w-full px-4 py-3 ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
                } border rounded-lg focus:outline-none focus:border-[#ff6b35]/50`}
                style={{ fontFamily: 'Work Sans, sans-serif' }}
              />
            </div>
            <div className="col-span-1">
              <label className={`block text-sm font-medium mb-2 ${text.primary}`}>
                State <span className="text-red-400">*</span>
              </label>
              <select
                name="state"
                value={formData.state}
                onChange={handleChange}
                required
                className={`w-full px-4 py-3 ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
                } border rounded-lg focus:outline-none focus:border-[#ff6b35]/50`}
                style={{ fontFamily: 'Work Sans, sans-serif' }}
              >
                <option value="">--</option>
                {US_STATES.map(state => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className={`block text-sm font-medium mb-2 ${text.primary}`}>
                ZIP Code <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                name="zip"
                value={formData.zip}
                onChange={handleChange}
                required
                placeholder="94102"
                maxLength={10}
                className={`w-full px-4 py-3 ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
                } border rounded-lg focus:outline-none focus:border-[#ff6b35]/50`}
                style={{ fontFamily: 'Work Sans, sans-serif' }}
              />
            </div>
          </div>

          {/* Total Units */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${text.primary}`}>
              Total Units <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              name="totalUnits"
              value={formData.totalUnits}
              onChange={handleChange}
              required
              min={1}
              step={1}
              placeholder="1"
              className={`w-full px-4 py-3 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
              } border rounded-lg focus:outline-none focus:border-[#ff6b35]/50`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            />
          </div>

          {/* Default Rent */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${text.primary}`}>
              Default Rent (per unit)
            </label>
            <input
              type="number"
              name="defaultRent"
              value={formData.defaultRent}
              onChange={handleChange}
              min={0}
              step="0.01"
              placeholder="0.00"
              className={`w-full px-4 py-3 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
              } border rounded-lg focus:outline-none focus:border-[#ff6b35]/50`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            />
          </div>

          {/* Unit Numbers */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${text.primary}`}>
              Unit Numbers <span className={`text-xs ${text.muted}`}>(Optional, comma-separated)</span>
            </label>
            <input
              type="text"
              name="unitNumbers"
              value={formData.unitNumbers}
              onChange={handleChange}
              placeholder="101, 102, 201"
              className={`w-full px-4 py-3 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-300'
              } border rounded-lg focus:outline-none focus:border-[#ff6b35]/50`}
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            />
            <p className={`mt-2 text-xs ${text.muted}`}>
              If provided, we will use these in order; any missing units fall back to 1..N.
            </p>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
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
              className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Creating...' : 'Create Property'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
