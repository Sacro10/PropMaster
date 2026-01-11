/**
 * Vendors API
 * Data access layer for vendor management
 */

import { supabase } from '../supabaseClient';
import { getCurrentAccountId } from './client';

export interface CreateVendorData {
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  license_number?: string;
  insurance_policy_number?: string;
  insurance_expiry?: string;
  services: string[]; // Service categories like 'hvac', 'plumbing', etc.
}

/**
 * Create a new vendor profile
 */
export async function createVendor(data: CreateVendorData): Promise<{ success: boolean; error?: any }> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      return { success: false, error: { message: 'No account ID found' } };
    }

    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return { success: false, error: { message: 'Not authenticated' } };
    }

    const category = data.services?.[0] || 'general';
    const payloads: Array<Record<string, any>> = [
      {
        account_id: accountId,
        user_id: user.id,
        business_name: data.business_name,
        contact_name: data.contact_name,
        phone: data.phone,
        email: data.email,
        address1: data.address1,
        address2: data.address2 || null,
        city: data.city,
        state: data.state,
        zip: data.zip,
        license_number: data.license_number || null,
        insurance_policy_number: data.insurance_policy_number || null,
        insurance_expiry: data.insurance_expiry || null,
        is_active: true,
      },
      {
        account_id: accountId,
        user_id: user.id,
        business_name: data.business_name,
        phone: data.phone,
        email: data.email,
        address1: data.address1,
        address2: data.address2 || null,
        city: data.city,
        state: data.state,
        zip: data.zip,
        license_number: data.license_number || null,
        insurance_policy_number: data.insurance_policy_number || null,
        insurance_expiry: data.insurance_expiry || null,
        is_active: true,
      },
      {
        account_id: accountId,
        user_id: user.id,
        business_name: data.business_name,
        contact_name: data.contact_name,
        phone: data.phone,
        email: data.email,
        is_active: true,
      },
      {
        account_id: accountId,
        user_id: user.id,
        business_name: data.business_name,
        phone: data.phone,
        email: data.email,
        is_active: true,
      },
      {
        account_id: accountId,
        business_name: data.business_name,
        contact_name: data.contact_name,
        phone: data.phone,
        email: data.email,
        is_active: true,
      },
      {
        account_id: accountId,
        business_name: data.business_name,
        phone: data.phone,
        email: data.email,
        is_active: true,
      },
      {
        account_id: accountId,
        company_name: data.business_name,
        contact_name: data.contact_name,
        phone: data.phone,
        email: data.email,
        category,
        is_active: true,
      },
      {
        account_id: accountId,
        company_name: data.business_name,
        phone: data.phone,
        email: data.email,
        category,
        is_active: true,
      },
    ];

    let lastError: any = null;
    for (const payload of payloads) {
      // @ts-ignore - vendor_profiles table not in generated types
      const { data: vendorProfile, error: vendorError } = await supabase
        .from('vendor_profiles')
        .insert(payload)
        .select()
        .single();

      if (!vendorError && vendorProfile) {
        return await insertVendorServices(accountId, vendorProfile.id, data.services);
      }

      if (
        vendorError?.code === '42703' ||
        vendorError?.code === 'PGRST204' ||
        vendorError?.message?.includes('schema cache') ||
        vendorError?.message?.includes('Could not find the') ||
        vendorError?.message?.includes('contact_name')
      ) {
        lastError = vendorError;
        continue;
      }

      if (vendorError?.code === '23505') {
        return { success: false, error: { message: 'A vendor profile already exists for this user.' } };
      }

      if (vendorError) {
        console.error('[createVendor] Error creating vendor profile:', vendorError);
        return { success: false, error: normalizeSupabaseError(vendorError) };
      }
    }

    console.error('[createVendor] Error creating vendor profile:', lastError);
    return { success: false, error: normalizeSupabaseError(lastError) };
  } catch (error) {
    console.error('[createVendor] Unexpected error:', error);
    return { success: false, error: normalizeSupabaseError(error) };
  }
}

async function insertVendorServices(accountId: string, vendorProfileId: string, services: string[]) {
  if (services && services.length > 0) {
    const vendorServices = services.map(service => ({
      account_id: accountId,
      vendor_profile_id: vendorProfileId,
      service_type: service,
    }));

    // @ts-ignore - vendor_services table not in generated types
    const { error: servicesError } = await supabase
      .from('vendor_services')
      .insert(vendorServices);

    if (servicesError?.code === '42703') {
      const legacyServices = services.map(service => ({
        account_id: accountId,
        vendor_id: vendorProfileId,
        service_type: service,
      }));

      // @ts-ignore - vendor_services table not in generated types
      const { error: fallbackError } = await supabase
        .from('vendor_services')
        .insert(legacyServices);

      if (fallbackError) {
        console.error('[createVendor] Error creating vendor services:', fallbackError);
        return { success: false, error: normalizeSupabaseError(fallbackError) };
      }
    } else if (servicesError) {
      console.error('[createVendor] Error creating vendor services:', servicesError);
      // Don't fail the entire operation if services fail
    }
  }

  return { success: true };
}

function normalizeSupabaseError(error: any) {
  if (!error) {
    return { message: 'Unknown error' };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  if (error?.message) {
    return { message: error.message, details: error.details, code: error.code, hint: error.hint };
  }

  return { message: 'Unexpected error', details: error };
}
