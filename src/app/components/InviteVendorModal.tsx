import { useState } from 'react';
import { X, Loader2, Mail, CheckCircle2 } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { createVendorInvite } from '../../lib/api/vendorInvites';

interface InviteVendorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InviteVendorModal({ isOpen, onClose }: InviteVendorModalProps) {
  const { isDark, bg, text, border } = useThemeStyles();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetState = () => {
    setEmail('');
    setError('');
    setInviteLink(null);
    setEmailSent(null);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    resetState();
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setInviteLink(null);
    setEmailSent(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError('Vendor email is required.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await createVendorInvite({ email: trimmedEmail });
      setInviteLink(response.inviteLink);
      setEmailSent(response.emailSent);
    } catch (err: any) {
      setError(err?.message || 'Failed to send invite.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      <div
        className={`relative w-full max-w-lg ${isDark ? 'bg-[#1a1a1a]' : 'bg-white'} rounded-xl shadow-2xl`}
      >
        <div className={`flex items-center justify-between p-6 border-b ${border.default} ${bg.secondary}`}>
          <div>
            <h2 className="text-3xl font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              INVITE VENDOR
            </h2>
            <p className={`${text.muted} mt-1`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
              Send an onboarding link to your vendor
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className={`p-2 ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'} rounded-lg transition-colors`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={`block text-sm font-medium mb-2 ${text.primary}`}>Vendor Email</label>
            <div className="relative">
              <Mail className={`w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 ${text.muted}`} />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={`w-full pl-10 pr-4 py-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 ${
                  isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'
                }`}
                placeholder="vendor@example.com"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          {inviteLink && (
            <div className={`rounded-lg border p-3 ${isDark ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'}`}>
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Invite ready
              </div>
              <p className={`mt-2 text-xs ${text.muted}`}>
                {emailSent ? 'Email sent successfully.' : 'Email could not be sent. Share this link manually:'}
              </p>
              <p className={`mt-2 text-xs break-all ${isDark ? 'text-white/80' : 'text-gray-700'}`}>{inviteLink}</p>
              <p className={`mt-2 text-xs ${text.muted}`}>
                Vendor profiles appear in the assignment list after the invite is accepted.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform disabled:opacity-60 disabled:hover:scale-100"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending Invite...
              </span>
            ) : (
              'Send Invite'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
