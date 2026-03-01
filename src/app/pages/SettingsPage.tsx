import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Settings } from 'lucide-react';
import { useThemeContext } from '../context/ThemeContext';
import {
  getStripeConnectSettings,
  updateStripeConnectSettings,
  type StripeConnectSettings,
} from '../../lib/api/accounts';

export function SettingsPage() {
  const { theme } = useThemeContext();
  const isDark = theme === 'dark';

  const [stripeSettings, setStripeSettings] = useState<StripeConnectSettings>({
    stripeConnectedAccountId: null,
    chargesEnabled: null,
    payoutsEnabled: null,
  });
  const [stripeAccountInput, setStripeAccountInput] = useState('');
  const [stripeSaving, setStripeSaving] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [stripeSuccess, setStripeSuccess] = useState<string | null>(null);

  useEffect(() => {
    const loadStripeSettings = async () => {
      try {
        const response = await getStripeConnectSettings();
        setStripeSettings(response);
        setStripeAccountInput(response.stripeConnectedAccountId || '');
      } catch (err: any) {
        setStripeError(err.message || 'Failed to load Stripe settings');
      }
    };

    loadStripeSettings();
  }, []);

  const handleStripeSave = async () => {
    try {
      setStripeSaving(true);
      setStripeError(null);
      setStripeSuccess(null);

      if (!stripeAccountInput.trim()) {
        setStripeError('Enter a Stripe connected account ID (starts with acct_).');
        setStripeSaving(false);
        return;
      }

      const updated = await updateStripeConnectSettings(stripeAccountInput.trim());
      setStripeSettings({
        ...stripeSettings,
        stripeConnectedAccountId: updated.stripeConnectedAccountId || stripeAccountInput.trim(),
      });
      setStripeSuccess('Stripe Connect settings saved.');
    } catch (err: any) {
      setStripeError(err.message || 'Failed to update Stripe settings');
    } finally {
      setStripeSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-4xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
          SETTINGS
        </h2>
        <p className={`${isDark ? 'text-white/50' : 'text-gray-500'}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
          Manage payout settings and verify provider connectivity.
        </p>
      </div>

      <div className={`p-6 rounded-xl border ${isDark ? 'bg-[#1a1f35] border-white/10' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center gap-3 mb-6">
          <Settings className="w-6 h-6 text-[#ff6b35]" />
          <div>
            <h3 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              STRIPE CONNECT PAYOUTS
            </h3>
            <p className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
              Save your connected account ID to enable automatic disbursements.
            </p>
          </div>
        </div>

        {(stripeError || stripeSuccess) && (
          <div className={`mb-4 p-4 rounded-lg border ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'} flex items-start gap-3`}>
            {stripeError ? (
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <p className={`font-medium ${stripeError ? 'text-red-400' : 'text-emerald-400'}`}>
                {stripeError ? 'Action failed' : 'Success'}
              </p>
              <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                {stripeError || stripeSuccess}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
              Connected Account ID
            </label>
            <input
              type="text"
              value={stripeAccountInput}
              onChange={(e) => setStripeAccountInput(e.target.value)}
              placeholder="acct_1234567890"
              className={`w-full px-4 py-3 rounded-lg border ${
                isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'
              } focus:outline-none focus:border-[#ff6b35]/70`}
            />
            <p className={`mt-2 text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Use the connected account ID from Stripe Connect onboarding.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <span className={`px-3 py-1 rounded-full ${stripeSettings.chargesEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
              Charges: {stripeSettings.chargesEnabled === null ? 'Unknown' : stripeSettings.chargesEnabled ? 'Enabled' : 'Disabled'}
            </span>
            <span className={`px-3 py-1 rounded-full ${stripeSettings.payoutsEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
              Payouts: {stripeSettings.payoutsEnabled === null ? 'Unknown' : stripeSettings.payoutsEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={handleStripeSave}
              disabled={stripeSaving}
              className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              {stripeSaving ? 'Saving...' : 'Save Stripe Settings'}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
