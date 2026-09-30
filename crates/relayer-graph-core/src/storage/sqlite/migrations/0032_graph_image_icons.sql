CREATE TABLE graph_icon_assets (
 node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
 asset_id TEXT NOT NULL,
 digest_sha256 TEXT NOT NULL REFERENCES authored_detail_asset_contents(digest_sha256),
 media_type TEXT NOT NULL CHECK(media_type IN ('image/png','image/jpeg','image/svg+xml')),
 byte_length INTEGER NOT NULL CHECK(byte_length > 0),
 provenance_source TEXT NOT NULL CHECK(provenance_source IN ('user','system')),
 provenance_file_name TEXT NOT NULL
);
CREATE UNIQUE INDEX graph_icon_assets_identity ON graph_icon_assets(node_id,asset_id);
CREATE INDEX graph_icon_assets_digest ON graph_icon_assets(digest_sha256);
DROP TRIGGER reclaim_deleted_detail_asset_content;
CREATE TRIGGER reclaim_deleted_detail_asset_content AFTER DELETE ON authored_detail_assets BEGIN
 DELETE FROM authored_detail_asset_contents WHERE digest_sha256=OLD.digest_sha256 AND NOT EXISTS(SELECT 1 FROM authored_detail_assets WHERE digest_sha256=OLD.digest_sha256) AND NOT EXISTS(SELECT 1 FROM graph_icon_assets WHERE digest_sha256=OLD.digest_sha256);
END;
CREATE TRIGGER reclaim_deleted_icon_asset_content AFTER DELETE ON graph_icon_assets BEGIN
 DELETE FROM authored_detail_asset_contents WHERE digest_sha256=OLD.digest_sha256 AND NOT EXISTS(SELECT 1 FROM authored_detail_assets WHERE digest_sha256=OLD.digest_sha256) AND NOT EXISTS(SELECT 1 FROM graph_icon_assets WHERE digest_sha256=OLD.digest_sha256);
END;
