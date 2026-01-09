import { supabaseAdmin as supabase } from '../supabase';
import { logActivityEvent } from './activityService';

export interface RentalApplication {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  unitId: string;
  propertyId: string;
  status: string;
  moveInDate: string;
  monthlyIncome: number;
  currentEmployer: string;
  currentAddress: string;
  hasScreeningResult: boolean;
  createdAt: string;
  unit?: {
    unitNumber: string;
    rentAmount: number;
  };
  property?: {
    name: string;
    address: string;
  };
  screeningResult?: ScreeningResult;
}

export interface ScreeningResult {
  id: string;
  applicationId: string;
  provider: string;
  creditScore: number | null;
  backgroundCheckStatus: string | null;
  evictionHistory: boolean;
  criminalHistory: boolean;
  incomeVerificationStatus: string | null;
  riskScore: number | null;
  riskFactors: string[];
  recommendations: string | null;
  screenedAt: string;
}

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
 * Get rental applications with filtering
 */
export async function getApplications(
  accountId: string,
  filters?: {
    status?: string;
    unitId?: string;
    propertyId?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ applications: RentalApplication[]; total: number }> {
  const { status, unitId, propertyId, limit = 50, offset = 0 } = filters || {};

  let query = supabase
    .from('rental_applications')
    .select(
      `
      *,
      unit:units!inner(unit_number, rent_amount),
      property:properties!inner(name, address),
      screening_results(*)
    `,
      { count: 'exact' }
    )
    .eq('account_id', accountId);

  if (status) query = query.eq('status', status);
  if (unitId) query = query.eq('unit_id', unitId);
  if (propertyId) query = query.eq('property_id', propertyId);

  query = query.order('created_at', { ascending: false });
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  const applications: RentalApplication[] =
    data?.map((app: any) => ({
      id: app.id,
      firstName: app.first_name,
      lastName: app.last_name,
      email: app.email,
      phone: app.phone,
      unitId: app.unit_id,
      propertyId: app.property_id,
      status: app.status,
      moveInDate: app.move_in_date,
      monthlyIncome: Number(app.monthly_income),
      currentEmployer: app.current_employer,
      currentAddress: app.current_address,
      hasScreeningResult: app.screening_results && app.screening_results.length > 0,
      createdAt: app.created_at,
      unit: app.unit
        ? {
            unitNumber: app.unit.unit_number,
            rentAmount: Number(app.unit.rent_amount),
          }
        : undefined,
      property: app.property
        ? { name: app.property.name, address: app.property.address }
        : undefined,
      screeningResult:
        app.screening_results && app.screening_results.length > 0
          ? {
              id: app.screening_results[0].id,
              applicationId: app.screening_results[0].application_id,
              provider: app.screening_results[0].provider,
              creditScore: app.screening_results[0].credit_score,
              backgroundCheckStatus: app.screening_results[0].background_check_status,
              evictionHistory: app.screening_results[0].eviction_history,
              criminalHistory: app.screening_results[0].criminal_history,
              incomeVerificationStatus:
                app.screening_results[0].income_verification_status,
              riskScore: app.screening_results[0].risk_score,
              riskFactors: app.screening_results[0].risk_factors || [],
              recommendations: app.screening_results[0].recommendations,
              screenedAt: app.screening_results[0].screened_at,
            }
          : undefined,
    })) || [];

  return { applications, total: count || 0 };
}

/**
 * Get single application by ID
 */
export async function getApplicationById(
  accountId: string,
  applicationId: string
): Promise<RentalApplication | null> {
  const { data, error } = await supabase
    .from('rental_applications')
    .select(
      `
      *,
      unit:units!inner(unit_number, rent_amount),
      property:properties!inner(name, address),
      screening_results(*)
    `
    )
    .eq('account_id', accountId)
    .eq('id', applicationId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return {
    id: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    email: data.email,
    phone: data.phone,
    unitId: data.unit_id,
    propertyId: data.property_id,
    status: data.status,
    moveInDate: data.move_in_date,
    monthlyIncome: Number(data.monthly_income),
    currentEmployer: data.current_employer,
    currentAddress: data.current_address,
    hasScreeningResult: data.screening_results && data.screening_results.length > 0,
    createdAt: data.created_at,
    unit: data.unit
      ? {
          unitNumber: data.unit.unit_number,
          rentAmount: Number(data.unit.rent_amount),
        }
      : undefined,
    property: data.property
      ? { name: data.property.name, address: data.property.address }
      : undefined,
    screeningResult:
      data.screening_results && data.screening_results.length > 0
        ? {
            id: data.screening_results[0].id,
            applicationId: data.screening_results[0].application_id,
            provider: data.screening_results[0].provider,
            creditScore: data.screening_results[0].credit_score,
            backgroundCheckStatus: data.screening_results[0].background_check_status,
            evictionHistory: data.screening_results[0].eviction_history,
            criminalHistory: data.screening_results[0].criminal_history,
            incomeVerificationStatus: data.screening_results[0].income_verification_status,
            riskScore: data.screening_results[0].risk_score,
            riskFactors: data.screening_results[0].risk_factors || [],
            recommendations: data.screening_results[0].recommendations,
            screenedAt: data.screening_results[0].screened_at,
          }
        : undefined,
  };
}

/**
 * Create a new rental application
 */
export async function createApplication(
  accountId: string,
  applicationData: CreateApplicationData
): Promise<RentalApplication> {
  // Verify unit belongs to account
  const { data: unit, error: unitError } = await supabase
    .from('units')
    .select('property_id')
    .eq('id', applicationData.unitId)
    .single();

  if (unitError || !unit) {
    throw new Error('Unit not found');
  }

  const { data: property, error: propertyError } = await supabase
    .from('properties')
    .select('id')
    .eq('id', unit.property_id)
    .eq('account_id', accountId)
    .single();

  if (propertyError || !property) {
    throw new Error('Unit does not belong to your account');
  }

  const { data, error } = await supabase
    .from('rental_applications')
    .insert({
      account_id: accountId,
      unit_id: applicationData.unitId,
      property_id: unit.property_id,
      first_name: applicationData.firstName,
      last_name: applicationData.lastName,
      email: applicationData.email,
      phone: applicationData.phone,
      move_in_date: applicationData.moveInDate,
      monthly_income: applicationData.monthlyIncome,
      current_employer: applicationData.currentEmployer,
      current_address: applicationData.currentAddress,
      status: 'pending',
    })
    .select(
      `
      *,
      unit:units!inner(unit_number, rent_amount),
      property:properties!inner(name, address)
    `
    )
    .single();

  if (error) throw error;

  await logActivityEvent(
    accountId,
    null,
    'application_submitted',
    `New rental application from ${applicationData.firstName} ${applicationData.lastName}`,
    {
      entityType: 'rental_application',
      entityId: data.id,
    }
  );

  return {
    id: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    email: data.email,
    phone: data.phone,
    unitId: data.unit_id,
    propertyId: data.property_id,
    status: data.status,
    moveInDate: data.move_in_date,
    monthlyIncome: Number(data.monthly_income),
    currentEmployer: data.current_employer,
    currentAddress: data.current_address,
    hasScreeningResult: false,
    createdAt: data.created_at,
    unit: data.unit
      ? {
          unitNumber: data.unit.unit_number,
          rentAmount: Number(data.unit.rent_amount),
        }
      : undefined,
    property: data.property
      ? { name: data.property.name, address: data.property.address }
      : undefined,
  };
}

/**
 * Approve an application - Creates tenant profile, lease, and assigns unit
 */
export async function approveApplication(
  accountId: string,
  userId: string,
  applicationId: string
): Promise<RentalApplication> {
  // 1. Get application details
  const application = await getApplicationById(accountId, applicationId);
  if (!application) {
    throw new Error('Application not found');
  }

  if (application.status !== 'pending') {
    throw new Error(`Application is already ${application.status}`);
  }

  // 2. Check if unit is available (not already occupied)
  const { data: unit, error: unitError } = await supabase
    .from('units')
    .select('id, status, property_id, rent_amount')
    .eq('id', application.unitId)
    .eq('account_id', accountId)
    .single();

  if (unitError || !unit) {
    throw new Error('Unit not found');
  }

  // Check for active leases on this unit
  const { data: existingLeases } = await supabase
    .from('leases')
    .select('id, status')
    .eq('unit_id', application.unitId)
    .eq('account_id', accountId)
    .in('status', ['active', 'pending']);

  if (existingLeases && existingLeases.length > 0) {
    throw new Error('Unit is already occupied or has a pending lease');
  }

  // 3. Create or get tenant profile for the applicant
  // Check if tenant profile already exists
  const { data: existingProfile } = await supabase
    .from('tenant_profiles')
    .select('id, user_id')
    .eq('account_id', accountId)
    .eq('email', application.email)
    .maybeSingle();

  let tenantUserId: string;

  if (existingProfile) {
    tenantUserId = existingProfile.user_id;
  } else {
    // In production, this would create a new auth user and send invitation
    // For now, we'll use the approver's user ID as a placeholder
    tenantUserId = userId;

    // Create tenant profile
    const { error: profileError } = await supabase
      .from('tenant_profiles')
      .insert({
        account_id: accountId,
        user_id: tenantUserId,
        full_name: `${application.firstName} ${application.lastName}`,
        phone: application.phone,
        email: application.email,
        employer: application.currentEmployer,
        monthly_income: application.monthlyIncome,
        move_in_date: application.moveInDate,
        background_check_status: application.screeningResult?.backgroundCheckStatus || 'pending',
        credit_score: application.screeningResult?.creditScore,
        ai_risk_score: application.screeningResult?.riskScore,
      });

    if (profileError) throw profileError;
  }

  // 4. Create lease
  const leaseStart = new Date(application.moveInDate);
  const leaseEnd = new Date(leaseStart);
  leaseEnd.setFullYear(leaseEnd.getFullYear() + 1); // 1 year lease

  const { data: lease, error: leaseError } = await supabase
    .from('leases')
    .insert({
      account_id: accountId,
      unit_id: application.unitId,
      tenant_user_id: tenantUserId,
      lease_start: leaseStart.toISOString().split('T')[0],
      lease_end: leaseEnd.toISOString().split('T')[0],
      rent: unit.rent_amount,
      deposit: unit.rent_amount, // Default: 1 month deposit
      status: 'active',
      move_in_date: application.moveInDate,
    })
    .select()
    .single();

  if (leaseError) throw leaseError;

  // 5. Update unit status to occupied
  const { error: unitUpdateError } = await supabase
    .from('units')
    .update({ status: 'occupied' })
    .eq('id', application.unitId)
    .eq('account_id', accountId);

  if (unitUpdateError) throw unitUpdateError;

  // 6. Update application status
  const { data, error } = await supabase
    .from('rental_applications')
    .update({ status: 'approved' })
    .eq('id', applicationId)
    .eq('account_id', accountId)
    .select(
      `
      *,
      unit:units!inner(unit_number, rent_amount),
      property:properties!inner(name, address)
    `
    )
    .single();

  if (error) throw error;

  // 7. Log activity events
  await logActivityEvent(
    accountId,
    userId,
    'application_approved',
    `Approved application for ${application.firstName} ${application.lastName}`,
    {
      entityType: 'rental_application',
      entityId: applicationId,
    }
  );

  await logActivityEvent(
    accountId,
    userId,
    'lease_created',
    `New lease signed: ${application.firstName} ${application.lastName} - ${application.unit?.unitNumber || 'Unit'}`,
    {
      entityType: 'lease',
      entityId: lease.id,
      metadata: {
        unit_id: application.unitId,
        tenant_name: `${application.firstName} ${application.lastName}`,
      },
    }
  );

  return {
    id: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    email: data.email,
    phone: data.phone,
    unitId: data.unit_id,
    propertyId: data.property_id,
    status: data.status,
    moveInDate: data.move_in_date,
    monthlyIncome: Number(data.monthly_income),
    currentEmployer: data.current_employer,
    currentAddress: data.current_address,
    hasScreeningResult: false,
    createdAt: data.created_at,
    unit: data.unit
      ? {
          unitNumber: data.unit.unit_number,
          rentAmount: Number(data.unit.rent_amount),
        }
      : undefined,
    property: data.property
      ? { name: data.property.name, address: data.property.address }
      : undefined,
  };
}

/**
 * Reject an application
 */
export async function rejectApplication(
  accountId: string,
  userId: string,
  applicationId: string,
  reason?: string
): Promise<RentalApplication> {
  const { data, error } = await supabase
    .from('rental_applications')
    .update({ status: 'rejected' })
    .eq('id', applicationId)
    .eq('account_id', accountId)
    .select(
      `
      *,
      unit:units!inner(unit_number, rent_amount),
      property:properties!inner(name, address)
    `
    )
    .single();

  if (error) throw error;

  await logActivityEvent(
    accountId,
    userId,
    'application_rejected',
    `Rejected application for ${data.first_name} ${data.last_name}`,
    {
      entityType: 'rental_application',
      entityId: applicationId,
      metadata: { reason },
    }
  );

  return {
    id: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    email: data.email,
    phone: data.phone,
    unitId: data.unit_id,
    propertyId: data.property_id,
    status: data.status,
    moveInDate: data.move_in_date,
    monthlyIncome: Number(data.monthly_income),
    currentEmployer: data.current_employer,
    currentAddress: data.current_address,
    hasScreeningResult: false,
    createdAt: data.created_at,
    unit: data.unit
      ? {
          unitNumber: data.unit.unit_number,
          rentAmount: Number(data.unit.rent_amount),
        }
      : undefined,
    property: data.property
      ? { name: data.property.name, address: data.property.address }
      : undefined,
  };
}

/**
 * Run screening for an application with deterministic scoring based on inputs
 */
export async function runScreening(
  accountId: string,
  userId: string,
  applicationId: string
): Promise<ScreeningResult> {
  // Verify application belongs to account
  const application = await getApplicationById(accountId, applicationId);
  if (!application) {
    throw new Error('Application not found');
  }

  // Check if screening already exists
  const { data: existingScreening } = await supabase
    .from('screening_results')
    .select('*')
    .eq('application_id', applicationId)
    .eq('account_id', accountId)
    .maybeSingle();

  if (existingScreening) {
    return {
      id: existingScreening.id,
      applicationId: existingScreening.application_id,
      provider: existingScreening.provider,
      creditScore: existingScreening.credit_score,
      backgroundCheckStatus: existingScreening.background_check_status,
      evictionHistory: existingScreening.eviction_history,
      criminalHistory: existingScreening.criminal_history,
      incomeVerificationStatus: existingScreening.income_verification_status,
      riskScore: existingScreening.risk_score,
      riskFactors: existingScreening.risk_factors || [],
      recommendations: existingScreening.recommendations,
      screenedAt: existingScreening.screened_at,
    };
  }

  // Deterministic screening based on application data
  // This is a stubbed provider that produces consistent scores

  // Get unit rent for income verification
  const { data: unit } = await supabase
    .from('units')
    .select('rent_amount')
    .eq('id', application.unitId)
    .single();

  const rentAmount = unit?.rent_amount || 1000;
  const incomeToRentRatio = application.monthlyIncome / rentAmount;

  // Calculate credit score (deterministic based on name hash for consistency)
  const nameHash = (application.firstName + application.lastName)
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const baseCreditScore = 600 + (nameHash % 200); // 600-800

  // Adjust credit based on income ratio
  const creditScore = Math.min(850, Math.max(300,
    baseCreditScore + (incomeToRentRatio > 3 ? 50 : incomeToRentRatio > 2.5 ? 25 : 0)
  ));

  // Income verification
  const incomeVerified = incomeToRentRatio >= 2.5;
  const incomeVerificationStatus = incomeVerified ? 'verified' : 'failed';

  // Background check
  const hasGoodCredit = creditScore >= 650;
  const backgroundCheckStatus = hasGoodCredit ? 'clear' : 'flagged';

  // Eviction and criminal history (based on credit score threshold)
  const evictionHistory = creditScore < 600;
  const criminalHistory = creditScore < 550;

  // Calculate risk score (0-100, higher is better)
  let riskScore = 50; // Base score

  // Credit score contribution (max 30 points)
  if (creditScore >= 750) riskScore += 30;
  else if (creditScore >= 700) riskScore += 25;
  else if (creditScore >= 650) riskScore += 20;
  else if (creditScore >= 600) riskScore += 10;

  // Income ratio contribution (max 25 points)
  if (incomeToRentRatio >= 4) riskScore += 25;
  else if (incomeToRentRatio >= 3) riskScore += 20;
  else if (incomeToRentRatio >= 2.5) riskScore += 15;
  else if (incomeToRentRatio >= 2) riskScore += 10;

  // Background check contribution (max 20 points)
  if (backgroundCheckStatus === 'clear' && !evictionHistory && !criminalHistory) {
    riskScore += 20;
  } else if (backgroundCheckStatus === 'clear') {
    riskScore += 15;
  }

  // Employment contribution (max 10 points)
  if (application.currentEmployer && application.currentEmployer.length > 0) {
    riskScore += 10;
  }

  // Income verification (max 15 points)
  if (incomeVerified) {
    riskScore += 15;
  }

  riskScore = Math.min(100, Math.max(0, riskScore));

  // Identify risk factors
  const riskFactors: string[] = [];
  if (creditScore < 650) riskFactors.push('low_credit_score');
  if (!incomeVerified) riskFactors.push('insufficient_income');
  if (incomeToRentRatio < 2.5) riskFactors.push('low_income_ratio');
  if (evictionHistory) riskFactors.push('eviction_history');
  if (criminalHistory) riskFactors.push('criminal_record');
  if (!application.currentEmployer) riskFactors.push('no_employer_info');

  // Generate recommendations
  let recommendations: string;
  if (riskScore >= 85) {
    recommendations = 'Highly recommended for approval. Excellent credit and income verification.';
  } else if (riskScore >= 75) {
    recommendations = 'Recommended for approval. Good financial profile.';
  } else if (riskScore >= 65) {
    recommendations = 'Proceed with caution. Consider additional deposit or guarantor.';
  } else if (riskScore >= 50) {
    recommendations = 'High risk. Require guarantor and increased deposit.';
  } else {
    recommendations = 'Not recommended. Significant risk factors present.';
  }

  // Store screening result
  const { data, error } = await supabase
    .from('screening_results')
    .insert({
      account_id: accountId,
      application_id: applicationId,
      provider: 'internal',
      credit_score: creditScore,
      background_check_status: backgroundCheckStatus,
      eviction_history: evictionHistory,
      criminal_history: criminalHistory,
      income_verification_status: incomeVerificationStatus,
      risk_score: riskScore,
      risk_factors: riskFactors,
      recommendations,
      raw_data: {
        income_to_rent_ratio: incomeToRentRatio,
        monthly_income: application.monthlyIncome,
        rent_amount: rentAmount,
        calculated_at: new Date().toISOString(),
      },
    })
    .select()
    .single();

  if (error) throw error;

  await logActivityEvent(
    accountId,
    userId,
    'application_submitted',
    `Screening completed for ${application.firstName} ${application.lastName}`,
    {
      entityType: 'rental_application',
      entityId: applicationId,
      metadata: { riskScore, creditScore },
    }
  );

  return {
    id: data.id,
    applicationId: data.application_id,
    provider: data.provider,
    creditScore: data.credit_score,
    backgroundCheckStatus: data.background_check_status,
    evictionHistory: data.eviction_history,
    criminalHistory: data.criminal_history,
    incomeVerificationStatus: data.income_verification_status,
    riskScore: data.risk_score,
    riskFactors: data.risk_factors || [],
    recommendations: data.recommendations,
    screenedAt: data.screened_at,
  };
}
