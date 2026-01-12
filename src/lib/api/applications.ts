/**
 * Applications API
 * Data access layer for rental applications
 */

import { supabase } from '../supabaseClient';
import { getCurrentAccountId, handleSupabaseError } from './client';

export interface CreateApplicationData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  unitId: string;
  moveInDate: string;
  monthlyIncome: number;
  currentEmployer: string;
  currentAddress: string;
  creditScore?: number | null;
  backgroundCheckStatus?: string;
  incomeVerificationStatus?: string;
  evictionHistory?: boolean | null;
  criminalHistory?: boolean | null;
}

/**
 * Create a new rental application
 */
export async function createApplication(data: CreateApplicationData) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    const screeningInputs = {
      creditScore: data.creditScore ?? null,
      backgroundCheckStatus: data.backgroundCheckStatus || null,
      incomeVerificationStatus: data.incomeVerificationStatus || null,
      evictionHistory: data.evictionHistory ?? null,
      criminalHistory: data.criminalHistory ?? null,
    };
    const applicationData = {
      ...screeningInputs,
      firstName: data.firstName,
      lastName: data.lastName,
      currentEmployer: data.currentEmployer,
      currentAddress: data.currentAddress,
    };
    const fullName = [data.firstName, data.lastName].filter(Boolean).join(' ').trim();

    // Get unit's property_id
    const { data: unit, error: unitError } = await supabase
      .from('units')
      .select('property_id')
      .eq('id', data.unitId)
      .single();

    if (unitError) {
      throw handleSupabaseError(unitError, 'fetch unit');
    }

    const { data: application, error } = await supabase
      .from('rental_applications')
      .insert({
        account_id: accountId,
        unit_id: data.unitId,
        property_id: unit.property_id,
        full_name: fullName,
        email: data.email,
        phone: data.phone,
        desired_move_in_date: data.moveInDate,
        monthly_income: data.monthlyIncome,
        employer: data.currentEmployer,
        application_data: applicationData,
        status: 'submitted',
      })
      .select()
      .single();

    if (error) {
      throw handleSupabaseError(error, 'create application');
    }

    return application;
  } catch (error) {
    console.error('[Applications API] Error creating application:', error);
    throw error;
  }
}

/**
 * Run screening for an application
 */
export async function runScreening(applicationId: string) {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      throw new Error('No account ID found');
    }

    // Call the backend API to run screening
    const response = await fetch(`/api/applications/${applicationId}/screen`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to run screening');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[Applications API] Error running screening:', error);
    throw error;
  }
}
