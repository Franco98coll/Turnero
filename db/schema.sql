-- Crear base de datos (ejecutar con permisos)
-- CREATE DATABASE vibe_turnos;
-- GO
USE vibe_turnos;
GO

IF OBJECT_ID('dbo.users', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END
GO

IF OBJECT_ID('dbo.slots', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.slots (
    id INT IDENTITY(1,1) PRIMARY KEY,
    start_time DATETIME2 NOT NULL,
    end_time DATETIME2 NOT NULL,
    capacity INT NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END
GO

IF OBJECT_ID('dbo.bookings', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.bookings (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL,
    slot_id INT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'confirmed',
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_bookings_users FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE,
    CONSTRAINT FK_bookings_slots FOREIGN KEY (slot_id) REFERENCES dbo.slots(id) ON DELETE CASCADE
  );
END
GO

-- Crear admin manualmente (reemplazar HASH):
-- INSERT INTO users (name, email, password_hash, role) VALUES ('Admin', 'admin@example.com', '<bcrypt-hash>', 'admin');
