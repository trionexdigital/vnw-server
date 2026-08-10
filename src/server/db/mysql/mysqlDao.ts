import { MasterModel } from "../../models/MasterModel";
import { Constants } from "../../pixels-utility/constant";
import { Logger } from "../../pixels-utility/Logger";
import { hashPassword } from "../../pixels-utility/password";
import * as mysql from "mysql2";
import dotenv from "dotenv";
import * as util from "util";
import {
  CATEGORY_CLASSIFIER_VERSION,
  classifyNumber,
  syncNumberCategories,
} from "../../pixels/api/categories/categoryClassifier";

const logger = new Logger();
const masterModel = new MasterModel();
dotenv.config();

let db_host_ip: string = process.env.MYSQL_DB_HOST_IP + '';
let db_port: number = Number(process.env.MYSQL_DB_PORT + '');
let db_name: string = process.env.MYSQL_DB_NAME + '';
let db_user: string = process.env.MYSQL_DB_USER + '';
let db_password: string = process.env.MYSQL_DB_PASSWORD + '';
let db_conn_count: number = Number(process.env.MYSQL_DB_CONN_COUNT + '');

// connect to the db
const dbConnectionInfo = {
  host: db_host_ip,
  port: db_port,
  database: db_name,
  user: db_user,
  password: db_password,
  dateStrings: true,
  // multipleStatements: true,
  connectionLimit: db_conn_count //mysql connection pool length, ie DB Connections in pool
};

export function checkConnection() {
  const connection = mysql.createConnection(dbConnectionInfo);
  connection.connect((err) => {
    if (err) {
      console.error('❌ Connection failed:', err.message);
    } else {
      console.log('✅ Connected successfully to MySQL database!');
    }
    connection.end();
  });
}

//create mysql connection pool
logger.log('** DB Connection Pool: Starting: ' + JSON.stringify({ ...dbConnectionInfo, password: db_password ? '***REDACTED***' : '' }));
export const connPool = mysql.createPool(dbConnectionInfo);
logger.log('** DB Connection Pool: Success');

/**
 * Idempotent schema bootstrap run once at server startup.
 *
 * Every statement uses CREATE TABLE IF NOT EXISTS / INSERT IGNORE so it is safe
 * to run repeatedly and on a fresh, empty `vipnumberworld` database. The schema
 * models a VIP-number e-commerce marketplace (catalog, cart, orders, payments,
 * dealers, reviews, referrals). A small set of seed rows (admin/dealer/demo
 * users, sample numbers, testimonials, banners, and env keys) is also
 * inserted so the app is immediately usable.
 *
 * NOTE: the database `vipnumberworld` itself must already exist on the server
 * (one-time: CREATE DATABASE vipnumberworld;). This routine only creates tables.
 */
