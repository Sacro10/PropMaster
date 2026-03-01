/**
 * UpgradeCTA Component
 *
 * Displays an upgrade call-to-action when a user tries to access
 * a feature that requires a higher plan tier. Can be shown inline,
 * as a modal, or as a blur overlay on locked features.
 */

import React from 'react';
import { Lock, Zap, Check, ArrowRight } from 'lucide-react';
import {
  getPlanDetails,
  getRequiredPlan,
  type FeatureKey,
  type PlanTier,
  PLAN_DETAILS,
} from '../../lib/planGating';
import { useThemeContext } from '../context/ThemeContext';

// =====================================================
// TYPES
// =====================================================

interface UpgradeCTAProps {
  /** The feature that is locked (optional - used to determine required plan) */
  feature?: FeatureKey;
  /** The minimum plan tier required (optional - overrides feature lookup) */
  requiredPlan?: PlanTier;
  /** Display variant */
  variant?: 'inline' | 'modal' | 'overlay' | 'banner';
  /** Custom title */
  title?: string;
  /** Custom message */
  message?: string;
  /** Callback when upgrade is clicked */
  onUpgrade?: () => void;
  /** Additional CSS classes */
  className?: string;
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function UpgradeCTA({
  feature,
  requiredPlan,
  variant = 'inline',
  title,
  message,
  onUpgrade,
  className = '',
}: UpgradeCTAProps) {
  // Determine the required plan
  const plan = requiredPlan || (feature ? getRequiredPlan(feature) : 'pro');
  const planDetails = getPlanDetails(plan);

  // Default messages
  const defaultTitle = `Upgrade to ${planDetails.displayName}`;
  const defaultMessage = `This feature requires the ${planDetails.displayName} plan.`;

  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade();
    } else {
      window.location.href = `/app/billing?plan=${plan}&checkout=1`;
    }
  };

  // Render different variants
  switch (variant) {
    case 'overlay':
      return <OverlayVariant {...{ plan, planDetails, title: title || defaultTitle, message: message || defaultMessage, onUpgrade: handleUpgrade, className }} />;
    case 'modal':
      return <ModalVariant {...{ plan, planDetails, title: title || defaultTitle, message: message || defaultMessage, onUpgrade: handleUpgrade, className }} />;
    case 'banner':
      return <BannerVariant {...{ plan, planDetails, title: title || defaultTitle, message: message || defaultMessage, onUpgrade: handleUpgrade, className }} />;
    case 'inline':
    default:
      return <InlineVariant {...{ plan, planDetails, title: title || defaultTitle, message: message || defaultMessage, onUpgrade: handleUpgrade, className }} />;
  }
}

// =====================================================
// VARIANT COMPONENTS
// =====================================================

interface VariantProps {
  plan: PlanTier;
  planDetails: typeof PLAN_DETAILS[PlanTier];
  title: string;
  message: string;
  onUpgrade: () => void;
  className: string;
}

