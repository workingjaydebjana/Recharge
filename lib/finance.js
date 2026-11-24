import { MOBILE_OPERATORS, DTH_OPERATORS, ELECTRICITY_BOARDS } from './constants.js';

/**
 * Round monetary INR amounts safely to 2 decimal places using paise integer math.
 */
export function roundMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Format INR currency in Indian numbering style (e.g., ₹1,25,450.00).
 */
export function formatINR(amount) {
  const safe = roundMoney(amount);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

/**
 * Validate 10-digit Indian mobile number (starts with 6-9).
 */
export function validateIndianMobile(mobile) {
  const clean = String(mobile || '').trim();
  if (!/^[6-9]\d{9}$/.test(clean)) {
    return { valid: false, message: 'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.' };
  }
  return { valid: true, value: clean };
}

/**
 * Validate DTH subscriber/customer ID based on operator rules.
 */
export function validateDthSubscriber(operatorCode, subscriberId) {
  const op = DTH_OPERATORS.find((item) => item.code === operatorCode);
  if (!op) {
    return { valid: false, message: 'Please select a valid DTH operator.' };
  }
  const clean = String(subscriberId || '').trim();
  if (!/^\d+$/.test(clean) || clean.length < op.idMin || clean.length > op.idMax) {
    return {
      valid: false,
      message: `Invalid ${op.name} Subscriber ID. Expected ${op.idHint}.`,
    };
  }
  return { valid: true, value: clean, operator: op };
}

/**
 * Validate recharge amount against Super Admin platform min/max settings.
 */
export function validateRechargeAmount(amount, settings = {}) {
  const min = Number(settings.minRechargeAmount ?? 10);
  const max = Number(settings.maxRechargeAmount ?? 10000);
  const parsed = roundMoney(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { valid: false, message: 'Enter a valid recharge amount in ₹.' };
  }
  if (parsed < min) {
    return { valid: false, message: `Minimum recharge amount is ₹${min}.` };
  }
  if (parsed > max) {
    return { valid: false, message: `Maximum recharge amount is ₹${max}.` };
  }
  return { valid: true, value: parsed };
}

/**
 * Validate mobile operator code.
 */
export function findMobileOperator(code) {
  return MOBILE_OPERATORS.find((op) => op.code === code) || null;
}

/**
 * Validate DTH operator code.
 */
export function findDthOperator(code) {
  return DTH_OPERATORS.find((op) => op.code === code) || null;
}

/**
 * Find an Indian Electricity board by code.
 */
export function findElectricityBoard(code) {
  return ELECTRICITY_BOARDS.find((b) => b.code === code) || null;
}

/**
 * Validate Electricity Consumer ID / CA Number based on selected board.
 */
export function validateElectricityConsumer(boardCode, consumerNumber) {
  const board = findElectricityBoard(boardCode);
  if (!board) {
    return { valid: false, message: 'Please select a valid electricity board.' };
  }
  const clean = String(consumerNumber || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(clean) || clean.length < 6 || clean.length > 18) {
    return {
      valid: false,
      message: `Enter a valid ${board.consumerLabel} for ${board.short} (${board.idHint}).`,
    };
  }
  return { valid: true, value: clean, board };
}

/**
 * Validate electricity bill payment amount (supports bills up to ₹50,000).
 */
export function validateElectricityAmount(amount, settings = {}) {
  const min = Math.max(10, Number(settings.minRechargeAmount ?? 10));
  const max = Math.max(50000, Number(settings.maxRechargeAmount ?? 10000));
  const parsed = roundMoney(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { valid: false, message: 'Enter a valid electricity bill amount in ₹.' };
  }
  if (parsed < min) {
    return { valid: false, message: `Minimum bill payment amount is ₹${min}.` };
  }
  if (parsed > max) {
    return { valid: false, message: `Maximum bill payment amount is ₹${max}.` };
  }
  return { valid: true, value: parsed };
}

/**
 * Calculate commission or fixed service charge strictly from Super Admin configured rules.
 * - percentage: always non-negative (>= 0), computed as (amount * rateValue) / 100.
 * - fixed:
 *   - positive (> 0): exact flat commission in ₹ regardless of transaction amount.
 *   - negative (< 0): zero commission; absolute value is charged as a flat service fee in ₹.
 */
export function calculateCommission(amount, commissionRule) {
  const baseAmount = roundMoney(amount);
  const rateType = commissionRule?.rateType === 'fixed' ? 'fixed' : 'percentage';

  if (baseAmount <= 0 || !commissionRule || commissionRule.isActive === false) {
    return {
      commissionAmount: 0,
      serviceCharge: 0,
      totalPayable: Math.max(0, baseAmount),
      rateType,
      rateValue: 0,
      isActive: commissionRule ? Boolean(commissionRule.isActive) : true,
    };
  }

  const rateValue = roundMoney(commissionRule.rateValue || 0);
  if (!Number.isFinite(rateValue) || rateValue === 0) {
    return {
      commissionAmount: 0,
      serviceCharge: 0,
      totalPayable: baseAmount,
      rateType,
      rateValue: 0,
      isActive: true,
    };
  }

  if (rateType === 'fixed') {
    if (rateValue < 0) {
      const fee = roundMoney(Math.abs(rateValue));
      return {
        commissionAmount: 0,
        serviceCharge: fee,
        totalPayable: roundMoney(baseAmount + fee),
        rateType: 'fixed',
        rateValue,
        isActive: true,
      };
    }
    return {
      commissionAmount: roundMoney(rateValue),
      serviceCharge: 0,
      totalPayable: baseAmount,
      rateType: 'fixed',
      rateValue,
      isActive: true,
    };
  }

  // Percentage mode: never negative
  if (rateValue < 0) {
    return {
      commissionAmount: 0,
      serviceCharge: 0,
      totalPayable: baseAmount,
      rateType: 'percentage',
      rateValue: 0,
      isActive: true,
    };
  }

  const calculated = roundMoney((baseAmount * rateValue) / 100);
  return {
    commissionAmount: calculated,
    serviceCharge: 0,
    totalPayable: baseAmount,
    rateType: 'percentage',
    rateValue,
    isActive: true,
  };
}

/**
 * Validate Commission Balance -> Current Balance transfer request.
 * Minimum transfer amount is ₹50 (or platform configured minimum >= 50).
 */
export function validateCommissionTransfer(amount, availableCommission, minTransfer = 50) {
  const parsed = roundMoney(amount);
  const available = roundMoney(availableCommission);
  const floor = Math.max(50, roundMoney(minTransfer));

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { valid: false, message: 'Enter a valid transfer amount.' };
  }
  if (parsed < floor) {
    return { valid: false, message: `Minimum commission transfer amount is ₹${floor}.` };
  }
  if (parsed > available) {
    return { valid: false, message: 'Insufficient Commission Balance for this transfer.' };
  }
  return { valid: true, value: parsed };
}

