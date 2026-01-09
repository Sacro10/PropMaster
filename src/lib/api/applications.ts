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
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email,
        phone: data.phone,
        move_in_date: data.moveInDate,
        monthly_income: data.monthlyIncome,
        current_employer: data.currentEmployer,
        current_address: data.currentAddress,
        status: 'pending',
        applied_at: new Date().toISOString(),
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
