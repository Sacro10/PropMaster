import { useEffect, useState } from 'react';
import { AlertCircle, BellRing, CheckCircle2, Settings } from 'lucide-react';
import { useThemeContext } from '../context/ThemeContext';
import {
  getEmergencySupportConfig,
  updateEmergencySupportConfig,
  type EmergencySupportConfig,
} from '../../lib/api/maintenanceMetrics';
import {
  getStripeConnectSettings,
  updateStripeConnectSettings,
  type StripeConnectSettings,
} from '../../lib/api/accounts';

type EmergencyChannel = 'pagerduty' | 'opsgenie' | 'twilio' | 'slack' | 'email' | 'webhook';

const EMERGENCY_CHANNELS: Array<{ value: EmergencyChannel; label: string; helper: string }> = [
  { value: 'pagerduty', label: 'PagerDuty', helper: 'Triggers an on-call incident' },
  { value: 'opsgenie', label: 'Opsgenie', helper: 'Creates a P1 alert' },
  { value: 'twilio', label: 'SMS (Twilio)', helper: 'Sends SMS to on-call number' },
  { value: 'slack', label: 'Slack', helper: 'Posts to emergency channel' },
  { value: 'email', label: 'Email', helper: 'Sends to emergency email' },
  { value: 'webhook', label: 'Webhook', helper: 'Calls custom emergency endpoint' },
];

const DEFAULT_CHANNELS: EmergencyChannel[] = EMERGENCY_CHANNELS.map((channel) => channel.value);

const DEFAULT_CONFIG: EmergencySupportConfig = {
  isEnabled: false,
  notificationPhone: null,
  notificationEmail: null,
  notificationChannels: DEFAULT_CHANNELS,
};

export function SettingsPage() {
  const { theme } = useThemeContext();
  const isDark = theme === 'dark';

  const [config, setConfig] = useState<EmergencySupportConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
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
    const loadConfig = async () => {
      try {
        setLoading(true);
        const response = await getEmergencySupportConfig();
        setConfig(response);
      } catch (err: any) {
        setError(err.message || 'Failed to load emergency settings');
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

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

  const toggleChannel = (channel: EmergencyChannel) => {
    const currentChannels = config.notificationChannels as EmergencyChannel[];
    const nextChannels = currentChannels.includes(channel)
      ? currentChannels.filter((item) => item !== channel)
      : [...currentChannels, channel];

    setConfig({
      ...config,
      notificationChannels: nextChannels,
    } as EmergencySupportConfig);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      if (config.notificationChannels.length === 0) {
        setError('Select at least one default notification channel.');
        setSaving(false);
        return;
      }

      const updated = await updateEmergencySupportConfig(config);
      setConfig(updated);
      setSuccess('Emergency settings updated.');
    } catch (err: any) {
      setError(err.message || 'Failed to update emergency settings');
    } finally {
      setSaving(false);
    }
  };

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
          Configure emergency notifications and verify provider connectivity.
        </p>
      </div>

      {(error || success) && (
        <div className={`p-4 rounded-lg border ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'} flex items-start gap-3`}>
          {error ? (
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          )}
          <div>
            <p className={`font-medium ${error ? 'text-red-400' : 'text-emerald-400'}`}>
              {error ? 'Action failed' : 'Success'}
            </p>
            <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
              {error || success}
            </p>
          </div>
        </div>
      )}

      <div className={`p-6 rounded-xl border ${isDark ? 'bg-[#1a1f35] border-white/10' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center gap-3 mb-6">
          <BellRing className="w-6 h-6 text-[#ff6b35]" />
          <div>
            <h3 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              EMERGENCY SUPPORT
            </h3>
            <p className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
              Set contact methods and default escalation channels.
            </p>
          </div>
        </div>

        {loading ? (
          <p className={`${isDark ? 'text-white/50' : 'text-gray-500'}`}>Loading settings...</p>
        ) : (
          <div className="space-y-6">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={config.isEnabled}
                onChange={(e) => setConfig({ ...config, isEnabled: e.target.checked })}
                className="h-4 w-4"
              />
              <span className={`${isDark ? 'text-white/80' : 'text-gray-700'}`}>Enable 24/7 emergency support</span>
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                  Emergency phone
                </label>
                <input
                  type="text"
                  value={config.notificationPhone || ''}
                  onChange={(e) => setConfig({ ...config, notificationPhone: e.target.value })}
                  placeholder="+1 555 0100"
                  className={`w-full px-4 py-3 rounded-lg border ${
                    isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'
                  } focus:outline-none focus:border-[#ff6b35]/70`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                  Emergency email
                </label>
                <input
                  type="email"
                  value={config.notificationEmail || ''}
                  onChange={(e) => setConfig({ ...config, notificationEmail: e.target.value })}
                  placeholder="emergency@yourco.com"
                  className={`w-full px-4 py-3 rounded-lg border ${
                    isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'
                  } focus:outline-none focus:border-[#ff6b35]/70`}
                />
              </div>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                Default notification channels
              </label>
              <div className="grid grid-cols-2 gap-3">
                {EMERGENCY_CHANNELS.map((channel) => (
                  <button
                    key={channel.value}
                    type="button"
                    onClick={() => toggleChannel(channel.value)}
                    className={`px-4 py-3 rounded-lg border transition-all text-left ${
                      config.notificationChannels.includes(channel.value)
                        ? 'bg-gradient-to-r from-[#ff6b35] to-[#f7931e] border-[#ff6b35] text-white font-semibold'
                        : isDark
                        ? 'bg-white/5 border-white/10 hover:bg-white/10 text-white/70'
                        : 'bg-gray-50 border-gray-300 hover:bg-gray-100 text-gray-700'
                    }`}
                    style={{ fontFamily: 'Work Sans, sans-serif' }}
                  >
                    <div className="font-semibold mb-1">{channel.label}</div>
                    <div className={`text-xs ${config.notificationChannels.includes(channel.value) ? 'text-white/80' : isDark ? 'text-white/50' : 'text-gray-500'}`}>
                      {channel.helper}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ fontFamily: 'Work Sans, sans-serif' }}
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}
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
