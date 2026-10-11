-- Audit snapshots survive permanent deletion; deliberately no foreign key to inventory.
CREATE TABLE IF NOT EXISTS number_recycle_events (
 event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 number_id INT UNSIGNED NOT NULL,
 number_value VARCHAR(20) NOT NULL,
 action ENUM('RECYCLED','RESTORED','PERMANENTLY_DELETED') NOT NULL,
 actor_id INT UNSIGNED NOT NULL,
 snapshot JSON NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(event_id), KEY recycle_number(number_id), KEY recycle_actor(actor_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