/**
 * Compute pure three-balance wallet transitions for unit testing & verification.
 */
export function computeWalletTransition(wallet, action) {
  const current = roundMoney(wallet.currentBalance || 0);
  const pending = roundMoney(wallet.pendingBalance || 0);
  const commission = roundMoney(wallet.commissionBalance || 0);
  const amt = roundMoney(action.amount || 0);

  if (amt <= 0) {
    throw new Error('Transaction amount must be greater than zero.');
  }

  switch (action.type) {
    case 'HOLD_RECHARGE': {
      if (current < amt) throw new Error('Insufficient Current Balance.');
      return {
        currentBalance: roundMoney(current - amt),
        pendingBalance: roundMoney(pending + amt),
        commissionBalance: commission,
      };
    }
    case 'SETTLE_SUCCESS': {
      if (pending < amt) throw new Error('Pending balance mismatch.');
      const comm = roundMoney(action.commissionAmount || 0);
      return {
        currentBalance: current,
        pendingBalance: roundMoney(pending - amt),
        commissionBalance: roundMoney(commission + comm),
      };
    }
    case 'REFUND_FAILURE': {
      if (pending < amt) throw new Error('Pending balance mismatch for refund.');
      return {
        currentBalance: roundMoney(current + amt),
        pendingBalance: roundMoney(pending - amt),
        commissionBalance: commission,
      };
    }
    case 'TRANSFER_COMMISSION': {
      const check = validateCommissionTransfer(amt, commission, action.minTransfer || 50);
      if (!check.valid) throw new Error(check.message);
      return {
        currentBalance: roundMoney(current + amt),
        pendingBalance: pending,
        commissionBalance: roundMoney(commission - amt),
      };
    }
    case 'APPROVE_DEPOSIT': {
      return {
        currentBalance: roundMoney(current + amt),
        pendingBalance: pending,
        commissionBalance: commission,
      };
    }
    case 'PURCHASE_REDEEM': {
      if (current < amt) throw new Error('Insufficient Current Balance.');
      return {
        currentBalance: roundMoney(current - amt),
        pendingBalance: pending,
        commissionBalance: commission,
      };
    }
    default:
      throw new Error(`Unsupported wallet action: ${action.type}`);
  }
}

/**
 * Aggregate financial reports clearly separating:
 * - Customer Wallet Liabilities (Current + Pending + Commission across users)
 * - Gross Transaction Turnover (Recharge + Redeem volume)
 * - Commission Paid to Retailers vs Platform Net Margin
 */
