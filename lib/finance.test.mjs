import test from 'node:test';
import assert from 'node:assert/strict';
import {
  roundMoney,
  validateIndianMobile,
  validateDthSubscriber,
  validateRechargeAmount,
  calculateCommission,
  validateCommissionTransfer,
  computeWalletTransition,
  aggregateFinancialReport,
  buildSafeCsv,
} from './finance.js';

test('roundMoney avoids floating point drift', () => {
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(roundMoney(199 * 0.0225), 4.48);
});

test('validateIndianMobile accepts valid 10-digit Indian numbers and rejects invalid ones', () => {
  assert.equal(validateIndianMobile('9876543210').valid, true);
  assert.equal(validateIndianMobile('6123456789').valid, true);
  assert.equal(validateIndianMobile('5123456789').valid, false);
  assert.equal(validateIndianMobile('987654321').valid, false);
  assert.equal(validateIndianMobile('98765432101').valid, false);
  assert.equal(validateIndianMobile('98765abc10').valid, false);
});

test('validateDthSubscriber enforces operator-specific subscriber ID lengths', () => {
  assert.equal(validateDthSubscriber('TATA_PLAY', '1234567890').valid, true);
  assert.equal(validateDthSubscriber('TATA_PLAY', '12345').valid, false);
  assert.equal(validateDthSubscriber('DISH_TV', '12345678901').valid, true);
  assert.equal(validateDthSubscriber('UNKNOWN', '1234567890').valid, false);
});

test('validateRechargeAmount enforces platform min and max limits', () => {
  const settings = { minRechargeAmount: 10, maxRechargeAmount: 5000 };
  assert.equal(validateRechargeAmount(299, settings).valid, true);
  assert.equal(validateRechargeAmount(5, settings).valid, false);
  assert.equal(validateRechargeAmount(5001, settings).valid, false);
});

test('calculateCommission computes percentage, fixed commission, and negative fixed service fees accurately', () => {
  const pct = calculateCommission(299, { rateType: 'percentage', rateValue: 2.5, isActive: true });
  assert.equal(pct.commissionAmount, 7.48);
  assert.equal(pct.serviceCharge, 0);
  assert.equal(pct.totalPayable, 299);

  const negPct = calculateCommission(100, { rateType: 'percentage', rateValue: -2, isActive: true });
  assert.equal(negPct.commissionAmount, 0);
  assert.equal(negPct.serviceCharge, 0);
  assert.equal(negPct.totalPayable, 100);

  const fixed = calculateCommission(299, { rateType: 'fixed', rateValue: 5, isActive: true });
  assert.equal(fixed.commissionAmount, 5);
  assert.equal(fixed.serviceCharge, 0);
  assert.equal(fixed.totalPayable, 299);

  const negFixed = calculateCommission(1000, { rateType: 'fixed', rateValue: -5, isActive: true });
  assert.equal(negFixed.commissionAmount, 0);
  assert.equal(negFixed.serviceCharge, 5);
  assert.equal(negFixed.totalPayable, 1005);

  const inactive = calculateCommission(299, { rateType: 'percentage', rateValue: 2.5, isActive: false });
  assert.equal(inactive.commissionAmount, 0);
  assert.equal(inactive.serviceCharge, 0);
  assert.equal(inactive.isActive, false);
});

test('validateCommissionTransfer enforces minimum ₹50 transfer rule and available balance', () => {
  assert.equal(validateCommissionTransfer(49.99, 100, 50).valid, false);
  assert.equal(validateCommissionTransfer(50, 100, 50).valid, true);
  assert.equal(validateCommissionTransfer(120, 100, 50).valid, false);
});

test('three-balance wallet transitions maintain conservation of funds', () => {
  const initial = { currentBalance: 1000, pendingBalance: 0, commissionBalance: 60 };

  // 1. Hold ₹299 for recharge
  const held = computeWalletTransition(initial, { type: 'HOLD_RECHARGE', amount: 299 });
  assert.deepEqual(held, { currentBalance: 701, pendingBalance: 299, commissionBalance: 60 });

  // 2a. Settle Successful with ₹6.73 commission
  const settled = computeWalletTransition(held, { type: 'SETTLE_SUCCESS', amount: 299, commissionAmount: 6.73 });
  assert.deepEqual(settled, { currentBalance: 701, pendingBalance: 0, commissionBalance: 66.73 });

  // 2b. Refund Failed back to Current Balance
  const refunded = computeWalletTransition(held, { type: 'REFUND_FAILURE', amount: 299 });
  assert.deepEqual(refunded, { currentBalance: 1000, pendingBalance: 0, commissionBalance: 60 });

  // 3. Commission transfer ₹50 to Current Balance
  const transferred = computeWalletTransition(settled, { type: 'TRANSFER_COMMISSION', amount: 50, minTransfer: 50 });
  assert.deepEqual(transferred, { currentBalance: 751, pendingBalance: 0, commissionBalance: 16.73 });
});

test('aggregateFinancialReport cleanly separates customer wallet liabilities from turnover and revenue', () => {
  const report = aggregateFinancialReport({
    transactions: [
      { type: 'MOBILE_RECHARGE', status: 'SUCCESSFUL', amount: 299, commissionAmount: 6.73 },
      { type: 'DTH_RECHARGE', status: 'PENDING', amount: 350, commissionAmount: 0 },
      { type: 'MOBILE_RECHARGE', status: 'FAILED', amount: 199, refunded: true, commissionAmount: 0 },
      { type: 'REDEEM_CODE', status: 'SUCCESSFUL', amount: 100, commissionAmount: 0 },
    ],
    deposits: [
      { status: 'APPROVED', amount: 2000 },
      { status: 'PENDING', amount: 500 },
    ],
    wallets: [
      { currentBalance: 1251, pendingBalance: 350, commissionBalance: 6.73 },
    ],
    users: [{ status: 'ACTIVE' }, { status: 'SUSPENDED' }],
  });

  assert.equal(report.counts.totalTransactions, 4);
  assert.equal(report.counts.successfulCount, 2);
  assert.equal(report.counts.pendingCount, 1);
  assert.equal(report.counts.failedCount, 1);
  assert.equal(report.turnover.totalRechargeTurnover, 299);
  assert.equal(report.turnover.redeemVolume, 100);
  assert.equal(report.settlement.totalRefundedAmount, 199);
  assert.equal(report.walletLiabilities.totalWalletLiabilities, 1607.73);
  assert.equal(report.counts.activeUsers, 1);
  assert.equal(report.counts.suspendedUsers, 1);
});

test('buildSafeCsv escapes formula injection payloads', () => {
  const csv = buildSafeCsv(
    [{ key: 'name', label: 'Name' }, { key: 'amount', label: 'Amount' }],
    [{ name: '=CMD()', amount: 100 }]
  );
  assert.equal(csv.includes("'=CMD()"), true);
});
