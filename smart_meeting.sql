-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Feb 06, 2026 at 06:49 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `smart_meeting`
--

-- --------------------------------------------------------

--
-- Table structure for table `bookings`
--

CREATE TABLE `bookings` (
  `id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `room_id` int(11) DEFAULT NULL,
  `start_time` datetime DEFAULT NULL,
  `end_time` datetime DEFAULT NULL,
  `topic` varchar(255) DEFAULT NULL,
  `status` enum('pending','approved','rejected') DEFAULT 'pending',
  `document` varchar(255) DEFAULT NULL,
  `attendees` int(11) DEFAULT NULL,
  `equipment` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `bookings`
--

INSERT INTO `bookings` (`id`, `user_id`, `room_id`, `start_time`, `end_time`, `topic`, `status`, `document`, `attendees`, `equipment`) VALUES
(17, 1, 5, '2026-01-28 04:00:00', '2026-01-28 05:00:00', 'Test', 'approved', NULL, NULL, NULL),
(18, 6, 9, '2026-01-28 16:09:00', '2026-01-28 17:09:00', 'Test', 'approved', NULL, NULL, NULL),
(19, 6, 9, '2026-01-30 05:20:00', '2026-01-30 06:20:00', 'Test', 'approved', NULL, NULL, NULL),
(23, 1, 5, '2026-01-30 11:06:00', '2026-01-30 12:06:00', 'ddd111', 'approved', NULL, NULL, NULL),
(24, 1, 5, '2026-01-30 11:15:00', '2026-01-30 12:15:00', ' 1 ON 1 ', 'approved', '1769681675807.pdf', NULL, NULL),
(25, 1, 9, '2026-01-30 11:29:00', '2026-01-30 12:29:00', 'ddd1111', 'approved', NULL, NULL, NULL),
(26, 1, 8, '2026-01-31 12:50:00', '2026-01-31 13:50:00', 'Test1111', 'approved', NULL, NULL, NULL),
(27, 1, 7, '2026-01-25 14:53:00', '2026-01-25 15:53:00', 'Test11111111111111111111', 'approved', NULL, NULL, NULL),
(28, 1, 8, '2026-01-30 00:05:00', '2026-01-30 01:05:00', ' 1 ON 1 7', 'approved', NULL, NULL, NULL),
(29, 1, 5, '2026-01-30 15:09:00', '2026-01-30 16:09:00', 'Test111', 'approved', NULL, NULL, NULL),
(30, 6, 5, '2026-01-30 02:39:00', '2026-01-30 03:39:00', 'mn', 'approved', NULL, NULL, NULL),
(32, 6, 8, '2026-01-30 03:11:00', '2026-01-30 04:11:00', 'JJJ', 'approved', NULL, NULL, NULL),
(34, 7, 8, '2025-12-18 06:05:00', '2025-12-18 07:05:00', 'ประชุม', 'approved', NULL, NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `rooms`
--

CREATE TABLE `rooms` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `capacity` int(11) NOT NULL,
  `facilities` text DEFAULT NULL,
  `status` enum('active','maintenance') DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `rooms`
--

INSERT INTO `rooms` (`id`, `name`, `capacity`, `facilities`, `status`) VALUES
(5, 'ห้องประชุมโรงเเรมชั้น 3', 30, '', 'active'),
(7, 'ห้องประชุมอาเซียน', 50, '', 'active'),
(8, 'ห้องประชุม 514', 30, '', 'active'),
(9, 'ห้องประชุมหอประชุมเฉลิมพระเกียรติ', 200, '', 'active');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('admin','user') DEFAULT 'user',
  `fullname` varchar(100) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `avatar` varchar(255) DEFAULT 'default.png'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `username`, `password`, `role`, `fullname`, `email`, `avatar`) VALUES
(1, 'admin', '1234', 'admin', 'AdminP', 'admin@test.com', '1763827478486.jpg'),
(2, 'user1', '1234', 'user', 'Ronaphum User', 'user@test.com', 'default.png'),
(3, 'user2', '1234', 'user', 'Somchai Staff', NULL, 'default.png'),
(4, 'UserTest', '1122', 'user', 'Usertest', 'usertest@gmail.com', 'default.png'),
(5, 'UserTest1', 'UserTest1', 'user', 'UserTest1', 'UserTest1@gmail.com', 'default.png'),
(6, 'P', 'P', 'user', 'P', 'P@gmail.com', '1763899609318.jpg'),
(7, 'mink', 'mink12345', 'user', 'mink', 'phachrapha185@gmail.com', 'default.png'),
(8, 'ภูมิ', '1234', 'user', 'ภูมิ', 'tommimely999@gmail.com', 'default.png');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `bookings`
--
ALTER TABLE `bookings`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `room_id` (`room_id`);

--
-- Indexes for table `rooms`
--
ALTER TABLE `rooms`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `bookings`
--
ALTER TABLE `bookings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=36;

--
-- AUTO_INCREMENT for table `rooms`
--
ALTER TABLE `rooms`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `bookings`
--
ALTER TABLE `bookings`
  ADD CONSTRAINT `bookings_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `bookings_ibfk_2` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
