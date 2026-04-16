#pragma once

#include <Arduino.h>

constexpr uint8_t SERVO_COUNT = 7;
// 顺序对应 Web 中的舵机 ID:
// 1 左膝, 2 右膝, 3 左胯zy, 4 右胯zy, 5 左胯qh, 6 右胯qh, 7 脖子
constexpr uint8_t PCA9685_CHANNELS[SERVO_COUNT] = {15, 0, 12, 3, 9, 6, 14};
// 镜像结构下，右侧 3 个关节使用反向角度映射。
constexpr bool SERVO_INVERTED[SERVO_COUNT] = {false, true, false, true, true, false, false};
constexpr uint8_t PCA9685_I2C_ADDRESS = 0x40;
constexpr uint8_t PCA9685_SDA_PIN = 21;
constexpr uint8_t PCA9685_SCL_PIN = 22;
constexpr uint16_t PCA9685_PWM_FREQUENCY = 50;
constexpr bool IMU_MPU6050_ENABLED = true;
constexpr uint8_t MPU6050_PRIMARY_I2C_ADDRESS = 0x68;
constexpr uint8_t MPU6050_SECONDARY_I2C_ADDRESS = 0x69;
constexpr unsigned long IMU_UPDATE_INTERVAL_MS = 20;
constexpr unsigned long IMU_RETRY_INTERVAL_MS = 3000;
constexpr uint16_t IMU_GYRO_CALIBRATION_SAMPLES = 200;
constexpr float IMU_COMPLEMENTARY_ALPHA = 0.98f;
constexpr float IMU_FALLEN_THRESHOLD_DEG = 45.0f;
constexpr int SERVO_MIN_ANGLE = 10;
constexpr int SERVO_MAX_ANGLE = 170;
constexpr int SERVO_CENTER_ANGLE = 90;
constexpr int SERVO_TRIM_MIN_ANGLE = -30;
constexpr int SERVO_TRIM_MAX_ANGLE = 30;
constexpr uint16_t SERVO_MIN_PULSE_US = 500;
constexpr uint16_t SERVO_MAX_PULSE_US = 2400;
constexpr bool SERVO_CENTER_ON_BOOT = false;
constexpr unsigned long STATUS_PUSH_INTERVAL_MS = 1000;
constexpr unsigned long SAFETY_TIMEOUT_MS = 2500;

// 没有接电池采样时可保持 -1，固件会回落到模拟值。
constexpr int BATTERY_ADC_PIN = -1;
constexpr float ADC_REFERENCE_VOLTAGE = 3.3f;
constexpr float BATTERY_DIVIDER_RATIO = 2.0f;

constexpr bool WIFI_USE_STATIC_IP = true;
constexpr uint8_t WIFI_STATIC_IP[4] = {172, 20, 10, 10};
constexpr uint8_t WIFI_GATEWAY[4] = {172, 20, 10, 1};
constexpr uint8_t WIFI_SUBNET[4] = {255, 255, 255, 240};
constexpr uint8_t WIFI_DNS_PRIMARY[4] = {172, 20, 10, 1};
constexpr uint8_t WIFI_DNS_SECONDARY[4] = {8, 8, 8, 8};
