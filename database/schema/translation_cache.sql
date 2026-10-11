-- Only public source text is cached. No credentials or visitor form values.
CREATE TABLE IF NOT EXISTS translation_cache (
 source_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 language VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 source_text MEDIUMTEXT NOT NULL,
 translated_text MEDIUMTEXT NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(language,source_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
