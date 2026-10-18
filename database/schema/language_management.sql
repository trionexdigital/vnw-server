CREATE TABLE IF NOT EXISTS language_sources (
  source_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  source_text MEDIUMTEXT NOT NULL,
  context TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS language_translations (
  source_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  language VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  draft_text MEDIUMTEXT NOT NULL,
  published_text MEDIUMTEXT NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  updated_by BIGINT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (source_hash, language),
  INDEX language_published (language),
  CONSTRAINT language_translation_source FOREIGN KEY (source_hash) REFERENCES language_sources(source_hash) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
