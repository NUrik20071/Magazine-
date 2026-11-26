-- Complete the schema baseline for the existing optional commerce module.
-- These tables are additive and are created only when absent; existing rows remain intact.
CREATE TABLE IF NOT EXISTS products (
  id serial PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL,
  category text NOT NULL,
  description text NOT NULL DEFAULT '',
  price integer NOT NULL,
  image_url text NOT NULL,
  badge text,
  is_featured boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS products_slug_unique ON products (slug);

CREATE TABLE IF NOT EXISTS storefront_settings (
  id integer PRIMARY KEY,
  config jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT storefront_settings_id_check CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS store_orders (
  id bigserial PRIMARY KEY,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text NOT NULL DEFAULT '',
  delivery_address text NOT NULL,
  customer_note text NOT NULL DEFAULT '',
  items jsonb NOT NULL,
  total_amount integer NOT NULL CHECK (total_amount >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  moderation_note text NOT NULL DEFAULT '',
  user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_media (
  id bigserial PRIMARY KEY,
  filename text NOT NULL,
  mime_type text NOT NULL,
  data bytea NOT NULL,
  byte_size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