export async function ensureSchema(): Promise<void> {
  const pool = connPool.promise();

  const run = async (label: string, sql: string, params: any[] = []): Promise<void> => {
    try {
      await pool.query(sql, params);
      logger.log('** ensureSchema: applied — ' + label);
    } catch (e: any) {
      // Base-table reconciliation remains best-effort for legacy deployments.
      // Required versioned migrations below use direct queries and do block.
      logger.log('** ensureSchema: skipped (' + label + '): ' + (e?.message || e));
    }
  };

  try {
    logger.log('** ensureSchema: building VIP Number World schema…');

    // ---- env (key/value config; holds JWT MASTER_KEY) ----
    await run('create env',
      "CREATE TABLE IF NOT EXISTS `env` (" +
      "`key_id` varchar(64) NOT NULL," +
      "`value` text," +
      "`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
      "PRIMARY KEY (`key_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- auth_user ----
    await run('create auth_user',
      "CREATE TABLE IF NOT EXISTS `auth_user` (" +
      "`user_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`email` varchar(128) NOT NULL," +
      "`phone` varchar(20) NOT NULL," +
      "`password` varchar(512) NOT NULL," +
      "`role` enum('ADMIN','USER','DEALER','SYSTEM') NOT NULL DEFAULT 'USER'," +
      "`full_name` varchar(96) NOT NULL," +
      "`address` varchar(1048) DEFAULT NULL," +
      "`status` enum('ACTIVE','INACTIVE','BLOCKED') NOT NULL DEFAULT 'ACTIVE'," +
      "`logo` longtext," +
      "`referral_code` varchar(16) DEFAULT NULL," +
      "`referred_by` int unsigned DEFAULT NULL," +
      "`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
      "PRIMARY KEY (`user_id`)," +
      "UNIQUE KEY `email` (`email`)," +
      "UNIQUE KEY `phone` (`phone`)," +
      "UNIQUE KEY `referral_code` (`referral_code`)," +
      "KEY `referred_by` (`referred_by`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- categories ----
    await run('create categories',
      "CREATE TABLE IF NOT EXISTS `categories` (" +
      "`category_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`name` varchar(64) NOT NULL," +
      "`slug` varchar(64) NOT NULL," +
      "`icon` varchar(64) DEFAULT NULL," +
      "`description` varchar(255) DEFAULT NULL," +
      "`sort_order` int NOT NULL DEFAULT '0'," +
      "`is_active` tinyint(1) NOT NULL DEFAULT '1'," +
      "PRIMARY KEY (`category_id`), UNIQUE KEY `slug` (`slug`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- vip_numbers (product) ----
    await run('create vip_numbers',
      "CREATE TABLE IF NOT EXISTS `vip_numbers` (" +
      "`number_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`number_value` varchar(20) NOT NULL," +
      "`display_number` varchar(30) NOT NULL," +
      "`category_id` int unsigned DEFAULT NULL," +
      "`seller_id` int unsigned NOT NULL," +
      "`seller_type` enum('ADMIN','DEALER') NOT NULL DEFAULT 'ADMIN'," +
      "`title_label` varchar(64) DEFAULT 'VIP Number'," +
      "`badge` enum('NONE','HOT_PICK','PREMIUM','BEST_SELLER','HOT_DEAL','NEW_ARRIVAL','VALUE_PICK') NOT NULL DEFAULT 'NONE'," +
      "`mrp` decimal(18,2) NOT NULL DEFAULT '0.00'," +
      "`offer_price` decimal(18,2) NOT NULL DEFAULT '0.00'," +
      "`discount_pct` int NOT NULL DEFAULT '0'," +
      "`numerology_sum` int DEFAULT NULL," +
      "`operator` varchar(32) DEFAULT NULL," +
      "`description` text," +
      "`stock` int NOT NULL DEFAULT '1'," +
      "`status` enum('AVAILABLE','RESERVED','SOLD','PENDING_APPROVAL','REJECTED','INACTIVE') NOT NULL DEFAULT 'AVAILABLE'," +
      "`rtp_status` enum('RTP','NON_RTP') NOT NULL DEFAULT 'RTP'," +
      "`rtp_available_at` datetime DEFAULT NULL," +
      "`is_featured` tinyint(1) NOT NULL DEFAULT '0'," +
      "`views` int NOT NULL DEFAULT '0'," +
      "`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
      "PRIMARY KEY (`number_id`), UNIQUE KEY `number_value` (`number_value`)," +
      "KEY `category_id` (`category_id`), KEY `seller_id` (`seller_id`)," +
      "KEY `status` (`status`), KEY `is_featured` (`is_featured`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Derived, exclusive automatic category. The legacy categories table
    // and category_id column remain read-only for one compatibility release.
    await run('create vip_number_categories',
      "CREATE TABLE IF NOT EXISTS `vip_number_categories` (" +
      "`number_id` int unsigned NOT NULL," +
      "`category_slug` varchar(64) NOT NULL," +
      "`classifier_version` smallint unsigned NOT NULL," +
      "`matched_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "PRIMARY KEY (`number_id`,`category_slug`)," +
      "UNIQUE KEY `number_category_exclusive` (`number_id`)," +
      "KEY `category_lookup` (`category_slug`,`number_id`)," +
      "KEY `classifier_version` (`classifier_version`)," +
      "CONSTRAINT `fk_vip_number_categories_number` FOREIGN KEY (`number_id`) " +
      "REFERENCES `vip_numbers` (`number_id`) ON DELETE CASCADE" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- deal_of_day_numbers (curated homepage hero list) ----
    await run('create deal_of_day_numbers',
      "CREATE TABLE IF NOT EXISTS `deal_of_day_numbers` (" +
      "`deal_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`number_id` int unsigned NOT NULL," +
      "`hero_label` varchar(64) DEFAULT NULL," +
      "`hero_description` varchar(160) DEFAULT NULL," +
      "`sort_order` int NOT NULL DEFAULT '0'," +
      "`is_active` tinyint(1) NOT NULL DEFAULT '1'," +
      "`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
      "PRIMARY KEY (`deal_id`)," +
      "UNIQUE KEY `deal_number_unique` (`number_id`)," +
      "KEY `deal_published_order` (`is_active`,`sort_order`)," +
      "CONSTRAINT `fk_deal_of_day_number` FOREIGN KEY (`number_id`) " +
      "REFERENCES `vip_numbers` (`number_id`) ON DELETE CASCADE" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- family packs (legacy compatibility tables) ----
    await run('create corporate_packs',
      "CREATE TABLE IF NOT EXISTS `corporate_packs` (" +
      "`pack_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`title` varchar(96) NOT NULL," +
      "`pack_type` enum('SERIES','MIXED','SIMILAR_START','SIMILAR_END','SIMILAR_BOTH') NOT NULL," +
      "`description` varchar(320) DEFAULT NULL," +
      "`sort_order` int NOT NULL DEFAULT '0'," +
      "`is_active` tinyint(1) NOT NULL DEFAULT '1'," +
      "`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
      "PRIMARY KEY (`pack_id`), KEY `pack_published_order` (`is_active`,`sort_order`)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    await run('create corporate_pack_items',
      "CREATE TABLE IF NOT EXISTS `corporate_pack_items` (" +
      "`pack_item_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`pack_id` int unsigned NOT NULL," +
      "`number_id` int unsigned NOT NULL," +
      "`sort_order` int NOT NULL DEFAULT '0'," +
      "PRIMARY KEY (`pack_item_id`)," +
      "UNIQUE KEY `pack_number_unique` (`pack_id`,`number_id`)," +
      "KEY `corporate_pack_item_number` (`number_id`)," +
      "CONSTRAINT `fk_corporate_pack_item_pack` FOREIGN KEY (`pack_id`) REFERENCES `corporate_packs` (`pack_id`) ON DELETE CASCADE," +
      "CONSTRAINT `fk_corporate_pack_item_number` FOREIGN KEY (`number_id`) REFERENCES `vip_numbers` (`number_id`) ON DELETE CASCADE" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- trusted clients (admin-only publishing, public logo feed) ----
    await run('create trusted_clients',
      "CREATE TABLE IF NOT EXISTS `trusted_clients` (" +
      "`client_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`name` varchar(96) NOT NULL," +
      "`website_url` varchar(512) DEFAULT NULL," +
      "`alt_text` varchar(160) DEFAULT NULL," +
      "`logo_mime` varchar(32) DEFAULT NULL," +
      "`logo_data` longblob," +
      "`logo_sha256` char(64) DEFAULT NULL," +
      "`sort_order` int NOT NULL DEFAULT '0'," +
      "`is_active` tinyint(1) NOT NULL DEFAULT '1'," +
      "`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
      "PRIMARY KEY (`client_id`), KEY `trusted_client_published_order` (`is_active`,`sort_order`)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- frequently asked questions ----
    await run('create faqs',
      "CREATE TABLE IF NOT EXISTS `faqs` (" +
      "`faq_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`category` varchar(64) NOT NULL," +
      "`question` varchar(255) NOT NULL," +
      "`answer` text NOT NULL," +
      "`sort_order` int NOT NULL DEFAULT '0'," +
      "`is_active` tinyint(1) NOT NULL DEFAULT '1'," +
      "`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
      "PRIMARY KEY (`faq_id`), KEY `faq_published_order` (`is_active`,`sort_order`)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- carts / cart_items ----
    await run('create carts',
      "CREATE TABLE IF NOT EXISTS `carts` (" +
      "`cart_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`user_id` int unsigned NOT NULL," +
      "`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "PRIMARY KEY (`cart_id`), UNIQUE KEY `user_id` (`user_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    await run('create cart_items',
      "CREATE TABLE IF NOT EXISTS `cart_items` (" +
      "`cart_item_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`cart_id` int unsigned NOT NULL," +
      "`number_id` int unsigned NOT NULL," +
      "`added_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "PRIMARY KEY (`cart_item_id`), UNIQUE KEY `cart_number` (`cart_id`,`number_id`)," +
      "KEY `number_id` (`number_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- wishlist ----
    await run('create wishlist',
      "CREATE TABLE IF NOT EXISTS `wishlist` (" +
      "`wishlist_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`user_id` int unsigned NOT NULL," +
      "`number_id` int unsigned NOT NULL," +
      "`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "PRIMARY KEY (`wishlist_id`), UNIQUE KEY `user_number` (`user_id`,`number_id`)," +
      "KEY `number_id` (`number_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- orders ----
    await run('create orders',
      "CREATE TABLE IF NOT EXISTS `orders` (" +
      "`order_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`order_no` varchar(32) NOT NULL," +
      "`user_id` int unsigned NOT NULL," +
      "`subtotal` decimal(18,2) NOT NULL DEFAULT '0.00'," +
      "`discount` decimal(18,2) NOT NULL DEFAULT '0.00'," +
      "`total` decimal(18,2) NOT NULL DEFAULT '0.00'," +
      "`status` enum('PENDING','PAID','PROCESSING','COMPLETED','CANCELLED','REFUNDED') NOT NULL DEFAULT 'PENDING'," +
      "`payment_status` enum('UNPAID','PAID','FAILED','REFUNDED') NOT NULL DEFAULT 'UNPAID'," +
      "`order_type` enum('PURCHASE','PREBOOK') NOT NULL DEFAULT 'PURCHASE'," +
      "`payment_expires_at` datetime DEFAULT NULL," +
      "`coupon_code` varchar(32) DEFAULT NULL," +
      "`razorpay_order_id` varchar(64) DEFAULT NULL," +
      "`razorpay_payment_id` varchar(64) DEFAULT NULL," +
      "`razorpay_signature` varchar(256) DEFAULT NULL," +
      "`customer_name` varchar(96) DEFAULT NULL," +
      "`customer_email` varchar(128) DEFAULT NULL," +
      "`customer_phone` varchar(20) DEFAULT NULL," +
      "`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
      "PRIMARY KEY (`order_id`), UNIQUE KEY `order_no` (`order_no`)," +
      "KEY `user_id` (`user_id`), KEY `razorpay_order_id` (`razorpay_order_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- order_items ----
    await run('create order_items',
      "CREATE TABLE IF NOT EXISTS `order_items` (" +
      "`order_item_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`order_id` int unsigned NOT NULL," +
      "`number_id` int unsigned NOT NULL," +
      "`seller_id` int unsigned NOT NULL," +
      "`display_number` varchar(30) DEFAULT NULL," +
      "`price` decimal(18,2) NOT NULL DEFAULT '0.00'," +
      "`commission_amount` decimal(18,2) NOT NULL DEFAULT '0.00'," +
      "`item_status` enum('PENDING','PAID','TRANSFERRED','CANCELLED') NOT NULL DEFAULT 'PENDING'," +
      "PRIMARY KEY (`order_item_id`), KEY `order_id` (`order_id`)," +
      "KEY `number_id` (`number_id`), KEY `seller_id` (`seller_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- payments (Razorpay audit) ----
    await run('create payments',
      "CREATE TABLE IF NOT EXISTS `payments` (" +
      "`payment_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`order_id` int unsigned DEFAULT NULL," +
      "`razorpay_order_id` varchar(64) DEFAULT NULL," +
      "`razorpay_payment_id` varchar(64) DEFAULT NULL," +
      "`amount` decimal(18,2) NOT NULL DEFAULT '0.00'," +
      "`currency` varchar(8) NOT NULL DEFAULT 'INR'," +
      "`status` varchar(32) DEFAULT NULL," +
      "`method` varchar(32) DEFAULT NULL," +
      "`raw_payload` longtext," +
      "`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "PRIMARY KEY (`payment_id`), KEY `order_id` (`order_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- paid, exclusive NON-RTP reservations ----
    await run('create prebookings',
      "CREATE TABLE IF NOT EXISTS `prebookings` (" +
      "`prebook_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`order_id` int unsigned NOT NULL," +
      "`user_id` int unsigned NOT NULL," +
      "`number_id` int unsigned NOT NULL," +
      "`status` enum('PENDING_PAYMENT','BOOKED','READY','CANCEL_REQUESTED','REFUND_PENDING','REFUNDED','FULFILLED','FAILED') NOT NULL DEFAULT 'PENDING_PAYMENT'," +
      "`rtp_available_at_snapshot` datetime NOT NULL," +
      "`hold_expires_at` datetime NOT NULL," +
      "`paid_at` datetime DEFAULT NULL," +
      "`cancellation_deadline` datetime DEFAULT NULL," +
      "`fulfilled_at` datetime DEFAULT NULL," +
      "`refunded_at` datetime DEFAULT NULL," +
      "`issue_note` varchar(1000) DEFAULT NULL," +
      "`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
      "PRIMARY KEY (`prebook_id`), UNIQUE KEY `prebook_order_unique` (`order_id`)," +
      "KEY `prebook_user` (`user_id`,`created_at`), KEY `prebook_number_state` (`number_id`,`status`)," +
      "KEY `prebook_due` (`status`,`rtp_available_at_snapshot`), KEY `prebook_hold` (`status`,`hold_expires_at`)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    await run('create prebook_refund_requests',
      "CREATE TABLE IF NOT EXISTS `prebook_refund_requests` (" +
      "`refund_request_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`prebook_id` int unsigned NOT NULL," +
      "`user_id` int unsigned NOT NULL," +
      "`reason_type` enum('CUSTOMER_CANCELLATION','DELIVERY_ISSUE','UPC_ISSUE','ACTIVATION_ISSUE','NUMBER_UNAVAILABLE') NOT NULL," +
      "`status` enum('PENDING','APPROVED','REJECTED','PROCESSING','PROCESSED','FAILED') NOT NULL DEFAULT 'PENDING'," +
      "`status_before_request` enum('BOOKED','READY') NOT NULL," +
      "`amount` decimal(18,2) NOT NULL," +
      "`customer_note` varchar(1000) DEFAULT NULL," +
      "`admin_note` varchar(1000) DEFAULT NULL," +
      "`reviewed_by` int unsigned DEFAULT NULL," +
      "`razorpay_refund_id` varchar(64) DEFAULT NULL," +
      "`gateway_status` varchar(32) DEFAULT NULL," +
      "`gateway_payload` longtext," +
      "`requested_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "`reviewed_at` datetime DEFAULT NULL," +
      "`processed_at` datetime DEFAULT NULL," +
      "PRIMARY KEY (`refund_request_id`), KEY `prebook_refund_history` (`prebook_id`,`status`)," +
      "UNIQUE KEY `razorpay_refund_unique` (`razorpay_refund_id`), KEY `refund_queue` (`status`,`requested_at`)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- reviews ----
    await run('create reviews',
      "CREATE TABLE IF NOT EXISTS `reviews` (" +
      "`review_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`user_id` int unsigned NOT NULL," +
      "`number_id` int unsigned NOT NULL," +
      "`rating` tinyint NOT NULL DEFAULT '5'," +
      "`comment` varchar(1024) DEFAULT NULL," +
      "`status` enum('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'APPROVED'," +
      "`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "PRIMARY KEY (`review_id`), KEY `number_id` (`number_id`), KEY `user_id` (`user_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- testimonials (landing) ----
    await run('create testimonials',
      "CREATE TABLE IF NOT EXISTS `testimonials` (" +
      "`testimonial_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`name` varchar(96) NOT NULL," +
      "`role` varchar(96) DEFAULT NULL," +
      "`avatar` longtext," +
      "`content` varchar(1024) NOT NULL," +
      "`rating` tinyint NOT NULL DEFAULT '5'," +
      "`is_active` tinyint(1) NOT NULL DEFAULT '1'," +
      "`sort_order` int NOT NULL DEFAULT '0'," +
      "PRIMARY KEY (`testimonial_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- banners (hero) ----
    await run('create banners',
      "CREATE TABLE IF NOT EXISTS `banners` (" +
      "`banner_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`eyebrow` varchar(96) DEFAULT NULL," +
      "`title` varchar(160) DEFAULT NULL," +
      "`subtitle` varchar(255) DEFAULT NULL," +
      "`image` longtext," +
      "`cta_text` varchar(64) DEFAULT NULL," +
      "`cta_link` varchar(255) DEFAULT NULL," +
      "`content_x` tinyint unsigned NOT NULL DEFAULT '25'," +
      "`content_y` tinyint unsigned NOT NULL DEFAULT '62'," +
      "`content_width` tinyint unsigned NOT NULL DEFAULT '34'," +
      "`content_rotation` smallint NOT NULL DEFAULT '0'," +
      "`content_style` varchar(16) NOT NULL DEFAULT 'light'," +
      "`text_align` varchar(8) NOT NULL DEFAULT 'left'," +
      "`font_style` varchar(12) NOT NULL DEFAULT 'serif'," +
      "`title_size` varchar(8) NOT NULL DEFAULT 'medium'," +
      "`overlay_style` varchar(12) NOT NULL DEFAULT 'soft'," +
      "`is_active` tinyint(1) NOT NULL DEFAULT '1'," +
      "`sort_order` int NOT NULL DEFAULT '0'," +
      "PRIMARY KEY (`banner_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- carousel studio (intentionally independent from legacy banners) ----
    // Draft and published documents live in separate columns so an autosave can
    // never mutate the version currently rendered by the storefront.
    await run('create carousel_projects',
      "CREATE TABLE IF NOT EXISTS `carousel_projects` (" +
      "`carousel_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`name` varchar(120) NOT NULL DEFAULT 'Untitled carousel'," +
      "`sort_order` int NOT NULL DEFAULT '0'," +
      "`is_published` tinyint(1) NOT NULL DEFAULT '0'," +
      "`draft_revision` int unsigned NOT NULL DEFAULT '1'," +
      "`draft_desktop` longtext," +
      "`draft_mobile` longtext," +
      "`draft_desktop_preview_id` int unsigned DEFAULT NULL," +
      "`draft_mobile_preview_id` int unsigned DEFAULT NULL," +
      "`published_revision` int unsigned DEFAULT NULL," +
      "`published_desktop` longtext," +
      "`published_mobile` longtext," +
      "`published_desktop_preview_id` int unsigned DEFAULT NULL," +
      "`published_mobile_preview_id` int unsigned DEFAULT NULL," +
      "`transition_style` varchar(24) NOT NULL DEFAULT 'fade'," +
      "`autoplay_seconds` tinyint unsigned NOT NULL DEFAULT '6'," +
      "`created_by` int unsigned NOT NULL," +
      "`updated_by` int unsigned NOT NULL," +
      "`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
      "`published_at` timestamp NULL DEFAULT NULL," +
      "PRIMARY KEY (`carousel_id`), KEY `published_order` (`is_published`,`sort_order`)) " +
      "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    await run('create carousel_assets',
      "CREATE TABLE IF NOT EXISTS `carousel_assets` (" +
      "`asset_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`carousel_id` int unsigned NOT NULL," +
      "`purpose` enum('source','sticker','preview-desktop','preview-mobile') NOT NULL DEFAULT 'source'," +
      "`original_name` varchar(180) NOT NULL," +
      "`mime_type` varchar(64) NOT NULL," +
      "`byte_size` int unsigned NOT NULL," +
      "`width` int unsigned NOT NULL," +
      "`height` int unsigned NOT NULL," +
      "`content_sha256` char(64) NOT NULL," +
      "`content` longblob NOT NULL," +
      "`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "PRIMARY KEY (`asset_id`), KEY `project_assets` (`carousel_id`,`purpose`)) " +
      "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- dealer_profiles ----
    await run('create dealer_profiles',
      "CREATE TABLE IF NOT EXISTS `dealer_profiles` (" +
      "`dealer_id` int unsigned NOT NULL," +
      "`business_name` varchar(128) DEFAULT NULL," +
      "`gst_no` varchar(32) DEFAULT NULL," +
      "`payout_method` varchar(32) DEFAULT NULL," +
      "`payout_details` longtext," +
      "`commission_pct` decimal(6,2) NOT NULL DEFAULT '10.00'," +
      "`kyc_status` enum('PENDING','VERIFIED','REJECTED') NOT NULL DEFAULT 'PENDING'," +
      "`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "PRIMARY KEY (`dealer_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- dealer_payouts ----
    await run('create dealer_payouts',
      "CREATE TABLE IF NOT EXISTS `dealer_payouts` (" +
      "`payout_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`dealer_id` int unsigned NOT NULL," +
      "`amount` decimal(18,2) NOT NULL DEFAULT '0.00'," +
      "`status` enum('PENDING','APPROVED','PAID','REJECTED') NOT NULL DEFAULT 'PENDING'," +
      "`reference` varchar(128) DEFAULT NULL," +
      "`requested_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "`processed_at` timestamp NULL DEFAULT NULL," +
      "PRIMARY KEY (`payout_id`), KEY `dealer_id` (`dealer_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- referral_earnings ----
    await run('create referral_earnings',
      "CREATE TABLE IF NOT EXISTS `referral_earnings` (" +
      "`id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`user_id` int unsigned NOT NULL," +
      "`source_user_id` int unsigned NOT NULL," +
      "`type` enum('SIGNUP','PURCHASE') NOT NULL DEFAULT 'SIGNUP'," +
      "`amount` decimal(18,2) NOT NULL DEFAULT '0.00'," +
      "`order_id` int unsigned DEFAULT NULL," +
      "`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "PRIMARY KEY (`id`), KEY `user_id` (`user_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- coupons ----
    await run('create coupons',
      "CREATE TABLE IF NOT EXISTS `coupons` (" +
      "`coupon_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`code` varchar(32) NOT NULL," +
      "`type` enum('PERCENT','FLAT') NOT NULL DEFAULT 'PERCENT'," +
      "`value` decimal(18,2) NOT NULL DEFAULT '0.00'," +
      "`min_order` decimal(18,2) NOT NULL DEFAULT '0.00'," +
      "`max_discount` decimal(18,2) DEFAULT NULL," +
      "`usage_limit` int DEFAULT NULL," +
      "`used_count` int NOT NULL DEFAULT '0'," +
      "`expires_at` date DEFAULT NULL," +
      "`is_active` tinyint(1) NOT NULL DEFAULT '1'," +
      "PRIMARY KEY (`coupon_id`), UNIQUE KEY `code` (`code`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- notifications ----
    await run('create notifications',
      "CREATE TABLE IF NOT EXISTS `notifications` (" +
      "`notification_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`user_id` int unsigned NOT NULL," +
      "`sender_id` int unsigned NOT NULL DEFAULT '0'," +
      "`type` varchar(32) NOT NULL DEFAULT 'info'," +
      "`title` varchar(160) NOT NULL," +
      "`message` varchar(1024) NOT NULL," +
      "`is_read` varchar(8) NOT NULL DEFAULT 'false'," +
      "`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "PRIMARY KEY (`notification_id`), KEY `user_id` (`user_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- contact_messages ----
    await run('create contact_messages',
      "CREATE TABLE IF NOT EXISTS `contact_messages` (" +
      "`message_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`name` varchar(96) NOT NULL," +
      "`email` varchar(128) NOT NULL," +
      "`phone` varchar(20) DEFAULT NULL," +
      "`subject` varchar(160) DEFAULT NULL," +
      "`message` varchar(2048) NOT NULL," +
      "`status` enum('NEW','READ','CLOSED') NOT NULL DEFAULT 'NEW'," +
      "`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "PRIMARY KEY (`message_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- password_reset_requests ----
    await run('create password_reset_requests',
      "CREATE TABLE IF NOT EXISTS `password_reset_requests` (" +
      "`reset_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`user_id` int unsigned NOT NULL," +
      "`email` varchar(128) NOT NULL," +
      "`reason` varchar(1024) DEFAULT NULL," +
      "`status` enum('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING'," +
      "`admin_id` int unsigned DEFAULT NULL," +
      "`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "`processed_at` timestamp NULL DEFAULT NULL," +
      "PRIMARY KEY (`reset_id`), KEY `user_id` (`user_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- newsletter_subscribers ----
    await run('create newsletter_subscribers',
      "CREATE TABLE IF NOT EXISTS `newsletter_subscribers` (" +
      "`id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`email` varchar(128) NOT NULL," +
      "`source` varchar(32) DEFAULT 'footer'," +
      "`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "PRIMARY KEY (`id`), UNIQUE KEY `email` (`email`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- permissions (RBAC catalog of grantable capability keys) ----
    await run('create permissions',
      "CREATE TABLE IF NOT EXISTS `permissions` (" +
      "`perm_key` varchar(64) NOT NULL," +
      "`module` enum('USER','DEALER','MANAGE') NOT NULL DEFAULT 'USER'," +
      "`label` varchar(96) NOT NULL," +
      "`description` varchar(255) DEFAULT NULL," +
      "`sort_order` int NOT NULL DEFAULT '0'," +
      "PRIMARY KEY (`perm_key`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- role_default_permissions (baseline permissions auto-granted per role) ----
    await run('create role_default_permissions',
      "CREATE TABLE IF NOT EXISTS `role_default_permissions` (" +
      "`role` enum('ADMIN','USER','DEALER','EMPLOYEE','SYSTEM') NOT NULL," +
      "`perm_key` varchar(64) NOT NULL," +
      "PRIMARY KEY (`role`,`perm_key`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- user_permissions (per-user overrides; granted=1 add, granted=0 revoke) ----
    await run('create user_permissions',
      "CREATE TABLE IF NOT EXISTS `user_permissions` (" +
      "`user_id` int unsigned NOT NULL," +
      "`perm_key` varchar(64) NOT NULL," +
      "`granted` tinyint(1) NOT NULL DEFAULT '1'," +
      "`granted_by` int unsigned DEFAULT NULL," +
      "`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
      "PRIMARY KEY (`user_id`,`perm_key`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- sell_requests (a USER offers to sell their own number to the platform) ----
    await run('create sell_requests',
      "CREATE TABLE IF NOT EXISTS `sell_requests` (" +
      "`request_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`user_id` int unsigned NOT NULL," +
      "`number_value` varchar(20) NOT NULL," +
      "`display_number` varchar(30) NOT NULL," +
      "`operator` varchar(32) DEFAULT NULL," +
      "`category_id` int unsigned DEFAULT NULL," +
      "`asking_price` decimal(18,2) NOT NULL DEFAULT '0.00'," +
      "`description` text," +
      "`contact_phone` varchar(20) DEFAULT NULL," +
      "`status` enum('PENDING','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING'," +
      "`admin_id` int unsigned DEFAULT NULL," +
      "`admin_note` varchar(512) DEFAULT NULL," +
      "`offer_price` decimal(18,2) DEFAULT NULL," +
      "`number_id` int unsigned DEFAULT NULL," +
      "`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "`processed_at` timestamp NULL DEFAULT NULL," +
      "PRIMARY KEY (`request_id`), KEY `user_id` (`user_id`), KEY `status` (`status`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- approval_requests (EMPLOYEE deferred-action queue; nothing applies until ADMIN approves) ----
    await run('create approval_requests',
      "CREATE TABLE IF NOT EXISTS `approval_requests` (" +
      "`approval_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`requested_by` int unsigned NOT NULL," +
      "`action_key` varchar(64) NOT NULL," +
      "`summary` varchar(255) NOT NULL," +
      "`payload` longtext," +
      "`status` enum('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING'," +
      "`reviewed_by` int unsigned DEFAULT NULL," +
      "`review_note` varchar(512) DEFAULT NULL," +
      "`result` longtext," +
      "`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "`reviewed_at` timestamp NULL DEFAULT NULL," +
      "PRIMARY KEY (`approval_id`), KEY `requested_by` (`requested_by`), KEY `status` (`status`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- wallets (one balance row per user; credited on sales / number purchases by platform) ----
    await run('create wallets',
      "CREATE TABLE IF NOT EXISTS `wallets` (" +
      "`user_id` int unsigned NOT NULL," +
      "`balance` decimal(18,2) NOT NULL DEFAULT '0.00'," +
      "`total_credited` decimal(18,2) NOT NULL DEFAULT '0.00'," +
      "`total_debited` decimal(18,2) NOT NULL DEFAULT '0.00'," +
      "`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
      "PRIMARY KEY (`user_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- wallet_transactions (immutable audit ledger; unique source+ref makes credits idempotent) ----
    await run('create wallet_transactions',
      "CREATE TABLE IF NOT EXISTS `wallet_transactions` (" +
      "`txn_id` int unsigned NOT NULL AUTO_INCREMENT," +
      "`user_id` int unsigned NOT NULL," +
      "`direction` enum('CREDIT','DEBIT') NOT NULL," +
      "`amount` decimal(18,2) NOT NULL," +
      "`balance_after` decimal(18,2) NOT NULL DEFAULT '0.00'," +
      "`source` enum('SALE','SELL_PAYOUT','WITHDRAWAL','WITHDRAWAL_REVERSAL','REFERRAL','ADJUSTMENT') NOT NULL DEFAULT 'ADJUSTMENT'," +
      "`reference_type` varchar(32) DEFAULT NULL," +
      "`reference_id` int unsigned DEFAULT NULL," +
      "`description` varchar(255) DEFAULT NULL," +
      "`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "PRIMARY KEY (`txn_id`), KEY `user_id` (`user_id`)," +
      "UNIQUE KEY `uniq_source_ref` (`source`,`reference_type`,`reference_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // ---- ensure auth_user.role enum includes EMPLOYEE (idempotent MODIFY) ----
    await run('alter auth_user add EMPLOYEE role',
      "ALTER TABLE `auth_user` MODIFY COLUMN `role` enum('ADMIN','USER','DEALER','EMPLOYEE','SYSTEM') NOT NULL DEFAULT 'USER'");

    // ---- extend contact_messages for per-number enquiries (guarded) ----
    const colExists = async (table: string, col: string): Promise<boolean> => {
      try {
        const [rows]: any = await pool.query(
          `SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1`,
          [db_name, table, col]);
        return Array.isArray(rows) && rows.length > 0;
      } catch { return false; }
    };
    const indexExists = async (table: string, index: string): Promise<boolean> => {
      try {
        const [rows]: any = await pool.query(
          `SELECT 1 FROM information_schema.statistics WHERE table_schema = ? AND table_name = ? AND index_name = ? LIMIT 1`,
          [db_name, table, index]);
        return Array.isArray(rows) && rows.length > 0;
      } catch { return false; }
    };
    if (!(await colExists('contact_messages', 'number_id')))
      await run('add contact_messages.number_id', "ALTER TABLE `contact_messages` ADD COLUMN `number_id` int unsigned NULL");
    if (!(await colExists('contact_messages', 'type')))
      await run('add contact_messages.type', "ALTER TABLE `contact_messages` ADD COLUMN `type` varchar(24) NOT NULL DEFAULT 'CONTACT'");

    if (!(await colExists('banners', 'eyebrow')))
      await run('add banners.eyebrow', "ALTER TABLE `banners` ADD COLUMN `eyebrow` varchar(96) DEFAULT NULL AFTER `banner_id`");
    if (!(await colExists('banners', 'content_x')))
      await run('add banners.content_x', "ALTER TABLE `banners` ADD COLUMN `content_x` tinyint unsigned NOT NULL DEFAULT '25' AFTER `cta_link`");
    if (!(await colExists('banners', 'content_y')))
      await run('add banners.content_y', "ALTER TABLE `banners` ADD COLUMN `content_y` tinyint unsigned NOT NULL DEFAULT '62' AFTER `content_x`");
    if (!(await colExists('banners', 'content_width')))
      await run('add banners.content_width', "ALTER TABLE `banners` ADD COLUMN `content_width` tinyint unsigned NOT NULL DEFAULT '34' AFTER `content_y`");
    if (!(await colExists('banners', 'content_rotation')))
      await run('add banners.content_rotation', "ALTER TABLE `banners` ADD COLUMN `content_rotation` smallint NOT NULL DEFAULT '0' AFTER `content_width`");
    if (!(await colExists('banners', 'content_style')))
      await run('add banners.content_style', "ALTER TABLE `banners` ADD COLUMN `content_style` varchar(16) NOT NULL DEFAULT 'light' AFTER `content_rotation`");
    if (!(await colExists('banners', 'text_align')))
      await run('add banners.text_align', "ALTER TABLE `banners` ADD COLUMN `text_align` varchar(8) NOT NULL DEFAULT 'left' AFTER `content_style`");
    if (!(await colExists('banners', 'font_style')))
      await run('add banners.font_style', "ALTER TABLE `banners` ADD COLUMN `font_style` varchar(12) NOT NULL DEFAULT 'serif' AFTER `text_align`");
    if (!(await colExists('banners', 'title_size')))
      await run('add banners.title_size', "ALTER TABLE `banners` ADD COLUMN `title_size` varchar(8) NOT NULL DEFAULT 'medium' AFTER `font_style`");
    if (!(await colExists('banners', 'overlay_style')))
      await run('add banners.overlay_style', "ALTER TABLE `banners` ADD COLUMN `overlay_style` varchar(12) NOT NULL DEFAULT 'soft' AFTER `title_size`");

    // buy_price = amount the platform pays the seller (credited to their wallet on approval)
    if (!(await colExists('sell_requests', 'buy_price')))
      await run('add sell_requests.buy_price', "ALTER TABLE `sell_requests` ADD COLUMN `buy_price` decimal(18,2) DEFAULT NULL");

    // RTP is backward-compatible: every legacy number remains immediately purchasable.
    if (!(await colExists('vip_numbers', 'rtp_status')))
      await run('add vip_numbers.rtp_status', "ALTER TABLE `vip_numbers` ADD COLUMN `rtp_status` enum('RTP','NON_RTP') NOT NULL DEFAULT 'RTP' AFTER `status`");
    if (!(await colExists('vip_numbers', 'rtp_available_at')))
      await run('add vip_numbers.rtp_available_at', "ALTER TABLE `vip_numbers` ADD COLUMN `rtp_available_at` datetime DEFAULT NULL AFTER `rtp_status`");
    if (!(await colExists('orders', 'order_type')))
      await run('add orders.order_type', "ALTER TABLE `orders` ADD COLUMN `order_type` enum('PURCHASE','PREBOOK') NOT NULL DEFAULT 'PURCHASE' AFTER `payment_status`");
    if (!(await colExists('orders', 'payment_expires_at')))
      await run('add orders.payment_expires_at', "ALTER TABLE `orders` ADD COLUMN `payment_expires_at` datetime DEFAULT NULL AFTER `order_type`");

    // Existing deployments may have narrower enums. Widening preserves all
    // rows while enabling the complete reservation/refund lifecycle.
    await run('ensure vip number reservation statuses', "ALTER TABLE `vip_numbers` MODIFY COLUMN `status` enum('AVAILABLE','RESERVED','SOLD','PENDING_APPROVAL','REJECTED','INACTIVE') NOT NULL DEFAULT 'AVAILABLE'");
    await run('ensure prebook order statuses', "ALTER TABLE `orders` MODIFY COLUMN `status` enum('PENDING','PAID','PROCESSING','COMPLETED','CANCELLED','REFUNDED') NOT NULL DEFAULT 'PENDING'");
    await run('ensure prebook payment statuses', "ALTER TABLE `orders` MODIFY COLUMN `payment_status` enum('UNPAID','PAID','FAILED','REFUNDED') NOT NULL DEFAULT 'UNPAID'");
    if (await indexExists('prebook_refund_requests', 'prebook_open_refund')) {
      await run('replace invalid prebook refund uniqueness', "ALTER TABLE `prebook_refund_requests` DROP INDEX `prebook_open_refund`, ADD KEY `prebook_refund_history` (`prebook_id`,`status`)");
    }

    // ===================== SEED DATA =====================
    await seedData(run);

    // Required: public filters must never start on a partially classified
    // catalog. Existing values are preflighted before associations are changed.
    await reconcileAutomaticNumberCategories(pool);

    logger.log('** ensureSchema: done.');
  } catch (e: any) {
    logger.log('** ensureSchema: failed: ' + (e?.message || e));
    throw e;
  }
}

interface NumberToClassify {
  number_id: number;
  number_value: string;
}

const CATEGORY_BACKFILL_BATCH_SIZE = 200;

async function scanNumbersForCategoryMigration(
  pool: any,
  onlyMissingCurrentVersion: boolean,
  visit: (rows: NumberToClassify[]) => Promise<void>,
): Promise<number> {
  let lastNumberId = 0;
  let visited = 0;
  while (true) {
    const missingSql = onlyMissingCurrentVersion
      ? `AND (
           CHAR_LENGTH(n.number_value) <> 10 OR n.number_value REGEXP '[^0-9]' OR
           (SELECT COUNT(*) FROM vip_number_categories all_vnc WHERE all_vnc.number_id = n.number_id) <> 1 OR
           NOT EXISTS (
             SELECT 1 FROM vip_number_categories vnc
             WHERE vnc.number_id = n.number_id AND vnc.classifier_version = ?
           )
         )`
      : '';
    const params = onlyMissingCurrentVersion
      ? [lastNumberId, CATEGORY_CLASSIFIER_VERSION]
      : [lastNumberId];
    const [rows]: any = await pool.query(
      `SELECT n.number_id, n.number_value
       FROM vip_numbers n
       WHERE n.number_id > ? ${missingSql}
       ORDER BY n.number_id ASC
       LIMIT ${CATEGORY_BACKFILL_BATCH_SIZE}`,
      params,
    );
    const batch = (Array.isArray(rows) ? rows : []) as NumberToClassify[];
    if (!batch.length) break;
    await visit(batch);
    visited += batch.length;
    lastNumberId = Number(batch[batch.length - 1].number_id);
  }
  return visited;
}

/**
 * Build/rebuild the versioned automatic category index. Exported so deployment
 * checks can invoke the same idempotent migration without starting HTTP.
 */
export async function reconcileAutomaticNumberCategories(pool: any = connPool.promise()): Promise<void> {
  await pool.query(
    "CREATE TABLE IF NOT EXISTS `schema_migrations` (" +
    "`migration_key` varchar(128) NOT NULL," +
    "`classifier_version` smallint unsigned DEFAULT NULL," +
    "`details` text," +
    "`applied_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
    "PRIMARY KEY (`migration_key`)" +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  );
  await pool.query(
    "CREATE TABLE IF NOT EXISTS `vip_number_categories` (" +
    "`number_id` int unsigned NOT NULL," +
    "`category_slug` varchar(64) NOT NULL," +
    "`classifier_version` smallint unsigned NOT NULL," +
    "`matched_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
    "PRIMARY KEY (`number_id`,`category_slug`)," +
    "KEY `category_lookup` (`category_slug`,`number_id`)," +
    "KEY `classifier_version` (`classifier_version`)," +
    "CONSTRAINT `fk_vip_number_categories_number` FOREIGN KEY (`number_id`) " +
    "REFERENCES `vip_numbers` (`number_id`) ON DELETE CASCADE" +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
  );

  const migrationKey = `automatic-number-categories-v${CATEGORY_CLASSIFIER_VERSION}`;
  const [migrationRows]: any = await pool.query(
    'SELECT migration_key FROM schema_migrations WHERE migration_key = ? LIMIT 1',
    [migrationKey],
  );
  const firstRunForVersion = !Array.isArray(migrationRows) || migrationRows.length === 0;

  // Always preflight the complete inventory before changing anything. This
  // catches invalid legacy rows and differently formatted duplicates even
  // during a rolling deployment with older writers still present.
  const invalidIds: number[] = [];
  const idsByCanonicalNumber = new Map<string, number[]>();
  await scanNumbersForCategoryMigration(pool, false, async (rows) => {
    for (const row of rows) {
      try {
        const canonical = classifyNumber(row.number_value).canonicalNumber;
        const ids = idsByCanonicalNumber.get(canonical) || [];
        ids.push(Number(row.number_id));
        idsByCanonicalNumber.set(canonical, ids);
      }
      catch { invalidIds.push(Number(row.number_id)); }
    }
  });
  const duplicateIds = [...idsByCanonicalNumber.values()]
    .filter((ids) => ids.length > 1)
    .flat()
    .sort((left, right) => left - right);
  if (invalidIds.length || duplicateIds.length) {
    const describeIds = (ids: number[]) => {
      const shown = ids.slice(0, 100).join(', ');
      return shown + (ids.length > 100 ? ` (+${ids.length - 100} more)` : '');
    };
    const issues = [
      ...(invalidIds.length ? [`invalid vip_numbers IDs: ${describeIds(invalidIds)}`] : []),
      ...(duplicateIds.length ? [`duplicate canonical vip_numbers IDs: ${describeIds(duplicateIds)}`] : []),
    ];
    throw new Error(`Automatic category migration blocked by ${issues.join('; ')}`);
  }

  let canonicalized = 0;
  const migrated = await scanNumbersForCategoryMigration(pool, !firstRunForVersion, async (rows) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const row of rows) {
        const classification = classifyNumber(row.number_value);
        if (classification.canonicalNumber !== String(row.number_value)) {
          await connection.query(
            'UPDATE vip_numbers SET number_value = ? WHERE number_id = ?',
            [classification.canonicalNumber, Number(row.number_id)],
          );
          canonicalized += 1;
        }
        await syncNumberCategories(connection, Number(row.number_id), classification.canonicalNumber);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  });

  // An exclusive classifier must leave one and only one current mapping for
  // every inventory record. Fail before adding the database constraint so a
  // concurrent v1 writer cannot be hidden by a partially successful rollout.
  const [invalidMappingRows]: any = await pool.query(
    `SELECT n.number_id,
            COUNT(vnc.number_id) AS mapping_count,
            COALESCE(SUM(vnc.classifier_version = ?), 0) AS current_mapping_count
     FROM vip_numbers n
     LEFT JOIN vip_number_categories vnc ON vnc.number_id = n.number_id
     GROUP BY n.number_id
     HAVING mapping_count <> 1 OR current_mapping_count <> 1
     ORDER BY n.number_id ASC
     LIMIT 100`,
    [CATEGORY_CLASSIFIER_VERSION],
  );
  if (Array.isArray(invalidMappingRows) && invalidMappingRows.length > 0) {
    const ids = invalidMappingRows.map((row: any) => Number(row.number_id)).join(', ');
    throw new Error(`Automatic category migration did not produce exactly one v${CATEGORY_CLASSIFIER_VERSION} mapping for vip_numbers IDs: ${ids}. Drain older server processes and retry.`);
  }

  const [uniqueIndexRows]: any = await pool.query(
    `SELECT s.INDEX_NAME
     FROM information_schema.STATISTICS s
     WHERE s.TABLE_SCHEMA = DATABASE() AND s.TABLE_NAME = 'vip_number_categories'
       AND s.NON_UNIQUE = 0
     GROUP BY s.INDEX_NAME
     HAVING COUNT(*) = 1
        AND MAX(CASE WHEN s.COLUMN_NAME = 'number_id' THEN 1 ELSE 0 END) = 1`,
  );
  if (!Array.isArray(uniqueIndexRows) || uniqueIndexRows.length === 0) {
    await pool.query(
      'ALTER TABLE vip_number_categories ADD UNIQUE KEY number_category_exclusive (number_id)',
    );
  }

  // Historical category CRUD requests can no longer be replayed. REJECTED is
  // the current approval enum's safe terminal state.
  const retirementNote = 'Category Master retired; categories are now detected automatically.';
  await pool.query(
    `UPDATE approval_requests
     SET status = 'REJECTED', review_note = ?, result = ?, reviewed_at = NOW()
     WHERE status = 'PENDING' AND action_key IN ('categories.save', 'categories.delete')`,
    [retirementNote, JSON.stringify({ retired: true, classifier_version: CATEGORY_CLASSIFIER_VERSION })],
  );

  await pool.query(
    `INSERT INTO schema_migrations (migration_key, classifier_version, details)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE classifier_version = VALUES(classifier_version), details = VALUES(details)`,
    [migrationKey, CATEGORY_CLASSIFIER_VERSION, JSON.stringify({ migrated_numbers: migrated, canonicalized_numbers: canonicalized })],
  );
  logger.log(`** ensureSchema: automatic categories v${CATEGORY_CLASSIFIER_VERSION}; classified ${migrated}, canonicalized ${canonicalized} number(s).`);
}

/** Inserts demo/seed rows (idempotent via INSERT IGNORE on stable keys). */
async function seedData(run: (label: string, sql: string, params?: any[]) => Promise<void>) {
  // JWT signing key + token lifetime (read by pixels-utility/jwt.ts).
  await run('seed env MASTER_KEY',
    "INSERT IGNORE INTO `env` (`key_id`,`value`) VALUES ('MASTER_KEY', ?)",
    ['vnw_' + 'a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff00']);
  await run('seed env JWT_TIME_OUT_SECONDS',
    "INSERT IGNORE INTO `env` (`key_id`,`value`) VALUES ('JWT_TIME_OUT_SECONDS', '604800')");

  // Seed users (explicit ids so FKs are deterministic). Default dev passwords:
  // admin@vipnumberworld.com / Admin@123 | dealer@vipnumberworld.com / Dealer@123 | user@vipnumberworld.com / User@123
  await run('seed admin user',
    "INSERT IGNORE INTO `auth_user` (`user_id`,`email`,`phone`,`password`,`role`,`full_name`,`referral_code`) VALUES (1, 'admin@vipnumberworld.com', '9000000001', ?, 'ADMIN', 'VNW Administrator', 'VNWADMIN')",
    [hashPassword('Admin@123')]);
  await run('seed dealer user',
    "INSERT IGNORE INTO `auth_user` (`user_id`,`email`,`phone`,`password`,`role`,`full_name`,`referral_code`) VALUES (2, 'dealer@vipnumberworld.com', '9000000002', ?, 'DEALER', 'Demo Dealer', 'VNWDEALER')",
    [hashPassword('Dealer@123')]);
  await run('seed demo user',
    "INSERT IGNORE INTO `auth_user` (`user_id`,`email`,`phone`,`password`,`role`,`full_name`,`referral_code`) VALUES (3, 'user@vipnumberworld.com', '9000000003', ?, 'USER', 'Demo Customer', 'VNWUSER')",
    [hashPassword('User@123')]);

  await run('seed employee user',
    "INSERT IGNORE INTO `auth_user` (`user_id`,`email`,`phone`,`password`,`role`,`full_name`,`referral_code`) VALUES (4, 'employee@vipnumberworld.com', '9000000004', ?, 'EMPLOYEE', 'Demo Employee', 'VNWEMP')",
    [hashPassword('Employee@123')]);

  await run('seed carts', "INSERT IGNORE INTO `carts` (`user_id`) VALUES (1),(2),(3),(4)");

  // ---- RBAC permission catalog (grantable capability keys) ----
  await run('seed permissions',
    "INSERT IGNORE INTO `permissions` (`perm_key`,`module`,`label`,`description`,`sort_order`) VALUES " +
    // USER (customer) capabilities — granted by default on signup
    "('user.shop','USER','Browse & Buy','Browse the catalog and purchase VIP numbers',1)," +
    "('user.cart','USER','Cart','Add numbers to cart and checkout',2)," +
    "('user.orders','USER','My Orders','View own order history',3)," +
    "('user.wishlist','USER','Wishlist','Save numbers to a wishlist',4)," +
    "('user.reviews','USER','Reviews','Write product reviews',5)," +
    "('user.referrals','USER','Referrals','Participate in the referral program',6)," +
    "('user.sell','USER','Sell a Number','Raise requests to sell own numbers to the platform',7)," +
    // DEALER capabilities — mapped by admin during dealer account creation
    "('dealer.dashboard','DEALER','Dashboard','View dealer dashboard & KPIs',1)," +
    "('dealer.listings.view','DEALER','View Listings','View own number listings',2)," +
    "('dealer.listings.create','DEALER','Create Listings','Add new number listings (admin-approved)',3)," +
    "('dealer.listings.edit','DEALER','Edit Listings','Edit own listings',4)," +
    "('dealer.listings.delete','DEALER','Delete Listings','Delete own listings',5)," +
    "('dealer.sales','DEALER','Sales','View own sales',6)," +
    "('dealer.payouts','DEALER','Payouts','Request and view payouts',7)," +
    "('dealer.profile','DEALER','Dealer Profile','Manage dealer business profile',8)");

  // ---- default role permissions ----
  // USER gets all user.* by default. DEALER defaults are empty (admin maps per dealer).
  await run('seed role_default_permissions USER',
    "INSERT IGNORE INTO `role_default_permissions` (`role`,`perm_key`) VALUES " +
    "('USER','user.shop'),('USER','user.cart'),('USER','user.orders'),('USER','user.wishlist')," +
    "('USER','user.reviews'),('USER','user.referrals'),('USER','user.sell')");

  // Demo dealer (user 2) gets a sensible starter permission set so the seed is usable.
  await run('seed demo dealer permissions',
    "INSERT IGNORE INTO `user_permissions` (`user_id`,`perm_key`,`granted`,`granted_by`) VALUES " +
    "(2,'dealer.dashboard',1,1),(2,'dealer.listings.view',1,1),(2,'dealer.listings.create',1,1)," +
    "(2,'dealer.listings.edit',1,1),(2,'dealer.sales',1,1),(2,'dealer.payouts',1,1),(2,'dealer.profile',1,1)");

  await run('seed dealer profile',
    "INSERT IGNORE INTO `dealer_profiles` (`dealer_id`,`business_name`,`commission_pct`,`kyc_status`) VALUES (2, 'Demo Dealer Numbers', 10.00, 'VERIFIED')");

  // Sample numbers (from the reference design). seller 1 = admin, one from dealer (2).
  await run('seed vip_numbers',
    "INSERT IGNORE INTO `vip_numbers` (`number_id`,`number_value`,`display_number`,`seller_id`,`seller_type`,`title_label`,`badge`,`mrp`,`offer_price`,`discount_pct`,`numerology_sum`,`operator`,`stock`,`status`,`is_featured`) VALUES " +
    "(1,'9193915915','9193 915 915',1,'ADMIN','Business VIP Number','HOT_PICK',49999,24999,50,9,'Airtel',1,'AVAILABLE',1)," +
    "(2,'9353115511','9353 115 511',1,'ADMIN','Business VIP Number','PREMIUM',39999,19999,50,5,'Jio',2,'AVAILABLE',1)," +
    "(3,'9696915915','9696 915 915',1,'ADMIN','Business VIP Number','BEST_SELLER',37999,18999,50,9,'Airtel',1,'AVAILABLE',1)," +
    "(4,'9090909090','9090 909 090',1,'ADMIN','Easy To Remember','HOT_DEAL',59999,29999,50,9,'Vi',3,'AVAILABLE',1)," +
    "(5,'9161551551','9161 551 551',2,'DEALER','Fancy VIP Number','PREMIUM',33999,16999,50,6,'Jio',2,'AVAILABLE',1)," +
    "(6,'9155915915','9155 915 915',1,'ADMIN','Lucky VIP Number','NEW_ARRIVAL',31999,15999,50,9,'Airtel',2,'AVAILABLE',1)," +
    "(7,'7777915915','7777 915 915',1,'ADMIN','Premium VIP Number','VALUE_PICK',45999,22999,50,9,'Airtel',1,'AVAILABLE',1)," +
    "(8,'8888115511','8888 115 511',1,'ADMIN','Business VIP Number','PREMIUM',41999,20999,50,5,'Jio',2,'AVAILABLE',1)");

  await run('seed testimonials',
    "INSERT IGNORE INTO `testimonials` (`testimonial_id`,`name`,`role`,`content`,`rating`,`sort_order`) VALUES " +
    "(1,'Rahul Sharma','Business Owner','Got my dream business number in 2 days. Smooth transfer and genuine service!',5,1)," +
    "(2,'Priya Mehta','Entrepreneur','The premium gold numbers are stunning. My clients remember my number instantly.',5,2)," +
    "(3,'Imran Khan','Reseller','As a dealer, listing and selling numbers here is effortless. Great commissions.',5,3)," +
    "(4,'Anita Desai','Influencer','Loved the lucky number selection. Numerology details helped me pick the right one.',5,4)");

  await run('seed faqs',
    "INSERT IGNORE INTO `faqs` (`faq_id`,`category`,`question`,`answer`,`sort_order`,`is_active`) VALUES " +
    "(1,'Buying & Porting','How do I purchase a VIP number?','Choose an available number, add it to your cart, complete the secure checkout, and follow the transfer guidance shared with your order.',1,1)," +
    "(2,'Buying & Porting','Can I keep my preferred network operator?','Operator availability is shown on each listing. Porting and activation remain subject to the selected operator’s eligibility and verification requirements.',2,1)," +
    "(3,'Payments & Security','How is my payment handled?','Checkout uses the existing secure payment flow. Your order screen records the payment and subsequent transfer status.',3,1)," +
    "(4,'Number Selection','How are number categories assigned?','VIP Number World analyses each number automatically and assigns its strongest matching pattern category.',4,1)," +
    "(5,'Number Selection','What makes a number premium?','Premium numbers are curated listings selected for memorable patterns, presentation, demand, and overall distinctiveness.',5,1)," +
    "(6,'Numerology','Can I search by numerology sum?','Yes. Use the numerology tools or shop filters to calculate a root number and explore available listings with that sum.',6,1)," +
    "(7,'Support','What happens after checkout?','Our team guides you through UPC delivery, MNP initiation, and activation using the contact details attached to your order.',7,1)");

  await run('seed banners',
    "INSERT IGNORE INTO `banners` (`banner_id`,`title`,`subtitle`,`cta_text`,`cta_link`,`sort_order`) VALUES " +
    "(1,'Own Your Identity','Premium VIP numbers, handpicked for you. Your Number. Your Identity.','Explore Numbers','/shop',1)," +
    "(2,'Up to 50% OFF','Limited-time offers on best-selling business & fancy numbers.','Grab Deals','/shop?badge=HOT_DEAL',2)");

  await run('seed coupon',
    "INSERT IGNORE INTO `coupons` (`code`,`type`,`value`,`min_order`,`is_active`) VALUES ('WELCOME10','PERCENT',10,5000,1)");
  await run('seed coupon FEST20',
    "INSERT IGNORE INTO `coupons` (`code`,`type`,`value`,`min_order`,`is_active`) VALUES ('FEST20','PERCENT',20,15000,1)");

  // public site config / promo bar (admin-editable via Settings)
  await run('seed env PROMO_TEXT',
    "INSERT IGNORE INTO `env` (`key_id`,`value`) VALUES ('PROMO_TEXT', '🎉 MEGA FESTIVAL SALE — use code WELCOME10 for 10% OFF your first VIP number!')");
  await run('seed env PROMO_COUPON',
    "INSERT IGNORE INTO `env` (`key_id`,`value`) VALUES ('PROMO_COUPON', 'WELCOME10')");
  await run('seed env SITE_TITLE', "INSERT IGNORE INTO `env` (`key_id`,`value`) VALUES ('SITE_TITLE', 'VIP Number World')");
  await run('seed env SITE_TAGLINE', "INSERT IGNORE INTO `env` (`key_id`,`value`) VALUES ('SITE_TAGLINE', 'Your Number. Your Identity.')");
  await run('seed env CONTACT_PHONE', "INSERT IGNORE INTO `env` (`key_id`,`value`) VALUES ('CONTACT_PHONE', '+91 70091 70092')");
  await run('seed env CONTACT_EMAIL', "INSERT IGNORE INTO `env` (`key_id`,`value`) VALUES ('CONTACT_EMAIL', 'info@vipnumberworld.com')");
  await run('seed env WHATSAPP', "INSERT IGNORE INTO `env` (`key_id`,`value`) VALUES ('WHATSAPP', '917009170092')");
}


export class MySqlMaster {

  autoCommit = true;

  //query result
  executeQuery(query: string) {
    let promise;
    let startMS = new Date().getTime();
    let queryModel = masterModel.getQueryModel();
    try {

      promise = new Promise((resolve, reject) => {
        connPool.query(query, async (err, results: any, fields) => {

          // in case of errror in executing the query rejecting the request
          if (err) {
            //throw new Error('Error in Query Execution: ' + err);
            queryModel.status = Constants.DB_QUERY_ERROR;
            queryModel.info = 'DB: executeQuery(): ERROR: ' + JSON.stringify(err);
            //reject(model);

          } else {
            //SUCCESS
            queryModel.status = Constants.SUCCESS;
            queryModel.info = 'SUCCESS';
            // check for select query results i.e JSON ARRAY of selected Rows
            if (util.isArray(results)) {
              queryModel.fetchedRows = results.length;
              queryModel.rows = results;
              queryModel.info = queryModel.info + ': 1, fetchedRows: ' + queryModel.fetchedRows;
            } else if ((results)) {
              queryModel.affectedRows = results.affectedRows;
              queryModel.changedRows = results.changedRows;
              queryModel.fieldCount = results.fieldCount;
              queryModel.insertId = results.insertId;
              queryModel.message = results.message;
              queryModel.protocol41 = results.protocol41;
              queryModel.serverStatus = results.serverStatus;
              queryModel.warningCount = results.warningCount;
            }

          }// end else

          // finally resolving the request
          queryModel.tat = (new Date().getTime() - startMS) / 1000;
          // logger.log('results: ' + JSON.stringify(results));
          resolve(queryModel);
        });// close conn pool

      });// close promise

      return promise;
    } catch (error) {
      throw new Error('executeQuery: ' + error);
    } finally {
      try { queryModel.endDT = new Date(); } catch (error) { }
      try { queryModel.tat = (new Date().getTime() - startMS) / 1000; } catch (error) { }
    }
  };

  async getEnvKey(payload: string) {
    let query = "select * from `env` where key_id = '" + payload.replace(/'/g, "''") + "'";
    let queryModel: any;
    try {

      queryModel = await this.executeQuery(query);

      if (queryModel.rows && queryModel.rows.length === 1) {
        let temp = (queryModel.rows[0].value);
        return temp;
      } else {
        logger.log('WARNING: getEnvKey() - Key not found in env table: ' + payload);
        return undefined;
      }


    } catch (error) {
      logger.log('ERROR: getEnvKey() - ' + error);
      throw new Error('getEnvKey error :: ' + error)
    }
  }
}
