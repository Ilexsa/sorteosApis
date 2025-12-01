-- Script de ejemplo para SQL Server (localhost)
-- Ajusta nombres y tipos según tu despliegue real.

IF DB_ID('sorteos') IS NULL
BEGIN
    CREATE DATABASE sorteos;
END
GO
USE sorteos;
GO

IF OBJECT_ID('personas', 'U') IS NULL
BEGIN
    CREATE TABLE personas (
        id INT IDENTITY(1,1) PRIMARY KEY,
        nombre NVARCHAR(200) NOT NULL,
        email NVARCHAR(200) NOT NULL,
        entregado BIT NOT NULL DEFAULT 0,
        creado_en DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID('premios', 'U') IS NULL
BEGIN
    CREATE TABLE premios (
        id INT IDENTITY(1,1) PRIMARY KEY,
        nombre NVARCHAR(200) NOT NULL,
        descripcion NVARCHAR(500) NULL,
        entregado BIT NOT NULL DEFAULT 0,
        creado_en DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID('ganadores', 'U') IS NULL
BEGIN
    CREATE TABLE ganadores (
        id INT IDENTITY(1,1) PRIMARY KEY,
        persona_id INT NOT NULL,
        premio_id INT NOT NULL,
        entregado_en DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_ganadores_persona FOREIGN KEY (persona_id) REFERENCES personas(id),
        CONSTRAINT FK_ganadores_premio FOREIGN KEY (premio_id) REFERENCES premios(id)
    );
END
GO

-- Semillas opcionales para pruebas locales
INSERT INTO personas (nombre, email)
VALUES
    ('Elena Navideña', 'elena@example.com'),
    ('Carlos Duende', 'carlos@example.com'),
    ('Lucía Brillante', 'lucia@example.com'),
    ('Mateo Estrella', 'mateo@example.com'),
    ('Valeria Copo', 'valeria@example.com');
GO

INSERT INTO premios (nombre, descripcion)
VALUES
    ('Caja Sorpresa', 'Sorpresa festiva envuelta en rojo'),
    ('Café Invernal', 'Kit de café con especias'),
    ('Bufanda Polar', 'Bufanda bordada con copos'),
    ('Chocolate Caliente', 'Set de tazas y chocolate'),
    ('Luces de Hadas', 'Guirnalda LED cálida');
GO
