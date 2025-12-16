-- Migration: Add Cancellations and Refunds Support
-- Run this to add cancellation functionality to existing database

-- Add cancellation fields to sales table (if not exist)
-- Note: These will fail silently if columns already exist

-- Cancellations Table
CREATE TABLE IF NOT EXISTS cancellations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    sale_id INTEGER NOT NULL,
    cancelled_by INTEGER NOT NULL,
    cancellation_reason_code TEXT NOT NULL CHECK(cancellation_reason_code IN ('01', '02', '03', '04')),
    cancellation_reason_text TEXT NOT NULL,
    observations TEXT,
    requires_refund INTEGER DEFAULT 0,
    refund_method TEXT CHECK(refund_method IN ('cash', 'transfer', 'credit', NULL)),
    refund_status TEXT DEFAULT 'pending' CHECK(refund_status IN ('pending', 'processing', 'completed', 'rejected')),
    refund_amount REAL,
    refund_processed_at TEXT,
    refund_processed_by INTEGER,
    cancelled_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES businesses(id),
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (cancelled_by) REFERENCES users(id),
    FOREIGN KEY (refund_processed_by) REFERENCES users(id)
);

-- Refunds Table
CREATE TABLE IF NOT EXISTS refunds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cancellation_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    method TEXT NOT NULL CHECK(method IN ('cash', 'transfer', 'credit')),
    reference TEXT,
    bank_account TEXT,
    notes TEXT,
    processed_by INTEGER NOT NULL,
    processed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cancellation_id) REFERENCES cancellations(id),
    FOREIGN KEY (processed_by) REFERENCES users(id)
);

-- Cancellation Audit Log
CREATE TABLE IF NOT EXISTS cancellation_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cancellation_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    performed_by INTEGER NOT NULL,
    details TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cancellation_id) REFERENCES cancellations(id),
    FOREIGN KEY (performed_by) REFERENCES users(id)
);

-- Now add columns to sales table
ALTER TABLE sales ADD COLUMN cancelled INTEGER DEFAULT 0;
ALTER TABLE sales ADD COLUMN cancelled_at TEXT;
ALTER TABLE sales ADD COLUMN cancellation_id INTEGER;

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_cancellations_business ON cancellations(business_id);
CREATE INDEX IF NOT EXISTS idx_cancellations_sale ON cancellations(sale_id);
CREATE INDEX IF NOT EXISTS idx_cancellations_date ON cancellations(cancelled_at);
CREATE INDEX IF NOT EXISTS idx_refunds_cancellation ON refunds(cancellation_id);
CREATE INDEX IF NOT EXISTS idx_sales_cancelled ON sales(cancelled);
