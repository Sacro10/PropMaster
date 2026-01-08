/**
 * Date formatting and manipulation utilities
 */

import { formatDistanceToNow, format, isToday, isYesterday, differenceInDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths } from 'date-fns';

/**
 * Format a date as a relative time string (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: string | Date): string {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return formatDistanceToNow(dateObj, { addSuffix: true });
  } catch (error) {
    console.error('[dateHelpers] Error formatting relative time:', error);
    return 'Unknown';
  }
}

/**
 * Format a date in a standard display format
 */
export function formatDisplayDate(date: string | Date, formatString: string = 'MMM d, yyyy'): string {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return format(dateObj, formatString);
  } catch (error) {
    console.error('[dateHelpers] Error formatting date:', error);
    return 'Invalid date';
  }
}

/**
 * Format a date with time
 */
export function formatDateTime(date: string | Date): string {
  return formatDisplayDate(date, 'MMM d, yyyy h:mm a');
}

/**
 * Get a friendly date string (Today, Yesterday, or date)
 */
export function formatFriendlyDate(date: string | Date): string {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;

    if (isToday(dateObj)) {
      return `Today, ${format(dateObj, 'h:mm a')}`;
    }

    if (isYesterday(dateObj)) {
      return `Yesterday, ${format(dateObj, 'h:mm a')}`;
    }

    return formatDisplayDate(dateObj, 'MMM d, yyyy');
  } catch (error) {
    console.error('[dateHelpers] Error formatting friendly date:', error);
    return 'Invalid date';
  }
}

/**
 * Calculate days between two dates
 */
export function daysBetween(date1: string | Date, date2: string | Date): number {
  try {
    const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
    const d2 = typeof date2 === 'string' ? new Date(date2) : date2;
    return differenceInDays(d1, d2);
  } catch (error) {
    console.error('[dateHelpers] Error calculating days between:', error);
    return 0;
  }
}

/**
 * Get the start of the current month
 */
export function getStartOfMonth(date: Date = new Date()): Date {
  return startOfMonth(date);
}

/**
 * Get the end of the current month
 */
export function getEndOfMonth(date: Date = new Date()): Date {
  return endOfMonth(date);
}

/**
 * Get the start of the current week
 */
export function getStartOfWeek(date: Date = new Date()): Date {
  return startOfWeek(date);
}

/**
 * Get the end of the current week
 */
export function getEndOfWeek(date: Date = new Date()): Date {
  return endOfWeek(date);
}

/**
 * Get date range for previous month
 */
export function getPreviousMonthRange(date: Date = new Date()): { start: Date; end: Date } {
  const previousMonth = subMonths(date, 1);
  return {
    start: startOfMonth(previousMonth),
    end: endOfMonth(previousMonth),
  };
}

/**
 * Get date range for current month
 */
export function getCurrentMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  return {
    start: startOfMonth(now),
    end: endOfMonth(now),
  };
}

/**
 * Check if a date is in the future
 */
export function isFutureDate(date: string | Date): boolean {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj > new Date();
  } catch (error) {
    return false;
  }
}

/**
 * Check if a date is overdue (past today)
 */
export function isOverdue(date: string | Date): boolean {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dateObj < today;
  } catch (error) {
    return false;
  }
}
