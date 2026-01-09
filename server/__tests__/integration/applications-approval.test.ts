import request from 'supertest';
import app from '../../src/index';
import { supabaseAdmin } from '../../src/supabase';

describe('Application Approval Flow', () => {
  let authToken: string;
  let accountId: string;
  let userId: string;
  let propertyId: string;
  let unitId: string;
  let applicationId: string;

  beforeAll(async () => {
    // Setup test account and auth
    // This would use your test authentication setup
    // For now, this is a placeholder
  });

  afterAll(async () => {
    // Cleanup test data
    if (applicationId) {
      await supabaseAdmin.from('rental_applications').delete().eq('id', applicationId);
    }
    if (unitId) {
      await supabaseAdmin.from('units').delete().eq('id', unitId);
    }
    if (propertyId) {
      await supabaseAdmin.from('properties').delete().eq('id', propertyId);
    }
  });

  describe('POST /api/applications', () => {
    it('should create a new application with org scoping', async () => {
      const response = await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '555-1234',
          unitId: unitId,
          moveInDate: '2024-02-01',
          monthlyIncome: 5000,
          currentEmployer: 'Acme Corp',
          currentAddress: '123 Main St',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('pending');
      applicationId = response.body.id;
    });

    it('should reject application for unit in different org', async () => {
      // Create a unit in a different account
      const { data: otherAccount } = await supabaseAdmin
        .from('accounts')
        .insert({ name: 'Other Account' })
        .select()
        .single();

      const { data: otherProperty } = await supabaseAdmin
        .from('properties')
        .insert({
          account_id: otherAccount.id,
          name: 'Other Property',
          address1: '456 Other St',
          city: 'Othertown',
          state: 'CA',
          zip: '90000',
        })
        .select()
        .single();

      const { data: otherUnit } = await supabaseAdmin
        .from('units')
        .insert({
          account_id: otherAccount.id,
          property_id: otherProperty.id,
          unit_number: '999',
          bedrooms: 2,
          bathrooms: 1,
          sqft: 1000,
          rent_amount: 2000,
        })
        .select()
        .single();

      const response = await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@example.com',
          phone: '555-5678',
          unitId: otherUnit.id,
          moveInDate: '2024-02-01',
          monthlyIncome: 5000,
          currentEmployer: 'Test Corp',
          currentAddress: '789 Test St',
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBeTruthy();

      // Cleanup
      await supabaseAdmin.from('units').delete().eq('id', otherUnit.id);
      await supabaseAdmin.from('properties').delete().eq('id', otherProperty.id);
      await supabaseAdmin.from('accounts').delete().eq('id', otherAccount.id);
    });
  });

  describe('POST /api/applications/:id/screen', () => {
    it('should run screening and calculate risk score', async () => {
      const response = await request(app)
        .post(`/api/applications/${applicationId}/screen`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('riskScore');
      expect(response.body).toHaveProperty('creditScore');
      expect(response.body.riskScore).toBeGreaterThanOrEqual(0);
      expect(response.body.riskScore).toBeLessThanOrEqual(100);
    });

    it('should return existing screening if already run', async () => {
      const response1 = await request(app)
        .post(`/api/applications/${applicationId}/screen`)
        .set('Authorization', `Bearer ${authToken}`);

      const response2 = await request(app)
        .post(`/api/applications/${applicationId}/screen`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response1.body.id).toBe(response2.body.id);
      expect(response1.body.riskScore).toBe(response2.body.riskScore);
    });
  });

  describe('POST /api/applications/:id/approve', () => {
    it('should approve application and create tenant + lease', async () => {
      const response = await request(app)
        .post(`/api/applications/${applicationId}/approve`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('approved');

      // Verify tenant profile was created
      const { data: tenantProfile } = await supabaseAdmin
        .from('tenant_profiles')
        .select('*')
        .eq('account_id', accountId)
        .eq('email', 'john.doe@example.com')
        .single();

      expect(tenantProfile).toBeTruthy();
      expect(tenantProfile.full_name).toBe('John Doe');

      // Verify lease was created
      const { data: lease } = await supabaseAdmin
        .from('leases')
        .select('*')
        .eq('account_id', accountId)
        .eq('unit_id', unitId)
        .single();

      expect(lease).toBeTruthy();
      expect(lease.status).toBe('active');

      // Verify unit status was updated
      const { data: unit } = await supabaseAdmin
        .from('units')
        .select('status')
        .eq('id', unitId)
        .single();

      expect(unit.status).toBe('occupied');

      // Verify activity event was logged
      const { data: activityEvents } = await supabaseAdmin
        .from('activity_events')
        .select('*')
        .eq('account_id', accountId)
        .eq('event_type', 'lease_created')
        .eq('entity_id', lease.id);

      expect(activityEvents).toHaveLength(1);
    });

    it('should reject approval if unit already occupied', async () => {
      // Create another application for the same unit
      const { data: newApp } = await supabaseAdmin
        .from('rental_applications')
        .insert({
          account_id: accountId,
          unit_id: unitId,
          property_id: propertyId,
          first_name: 'Jane',
          last_name: 'Smith',
          email: 'jane@example.com',
          phone: '555-9999',
          move_in_date: '2024-03-01',
          monthly_income: 6000,
          current_employer: 'Corp Inc',
          current_address: '999 Test Ave',
          status: 'pending',
        })
        .select()
        .single();

      const response = await request(app)
        .post(`/api/applications/${newApp.id}/approve`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('occupied');

      // Cleanup
      await supabaseAdmin.from('rental_applications').delete().eq('id', newApp.id);
    });

    it('should reject approval of already approved application', async () => {
      const response = await request(app)
        .post(`/api/applications/${applicationId}/approve`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(500);
      expect(response.body.error).toBeTruthy();
    });
  });

  describe('GET /api/tenants with search', () => {
    it('should search tenants by name', async () => {
      const response = await request(app)
        .get('/api/tenants')
        .query({ search: 'John' })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.tenants).toBeInstanceOf(Array);
      expect(response.body.tenants.length).toBeGreaterThan(0);
      expect(response.body.tenants[0].firstName).toBe('John');
    });

    it('should search tenants by email', async () => {
      const response = await request(app)
        .get('/api/tenants')
        .query({ search: 'john.doe@example.com' })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.tenants.length).toBeGreaterThan(0);
      expect(response.body.tenants[0].email).toBe('john.doe@example.com');
    });

    it('should return empty array for non-matching search', async () => {
      const response = await request(app)
        .get('/api/tenants')
        .query({ search: 'NonExistentName' })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.tenants).toEqual([]);
    });
  });
});
