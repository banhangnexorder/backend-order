ALTER TABLE orders
ADD COLUMN areas_status JSONB DEFAULT '{}'::jsonb;
