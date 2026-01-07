import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { PLAN_INFO, SubscriptionPlan } from '../../lib/stripe';
import { createCheckoutSession, createPortalSession } from '../../lib/api/subscription';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { CheckIcon } from 'lucide-react';
import { toast } from 'sonner';

export function SubscriptionSettings() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);

  const currentPlan = (profile?.plan || 'basic') as SubscriptionPlan;
  const hasActiveSubscription = profile?.subscription_status === 'active';

  const handleUpgrade = async (plan: SubscriptionPlan) => {
    if (!profile?.account_id || !profile?.id) {
      toast.error('Unable to start checkout. Please refresh and try again.');
      return;
    }

    try {
      setLoading(plan);
      const url = await createCheckoutSession(profile.account_id, plan, profile.id);
      window.location.href = url;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to start checkout');
      setLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    if (!profile?.account_id) {
      toast.error('Unable to open billing portal. Please refresh and try again.');
      return;
    }

    try {
      setLoading('portal');
      const url = await createPortalSession(profile.account_id);
      window.location.href = url;
    } catch (error) {
      console.error('Error creating portal session:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to open billing portal');
      setLoading(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Current Plan Status */}
      <Card className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border-white/10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold mb-2" style={{ fontFamily: 'Work Sans, sans-serif' }}>
              Current Plan
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                {PLAN_INFO[currentPlan].name}
              </span>
              <Badge variant={currentPlan === 'basic' ? 'secondary' : 'default'}>
                {PLAN_INFO[currentPlan].priceLabel}
              </Badge>
            </div>
            {hasActiveSubscription && (
              <p className="text-white/60 text-sm mt-2" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                Status: Active
              </p>
            )}
          </div>
          {hasActiveSubscription && (
            <Button
              onClick={handleManageSubscription}
              disabled={loading !== null}
              variant="outline"
            >
              {loading === 'portal' ? 'Loading...' : 'Manage Subscription'}
            </Button>
          )}
        </div>
      </Card>

      {/* Available Plans */}
      <div>
        <h3 className="text-2xl mb-4" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
          Available Plans
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(Object.keys(PLAN_INFO) as SubscriptionPlan[]).map((plan) => {
            const info = PLAN_INFO[plan];
            const isCurrent = plan === currentPlan;
            const isDowngrade = getPlanLevel(plan) < getPlanLevel(currentPlan);

            return (
              <Card
                key={plan}
                className={`relative bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border-white/10 p-6 ${
                  info.recommended ? 'ring-2 ring-blue-500' : ''
                }`}
              >
                {info.recommended && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500">
                    Recommended
                  </Badge>
                )}

                <div className="text-center mb-6">
                  <h4 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                    {info.name}
                  </h4>
                  <div className="text-4xl font-bold mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                    {plan === 'basic' ? (
                      'FREE'
                    ) : (
                      <>
                        ${info.price}
                        <span className="text-lg text-white/60">/mo</span>
                      </>
                    )}
                  </div>
                  <p className="text-white/60 text-sm" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                    Up to {info.maxUnits === 999999 ? 'unlimited' : info.maxUnits} units
                  </p>
                </div>

                <ul className="space-y-3 mb-6">
                  {info.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      <CheckIcon className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-white/80">{feature}</span>
                    </li>
                  ))}
                </ul>

                {plan === 'basic' ? (
                  <Button
                    className="w-full"
                    variant={isCurrent ? 'secondary' : 'outline'}
                    disabled
                  >
                    {isCurrent ? 'Current Plan' : 'Free Plan'}
                  </Button>
                ) : isCurrent ? (
                  <Button className="w-full" variant="secondary" disabled>
                    Current Plan
                  </Button>
                ) : isDowngrade ? (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={handleManageSubscription}
                    disabled={loading !== null}
                  >
                    {loading === 'portal' ? 'Loading...' : 'Downgrade via Portal'}
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => handleUpgrade(plan)}
                    disabled={loading !== null}
                  >
                    {loading === plan ? 'Loading...' : 'Upgrade Now'}
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* Additional Info */}
      <Card className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border-white/10 p-6">
        <h4 className="font-semibold mb-2" style={{ fontFamily: 'Work Sans, sans-serif' }}>
          Billing Information
        </h4>
        <ul className="text-sm text-white/70 space-y-1" style={{ fontFamily: 'Work Sans, sans-serif' }}>
          <li>• All plans are billed monthly</li>
          <li>• You can upgrade or downgrade at any time</li>
          <li>• Changes take effect at the start of your next billing cycle</li>
          <li>• Cancel anytime with no cancellation fees</li>
        </ul>
      </Card>
    </div>
  );
}

function getPlanLevel(plan: SubscriptionPlan): number {
  return { basic: 0, pro: 1, premium: 2 }[plan];
}
