import { randomBytes } from 'crypto';
import { supabaseAdmin as supabase } from '../supabase';
import { logActivityEvent } from './activityService';
import { AiDisabledError, generateStructuredJson, getAiStatus } from './aiClient';

function formatPropertyAddress(property: any) {
  if (!property) return '';
  const parts = [property.address1, property.address2].filter(Boolean);
  const cityStateZip = [property.city, property.state, property.zip].filter(Boolean).join(' ');
  if (cityStateZip) parts.push(cityStateZip);
  return parts.join(', ');
}

export interface ScreeningInputs {
  creditScore?: number | null;
  backgroundCheckStatus?: string | null;
  incomeVerificationStatus?: string | null;
  evictionHistory?: boolean | null;
  criminalHistory?: boolean | null;
}

function normalizeScreeningInputs(raw: any): ScreeningInputs {
  if (!raw || typeof raw !== 'object') return {};

  const creditScore =
    typeof raw.creditScore === 'number'
      ? raw.creditScore
      : typeof raw.credit_score === 'number'
        ? raw.credit_score
        : null;

  const backgroundCheckStatus =
    typeof raw.backgroundCheckStatus === 'string'
      ? raw.backgroundCheckStatus
      : typeof raw.background_check_status === 'string'
        ? raw.background_check_status
        : null;

  const incomeVerificationStatus =
    typeof raw.incomeVerificationStatus === 'string'
      ? raw.incomeVerificationStatus
      : typeof raw.income_verification_status === 'string'
        ? raw.income_verification_status
        : null;

  const evictionHistory =
    typeof raw.evictionHistory === 'boolean'
      ? raw.evictionHistory
      : typeof raw.eviction_history === 'boolean'
        ? raw.eviction_history
        : null;

  const criminalHistory =
    typeof raw.criminalHistory === 'boolean'
      ? raw.criminalHistory
      : typeof raw.criminal_history === 'boolean'
        ? raw.criminal_history
        : null;

  return {
    creditScore,
    backgroundCheckStatus,
    incomeVerificationStatus,
    evictionHistory,
    criminalHistory,
  };
}

function splitFullName(fullName?: string | null) {
  if (!fullName) return { firstName: '', lastName: '' };
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
  };
}

function getNameParts(fullName: string | null, applicationData: any) {
  const firstName =
    applicationData?.firstName ||
    applicationData?.first_name ||
    '';
  const lastName =
    applicationData?.lastName ||
    applicationData?.last_name ||
    '';

  if (firstName || lastName) {
    return { firstName, lastName };
  }

  return splitFullName(fullName);
}

function getCurrentEmployer(employer: string | null, applicationData: any) {
  return (
    applicationData?.currentEmployer ||
    applicationData?.current_employer ||
    employer ||
    ''
  );
}

function getCurrentAddress(applicationData: any) {
  return (
    applicationData?.currentAddress ||
    applicationData?.current_address ||
    ''
  );
}

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
  screeningInputs?: ScreeningInputs;
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
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  recommendation?: 'APPROVE' | 'REVIEW' | 'REJECT' | null;
  reasons?: string[];
  notes?: string | null;
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
  creditScore?: number | null;
  backgroundCheckStatus?: string;
  incomeVerificationStatus?: string;
  evictionHistory?: boolean | null;
  criminalHistory?: boolean | null;
}

