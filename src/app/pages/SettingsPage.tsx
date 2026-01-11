import { useEffect, useState } from 'react';
import { AlertCircle, BellRing, CheckCircle2, Settings } from 'lucide-react';
import { useThemeContext } from '../context/ThemeContext';
import {
  getEmergencySupportConfig,
  updateEmergencySupportConfig,
  sendEmergencyTest,
  type EmergencySupportConfig,
} from '../../lib/api/maintenanceMetrics';

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
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testChannels, setTestChannels] = useState<EmergencyChannel[]>(DEFAULT_CHANNELS);
  const [testTitle, setTestTitle] = useState('Emergency Notification Test');
  const [testDescription, setTestDescription] = useState('This is a test of your emergency notification channels.');
  const [testCategory, setTestCategory] = useState('general');
  const [testResults, setTestResults] = useState<Array<{ channel: string; sent: boolean; status?: number; error?: string }>>([]);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        setLoading(true);
        const response = await getEmergencySupportConfig();
        setConfig(response);
        setTestChannels(response.notificationChannels as EmergencyChannel[]);
      } catch (err: any) {
        setError(err.message || 'Failed to load emergency settings');
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  const toggleChannel = (channel: EmergencyChannel, isDefault: boolean) => {
    const currentChannels = isDefault ? (config.notificationChannels as EmergencyChannel[]) : testChannels;

    const nextChannels = currentChannels.includes(channel)
      ? currentChannels.filter((item) => item !== channel)
      : [...currentChannels, channel];

    if (isDefault) {
      setConfig({
        ...config,
        notificationChannels: nextChannels,
      } as EmergencySupportConfig);
    } else {
      setTestChannels(nextChannels);
    }
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

  const handleTest = async () => {
    try {
      setTesting(true);
      setError(null);
      setSuccess(null);
      setTestResults([]);

      if (testChannels.length === 0) {
        setError('Select at least one test notification channel.');
        setTesting(false);
        return;
      }

      const response = await sendEmergencyTest({
        title: testTitle,
        description: testDescription,
        category: testCategory,
        notificationChannels: testChannels,
      });

      setTestResults(response.notifications || []);
      setSuccess('Test notifications sent. Review results below.');
    } catch (err: any) {
      setError(err.message || 'Failed to send emergency test');
    } finally {
      setTesting(false);
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
                    onClick={() => toggleChannel(channel.value, true)}
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

      <div className={`p-6 rounded-xl border ${isDark ? 'bg-[#0f1523] border-white/10' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center gap-3 mb-6">
          <Settings className="w-6 h-6 text-[#ff6b35]" />
          <div>
            <h3 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              TEST EMERGENCY NOTIFICATIONS
            </h3>
            <p className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
              Validate each provider from the dashboard.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                Test title
              </label>
              <input
                type="text"
                value={testTitle}
                onChange={(e) => setTestTitle(e.target.value)}
                className={`w-full px-4 py-3 rounded-lg border ${
                  isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'
                } focus:outline-none focus:border-[#ff6b35]/70`}
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                Category
              </label>
              <input
                type="text"
                value={testCategory}
                onChange={(e) => setTestCategory(e.target.value)}
                className={`w-full px-4 py-3 rounded-lg border ${
                  isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'
                } focus:outline-none focus:border-[#ff6b35]/70`}
              />
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
              Test description
            </label>
            <textarea
              value={testDescription}
              onChange={(e) => setTestDescription(e.target.value)}
              rows={3}
              className={`w-full px-4 py-3 rounded-lg border ${
                isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'
              } focus:outline-none focus:border-[#ff6b35]/70`}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
              Test channels
            </label>
            <div className="grid grid-cols-2 gap-3">
              {EMERGENCY_CHANNELS.map((channel) => (
                <button
                  key={channel.value}
                  type="button"
                  onClick={() => toggleChannel(channel.value, false)}
                  className={`px-4 py-3 rounded-lg border transition-all text-left ${
                    testChannels.includes(channel.value)
                      ? 'bg-gradient-to-r from-[#ff6b35] to-[#f7931e] border-[#ff6b35] text-white font-semibold'
                      : isDark
                      ? 'bg-white/5 border-white/10 hover:bg-white/10 text-white/70'
                      : 'bg-gray-50 border-gray-300 hover:bg-gray-100 text-gray-700'
                  }`}
                  style={{ fontFamily: 'Work Sans, sans-serif' }}
                >
                  <div className="font-semibold mb-1">{channel.label}</div>
                  <div className={`text-xs ${testChannels.includes(channel.value) ? 'text-white/80' : isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    {channel.helper}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={handleTest}
              disabled={testing}
              className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ fontFamily: 'Work Sans, sans-serif' }}
            >
              {testing ? 'Sending...' : 'Send Test'}
            </button>
          </div>

          {testResults.length > 0 && (
            <div className={`mt-4 rounded-lg border ${isDark ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'} p-4`}>
              <p className={`text-sm font-medium mb-2 ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                Delivery results
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                {testResults.map((result) => (
                  <div
                    key={result.channel}
                    className={`p-3 rounded-lg border ${
                      result.sent
                        ? isDark
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : isDark
                        ? 'border-red-500/30 bg-red-500/10 text-red-300'
                        : 'border-red-200 bg-red-50 text-red-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{result.channel}</span>
                      <span>{result.sent ? 'Sent' : 'Failed'}</span>
                    </div>
                    {!result.sent && result.error && (
                      <p className="text-xs mt-1">{result.error}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
