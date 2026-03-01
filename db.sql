-- Create database
CREATE DATABASE schedule_db;

-- Switch to database
use schedule_db;

CREATE TABLE faculity(
    faculity_id SERIAL PRIMARY KEY,
    faculity_name VARCHAR(255) NOT NULL ,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

CREATE TABLE departments (
    department_id SERIAL PRIMARY KEY,
    department_name VARCHAR(100) UNIQUE NOT NULL,
    head_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    faculity_id int ,
   FOREIGN KEY (faculity_id) REFERENCES faculity(faculity_id)

);

-- Create users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) CHECK (role IN ('instructor', 'department_head', 'admin')) NOT NULL,
    id_number VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(255) NOT NULL,
    status VARCHAR(255) NOT NULL,
    is_first_login BOOLEAN DEFAULT TRUE,
    department_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatd_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(department_id)
);
INSERT INTO users (full_name,email,password_hash,role,id_number,username,status) values (
    'admin','Admin@gmail.com','$2b$10$UlCvZVBkvwbPAArbx5CYdOnVNmVO0SZ2GFMwvCdDe51qLjvJMsUD6','admin','A0002','Admin','Active'
);
-- Create departments_history table
CREATE TABLE departments_history (
    department_id INT NOT NULL,
    department_name VARCHAR(100) NOT NULL,
    head_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    lastdate_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create course table
CREATE TABLE Course (
    course_id SERIAL PRIMARY KEY,
    course_code VARCHAR(20) NOT NULL,
    course_name VARCHAR(100) NOT NULL,
    credit_hour INT NOT NULL,
    category VARCHAR(50) NOT NULL
);

CREATE TABLE blocks (
    block_id SERIAL PRIMARY KEY,
    block_name VARCHAR(50) NOT NULL UNIQUE,
    block_code VARCHAR(10) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample blocks
INSERT INTO blocks (block_name, block_code, description) VALUES
('Main Block', 'MB', 'Main academic building'),
('Science Block', 'SB', 'Science and laboratory building'),
('Engineering Block', 'EB', 'Engineering and technology building'),
('Arts Block', 'AB', 'Arts and humanities building');
-- create bloack table 
CREATE TABLE rooms (
    room_id SERIAL PRIMARY KEY,
    room_number VARCHAR(20) NOT NULL,
    room_name VARCHAR(100),
    room_type VARCHAR(50) NOT NULL, -- 'classroom', 'lab', 'office', 'conference', 'library'
    capacity INTEGER,
    facilities TEXT[], -- Array of facilities: {'projector', 'ac', 'computers', 'whiteboard'}
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE( room_number)
);

-- Insert sample rooms
INSERT INTO rooms ( room_number, room_name, room_type, capacity, facilities) VALUES
( 'G01', 'Main Hall', 'conference', 200, '{"projector", "ac", "sound_system"}'),
( 'G02', 'Reception', 'office', 5, '{"ac", "computers"}'),
( '101', 'Classroom 101', 'classroom', 40, '{"projector", "whiteboard"}'),
( '102', 'Computer Lab', 'lab', 30, '{"computers", "projector", "ac"}'),
( '201', 'Physics Lab', 'lab', 25, '{"lab_equipment", "projector"}'),
( 'B01', 'Chemistry Lab A', 'lab', 20, '{"lab_equipment", "fume_hood"}');


-- Create batches table
CREATE TABLE batches (
    batch_id SERIAL PRIMARY KEY,
    batch_year VARCHAR(20) NOT NULL,   -- Example: 2016, 2017, 2024
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
-- Create semesters table
CREATE TABLE semesters (
    id SERIAL PRIMARY KEY,
    batch_id int NOT NULL,
    semester VARCHAR(20) NOT NULL,
    academic_year VARCHAR(9) NOT NULL, -- Format: 2023-2024
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    department_id INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Foreign key constraint
    FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE CASCADE,
    -- Unique constraint to prevent duplicate semesters in same department
    UNIQUE(semester, academic_year, department_id)
);

-- Update schedules table to use batch_id and semester_id
CREATE TABLE schedules (
    id SERIAL PRIMARY KEY,
    department_id INT,
    batch_id INT,
    semester_id INT,
    section VARCHAR(10) NOT NULL,
    status VARCHAR(20) CHECK (status IN ('draft','published')) DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(department_id),
    FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE SET NULL,
    FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE SET NULL,
    UNIQUE (batch_id, semester_id, section, department_id) -- Prevent duplicate schedules
);



-- Create day_schedules table
CREATE TABLE day_schedules (
    id SERIAL PRIMARY KEY,
    schedule_id INT NOT NULL,
    day_of_week VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
);

-- Create day_courses table
CREATE TABLE day_courses (
    id SERIAL PRIMARY KEY,
    day_schedule_id INT NOT NULL,
    course_id INT NOT NULL,
    room_id INT NOT NULL,
    instructor_id INT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    color VARCHAR(7) DEFAULT '#3b82f6',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (day_schedule_id) REFERENCES day_schedules(id) ON DELETE CASCADE
);

-- Enhanced feedback table schema
CREATE TABLE feedback (
  id SERIAL PRIMARY KEY,
  id_number VARCHAR(50) NOT NULL,
  mes_category VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE announcements (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    author_id INTEGER REFERENCES users(id),
    department_id INTEGER REFERENCES departments(id),
    priority VARCHAR(20) DEFAULT 'normal',
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    publish_at TIMESTAMP,
    expires_at TIMESTAMP
);
=================================================================================================
-- Create database
CREATE DATABASE schedule_db;
-- Switch to database
USE schedule_db;

-------------------------------------------------------------
-- 1. FACULITY TABLE
-------------------------------------------------------------
CREATE TABLE faculity(
    faculity_id SERIAL PRIMARY KEY,
    faculity_name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert Faculties
INSERT INTO faculity (faculity_name) VALUES
('Engineering'),
('Computing'),
('Business & Economics'),
('Health Science'),
('Law'),
('Social Science'),
('Agriculture'),
('Education'),
('Architecture'),
('Medicine');
-------------------------------------------------------------
-- 7. ROOMS TABLE
------------------------------------------------------------
CREATE TABLE blocks_faculity (
    id SERIAL PRIMARY KEY,
    faculity_id int NOT NULL,
    block_id int NOT NULL,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (faculity_id) REFERENCES faculity(faculity_id),
    FOREIGN KEY (block_id) REFERENCES blocks(block_id),
    UNIQUE( block_id)
);
-------------------------------------------------------------
-- 2. DEPARTMENTS TABLE
-------------------------------------------------------------

CREATE TABLE departments (
    department_id SERIAL PRIMARY KEY,
    department_name VARCHAR(100) UNIQUE NOT NULL,
    head_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    faculity_id INT,
    FOREIGN KEY (faculity_id) REFERENCES faculity(faculity_id)
);
-- Insert Departments
INSERT INTO departments (department_name, head_id, faculity_id) VALUES
('Software Engineering', NULL, 2),
('Computer Science', NULL, 2),
('Information Systems', NULL, 2),
('Civil Engineering', NULL, 1),
('Mechanical Engineering', NULL, 1),
('Accounting & Finance', NULL, 3),
('Marketing Management', NULL, 3),
('Nursing', NULL, 4),
('Public Health', NULL, 4),
('Law Department', NULL, 5);

-------------------------------------------------------------
-- 3. USERS TABLE
-------------------------------------------------------------

CREATE TABLE departments_rooms (
    id SERIAL PRIMARY KEY,
    department_id int NOT NULL,
    room_id int NOT NULL,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(department_id),
    FOREIGN KEY (room_id) REFERENCES rooms(room_id),
    UNIQUE(room_id)
);
  
  CREATE TABLE section_rooms (
    id SERIAL PRIMARY KEY,
    department_id INT NOT NULL,
    batch_id INT NOT NULL,
    section VARCHAR(3) NOT NULL,
    room_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(department_id),
    FOREIGN KEY (room_id) REFERENCES rooms(room_id)
);



-------------------------------------------------------------
-- 3. USERS TABLE
-------------------------------------------------------------
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) CHECK (role IN ('instructor', 'department_head', 'admin')) NOT NULL,
    id_number VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(255) NOT NULL,
    status VARCHAR(255) NOT NULL,
    is_first_login BOOLEAN DEFAULT TRUE,
    department_id INT,
    is_online BOOLEAN DEFAULT false,
    last_seen TIMESTAMP,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatd_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(department_id)
);

-- Insert Admin

INSERT INTO users (full_name,email,password_hash,role,id_number,username,status)
VALUES (
    'admi n','Admin@gmail.com',
    '$2b$10$Ad0CS3PZK3Jg9KZ60P8rhOdE6WL1Osv213MnCxaAxN.VLOL1yfVwy',
    'admin','A0002','Admin','Active'
);
-- Insert More Users
INSERT INTO users (full_name, email, password_hash, role, id_number, username, status, department_id) VALUES
('John Doe','john@example.com','$2b$10$Ad0CS3PZK3Jg9KZ60P8rhOdE6WL1Osv213MnCxaAxN.VLOL1yfVwy','instructor','I1001','john','Active',1),
('Sara Thomas','sara@example.com','$2b$10$Ad0CS3PZK3Jg9KZ60P8rhOdE6WL1Osv213MnCxaAxN.VLOL1yfVwy','instructor','I1002','sara','Active',2),
('Michael White','mike@example.com','$2b$10$Ad0CS3PZK3Jg9KZ60P8rhOdE6WL1Osv213MnCxaAxN.VLOL1yfVwy','instructor','S2001','mike','Active',1),
('Lily Hagos','lily@example.com','$2b$10$Ad0CS3PZK3Jg9KZ60P8rhOdE6WL1Osv213MnCxaAxN.VLOL1yfVwy','instructor','S2002','lily','Active',2),
('Daniel Mark','daniel@example.com','$2b$10$Ad0CS3PZK3Jg9KZ60P8rhOdE6WL1Osv213MnCxaAxN.VLOL1yfVwy','instructor','S2003','daniel','Active',3),
('Helen Simon','helen@example.com','$2b$10$Ad0CS3PZK3Jg9KZ60P8rhOdE6WL1Osv213MnCxaAxN.VLOL1yfVwy','instructor','I1003','helen','Active',4),
('Samuel Admas','samuel@example.com','$2b$10$Ad0CS3PZK3Jg9KZ60P8rhOdE6WL1Osv213MnCxaAxN.VLOL1yfVwy','instructor','S2004','samuel','Active',5),
('Ruth Alemu','ruth@example.com','$2b$10$Ad0CS3PZK3Jg9KZ60P8rhOdE6WL1Osv213MnCxaAxN.VLOL1yfVwy','instructor','S2005','ruth','Active',6),
('Yonatan Ayele','yoni@example.com','$2b$10$Ad0CS3PZK3Jg9KZ60P8rhOdE6WL1Osv213MnCxaAxN.VLOL1yfVwy','department_head','DH001','yoni','Active',2);

-------------------------------------------------------------
-- 4. DEPARTMENTS HISTORY
-------------------------------------------------------------
CREATE TABLE departments_history (
    department_id INT NOT NULL,
    department_name VARCHAR(100) NOT NULL,
    head_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    lastdate_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-------------------------------------------------------------
-- 5. COURSE TABLE
-------------------------------------------------------------

CREATE TABLE Course (
    course_id SERIAL PRIMARY KEY,
    course_code VARCHAR(20) NOT NULL,
    course_name VARCHAR(100) NOT NULL,
    credit_hour INT NOT NULL,
    lec_hr INT NOT NULL,
    lab_hr INT NOT NULL,
    tut_hr INT NOT NULL DEFAULT 0,
    category VARCHAR(50) NOT NULL
);

-- Insert data
INSERT INTO Course (course_code, course_name, credit_hour, lec_hr, lab_hr, category) VALUES
('SE101','Intro to Software Engineering',3,3,0,'Core'),
('CS102','Programming Fundamentals',4,3,1,'Core'),
('SE201','Database Systems',3,2,1,'Core'),
('SE202','Web Development',3,2,1,'Elective'),
('CS201','Algorithms',3,3,0,'Core'),
('CS202','Operating Systems',4,3,1,'Core'),
('CS203','Networks',3,2,1,'Core'),
('SE301','Mobile App Development',3,2,1,'Elective'),
('SE302','Artificial Intelligence',3,3,0,'Core'),
('CS205','Discrete Mathematics',3,3,0,'Math');
-------------------------------------------------------------
-- 5. COURSE TABLE
-------------------------------------------------------------
CREATE TABLE course_instructor_assign (
    id SERIAL PRIMARY KEY,
    course_id INT NOT NULL,
    instructor_id INT NOT NULL,
    course_status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES course(course_id),
    FOREIGN KEY (instructor_id) REFERENCES users(id),
    UNIQUE(course_id, instructor_id)
);

CREATE TABLE course_batch (
    id SERIAL PRIMARY KEY,
    course_id INT NOT NULL,
    batch INT NOT NULL,
    semester_id int NOT NULL,
    department_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES course(course_id),
    FOREIGN KEY (department_id) REFERENCES departments(department_id)
);

-- Create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS course_section_instructor_assign (
    id SERIAL PRIMARY KEY,
    course_batch_id INT NOT NULL,
    instructor_id INT NOT NULL,
    section VARCHAR(2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_batch_id) REFERENCES course_batch(id) ON DELETE CASCADE,
    FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(course_batch_id, instructor_id,  section)
);

-------------------------------------------------------------
-- 6. BLOCKS TABLE
-------------------------------------------------------------


-- Insert Blocks
INSERT INTO blocks (block_name, block_code, description) VALUES
('Main Block','MB','Main academic building'),
('Science Block','SB','Science building'),
('Engineering Block','EB','Engineering building'),
('Arts Block','AB','Arts building'),
(5,'Library Block','LB','Library area'),
(6,'Admin Block','AD','Administrative services'),
(7,'Medical Block','MD','Medical training building'),
(8,'ICT Block','ICT','Computing building'),
(9,'Business Block','BB','Business faculty'),
(10,'Agriculture Block','AG','Agriculture center');

-------------------------------------------------------------
-- 7. ROOMS TABLE
-------------------------------------------------------------

-- CREATE TABLE rooms (
--     room_id SERIAL PRIMARY KEY,
--     block_id INT NOT NULL REFERENCES blocks(block_id) ON DELETE CASCADE,
--     room_number VARCHAR(20) NOT NULL UNIQUE,
--     room_name VARCHAR(100),
--     room_type VARCHAR(50) NOT NULL,
--     capacity INTEGER,
--     facilities TEXT[],
--     is_available BOOLEAN DEFAULT TRUE,
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );


CREATE TABLE blocks (
    block_id SERIAL PRIMARY KEY,
    block_name VARCHAR(50) NOT NULL UNIQUE,
    block_code VARCHAR(10) NOT NULL UNIQUE,
    floor_capacity INT CHECK (floor_capacity > 0) DEFAULT 5,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE floors (
    floor_id SERIAL PRIMARY KEY,
    block_id INT NOT NULL,
    floor_number VARCHAR(50) NOT NULL,
    room_capacity INT CHECK (room_capacity > 0) DEFAULT 5,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_floor_block
      FOREIGN KEY (block_id)
      REFERENCES blocks(block_id)
      ON DELETE CASCADE,

    UNIQUE (block_id, floor_number)
);
CREATE TABLE rooms (
    room_id SERIAL PRIMARY KEY,
    floor_id INT NOT NULL,
    room_number VARCHAR(50) NOT NULL,
    room_type VARCHAR(50) CHECK (room_type IN ('classroom','lab','office')) DEFAULT 'classroom',
    capacity INT CHECK (capacity > 0) DEFAULT 30,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_room_floor
      FOREIGN KEY (floor_id)
      REFERENCES floors(floor_id)
      ON DELETE CASCADE,
    UNIQUE (floor_id, room_number)
);


-- Insert Rooms
INSERT INTO rooms (block_id,room_number, room_name, room_type, capacity, facilities) VALUES
(1,'G01','Main Hall','conference',200,'{projector,ac,sound_system}'),
(2,'G02','Reception','office',5,'{ac,computers}'),
(3,'101','Classroom 101','classroom',40,'{projector,whiteboard}'),
(5,'102','Computer Lab','lab',30,'{computers,projector,ac}'),
(6,'201','Physics Lab','lab',25,'{lab_equipment,projector}'),
(7,'B01','Chem Lab A','lab',20,'{lab_equipment,fume_hood}'),
(8,'203','Classroom 203','classroom',45,'{projector}'),
(9,'204','Classroom 204','classroom',50,'{whiteboard}'),
(1,'301','Smart Lab','lab',35,'{computers,smart_board}'),
(2,'A01','Office A','office',3,'{computer}');

-------------------------------------------------------------
-- 8. BATCHES TABLE
-------------------------------------------------------------
CREATE TABLE batches (
    batch_id SERIAL PRIMARY KEY,
    batch_year VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert Batches
INSERT INTO batches (batch_year) VALUES
('first year'),
('second year'),
('third year'),
('fourth year'),
('fifth year'),
('sixth year'),
('seventh year');

-------------------------------------------------------------
-- 9. SEMESTERS TABLE
-------------------------------------------------------------

CREATE TABLE semesters (
    id SERIAL PRIMARY KEY,
    batch_id INT NOT NULL,
    semester VARCHAR(20) NOT NULL,
    academic_year VARCHAR(9) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'active'CHECK (status IN ('active', 'inactive', 'upcoming', 'completed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    Foreign key(batch_id) REFERENCES batches(batch_id)
);

-- Insert Semesters
INSERT INTO semesters (batch_id, semester, academic_year, start_date, end_date) VALUES
(1,'Semester 1','2023-2024','2023-09-01','2024-01-30'),
(1,'Semester 2','2023-2024','2024-02-01','2024-06-30'),
(2,'Semester 3','2024-2025','2024-09-01','2025-01-30'),
(3,'Semester 4','2023-2024','2023-09-01','2024-01-30'),
(4,'Semester 5','2024-2025','2024-02-01','2024-06-30'),
(5,'Semester 6','2023-2024','2023-09-01','2024-01-30'),
(6,'Semester 7','2024-2025','2024-02-01','2024-06-30');

-------------------------------------------------------------
-- 10. SCHEDULES TABLE
-------------------------------------------------------------

CREATE TABLE schedules (
    id SERIAL PRIMARY KEY,
    department_id INT,
    batch_id int NOT NULL REFERENCES batches(batch_id) ON DELETE CASCADE,
    semester_id int  NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
    section VARCHAR(2) NOT NULL,
    status VARCHAR(20) CHECK (status IN ('draft','published')) DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(department_id)
);

-- Insert Schedules
INSERT INTO schedules (department_id, batch_id, semester_id, section, status) VALUES
(1,1,1,'A','draft'),
(1,1,1,'B','published'),
(2,2,1,'A','draft'),
(2,2,2,'B','published'),
(3,3,1,'A','draft'),
(4,3,1,'B','draft'),
(5,4,2,'A','published'),
(6,4,1,'B','draft'),
(7,5,1,'A','published'),
(8,6,3,'A','draft');

-------------------------------------------------------------
-- 11. DAY SCHEDULES
-------------------------------------------------------------
CREATE TABLE day_schedules (
    id SERIAL PRIMARY KEY,
    schedule_id INT NOT NULL,
    day_of_week VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
);
-------------------------------------------------------------
-- 11. DAY SCHEDULES
-----------------------------------------------------------

CREATE TABLE time_slots (
    id SERIAL PRIMARY KEY,
    department_id INT NOT NULL REFERENCES departments(department_id),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    Lecture_duration int NOT NULL,
    labratory_duration int NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (department_id),
    CHECK (end_time > start_time)
);

INSERT INTO day_schedules (schedule_id, day_of_week) VALUES
(1,'Monday'),
(1,'Wednesday'),
(2,'Tuesday'),
(2,'Friday'),
(3,'Thursday'),
(4,'Monday'),
(5,'Wednesday'),
(6,'Friday'),
(7,'Tuesday'),
(8,'Thursday');

-------------------------------------------------------------
-- 12. DAY COURSES
-------------------------------------------------------------
CREATE TABLE day_courses (
    id SERIAL PRIMARY KEY,
    day_schedule_id INT NOT NULL,
    course_id INT NOT NULL,
    room_id INT NOT NULL,
    instructor_id INT NOT NULL,
    start_time TIME , -- for manual
    end_time TIME , -- for manual
    color VARCHAR(7) DEFAULT '#3b82f6',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (day_schedule_id) REFERENCES day_schedules(id) ON DELETE CASCADE
);

-- Insert Day Courses
INSERT INTO day_courses (day_schedule_id, course_id, room_id, instructor_id, start_time, end_time) VALUES
(1,1,3,2,'08:00','10:00'),
(1,2,3,1,'10:00','12:00'),
(2,3,4,2,'08:00','10:00'),
(3,4,5,1,'13:00','15:00'),
(4,5,6,3,'09:00','11:00'),
(5,6,7,4,'11:00','13:00'),
(6,7,8,2,'14:00','16:00'),
(7,8,9,5,'08:30','10:30'),
(8,9,10,4,'10:30','12:30');
-----------------------------------------------------------
-- 13. FEEDBACK TABLE
-------------------------------------------------------------
CREATE TABLE feedback (
  id SERIAL PRIMARY KEY,
  id_number VARCHAR(50) ,
  role VARCHAR(10) NOT NULL,
  mes_category VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert Feedback with specific timestamps
INSERT INTO feedback (id_number, role, mes_category, message, status, created_at) VALUES
('S2001', 'instructor', 'Complaint', 'Projector not working in room 302', 'pending', '2024-01-15 09:30:00'),
('S2002', 'instructor', 'Request', 'Add more lab sessions for Programming course', 'pending', '2024-01-16 14:20:00'),
('S2003', 'instructor', 'Complaint', 'WiFi not stable in library area', 'pending', '2024-01-17 11:45:00'),
('S2004', 'instructor', 'Comment', 'Great teaching style by Professor Smith', 'approved', '2024-01-18 16:10:00'),
('S2005', 'instructor', 'Complaint', 'Room 205 too crowded for lectures', 'pending', '2024-01-19 10:15:00'),
('S2006', 'student', 'Suggestion', 'Extend library hours during exam weeks', 'pending', '2024-01-20 15:30:00'),
('S2007', 'student', 'Request', 'Need more PCs in Computer Lab 3', 'approved', '2024-01-21 13:25:00'),
('S2008', 'student', 'Complaint', 'Air conditioning not working in building B', 'pending', '2024-01-22 08:40:00'),
('S2009', 'student', 'Comment', 'Clean environment and well-maintained facilities', 'approved', '2024-01-23 12:50:00'),
('S2010', 'student', 'Suggestion', 'Add more elective courses for final year', 'pending', '2024-01-24 17:05:00');

-------------------------------------------------------------
-- 14. ANNOUNCEMENTS
-------------------------------------------------------------
CREATE TABLE announcements (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    author_id INTEGER REFERENCES users(id),
    department_id INTEGER REFERENCES departments(department_id),
    priority VARCHAR(20) DEFAULT 'normal',
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    publish_at TIMESTAMP,
    expires_at TIMESTAMP,
    isRead BOOLEAN DEFAULT false
);


-- Insert Announcements
INSERT INTO announcements (title,content,author_id,department_id,priority,is_published) VALUES
('Class Suspension','Maintenance work',1,1,'high',true),
('New Lab PCs','30 new computers added',1,2,'normal',true),
('Exam Schedule','Exam starts next Monday',1,3,'high',true),
('Holiday Notice','Holiday on Friday',1,4,'normal',false),
('Workshop','Web Development Workshop',1,1,'normal',true),
('Orientation','Freshman orientation day',1,2,'high',true),
('Seminar','AI Seminar this weekend',1,3,'normal',true),
('Sports Day','Sports day next month',1,4,'low',false),
('Conference','Engineering conference',1,1,'high',true),
('Library Update','Library open 24/7',1,2,'normal',true);

-- Create students table

CREATE TABLE students (
    student_id SERIAL PRIMARY KEY,
    student_number VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL DEFAULT '$2b$10$Ad0CS3PZK3Jg9KZ60P8rhOdE6WL1Osv213MnCxaAxN.VLOL1yfVwy',
    email VARCHAR(150) UNIQUE NOT NULL,
    phone VARCHAR(15),
    date_of_birth DATE,
    gender VARCHAR(10) CHECK (gender IN ('Male', 'Female', 'Other')),
    address TEXT,
    role VARCHAR(10) NOT NULL DEFAULT 'Student',
    enrollment_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Graduated', 'Suspended')),
    is_first_login BOOLEAN DEFAULT TRUE,
    department_id INTEGER REFERENCES departments(department_id) ON DELETE SET NULL,
    batch_id INTEGER REFERENCES batches(batch_id) ON DELETE SET NULL,
    semester_id INTEGER REFERENCES semesters(id) ON DELETE SET NULL,
    section VARCHAR(10), 
    reason TEXT,
    profile_image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id)
);

INSERT INTO students (
    student_number,
    full_name,
    email,
    phone,
    date_of_birth,
    gender,
    address,
    enrollment_date,
    status,
    department_id,
    batch_id,
    semester_id,
    section,
    profile_image_url,
    created_by,
    updated_by
) VALUES
('STU2024001', 'Alice Johnson', 'alice.johnson@student.university.edu', '555-0101', '2003-05-15', 'Female', '123 Main St, Anytown, USA', '2024-08-20', 'Active', 1, 3, 1, 'A', 'https://example.com/profiles/alice.jpg', 1, 1),
('STU2024002', 'Bob Smith', 'bob.smith@student.university.edu', '555-0102', '2002-11-22', 'Male', '456 Oak Ave, Othertown, USA', '2024-08-20', 'Active', 2, 3, 1, 'B', 'https://example.com/profiles/bob.jpg', 1, 2),
('STU2023001', 'Carol Davis', 'carol.davis@student.university.edu', '555-0103', '2001-08-30', 'Female', '789 Pine Rd, Somewhere, USA', '2023-08-20', 'Active', 1, 2, 3, 'A', 'https://example.com/profiles/carol.jpg', 2, 2),
('STU2023002', 'David Wilson', 'david.wilson@student.university.edu', '555-0104', '2001-03-10', 'Male', '321 Elm St, Nowhere, USA', '2023-08-20', 'Active', 3, 2, 3, 'B', 'https://example.com/profiles/david.jpg', 2, 3),
('STU2022001', 'Emma Brown', 'emma.brown@student.university.edu', '555-0105', '2000-12-05', 'Female', '654 Maple Dr, Anycity, USA', '2022-08-15', 'Active', 1, 1, 3, 'A', 'https://example.com/profiles/emma.jpg', 3, 3),
('STU2024003', 'Frank Miller', 'frank.miller@student.university.edu', '555-0106', '2003-07-18', 'Male', '987 Cedar Ln, Yourtown, USA', '2024-08-20', 'Active', 4, 3, 1, 'C', NULL, 1, 1),
('STU2024004', 'Grace Lee', 'grace.lee@student.university.edu', '555-0107', '2002-09-25', 'Female', '147 Birch St, Mytown, USA', '2024-08-20', 'Active', 5, 3, 1, 'A', 'https://example.com/profiles/grace.jpg', 1, 2),
('STU2023003', 'Henry Taylor', 'henry.taylor@student.university.edu', '555-0108', '2001-01-14', 'Male', '258 Walnut Way, Histown, USA', '2023-08-20', 'Suspended', 2, 2, 3, 'B', NULL, 2, 3),
('STU2022002', 'Ivy Chen', 'ivy.chen@student.university.edu', '555-0109', '2000-06-30', 'Female', '369 Spruce Ct, Newtown, USA', '2022-08-15', 'Graduated', 6, 1, 3, 'A', 'https://example.com/profiles/ivy.jpg', 3, 4),
('STU2022003', 'Jack Martin', 'jack.martin@student.university.edu', '555-0110', '2000-04-12', 'Male', '741 Aspen Blvd, Oldtown, USA', '2022-08-15', 'Inactive', 1, 1, 3, 'B', NULL, 3, 3);
-------------------------------------------------------------
-- 14. chat_message
-------------------------------------------------------------

CREATE TABLE user_contacts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('request','pending', 'accepted', 'rejected')),
    is_favorite BOOLEAN DEFAULT false,
    is_blocked BOOLEAN DEFAULT false,
    last_interaction TIMESTAMP,
    message_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, contact_id),
    CHECK (user_id != contact_id)
);


CREATE TABLE direct_messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_id INTEGER NOT NULL REFERENCES user_contacts(id) ON DELETE CASCADE,
    message_type VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file')),
    message TEXT,
    file_url TEXT,
    file_name TEXT,
    file_size INTEGER,
    is_edited BOOLEAN DEFAULT false,
    edited_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP,
    mime_type VARCHAR(100),
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (sender_id != receiver_id),
     CHECK (
        (message_type = 'text' AND message IS NOT NULL)
        OR
        (message_type != 'text' AND file_url IS NOT NULL)
    )
);