function InlineVariant({ planDetails, title, message, onUpgrade, className }: VariantProps) {
  const { theme } = useThemeContext();
  const isDark = theme === 'dark';

  return (
    <div className={`bg-gradient-to-r ${isDark ? 'from-blue-900/20 to-indigo-900/20 border-blue-800' : 'from-blue-50 to-indigo-50 border-blue-200'} border rounded-lg p-6 ${className}`}>
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
            <Lock className="w-6 h-6 text-white" />
          </div>
        </div>
        <div className="flex-1">
          <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'} mb-1`}>
            {title}
          </h3>
          <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'} mb-4`}>
            {message}
          </p>
          <div className="space-y-2 mb-4">
            {planDetails.features.slice(0, 4).map((feature, index) => (
              <div key={index} className={`flex items-center gap-2 text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span>{feature}</span>
              </div>
            ))}
          </div>
          <button
            onClick={onUpgrade}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
          >
            <Zap className="w-4 h-4" />
            Upgrade to {planDetails.displayName} - ${planDetails.price}/mo
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function OverlayVariant({ planDetails, title, message, onUpgrade, className }: VariantProps) {
  const { theme } = useThemeContext();
  const isDark = theme === 'dark';

  return (
    <div className={`relative ${className}`}>
      {/* Blurred background */}
      <div className={`absolute inset-0 ${isDark ? 'bg-gray-900/80' : 'bg-white/80'} backdrop-blur-sm z-10 rounded-lg flex items-center justify-center`}>
        <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-xl shadow-2xl p-8 max-w-md mx-4 border`}>
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center mb-4">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-2`}>
              {title}
            </h3>
            <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'} mb-6`}>
              {message}
            </p>
            <div className="w-full space-y-2 mb-6 text-left">
              {planDetails.features.slice(0, 3).map((feature, index) => (
                <div key={index} className={`flex items-center gap-2 text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
            <button
              onClick={onUpgrade}
              className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-6 py-3 rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl"
            >
              <Zap className="w-5 h-5" />
              Upgrade to {planDetails.displayName}
              <ArrowRight className="w-5 h-5" />
            </button>
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-3`}>
              ${planDetails.price}/month
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalVariant({ planDetails, title, message, onUpgrade, className }: VariantProps) {
  const { theme } = useThemeContext();
  const isDark = theme === 'dark';

  return (
    <div className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 ${className}`}>
      <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto`}>
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6 rounded-t-2xl">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">
                {title}
              </h2>
              <p className="text-blue-100 text-sm">
                Unlock premium features
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          <p className={`${isDark ? 'text-gray-300' : 'text-gray-600'} mb-6 text-lg`}>
            {message}
          </p>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {planDetails.features.map((feature, index) => (
              <div
                key={index}
                className={`flex items-start gap-3 ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'} rounded-lg p-4`}
              >
                <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span className={`${isDark ? 'text-gray-300' : 'text-gray-700'} text-sm`}>
                  {feature}
                </span>
              </div>
            ))}
          </div>

          {/* Pricing */}
          <div className={`bg-gradient-to-r ${isDark ? 'from-blue-900/20 to-indigo-900/20 border-blue-800' : 'from-blue-50 to-indigo-50 border-blue-200'} border rounded-xl p-6 mb-6`}>
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>
                  {planDetails.displayName} Plan
                </div>
                <div className={`text-4xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  ${planDetails.price}
                  <span className={`text-lg font-normal ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    /month
                  </span>
                </div>
              </div>
              <Zap className="w-12 h-12 text-blue-600" />
            </div>
          </div>

          {/* Actions */}
          <button
            onClick={onUpgrade}
            className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-6 py-4 rounded-xl font-semibold text-lg transition-all shadow-lg hover:shadow-xl"
          >
            <Zap className="w-5 h-5" />
            Upgrade Now
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function BannerVariant({ planDetails, title, message, onUpgrade, className }: VariantProps) {
  return (
    <div className={`bg-gradient-to-r from-blue-600 to-indigo-600 text-white ${className}`}>
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Lock className="w-6 h-6 flex-shrink-0" />
            <div>
              <p className="font-semibold">{title}</p>
              <p className="text-sm text-blue-100">{message}</p>
            </div>
          </div>
          <button
            onClick={onUpgrade}
            className="inline-flex items-center gap-2 bg-white text-blue-600 hover:bg-blue-50 px-5 py-2 rounded-lg font-medium transition-colors flex-shrink-0"
          >
            <Zap className="w-4 h-4" />
            Upgrade - ${planDetails.price}/mo
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// FEATURE GATE WRAPPER COMPONENT
// =====================================================

interface FeatureGateProps {
  /** The feature required to view children */
  feature?: FeatureKey;
  /** The plan required to view children */
  requiredPlan?: PlanTier;
  /** Check function result (from useFeatureGate or usePlanGate hook) */
  hasAccess?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Content to show when access is granted */
  children: React.ReactNode;
  /** Variant for the upgrade CTA */
  variant?: 'inline' | 'modal' | 'overlay' | 'banner';
  /** Custom fallback instead of UpgradeCTA */
  fallback?: React.ReactNode;
  /** Show loading skeleton while checking access */
  showLoadingSkeleton?: boolean;
}

/**
 * FeatureGate component that wraps content and shows an UpgradeCTA
 * when the user doesn't have access.
 */
export function FeatureGate({
  feature,
  requiredPlan,
  hasAccess = false,
  loading = false,
  children,
  variant = 'inline',
  fallback,
  showLoadingSkeleton = false,
}: FeatureGateProps) {
  const { theme } = useThemeContext();
  const isDark = theme === 'dark';

  if (loading && showLoadingSkeleton) {
    return (
      <div className="animate-pulse space-y-4">
        <div className={`h-4 ${isDark ? 'bg-gray-700' : 'bg-gray-200'} rounded w-3/4`}></div>
        <div className={`h-4 ${isDark ? 'bg-gray-700' : 'bg-gray-200'} rounded w-1/2`}></div>
      </div>
    );
  }

  if (loading) {
    return null;
  }

  if (hasAccess) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <UpgradeCTA
      feature={feature}
      requiredPlan={requiredPlan}
      variant={variant}
    />
  );
}

// =====================================================
// LOCKED FEATURE CARD
// =====================================================

interface LockedFeatureCardProps {
  /** Feature name */
  name: string;
  /** Feature description */
  description: string;
  /** Icon component */
  icon: React.ReactNode;
  /** Required feature key */
  feature?: FeatureKey;
  /** Required plan */
  requiredPlan?: PlanTier;
  /** Click handler for upgrade */
  onUpgrade?: () => void;
  /** Additional classes */
  className?: string;
}

/**
 * A card component showing a locked feature with upgrade CTA
 */
export function LockedFeatureCard({
  name,
  description,
  icon,
  feature,
  requiredPlan,
  onUpgrade,
  className = '',
}: LockedFeatureCardProps) {
  const plan = requiredPlan || (feature ? getRequiredPlan(feature) : 'pro');
  const planDetails = getPlanDetails(plan);
  const { theme } = useThemeContext();
  const isDark = theme === 'dark';

  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade();
    } else {
      window.location.href = `/app/billing?plan=${plan}&checkout=1`;
    }
  };

  return (
    <div className={`relative ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-6 overflow-hidden ${className}`}>
      {/* Lock overlay */}
      <div className="absolute top-3 right-3">
        <div className="bg-blue-600 text-white rounded-full p-2">
          <Lock className="w-4 h-4" />
        </div>
      </div>

      {/* Content (slightly faded) */}
      <div className="opacity-60 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="text-gray-400">{icon}</div>
          <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {name}
          </h3>
        </div>
        <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'} text-sm`}>
          {description}
        </p>
      </div>

      {/* CTA */}
      <button
        onClick={handleUpgrade}
        className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
      >
        <Zap className="w-4 h-4" />
        Upgrade to {planDetails.displayName}
      </button>
    </div>
  );
}
