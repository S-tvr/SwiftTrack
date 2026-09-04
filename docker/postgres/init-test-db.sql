-- Runs once, on first initialisation of the pgdata volume.
--
-- The backend e2e suite (npm run test:e2e) connects to a separate database whose
-- name must end in _test — test/helpers/env.ts refuses to run otherwise, because
-- the suite truncates tables between tests. globalSetup applies the migrations and
-- the seed, but it cannot CREATE the database itself, so without this file that
-- remains a manual step before the suite can run for the first time.
CREATE DATABASE swifttrack_test;
