-- No inventory is modified or assigned guessed PIN codes.
CREATE TABLE IF NOT EXISTS vip_number_serviceable_pins (
  number_id INT UNSIGNED NOT NULL,
  pin_code CHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (number_id,pin_code),
  KEY pin_number (pin_code,number_id),
  CONSTRAINT rta_pin_number_fk FOREIGN KEY (number_id) REFERENCES vip_numbers(number_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS location_geocode_cache (
  location_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  pin_code CHAR(6) CHARACTER SET ascii DEFAULT NULL,
  expires_at DATETIME(3) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS location_geocode_throttle (
  service VARCHAR(32) NOT NULL PRIMARY KEY,
  next_request_at DATETIME(3) NOT NULL
) ENGINE=InnoDB;
INSERT IGNORE INTO location_geocode_throttle(service,next_request_at) VALUES ('nominatim','2000-01-01');
