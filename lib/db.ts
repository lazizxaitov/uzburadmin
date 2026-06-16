import "server-only";

import Database from "better-sqlite3";
import crypto from "node:crypto";
import { getDatabasePath } from "./storage";

const dbPath = getDatabasePath();
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  const exists = columns.some((item) => item.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poster_id TEXT UNIQUE,
    name_ru TEXT NOT NULL,
    name_uz TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    image_url TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    synced_from_poster INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poster_id TEXT UNIQUE,
    category_id INTEGER,
    title_ru TEXT NOT NULL,
    title_uz TEXT NOT NULL,
    description_title_ru TEXT,
    description_title_uz TEXT,
    description_text_ru TEXT,
    description_text_uz TEXT,
    price INTEGER NOT NULL DEFAULT 0,
    price_text_ru TEXT,
    price_text_uz TEXT,
    pricing_mode TEXT NOT NULL DEFAULT 'quantity',
    stock INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    synced_from_poster INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS portion_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    label_ru TEXT NOT NULL,
    label_uz TEXT NOT NULL,
    price INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS banners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title_ru TEXT NOT NULL,
    title_uz TEXT NOT NULL,
    image_url TEXT NOT NULL,
    banner_type TEXT NOT NULL DEFAULT 'image',
    target_product_id INTEGER,
    target_category_id INTEGER,
    link_url TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    cafe_name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    work_hours TEXT NOT NULL DEFAULT '',
    delivery_fee INTEGER NOT NULL DEFAULT 0,
    min_order INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'сум',
    bonus_percent REAL NOT NULL DEFAULT 0,
    bonus_redeem_amount INTEGER NOT NULL DEFAULT 0,
    card_payment_enabled INTEGER NOT NULL DEFAULT 1,
    cash_payment_enabled INTEGER NOT NULL DEFAULT 1,
    card_payment_text TEXT NOT NULL DEFAULT '',
    payme_qr_image_url TEXT NOT NULL DEFAULT '',
    click_qr_image_url TEXT NOT NULL DEFAULT '',
    support_phone TEXT NOT NULL DEFAULT '',
    instagram TEXT NOT NULL DEFAULT '',
    telegram TEXT NOT NULL DEFAULT '',
    splash_image_url TEXT NOT NULL DEFAULT '',
    splash_title_ru TEXT NOT NULL DEFAULT '',
    splash_title_uz TEXT NOT NULL DEFAULT '',
    splash_subtitle_ru TEXT NOT NULL DEFAULT '',
    splash_subtitle_uz TEXT NOT NULL DEFAULT '',
    splash_show_once INTEGER NOT NULL DEFAULT 1,
    catalog_mode TEXT NOT NULL DEFAULT 'real',
    mobile_api_key TEXT NOT NULL DEFAULT '',
    plum_base_url TEXT NOT NULL DEFAULT 'https://pay.myuzcard.uz',
    plum_username TEXT NOT NULL DEFAULT '',
    plum_password TEXT NOT NULL DEFAULT '',
    eskiz_enabled INTEGER NOT NULL DEFAULT 0,
    eskiz_email TEXT NOT NULL DEFAULT '',
    eskiz_password TEXT NOT NULL DEFAULT '',
    eskiz_from TEXT NOT NULL DEFAULT '4546',
    eskiz_callback_url TEXT NOT NULL DEFAULT '',
    eskiz_notify_on_register INTEGER NOT NULL DEFAULT 1,
    eskiz_notify_on_order_created INTEGER NOT NULL DEFAULT 1,
    eskiz_notify_on_order_status INTEGER NOT NULL DEFAULT 1,
    eskiz_token TEXT NOT NULL DEFAULT '',
    eskiz_token_expires_at TEXT NOT NULL DEFAULT '',
    cashier_username TEXT NOT NULL DEFAULT 'uzburkassa',
    cashier_password TEXT NOT NULL DEFAULT 'kassa123',
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS poster_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    account_name TEXT NOT NULL DEFAULT '',
    access_token TEXT NOT NULL DEFAULT '',
    username TEXT NOT NULL DEFAULT '',
    password TEXT NOT NULL DEFAULT '',
    use_token INTEGER NOT NULL DEFAULT 1,
    import_categories INTEGER NOT NULL DEFAULT 1,
    import_products INTEGER NOT NULL DEFAULT 1,
    import_images INTEGER NOT NULL DEFAULT 1,
    is_connected INTEGER NOT NULL DEFAULT 0,
    last_sync_at TEXT,
    last_sync_status TEXT NOT NULL DEFAULT '',
    last_sync_error TEXT NOT NULL DEFAULT '',
    send_orders_to_poster INTEGER NOT NULL DEFAULT 0,
    order_spot_id TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT UNIQUE,
    customer_name TEXT NOT NULL DEFAULT '',
    customer_phone TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new',
    address_text TEXT NOT NULL DEFAULT '',
    subtotal INTEGER NOT NULL DEFAULT 0,
    delivery_fee INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    bonus_earned INTEGER NOT NULL DEFAULT 0,
    accepted_at TEXT,
    on_way_at TEXT,
    delivered_at TEXT,
    canceled_at TEXT,
    cancel_reason TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'mobile',
    poster_incoming_order_id TEXT NOT NULL DEFAULT '',
    poster_transaction_id TEXT NOT NULL DEFAULT '',
    poster_sync_status TEXT NOT NULL DEFAULT '',
    poster_sync_error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER,
    title TEXT NOT NULL,
    price INTEGER NOT NULL DEFAULT 0,
    quantity INTEGER NOT NULL DEFAULT 1,
    total INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    bonus_balance INTEGER NOT NULL DEFAULT 0,
    total_spent INTEGER NOT NULL DEFAULT 0,
    total_orders INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS customer_addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    address_line TEXT NOT NULL DEFAULT '',
    entrance TEXT NOT NULL DEFAULT '',
    floor TEXT NOT NULL DEFAULT '',
    comment TEXT NOT NULL DEFAULT '',
    latitude REAL,
    longitude REAL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS customer_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS customer_otp_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_token TEXT NOT NULL UNIQUE,
    purpose TEXT NOT NULL,
    phone TEXT NOT NULL,
    code TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    is_used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_categories_sort ON categories(sort_order, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_products_poster_id ON products(poster_id);
  CREATE INDEX IF NOT EXISTS idx_categories_poster_id ON categories(poster_id);
  CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
  CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
  CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
  CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id ON customer_addresses(customer_id, is_default DESC, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer_id ON customer_sessions(customer_id, is_active, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_customer_otp_phone ON customer_otp_requests(phone, purpose, is_used, created_at DESC);
`);

ensureColumn("settings", "splash_image_url", "TEXT NOT NULL DEFAULT ''");
ensureColumn("settings", "splash_title_ru", "TEXT NOT NULL DEFAULT ''");
ensureColumn("settings", "splash_title_uz", "TEXT NOT NULL DEFAULT ''");
ensureColumn("settings", "splash_subtitle_ru", "TEXT NOT NULL DEFAULT ''");
ensureColumn("settings", "splash_subtitle_uz", "TEXT NOT NULL DEFAULT ''");
ensureColumn("settings", "splash_show_once", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("settings", "catalog_mode", "TEXT NOT NULL DEFAULT 'real'");
ensureColumn("settings", "plum_base_url", "TEXT NOT NULL DEFAULT 'https://pay.myuzcard.uz'");
ensureColumn("settings", "plum_username", "TEXT NOT NULL DEFAULT ''");
ensureColumn("settings", "plum_password", "TEXT NOT NULL DEFAULT ''");
ensureColumn("settings", "eskiz_enabled", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("settings", "eskiz_email", "TEXT NOT NULL DEFAULT ''");
ensureColumn("settings", "eskiz_password", "TEXT NOT NULL DEFAULT ''");
ensureColumn("settings", "eskiz_from", "TEXT NOT NULL DEFAULT '4546'");
ensureColumn("settings", "eskiz_callback_url", "TEXT NOT NULL DEFAULT ''");
ensureColumn("settings", "eskiz_notify_on_register", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("settings", "eskiz_notify_on_order_created", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("settings", "eskiz_notify_on_order_status", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("settings", "eskiz_token", "TEXT NOT NULL DEFAULT ''");
ensureColumn("settings", "eskiz_token_expires_at", "TEXT NOT NULL DEFAULT ''");
ensureColumn("settings", "cashier_username", "TEXT NOT NULL DEFAULT 'uzburkassa'");
ensureColumn("settings", "cashier_password", "TEXT NOT NULL DEFAULT 'kassa123'");
ensureColumn("banners", "banner_type", "TEXT NOT NULL DEFAULT 'image'");
ensureColumn("banners", "target_product_id", "INTEGER");
ensureColumn("banners", "target_category_id", "INTEGER");
ensureColumn("orders", "payment_method", "TEXT NOT NULL DEFAULT 'cash'");
ensureColumn("orders", "payment_provider", "TEXT NOT NULL DEFAULT ''");
ensureColumn("orders", "payment_status", "TEXT NOT NULL DEFAULT ''");
ensureColumn("orders", "payment_transaction_id", "INTEGER");
ensureColumn("orders", "payment_session", "INTEGER");
ensureColumn("orders", "payment_card_mask", "TEXT NOT NULL DEFAULT ''");
ensureColumn("orders", "bonus_earned", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("orders", "accepted_at", "TEXT");
ensureColumn("orders", "on_way_at", "TEXT");
ensureColumn("orders", "delivered_at", "TEXT");
ensureColumn("orders", "canceled_at", "TEXT");
ensureColumn("orders", "cancel_reason", "TEXT NOT NULL DEFAULT ''");
ensureColumn("orders", "poster_incoming_order_id", "TEXT NOT NULL DEFAULT ''");
ensureColumn("orders", "poster_transaction_id", "TEXT NOT NULL DEFAULT ''");
ensureColumn("orders", "poster_sync_status", "TEXT NOT NULL DEFAULT ''");
ensureColumn("orders", "poster_sync_error", "TEXT NOT NULL DEFAULT ''");
ensureColumn("poster_settings", "auto_sync_enabled", "INTEGER NOT NULL DEFAULT 0");
ensureColumn(
  "poster_settings",
  "auto_sync_interval_minutes",
  "INTEGER NOT NULL DEFAULT 30"
);
ensureColumn("poster_settings", "webhook_secret", "TEXT NOT NULL DEFAULT ''");
ensureColumn("poster_settings", "send_orders_to_poster", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("poster_settings", "order_spot_id", "TEXT NOT NULL DEFAULT ''");
ensureColumn("customers", "password_hash", "TEXT NOT NULL DEFAULT ''");

const now = new Date().toISOString();

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

db.prepare(`
  INSERT INTO settings (
    id, cafe_name, phone, address, work_hours, delivery_fee, min_order, currency,
    bonus_percent, bonus_redeem_amount, card_payment_enabled, cash_payment_enabled,
    card_payment_text, payme_qr_image_url, click_qr_image_url, support_phone,
    instagram, telegram, splash_image_url, splash_title_ru, splash_title_uz,
    splash_subtitle_ru, splash_subtitle_uz, splash_show_once, catalog_mode, mobile_api_key,
    plum_base_url, plum_username, plum_password, eskiz_enabled, eskiz_email, eskiz_password,
    eskiz_from, eskiz_callback_url, eskiz_notify_on_register, eskiz_notify_on_order_created,
    eskiz_notify_on_order_status, eskiz_token, eskiz_token_expires_at,
    cashier_username, cashier_password, updated_at
  )
  VALUES (1, 'Uzbur', '', '', '', 0, 0, 'сум', 0, 0, 1, 1, '', '', '', '', '', '', ?, '', '', '', '', 1, 'real', '', 'https://pay.myuzcard.uz', '', '', 0, '', '', '4546', '', 1, 1, 1, '', '', 'uzburkassa', 'kassa123', ?)
  ON CONFLICT(id) DO NOTHING
`).run(
  "https://storage.googleapis.com/uxpilot-auth.appspot.com/ae7200cc90-a1e0c325e866593778d7.png",
  now,
);

const demoCategorySlug = "demo-burgers";
const demoCategory = db
  .prepare("SELECT id FROM categories WHERE slug = ?")
  .get(demoCategorySlug) as { id: number } | undefined;

let demoCategoryId = demoCategory?.id ?? 0;

if (!demoCategoryId) {
  const categoryInsert = db
    .prepare(
      `INSERT INTO categories
       (poster_id, name_ru, name_uz, slug, image_url, sort_order, is_active, synced_from_poster, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      "demo-category",
      "Бургеры",
      "Burgerlar",
      demoCategorySlug,
      "https://storage.googleapis.com/uxpilot-auth.appspot.com/ae7200cc90-a1e0c325e866593778d7.png",
      1,
      1,
      0,
      now,
      now,
    );
  demoCategoryId = Number(categoryInsert.lastInsertRowid);
}

const demoProduct = db
  .prepare("SELECT id FROM products WHERE poster_id = ?")
  .get("demo-product") as { id: number } | undefined;

let demoProductId = demoProduct?.id ?? 0;

if (!demoProductId) {
  const productInsert = db
    .prepare(
      `INSERT INTO products
       (poster_id, category_id, title_ru, title_uz, description_title_ru, description_title_uz,
        description_text_ru, description_text_uz, price, price_text_ru, price_text_uz,
        pricing_mode, stock, is_active, synced_from_poster, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      "demo-product",
      demoCategoryId,
      "Классический бургер",
      "Klassik burger",
      "Описание",
      "Tavsif",
      "Сочная говяжья котлета, сыр и свежие овощи.",
      "Sersuv mol go‘shti kotleti, pishloq va yangi sabzavotlar.",
      35000,
      "35 000 сум",
      "35 000 so‘m",
      "quantity",
      999,
      1,
      0,
      now,
      now,
    );
  demoProductId = Number(productInsert.lastInsertRowid);
}

const demoImageExists = db
  .prepare("SELECT id FROM product_images WHERE product_id = ? LIMIT 1")
  .get(demoProductId) as { id: number } | undefined;

if (!demoImageExists) {
  db.prepare(
    "INSERT INTO product_images (product_id, url, sort_order) VALUES (?, ?, ?)"
  ).run(
    demoProductId,
    "https://storage.googleapis.com/uxpilot-auth.appspot.com/ae7200cc90-a1e0c325e866593778d7.png",
    0,
  );
}

const reviewPhone = "+998997447744";
const reviewCustomer = db
  .prepare("SELECT id, password_hash FROM customers WHERE phone = ?")
  .get(reviewPhone) as { id: number; password_hash: string } | undefined;

if (!reviewCustomer) {
  db.prepare(
    `INSERT INTO customers
     (full_name, phone, email, password_hash, notes, bonus_balance, total_spent, total_orders, is_active, created_at, updated_at)
     VALUES (?, ?, '', ?, '', 0, 0, 0, 1, ?, ?)`
  ).run("App Review", reviewPhone, hashPassword("test"), now, now);
} else {
  db.prepare(
    "UPDATE customers SET full_name = ?, password_hash = ?, is_active = 1, updated_at = ? WHERE id = ?"
  ).run("App Review", hashPassword("test"), now, reviewCustomer.id);
}

db.prepare(`
  INSERT INTO poster_settings (
    id, account_name, access_token, username, password, use_token,
    import_categories, import_products, import_images, is_connected,
    last_sync_status, last_sync_error, send_orders_to_poster, order_spot_id, updated_at
  )
  VALUES (1, '', '', '', '', 1, 1, 1, 1, 0, '', '', 0, '', ?)
  ON CONFLICT(id) DO NOTHING
`).run(now);

export function getDb() {
  return db;
}

export function nowIso() {
  return new Date().toISOString();
}
