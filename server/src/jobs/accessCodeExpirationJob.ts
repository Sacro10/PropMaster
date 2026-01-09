/**
 * Access Code Expiration Job
 * 
 * Expires access codes for completed showings
 * Runs every 5 minutes to clean up expired codes
 */

import { expireOldAccessCodes } from '../services/showingsService';

export async function runAccessCodeExpirationJob(): Promise<void> {
  try {
    console.log('[AccessCodeExpiration] Starting access code expiration job...');
    
    const expiredCount = await expireOldAccessCodes();
    
    if (expiredCount > 0) {
      console.log(`[AccessCodeExpiration] Expired ${expiredCount} access code(s)`);
    } else {
      console.log('[AccessCodeExpiration] No access codes to expire');
    }
  } catch (error) {
    console.error('[AccessCodeExpiration] Error expiring access codes:', error);
    throw error;
  }
}

// Export job configuration
export const accessCodeExpirationJob = {
  name: 'access-code-expiration',
  interval: 5 * 60 * 1000, // 5 minutes
  handler: runAccessCodeExpirationJob,
  enabled: true,
};