function mapApplicationRow(app: any): RentalApplication {
  const applicationData = app.application_data || {};
  const { firstName, lastName } = getNameParts(app.full_name, applicationData);

  return {
    id: app.id,
    firstName,
    lastName,
    email: app.email,
    phone: app.phone,
    unitId: app.unit_id,
    propertyId: app.property_id,
    status: app.status,
    moveInDate: app.desired_move_in_date || app.move_in_date,
    monthlyIncome: Number(app.monthly_income),
    currentEmployer: getCurrentEmployer(app.employer, applicationData),
    currentAddress: getCurrentAddress(applicationData),
    screeningInputs: normalizeScreeningInputs(applicationData),
    hasScreeningResult: app.screening_results && app.screening_results.length > 0,
    createdAt: app.created_at,
    unit: app.unit
      ? {
          unitNumber: app.unit.unit_number,
          rentAmount: Number(app.unit.rent_amount),
        }
      : undefined,
    property: app.property
      ? { name: app.property.name, address: formatPropertyAddress(app.property) }
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
            riskLevel: app.screening_results[0].raw_data?.risk_level || null,
            recommendation: app.screening_results[0].raw_data?.recommendation || null,
            reasons: app.screening_results[0].raw_data?.reasons || [],
            notes: app.screening_results[0].raw_data?.notes || null,
            riskFactors: app.screening_results[0].risk_factors || [],
            recommendations: app.screening_results[0].recommendations,
            screenedAt: app.screening_results[0].screened_at,
          }
        : undefined,
  };
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
      property:properties!inner(name, address1, address2, city, state, zip),
      screening_results(*)
    `,
      { count: 'exact' }
    )
    .eq('account_id', accountId);

  const normalizedStatus = status === 'pending' ? 'submitted' : status;
  if (normalizedStatus) query = query.eq('status', normalizedStatus);
  if (unitId) query = query.eq('unit_id', unitId);
  if (propertyId) query = query.eq('property_id', propertyId);

  query = query.order('created_at', { ascending: false });
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  const applications: RentalApplication[] = data?.map(mapApplicationRow) || [];

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
      property:properties!inner(name, address1, address2, city, state, zip),
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

  return mapApplicationRow(data);
}

/**
 * Create a new rental application
 */
export async function createApplication(
  accountId: string,
  applicationData: CreateApplicationData
): Promise<RentalApplication> {
  const screeningInputs = {
    creditScore: applicationData.creditScore ?? null,
    backgroundCheckStatus: applicationData.backgroundCheckStatus || null,
    incomeVerificationStatus: applicationData.incomeVerificationStatus || null,
    evictionHistory: applicationData.evictionHistory ?? null,
    criminalHistory: applicationData.criminalHistory ?? null,
  };
  const applicationPayload = {
    ...screeningInputs,
    firstName: applicationData.firstName,
    lastName: applicationData.lastName,
    currentEmployer: applicationData.currentEmployer,
    currentAddress: applicationData.currentAddress,
  };
  const fullName = [applicationData.firstName, applicationData.lastName].filter(Boolean).join(' ').trim();

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
      full_name: fullName,
      email: applicationData.email,
      phone: applicationData.phone,
      desired_move_in_date: applicationData.moveInDate,
      monthly_income: applicationData.monthlyIncome,
      employer: applicationData.currentEmployer,
      application_data: applicationPayload,
      status: 'submitted',
    })
    .select(
      `
      *,
      unit:units!inner(unit_number, rent_amount),
      property:properties!inner(name, address1, address2, city, state, zip)
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

  return mapApplicationRow(data);
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

  if (!['submitted', 'pending'].includes(application.status)) {
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
    const fullName = `${application.firstName} ${application.lastName}`.trim();
    let resolvedUserId: string | null = null;

    const temporaryPassword = randomBytes(18)
      .toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '');
    const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
      email: application.email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: 'tenant',
      },
    });

    if (createUserError) {
      const { data: existingUsers, error: listUsersError } = await supabase.auth.admin.listUsers();
      if (listUsersError) {
        throw createUserError;
      }
      const matchingUser = existingUsers?.users?.find(
        (u) => u.email?.toLowerCase() === application.email.toLowerCase()
      );
      if (!matchingUser) {
        throw createUserError;
      }
      resolvedUserId = matchingUser.id;
    } else {
      resolvedUserId = createdUser.user.id;
    }

    if (!resolvedUserId) {
      throw new Error('Unable to create or locate tenant user');
    }

    tenantUserId = resolvedUserId;

    await supabase
      .from('account_members')
      .upsert(
        {
          account_id: accountId,
          user_id: tenantUserId,
          role: 'tenant',
          joined_at: new Date().toISOString(),
        },
        { onConflict: 'account_id,user_id' }
      );

    // Create tenant profile
    const { error: profileError } = await supabase
      .from('tenant_profiles')
      .insert({
        account_id: accountId,
        user_id: tenantUserId,
        full_name: fullName,
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
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
    })
    .eq('id', applicationId)
    .eq('account_id', accountId)
    .select(
      `
      *,
      unit:units!inner(unit_number, rent_amount),
      property:properties!inner(name, address1, address2, city, state, zip)
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

  return mapApplicationRow(data);
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
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
      rejection_reason: reason || null,
    })
    .eq('id', applicationId)
    .eq('account_id', accountId)
    .select(
      `
      *,
      unit:units!inner(unit_number, rent_amount),
      property:properties!inner(name, address1, address2, city, state, zip)
    `
    )
    .single();

  if (error) throw error;

  const { firstName, lastName } = getNameParts(data.full_name, data.application_data);

  await logActivityEvent(
    accountId,
    userId,
    'application_rejected',
    `Rejected application for ${firstName} ${lastName}`.trim(),
    {
      entityType: 'rental_application',
      entityId: applicationId,
      metadata: { reason },
    }
  );

  return mapApplicationRow(data);
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
      riskLevel: existingScreening.raw_data?.risk_level || null,
      recommendation: existingScreening.raw_data?.recommendation || null,
      reasons: existingScreening.raw_data?.reasons || [],
      notes: existingScreening.raw_data?.notes || null,
      riskFactors: existingScreening.risk_factors || [],
      recommendations: existingScreening.recommendations,
      screenedAt: existingScreening.screened_at,
    };
  }

  const { data: unit } = await supabase
    .from('units')
    .select('rent_amount')
    .eq('id', application.unitId)
    .single();

  const rentAmount = unit?.rent_amount || 1000;
  const incomeToRentRatio = application.monthlyIncome / rentAmount;
  const screeningInputs = application.screeningInputs || {};

  const normalizeStatus = (value: unknown, allowed: string[]) => {
    if (typeof value !== 'string') return null;
    const normalized = value.toLowerCase();
    return allowed.includes(normalized) ? normalized : null;
  };

  const nameHash = (application.firstName + application.lastName)
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const baseCreditScore = 600 + (nameHash % 200); // 600-800

  const providedCreditScore =
    typeof screeningInputs.creditScore === 'number' &&
    Number.isFinite(screeningInputs.creditScore)
      ? Math.min(850, Math.max(300, Math.round(screeningInputs.creditScore)))
      : null;

  const creditScore =
    providedCreditScore ??
    Math.min(
      850,
      Math.max(
        300,
        baseCreditScore + (incomeToRentRatio > 3 ? 50 : incomeToRentRatio > 2.5 ? 25 : 0)
      )
    );

  const normalizedIncomeStatus = normalizeStatus(screeningInputs.incomeVerificationStatus, [
    'verified',
    'failed',
    'pending',
  ]);
  const incomeVerificationStatus =
    normalizedIncomeStatus ?? (incomeToRentRatio >= 2.5 ? 'verified' : 'failed');
  const incomeVerified = incomeVerificationStatus === 'verified';

  const normalizedBackgroundStatus = normalizeStatus(screeningInputs.backgroundCheckStatus, [
    'clear',
    'flagged',
    'pending',
  ]);
  const hasGoodCredit = creditScore >= 650;
  const backgroundCheckStatus =
    normalizedBackgroundStatus ?? (hasGoodCredit ? 'clear' : 'flagged');

  const evictionHistory =
    typeof screeningInputs.evictionHistory === 'boolean'
      ? screeningInputs.evictionHistory
      : creditScore < 600;
  const criminalHistory =
    typeof screeningInputs.criminalHistory === 'boolean'
      ? screeningInputs.criminalHistory
      : creditScore < 550;

  const deterministicRiskFactors: string[] = [];
  if (creditScore < 650) deterministicRiskFactors.push('low_credit_score');
  if (!incomeVerified) deterministicRiskFactors.push('insufficient_income');
  if (incomeToRentRatio < 2.5) deterministicRiskFactors.push('low_income_ratio');
  if (backgroundCheckStatus === 'flagged') deterministicRiskFactors.push('background_check_flagged');
  if (incomeVerificationStatus === 'failed') deterministicRiskFactors.push('income_not_verified');
  if (evictionHistory) deterministicRiskFactors.push('eviction_history');
  if (criminalHistory) deterministicRiskFactors.push('criminal_record');
  if (!application.currentEmployer) deterministicRiskFactors.push('no_employer_info');

  const deterministicScore = (() => {
    let score = 50;
    if (creditScore >= 750) score += 30;
    else if (creditScore >= 700) score += 25;
    else if (creditScore >= 650) score += 20;
    else if (creditScore >= 600) score += 10;

    if (incomeToRentRatio >= 4) score += 25;
    else if (incomeToRentRatio >= 3) score += 20;
    else if (incomeToRentRatio >= 2.5) score += 15;
    else if (incomeToRentRatio >= 2) score += 10;

    if (backgroundCheckStatus === 'clear' && !evictionHistory && !criminalHistory) {
      score += 20;
    } else if (backgroundCheckStatus === 'clear') {
      score += 15;
    }

    if (application.currentEmployer && application.currentEmployer.length > 0) {
      score += 10;
    }

    if (incomeVerified) {
      score += 15;
    }

    return Math.min(100, Math.max(0, score));
  })();

  const deterministicDecision = (() => {
    if (deterministicScore >= 85) return 'APPROVE';
    if (deterministicScore >= 70) return 'REVIEW';
    return 'REJECT';
  })();

  const deterministicNotes =
    deterministicDecision === 'APPROVE'
      ? 'Applicant meets income and credit requirements.'
      : deterministicDecision === 'REVIEW'
        ? 'Applicant shows moderate risk; consider additional verification.'
        : 'Applicant shows significant risk based on financial indicators.';

  let aiOutput: {
    riskScore: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    recommendation: 'APPROVE' | 'REVIEW' | 'REJECT';
    reasons: string[];
    notes: string;
  } | null = null;

  try {
    aiOutput = await generateStructuredJson<{
      riskScore: number;
      riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
      recommendation: 'APPROVE' | 'REVIEW' | 'REJECT';
      reasons: string[];
      notes: string;
    }>(
      'You are a tenant screening analyst. Return JSON only with riskScore (0-100), riskLevel (LOW|MEDIUM|HIGH), recommendation (APPROVE|REVIEW|REJECT), reasons (array of short strings), and notes (one concise paragraph).',
      {
        applicant: {
          firstName: application.firstName,
          lastName: application.lastName,
          email: application.email,
          phone: application.phone,
          monthlyIncome: application.monthlyIncome,
          currentEmployer: application.currentEmployer,
          currentAddress: application.currentAddress,
        },
        lease: {
          rentAmount,
          incomeToRentRatio,
        },
        screeningSignals: {
          creditScore,
          backgroundCheckStatus,
          incomeVerificationStatus,
          evictionHistory,
          criminalHistory,
        },
        deterministicFallback: {
          riskScore: deterministicScore,
          recommendation: deterministicDecision,
          riskFactors: deterministicRiskFactors,
          notes: deterministicNotes,
        },
      }
    );
  } catch (error) {
    if (error instanceof AiDisabledError) {
      console.warn('[Screening] AI disabled; using deterministic screening.');
    } else {
      console.warn('[Screening] AI screening failed; using deterministic screening.', error);
    }
  }

  const riskScore = aiOutput?.riskScore ?? deterministicScore;
  const riskLevel = aiOutput?.riskLevel ?? (riskScore >= 75 ? 'LOW' : riskScore >= 55 ? 'MEDIUM' : 'HIGH');
  const recommendation = aiOutput?.recommendation ?? deterministicDecision;
  const reasons = aiOutput?.reasons?.length ? aiOutput.reasons : deterministicRiskFactors;
  const notes = aiOutput?.notes || deterministicNotes;

  const recommendations = `Recommendation: ${recommendation}. ${notes}`;

  let screeningProvider = 'internal';
  const aiStatus = getAiStatus();
  if (aiStatus.provider) {
    screeningProvider = `internal+${aiStatus.provider}`;
  }

  const mergedRiskFactors = reasons;
  const mergedRecommendations = recommendations;

  // Store screening result
  const { data, error } = await supabase
    .from('screening_results')
    .insert({
      account_id: accountId,
      application_id: applicationId,
      provider: screeningProvider,
      credit_score: creditScore,
      background_check_status: backgroundCheckStatus,
      eviction_history: evictionHistory,
      criminal_history: criminalHistory,
      income_verification_status: incomeVerificationStatus,
      risk_score: riskScore,
      risk_factors: mergedRiskFactors,
      recommendations: mergedRecommendations,
      raw_data: {
        income_to_rent_ratio: incomeToRentRatio,
        monthly_income: application.monthlyIncome,
        rent_amount: rentAmount,
        risk_level: riskLevel,
        recommendation,
        reasons,
        notes,
        calculated_at: new Date().toISOString(),
      },
    })
    .select()
    .single();

  if (error) {
    if (error.code === '42P01' || error.code === '42703') {
      console.warn('[Screening] screening_results table unavailable; returning computed result only.');
      return {
        id: `screening-${applicationId}`,
        applicationId,
        provider: screeningProvider,
        creditScore,
        backgroundCheckStatus,
        evictionHistory,
        criminalHistory,
        incomeVerificationStatus,
        riskScore,
        riskLevel,
        recommendation,
        reasons,
        notes,
        riskFactors: mergedRiskFactors,
        recommendations: mergedRecommendations,
        screenedAt: new Date().toISOString(),
      };
    }

    throw error;
  }

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
    riskLevel: data.raw_data?.risk_level || null,
    recommendation: data.raw_data?.recommendation || null,
    reasons: data.raw_data?.reasons || [],
    notes: data.raw_data?.notes || null,
    riskFactors: data.risk_factors || [],
    recommendations: data.recommendations,
    screenedAt: data.screened_at,
  };
}
