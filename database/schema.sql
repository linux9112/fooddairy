-- ==============================================================
-- Food Diary - MySQL Database Schema
-- Table: food_records
-- ==============================================================

CREATE TABLE IF NOT EXISTS food_records (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  record_date DATE NOT NULL,
  
  -- Breakfast meal slot
  breakfast_status ENUM('yes', 'no') NULL DEFAULT NULL,
  breakfast_time TIME NULL DEFAULT NULL,
  breakfast_details TEXT NULL DEFAULT NULL,
  
  -- Lunch meal slot
  lunch_status ENUM('yes', 'no') NULL DEFAULT NULL,
  lunch_time TIME NULL DEFAULT NULL,
  lunch_details TEXT NULL DEFAULT NULL,
  
  -- Dinner meal slot
  dinner_status ENUM('yes', 'no') NULL DEFAULT NULL,
  dinner_time TIME NULL DEFAULT NULL,
  dinner_details TEXT NULL DEFAULT NULL,
  
  -- Edit tracking
  is_edited BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Audit timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Unique constraint ensuring exactly 1 record per calendar day
  UNIQUE KEY uk_record_date (record_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
