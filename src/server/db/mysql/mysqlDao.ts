import { MasterModel } from "../../models/MasterModel";
import * as gtUtil from "../../pixels-utility";
import { hashPassword } from "../../pixels-utility/password";
import * as mysql from "mysql2";
import dotenv from "dotenv";
import * as util from "util";

const logger = new gtUtil.Logger();
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
logger.log('** DB Connection Pool: Starting: ' + JSON.stringify(dbConnectionInfo));
export const connPool = mysql.createPool(dbConnectionInfo);
logger.log('** DB Connection Pool: Success');

/**
 * Idempotent schema bootstrap run once at server startup.
 *
 * Every statement uses CREATE TABLE IF NOT EXISTS / INSERT IGNORE so it is safe
 * to run repeatedly and on a fresh, empty `vipnumberworld` database. The schema
 * models a VIP-number e-commerce marketplace (catalog, cart, orders, payments,
 * dealers, reviews, referrals). A small set of seed rows (admin/dealer/demo
 * users, categories, sample numbers, testimonials, banners, env keys) is also
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
      // Never block startup on a migration; log and continue.
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
      "`is_featured` tinyint(1) NOT NULL DEFAULT '0'," +
      "`views` int NOT NULL DEFAULT '0'," +
      "`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
      "PRIMARY KEY (`number_id`), UNIQUE KEY `number_value` (`number_value`)," +
      "KEY `category_id` (`category_id`), KEY `seller_id` (`seller_id`)," +
      "KEY `status` (`status`), KEY `is_featured` (`is_featured`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

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
      "`title` varchar(160) DEFAULT NULL," +
      "`subtitle` varchar(255) DEFAULT NULL," +
      "`image` longtext," +
      "`cta_text` varchar(64) DEFAULT NULL," +
      "`cta_link` varchar(255) DEFAULT NULL," +
      "`is_active` tinyint(1) NOT NULL DEFAULT '1'," +
      "`sort_order` int NOT NULL DEFAULT '0'," +
      "PRIMARY KEY (`banner_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

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

    // ===================== SEED DATA =====================
    await seedData(run);

    logger.log('** ensureSchema: done.');
  } catch (e: any) {
    logger.log('** ensureSchema: failed (non-fatal): ' + (e?.message || e));
  }
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

  await run('seed carts', "INSERT IGNORE INTO `carts` (`user_id`) VALUES (1),(2),(3)");
  await run('seed dealer profile',
    "INSERT IGNORE INTO `dealer_profiles` (`dealer_id`,`business_name`,`commission_pct`,`kyc_status`) VALUES (2, 'Demo Dealer Numbers', 10.00, 'VERIFIED')");

  // Categories (explicit ids)
  await run('seed categories',
    "INSERT IGNORE INTO `categories` (`category_id`,`name`,`slug`,`icon`,`description`,`sort_order`) VALUES " +
    "(1,'Business','business','briefcase','Premium numbers for business & branding',1)," +
    "(2,'Fancy','fancy','sparkles','Fancy patterned VIP numbers',2)," +
    "(3,'Lucky','lucky','clover','Numerology-aligned lucky numbers',3)," +
    "(4,'Premium','premium','crown','Top-tier premium VIP numbers',4)," +
    "(5,'Easy to Remember','easy-to-remember','smile','Simple, easy-to-recall numbers',5)");

  // Sample numbers (from the reference design). seller 1 = admin, one from dealer (2).
  await run('seed vip_numbers',
    "INSERT IGNORE INTO `vip_numbers` (`number_id`,`number_value`,`display_number`,`category_id`,`seller_id`,`seller_type`,`title_label`,`badge`,`mrp`,`offer_price`,`discount_pct`,`numerology_sum`,`operator`,`stock`,`status`,`is_featured`) VALUES " +
    "(1,'9193915915','9193 915 915',1,1,'ADMIN','Business VIP Number','HOT_PICK',49999,24999,50,9,'Airtel',1,'AVAILABLE',1)," +
    "(2,'9353115511','9353 115 511',1,1,'ADMIN','Business VIP Number','PREMIUM',39999,19999,50,5,'Jio',2,'AVAILABLE',1)," +
    "(3,'9696915915','9696 915 915',1,1,'ADMIN','Business VIP Number','BEST_SELLER',37999,18999,50,9,'Airtel',1,'AVAILABLE',1)," +
    "(4,'9090909090','9090 909 090',5,1,'ADMIN','Easy To Remember','HOT_DEAL',59999,29999,50,9,'Vi',3,'AVAILABLE',1)," +
    "(5,'9161551551','9161 551 551',2,2,'DEALER','Fancy VIP Number','PREMIUM',33999,16999,50,6,'Jio',2,'AVAILABLE',1)," +
    "(6,'9155915915','9155 915 915',3,1,'ADMIN','Lucky VIP Number','NEW_ARRIVAL',31999,15999,50,9,'Airtel',2,'AVAILABLE',1)," +
    "(7,'7777915915','7777 915 915',4,1,'ADMIN','Premium VIP Number','VALUE_PICK',45999,22999,50,9,'Airtel',1,'AVAILABLE',1)," +
    "(8,'8888115511','8888 115 511',1,1,'ADMIN','Business VIP Number','PREMIUM',41999,20999,50,5,'Jio',2,'AVAILABLE',1)");

  await run('seed testimonials',
    "INSERT IGNORE INTO `testimonials` (`testimonial_id`,`name`,`role`,`content`,`rating`,`sort_order`) VALUES " +
    "(1,'Rahul Sharma','Business Owner','Got my dream business number in 2 days. Smooth transfer and genuine service!',5,1)," +
    "(2,'Priya Mehta','Entrepreneur','The premium gold numbers are stunning. My clients remember my number instantly.',5,2)," +
    "(3,'Imran Khan','Reseller','As a dealer, listing and selling numbers here is effortless. Great commissions.',5,3)," +
    "(4,'Anita Desai','Influencer','Loved the lucky number selection. Numerology details helped me pick the right one.',5,4)");

  await run('seed banners',
    "INSERT IGNORE INTO `banners` (`banner_id`,`title`,`subtitle`,`cta_text`,`cta_link`,`sort_order`) VALUES " +
    "(1,'Own Your Identity','Premium VIP numbers, handpicked for you. Your Number. Your Identity.','Explore Numbers','/shop',1)," +
    "(2,'Up to 50% OFF','Limited-time offers on best-selling business & fancy numbers.','Grab Deals','/shop?badge=HOT_DEAL',2)");

  await run('seed coupon',
    "INSERT IGNORE INTO `coupons` (`code`,`type`,`value`,`min_order`,`is_active`) VALUES ('WELCOME10','PERCENT',10,5000,1)");
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
            queryModel.status = gtUtil.Constants.DB_QUERY_ERROR;
            queryModel.info = 'DB: executeQuery(): ERROR: ' + JSON.stringify(err);
            //reject(model);

          } else {
            //SUCCESS
            queryModel.status = gtUtil.Constants.SUCCESS;
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