export function aggregateFinancialReport({ transactions = [], deposits = [], wallets = [], users = [] }) {
  let totalTransactions = transactions.length;
  let successfulCount = 0;
  let pendingCount = 0;
  let failedCount = 0;
  let mobileVolume = 0;
  let dthVolume = 0;
  let electricityVolume = 0;
  let redeemVolume = 0;
  let totalCommissionCredited = 0;
  let totalRefundedAmount = 0;

  for (const tx of transactions) {
    const amt = roundMoney(tx.amount);
    if (tx.status === 'SUCCESSFUL') {
      successfulCount += 1;
      if (tx.type === 'MOBILE_RECHARGE') mobileVolume = roundMoney(mobileVolume + amt);
      else if (tx.type === 'DTH_RECHARGE') dthVolume = roundMoney(dthVolume + amt);
      else if (tx.type === 'ELECTRICITY_BILL') electricityVolume = roundMoney(electricityVolume + amt);
      else if (tx.type === 'REDEEM_CODE') redeemVolume = roundMoney(redeemVolume + amt);
      totalCommissionCredited = roundMoney(totalCommissionCredited + roundMoney(tx.commissionAmount || 0));
    } else if (tx.status === 'PENDING' || tx.status === 'PROCESSING') {
      pendingCount += 1;
    } else if (tx.status === 'FAILED') {
      failedCount += 1;
      if (tx.refunded) {
        totalRefundedAmount = roundMoney(totalRefundedAmount + amt);
      }
    }
  }

  let approvedDepositsTotal = 0;
  let approvedDepositsCount = 0;
  let pendingDepositsCount = 0;
  for (const dep of deposits) {
    if (dep.status === 'APPROVED') {
      approvedDepositsTotal = roundMoney(approvedDepositsTotal + roundMoney(dep.amount));
      approvedDepositsCount += 1;
    } else if (dep.status === 'PENDING') {
      pendingDepositsCount += 1;
    }
  }

  let totalCurrentLiability = 0;
  let totalPendingLiability = 0;
  let totalCommissionLiability = 0;
  for (const w of wallets) {
    totalCurrentLiability = roundMoney(totalCurrentLiability + roundMoney(w.currentBalance || 0));
    totalPendingLiability = roundMoney(totalPendingLiability + roundMoney(w.pendingBalance || 0));
    totalCommissionLiability = roundMoney(totalCommissionLiability + roundMoney(w.commissionBalance || 0));
  }

  const totalWalletLiabilities = roundMoney(
    totalCurrentLiability + totalPendingLiability + totalCommissionLiability
  );
  const totalRechargeTurnover = roundMoney(mobileVolume + dthVolume + electricityVolume);
  const totalGrossTurnover = roundMoney(mobileVolume + dthVolume + electricityVolume + redeemVolume);

  // Platform operator margin (illustrative 1% spread on successful recharge turnover + redeem margin, distinct from customer funds)
  const estimatedPlatformGrossFee = roundMoney(totalRechargeTurnover * 0.035);
  const estimatedNetPlatformRevenue = roundMoney(Math.max(0, estimatedPlatformGrossFee - totalCommissionCredited));

  const activeUsers = users.filter((u) => u.status === 'ACTIVE').length;
  const suspendedUsers = users.filter((u) => u.status === 'SUSPENDED').length;

  return {
    counts: {
      totalTransactions,
      successfulCount,
      pendingCount,
      failedCount,
      approvedDepositsCount,
      pendingDepositsCount,
      totalUsers: users.length,
      activeUsers,
      suspendedUsers,
    },
    turnover: {
      mobileVolume,
      dthVolume,
      electricityVolume,
      redeemVolume,
      totalRechargeTurnover,
      totalGrossTurnover,
    },
    settlement: {
      approvedDepositsTotal,
      totalCommissionCredited,
      totalRefundedAmount,
    },
    walletLiabilities: {
      totalCurrentLiability,
      totalPendingLiability,
      totalCommissionLiability,
      totalWalletLiabilities,
    },
    platformRevenue: {
      estimatedNetPlatformRevenue,
      note: 'Platform margin figures are strictly separated from Customer Wallet Liabilities and Gross Turnover.',
    },
  };
}

/**
 * Convert array of flat objects into RFC-4180 CSV string with formula injection defense.
 */
export function buildSafeCsv(headers, rows) {
  const escapeCell = (val) => {
    let str = val === null || val === undefined ? '' : String(val);
    // Neutralize spreadsheet formula injection (=, +, -, @)
    if (/^[=+\-@]/.test(str)) {
      str = `'${str}`;
    }
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [headers.map((h) => escapeCell(h.label)).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCell(row[h.key])).join(','));
  }
  return lines.join('\n');
}
