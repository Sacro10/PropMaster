import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Permissions } from '../middleware/rbac';
import { createExpense, CreateExpenseData } from '../services/expensesService';

const router = Router();

/**
 * POST /api/expenses
 * Create a new expense
 */
router.post('/', authenticate, Permissions.updateFinancials, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.accountId) {
      res.status(400).json({ error: 'Account ID required' });
      return;
    }

    const amount = Number(req.body.amount);
    const expenseDate = String(req.body.expenseDate || '');

    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Amount must be a positive number' });
      return;
    }

    const parsedDate = new Date(expenseDate);
    if (!expenseDate || Number.isNaN(parsedDate.getTime())) {
      res.status(400).json({ error: 'Valid expenseDate is required' });
      return;
    }

    const payload: CreateExpenseData = {
      amount,
      expenseDate,
      description: req.body.description,
      categoryId: req.body.categoryId,
      categoryName: req.body.categoryName,
      propertyId: req.body.propertyId,
      unitId: req.body.unitId,
      vendorProfileId: req.body.vendorProfileId,
      maintenanceRequestId: req.body.maintenanceRequestId,
      paymentMethod: req.body.paymentMethod,
    };

    const expense = await createExpense(req.user.accountId, payload);
    res.status(201).json(expense);
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({
      error: 'Failed to create expense',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
