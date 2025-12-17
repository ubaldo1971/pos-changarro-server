-- Migration: Add Partial Cancellations Support
-- Allows cancelling individual items from a sale

-- Table to track cancelled items
CREATE TABLE IF NOT EXISTS cancelled_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cancellation_id INTEGER NOT NULL,
    sale_item_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity REAL NOT NULL,
    refund_amount REAL NOT NULL,
    cancelled_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cancellation_id) REFERENCES cancellations(id),
    FOREIGN KEY (sale_item_id) REFERENCES sale_items(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Add cancelled_quantity column to sale_items
ALTER TABLE sale_items ADD COLUMN cancelled_quantity REAL DEFAULT 0;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_cancelled_items_cancellation ON cancelled_items(cancellation_id);
CREATE INDEX IF NOT EXISTS idx_cancelled_items_sale_item ON cancelled_items(sale_item_id);
