/**
 * Currency formatting utilities
 */

/**
 * Format a number as USD currency
 */
export function formatCurrency(amount: number | null | undefined, options: Intl.NumberFormatOptions = {}): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '$0';
  }

  const defaultOptions: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    ...options,
  };

  try {
    return new Intl.NumberFormat('en-US', defaultOptions).format(amount);
  } catch (error) {
    console.error('[currencyHelpers] Error formatting currency:', error);
    return `$${amount.toFixed(0)}`;
  }
}

/**
 * Format a number as USD currency with cents
 */
export function formatCurrencyWithCents(amount: number | null | undefined): string {
  return formatCurrency(amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Format currency in thousands (e.g., $284K)
 */
export function formatCurrencyCompact(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '$0';
  }

  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }

  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}K`;
  }

  return formatCurrency(amount);
}

/**
 * Format a number as a percentage
 */
export function formatPercentage(value: number | null | undefined, decimals: number = 1): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0%';
  }

  return `${value.toFixed(decimals)}%`;
}

/**
 * Format a percentage with sign (e.g., +8.2% or -3.5%)
 */
export function formatPercentageChange(value: number | null | undefined, decimals: number = 1): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0%';
  }

  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Format a large number with commas
 */
export function formatNumber(value: number | null | undefined, decimals: number = 0): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0';
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format a number compactly (1K, 1M, etc.)
 */
export function formatNumberCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0';
  }

  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }

  return value.toString();
}
