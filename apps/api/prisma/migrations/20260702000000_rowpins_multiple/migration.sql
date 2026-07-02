-- Autorise plusieurs flags par ligne : on retire la contrainte d'unicité (session, row_key).
DROP INDEX "row_pins_session_id_row_key_key";
