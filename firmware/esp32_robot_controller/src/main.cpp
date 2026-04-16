#include <Arduino.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>
#include <Update.h>
#include <WiFi.h>
#include <Wire.h>
#include <Preferences.h>
#include "robot_config.h"
#include "secrets.h"

AsyncWebServer server(80);
AsyncWebSocket socketServer("/ws");
Preferences preferences;

namespace {
constexpr uint8_t PCA9685_MODE1_REGISTER = 0x00;
constexpr uint8_t PCA9685_MODE2_REGISTER = 0x01;
constexpr uint8_t PCA9685_PRESCALE_REGISTER = 0xFE;
constexpr uint8_t PCA9685_LED0_ON_L_REGISTER = 0x06;
constexpr uint8_t MPU6050_WHO_AM_I_REGISTER = 0x75;
constexpr uint8_t MPU6050_PWR_MGMT_1_REGISTER = 0x6B;
constexpr uint8_t MPU6050_SMPLRT_DIV_REGISTER = 0x19;
constexpr uint8_t MPU6050_CONFIG_REGISTER = 0x1A;
constexpr uint8_t MPU6050_GYRO_CONFIG_REGISTER = 0x1B;
constexpr uint8_t MPU6050_ACCEL_CONFIG_REGISTER = 0x1C;
constexpr uint8_t MPU6050_ACCEL_XOUT_H_REGISTER = 0x3B;
constexpr float MPU6050_ACCEL_SCALE = 16384.0f;
constexpr float MPU6050_GYRO_SCALE = 131.0f;
constexpr float K_RADIANS_TO_DEGREES = 57.2957795f;
constexpr float K_DEGREES_TO_RADIANS = 0.0174532925f;
constexpr uint8_t SERVO_LEFT_KNEE = 0;
constexpr uint8_t SERVO_RIGHT_KNEE = 1;
constexpr uint8_t SERVO_LEFT_HIP_ROLL = 2;
constexpr uint8_t SERVO_RIGHT_HIP_ROLL = 3;
constexpr uint8_t SERVO_LEFT_HIP_PITCH = 4;
constexpr uint8_t SERVO_RIGHT_HIP_PITCH = 5;
constexpr uint8_t SERVO_NECK = 6;
}

struct GaitParams {
  float leanAngleDeg = 8.0f;
  float hipSwingDeg = 12.0f;
  float kneeLiftDeg = 14.0f;
  float stanceKneeDeg = 104.0f;
  unsigned long doubleSupportMs = 240;
  unsigned long swingPhaseMs = 460;
  float torsoLeadDeg = 1.0f;
  float neckTrimDeg = 1.5f;
};

enum class GaitPhase : uint8_t {
  Idle,
  ShiftLeft,
  SwingRight,
  ShiftRight,
  SwingLeft
};

struct GaitState {
  bool active = false;
  bool telemetryAvailable = false;
  bool manualControl = false;
  uint32_t trialId = 0;
  unsigned long startedAt = 0;
  unsigned long phaseStartedAt = 0;
  unsigned long durationMs = 0;
  uint32_t stepCount = 0;
  float estimatedForwardProgress = 0.0f;
  float baselineYaw = 0.0f;
  float baselineRoll = 0.0f;
  float stabilityScore = 0.0f;
  float lateralDriftMeters = 0.0f;
  float yawDriftDeg = 0.0f;
  GaitPhase phase = GaitPhase::Idle;
  GaitParams params;
};

struct RobotState {
  bool connected = false;
  bool otaInProgress = false;
  bool servoDriverReady = false;
  String mode = "idle";
  String firmwareVersion = FIRMWARE_VERSION;
  String lastDriverError = "";
  float battery = 7.4f;
  int signalStrength = -100;
  unsigned long lastCommandAt = 0;
  uint32_t servoWriteFailures = 0;
  bool imuAvailable = false;
  bool imuCalibrated = false;
  bool imuPoseInitialized = false;
  bool imuFallen = false;
  uint8_t imuAddress = 0;
  float imuRoll = 0.0f;
  float imuPitch = 0.0f;
  float imuYaw = 0.0f;
  float imuTemperature = 0.0f;
  float imuAccelX = 0.0f;
  float imuAccelY = 0.0f;
  float imuAccelZ = 0.0f;
  float imuGyroX = 0.0f;
  float imuGyroY = 0.0f;
  float imuGyroZ = 0.0f;
  float imuGyroBiasX = 0.0f;
  float imuGyroBiasY = 0.0f;
  float imuGyroBiasZ = 0.0f;
  unsigned long lastImuReadAt = 0;
  int servoAngles[SERVO_COUNT] = {
    SERVO_CENTER_ANGLE,
    SERVO_CENTER_ANGLE,
    SERVO_CENTER_ANGLE,
    SERVO_CENTER_ANGLE,
    SERVO_CENTER_ANGLE,
    SERVO_CENTER_ANGLE,
    SERVO_CENTER_ANGLE
  };
  int servoZeroOffsets[SERVO_COUNT] = {
    0,
    0,
    0,
    0,
    0,
    0,
    0
  };
};

RobotState robotState;
GaitState gaitState;

void applyServoAngle(uint8_t servoId, int angle);
void centerPose();
void stopAllMotion();

void appendStringArray(JsonArray target, const char* const items[], size_t count) {
  for (size_t index = 0; index < count; index++) {
    target.add(items[index]);
  }
}

void appendServoIdArray(JsonArray target) {
  for (uint8_t index = 0; index < SERVO_COUNT; index++) {
    target.add(index + 1);
  }
}

void appendServoChannelArray(JsonArray target) {
  for (uint8_t index = 0; index < SERVO_COUNT; index++) {
    target.add(PCA9685_CHANNELS[index]);
  }
}

void appendServoInvertedArray(JsonArray target) {
  for (uint8_t index = 0; index < SERVO_COUNT; index++) {
    target.add(SERVO_INVERTED[index]);
  }
}

void appendServoZeroOffsetArray(JsonArray target) {
  for (uint8_t index = 0; index < SERVO_COUNT; index++) {
    target.add(robotState.servoZeroOffsets[index]);
  }
}

void writeNullableFloat(JsonObject target, const char* key, bool available, float value, uint8_t digits = 2) {
  if (!available) {
    target[key] = nullptr;
    return;
  }

  target[key] = serialized(String(static_cast<double>(value), static_cast<unsigned int>(digits)));
}

float clampFloat(float value, float minValue, float maxValue) {
  if (value < minValue) {
    return minValue;
  }
  if (value > maxValue) {
    return maxValue;
  }
  return value;
}

float lerpFloat(float start, float end, float progress) {
  return start + (end - start) * progress;
}

float easeInOutSine(float progress) {
  const float clamped = clampFloat(progress, 0.0f, 1.0f);
  return 0.5f - 0.5f * cosf(PI * clamped);
}

float swingWave(float progress) {
  const float clamped = clampFloat(progress, 0.0f, 1.0f);
  return sinf(PI * clamped);
}

const char* gaitPhaseLabel(GaitPhase phase) {
  switch (phase) {
    case GaitPhase::ShiftLeft:
      return "shift_left";
    case GaitPhase::SwingRight:
      return "swing_right";
    case GaitPhase::ShiftRight:
      return "shift_right";
    case GaitPhase::SwingLeft:
      return "swing_left";
    case GaitPhase::Idle:
    default:
      return "idle";
  }
}

unsigned long gaitPhaseDurationMs(GaitPhase phase) {
  switch (phase) {
    case GaitPhase::ShiftLeft:
    case GaitPhase::ShiftRight:
      return gaitState.params.doubleSupportMs;
    case GaitPhase::SwingRight:
    case GaitPhase::SwingLeft:
      return gaitState.params.swingPhaseMs;
    case GaitPhase::Idle:
    default:
      return 0;
  }
}

GaitPhase nextGaitPhase(GaitPhase phase) {
  switch (phase) {
    case GaitPhase::ShiftLeft:
      return GaitPhase::SwingRight;
    case GaitPhase::SwingRight:
      return GaitPhase::ShiftRight;
    case GaitPhase::ShiftRight:
      return GaitPhase::SwingLeft;
    case GaitPhase::SwingLeft:
      return GaitPhase::ShiftLeft;
    case GaitPhase::Idle:
    default:
      return GaitPhase::ShiftLeft;
  }
}

int logicalLeftKneeAngle(float bendDeg) {
  return static_cast<int>(lroundf(clampFloat(SERVO_CENTER_ANGLE - bendDeg, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE)));
}

int logicalRightKneeAngle(float bendDeg) {
  return static_cast<int>(lroundf(clampFloat(SERVO_CENTER_ANGLE + bendDeg, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE)));
}

int logicalLeftHipRollAngle(float anatomicalDeg) {
  return static_cast<int>(lroundf(clampFloat(SERVO_CENTER_ANGLE + anatomicalDeg, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE)));
}

int logicalRightHipRollAngle(float anatomicalDeg) {
  return static_cast<int>(lroundf(clampFloat(SERVO_CENTER_ANGLE - anatomicalDeg, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE)));
}

int logicalLeftHipPitchAngle(float anatomicalDeg) {
  return static_cast<int>(lroundf(clampFloat(SERVO_CENTER_ANGLE - anatomicalDeg, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE)));
}

int logicalRightHipPitchAngle(float anatomicalDeg) {
  return static_cast<int>(lroundf(clampFloat(SERVO_CENTER_ANGLE + anatomicalDeg, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE)));
}

void setPenguinPose(
  float bodyLeanDeg,
  float leftKneeBendDeg,
  float rightKneeBendDeg,
  float leftHipPitchDeg,
  float rightHipPitchDeg,
  float neckTrimDeg
) {
  applyServoAngle(SERVO_LEFT_KNEE, logicalLeftKneeAngle(leftKneeBendDeg));
  applyServoAngle(SERVO_RIGHT_KNEE, logicalRightKneeAngle(rightKneeBendDeg));
  applyServoAngle(SERVO_LEFT_HIP_ROLL, logicalLeftHipRollAngle(bodyLeanDeg));
  applyServoAngle(SERVO_RIGHT_HIP_ROLL, logicalRightHipRollAngle(bodyLeanDeg));
  applyServoAngle(SERVO_LEFT_HIP_PITCH, logicalLeftHipPitchAngle(leftHipPitchDeg));
  applyServoAngle(SERVO_RIGHT_HIP_PITCH, logicalRightHipPitchAngle(rightHipPitchDeg));
  const float neckAngle = clampFloat(
    SERVO_CENTER_ANGLE + neckTrimDeg - bodyLeanDeg * 0.35f,
    SERVO_MIN_ANGLE,
    SERVO_MAX_ANGLE
  );
  applyServoAngle(SERVO_NECK, static_cast<int>(lroundf(neckAngle)));
}

String buildStatusJson() {
  JsonDocument doc;
  doc["type"] = "status";
  doc["name"] = ROBOT_NAME;
  doc["connected"] = robotState.connected;
  doc["mode"] = robotState.mode;
  doc["battery"] = robotState.battery;
  doc["signalStrength"] = robotState.signalStrength;
  doc["firmwareVersion"] = robotState.firmwareVersion;
  doc["otaInProgress"] = robotState.otaInProgress;

  JsonObject imu = doc["imu"].to<JsonObject>();
  imu["available"] = robotState.imuAvailable;
  imu["calibrated"] = robotState.imuCalibrated;
  imu["fallen"] = robotState.imuFallen;
  writeNullableFloat(imu, "roll", robotState.imuAvailable, robotState.imuRoll);
  writeNullableFloat(imu, "pitch", robotState.imuAvailable, robotState.imuPitch);
  writeNullableFloat(imu, "yaw", robotState.imuAvailable, robotState.imuYaw);
  writeNullableFloat(imu, "temperature", robotState.imuAvailable, robotState.imuTemperature);
  JsonObject accel = imu["accel"].to<JsonObject>();
  writeNullableFloat(accel, "x", robotState.imuAvailable, robotState.imuAccelX, 3);
  writeNullableFloat(accel, "y", robotState.imuAvailable, robotState.imuAccelY, 3);
  writeNullableFloat(accel, "z", robotState.imuAvailable, robotState.imuAccelZ, 3);
  JsonObject gyro = imu["gyro"].to<JsonObject>();
  writeNullableFloat(gyro, "x", robotState.imuAvailable, robotState.imuGyroX, 3);
  writeNullableFloat(gyro, "y", robotState.imuAvailable, robotState.imuGyroY, 3);
  writeNullableFloat(gyro, "z", robotState.imuAvailable, robotState.imuGyroZ, 3);

  JsonObject gaitTelemetry = doc["gaitTelemetry"].to<JsonObject>();
  gaitTelemetry["available"] = gaitState.telemetryAvailable || gaitState.active;
  gaitTelemetry["phase"] = gaitPhaseLabel(gaitState.phase);
  gaitTelemetry["stepCount"] = gaitState.stepCount;
  writeNullableFloat(
    gaitTelemetry,
    "forwardProgress",
    gaitState.telemetryAvailable || gaitState.active,
    gaitState.estimatedForwardProgress,
    3
  );
  writeNullableFloat(
    gaitTelemetry,
    "lateralDrift",
    gaitState.telemetryAvailable || gaitState.active,
    gaitState.lateralDriftMeters,
    3
  );
  writeNullableFloat(
    gaitTelemetry,
    "yawDrift",
    gaitState.telemetryAvailable || gaitState.active,
    gaitState.yawDriftDeg,
    2
  );
  writeNullableFloat(
    gaitTelemetry,
    "stabilityScore",
    gaitState.telemetryAvailable || gaitState.active,
    gaitState.stabilityScore,
    3
  );
  gaitTelemetry["fallen"] = robotState.imuFallen;

  JsonObject servoAngles = doc["servoAngles"].to<JsonObject>();
  for (uint8_t index = 0; index < SERVO_COUNT; index++) {
    servoAngles[String(index + 1)] = robotState.servoAngles[index];
  }

  JsonObject network = doc["network"].to<JsonObject>();
  network["wifiMode"] = "STA";
  network["ip"] = WiFi.localIP().toString();
  network["gateway"] = WiFi.gatewayIP().toString();
  network["subnet"] = WiFi.subnetMask().toString();
  network["dnsPrimary"] = WiFi.dnsIP(0).toString();
  network["dnsSecondary"] = WiFi.dnsIP(1).toString();
  network["staticIpEnabled"] = WIFI_USE_STATIC_IP;
  network["httpPort"] = 80;
  network["websocketPath"] = "/ws";
  network["controlPath"] = "/control";
  network["otaPath"] = "/update";

  JsonObject capabilities = doc["capabilities"].to<JsonObject>();
  JsonArray modules = capabilities["modules"].to<JsonArray>();
  const char* const enabledModules[] = {
    "wifi_sta",
    "websocket",
    "http_control",
    "ota",
    "servo_control",
    "safety_timeout"
  };
  appendStringArray(modules, enabledModules, sizeof(enabledModules) / sizeof(enabledModules[0]));
  modules.add("pca9685");
  if (WIFI_USE_STATIC_IP) {
    modules.add("static_ip");
  }
  if (IMU_MPU6050_ENABLED) {
    modules.add("imu_mpu6050");
  }
  modules.add("penguin_gait");
  modules.add("gait_telemetry");

  JsonArray actions = capabilities["actions"].to<JsonArray>();
  const char* const actionNames[] = {
    "stand",
    "squat",
    "center",
    "penguin_walk",
    "emergency_stop"
  };
  appendStringArray(actions, actionNames, sizeof(actionNames) / sizeof(actionNames[0]));

  JsonArray moves = capabilities["moves"].to<JsonArray>();
  const char* const moveNames[] = {
    "forward",
    "backward",
    "left",
    "right",
    "stop"
  };
  appendStringArray(moves, moveNames, sizeof(moveNames) / sizeof(moveNames[0]));

  JsonArray servoIds = capabilities["servoIds"].to<JsonArray>();
  appendServoIdArray(servoIds);

  JsonObject build = doc["build"].to<JsonObject>();
  build["firmwareVersion"] = FIRMWARE_VERSION;
  build["robotName"] = ROBOT_NAME;
  build["compiledAt"] = String(__DATE__) + " " + String(__TIME__);
  build["servoCount"] = SERVO_COUNT;
  build["servoDriver"] = "pca9685";
  build["servoDriverReady"] = robotState.servoDriverReady;
  build["servoWriteFailures"] = robotState.servoWriteFailures;
  build["lastDriverError"] = robotState.lastDriverError;
  build["i2cSdaPin"] = PCA9685_SDA_PIN;
  build["i2cSclPin"] = PCA9685_SCL_PIN;
  build["pca9685Address"] = PCA9685_I2C_ADDRESS;
  build["servoPwmFrequencyHz"] = PCA9685_PWM_FREQUENCY;
  build["statusPushIntervalMs"] = STATUS_PUSH_INTERVAL_MS;
  build["safetyTimeoutMs"] = SAFETY_TIMEOUT_MS;
  build["imuEnabled"] = IMU_MPU6050_ENABLED;
  if (IMU_MPU6050_ENABLED) {
    build["imuModel"] = "MPU6050";
    if (robotState.imuAvailable) {
      build["imuAddress"] = robotState.imuAddress;
    } else {
      build["imuAddress"] = nullptr;
    }
    build["imuUpdateIntervalMs"] = IMU_UPDATE_INTERVAL_MS;
    build["imuRetryIntervalMs"] = IMU_RETRY_INTERVAL_MS;
    build["imuFallenThresholdDeg"] = serialized(String(IMU_FALLEN_THRESHOLD_DEG, 1));
  }

  JsonObject angleRange = build["angleRange"].to<JsonObject>();
  angleRange["min"] = SERVO_MIN_ANGLE;
  angleRange["max"] = SERVO_MAX_ANGLE;
  angleRange["center"] = SERVO_CENTER_ANGLE;

  JsonObject pulseRangeUs = build["pulseRangeUs"].to<JsonObject>();
  pulseRangeUs["min"] = SERVO_MIN_PULSE_US;
  pulseRangeUs["max"] = SERVO_MAX_PULSE_US;

  JsonArray servoChannels = build["servoChannels"].to<JsonArray>();
  appendServoChannelArray(servoChannels);
  JsonArray servoInverted = build["servoInverted"].to<JsonArray>();
  appendServoInvertedArray(servoInverted);
  JsonArray servoZeroOffsets = build["servoZeroOffsets"].to<JsonArray>();
  appendServoZeroOffsetArray(servoZeroOffsets);
  build["servoCenterOnBoot"] = SERVO_CENTER_ON_BOOT;
  JsonObject trimRange = build["servoTrimRange"].to<JsonObject>();
  trimRange["min"] = SERVO_TRIM_MIN_ANGLE;
  trimRange["max"] = SERVO_TRIM_MAX_ANGLE;

  String output;
  serializeJson(doc, output);
  return output;
}

void broadcastStatus() {
  socketServer.textAll(buildStatusJson());
}

float readBatteryVoltage() {
  if (BATTERY_ADC_PIN < 0) {
    return 7.4f;
  }

  int raw = analogRead(BATTERY_ADC_PIN);
  const float adcVoltage = (static_cast<float>(raw) / 4095.0f) * ADC_REFERENCE_VOLTAGE;
  return adcVoltage * BATTERY_DIVIDER_RATIO;
}

bool probeI2cDevice(uint8_t address) {
  Wire.beginTransmission(address);
  return Wire.endTransmission() == 0;
}

bool writePca9685Register(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(PCA9685_I2C_ADDRESS);
  Wire.write(reg);
  Wire.write(value);
  return Wire.endTransmission() == 0;
}

bool probePca9685() {
  return probeI2cDevice(PCA9685_I2C_ADDRESS);
}

uint8_t readPca9685Register(uint8_t reg) {
  Wire.beginTransmission(PCA9685_I2C_ADDRESS);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) {
    return 0;
  }

  if (Wire.requestFrom(static_cast<int>(PCA9685_I2C_ADDRESS), 1) != 1) {
    return 0;
  }

  return static_cast<uint8_t>(Wire.read());
}

bool writePca9685Pwm(uint8_t channel, uint16_t on, uint16_t off) {
  if (channel > 15 || on > 4095 || off > 4095) {
    return false;
  }

  Wire.beginTransmission(PCA9685_I2C_ADDRESS);
  Wire.write(static_cast<uint8_t>(PCA9685_LED0_ON_L_REGISTER + 4 * channel));
  Wire.write(static_cast<uint8_t>(on & 0xFF));
  Wire.write(static_cast<uint8_t>((on >> 8) & 0x0F));
  Wire.write(static_cast<uint8_t>(off & 0xFF));
  Wire.write(static_cast<uint8_t>((off >> 8) & 0x0F));
  return Wire.endTransmission() == 0;
}

bool writePca9685FullOff(uint8_t channel) {
  if (channel > 15) {
    return false;
  }

  Wire.beginTransmission(PCA9685_I2C_ADDRESS);
  Wire.write(static_cast<uint8_t>(PCA9685_LED0_ON_L_REGISTER + 4 * channel));
  Wire.write(0x00);
  Wire.write(0x00);
  Wire.write(0x00);
  Wire.write(0x10);
  return Wire.endTransmission() == 0;
}

uint16_t pulseUsToTicks(uint16_t pulseUs) {
  const uint32_t periodUs = 1000000UL / PCA9685_PWM_FREQUENCY;
  const uint32_t ticks = (static_cast<uint32_t>(pulseUs) * 4096UL + periodUs / 2UL) / periodUs;
  return static_cast<uint16_t>(ticks > 4095 ? 4095 : ticks);
}

uint16_t angleToPulseUs(int angle) {
  const int constrained = constrain(angle, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE);
  return static_cast<uint16_t>(
    map(constrained, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE, SERVO_MIN_PULSE_US, SERVO_MAX_PULSE_US)
  );
}

int mapLogicalAngleToPhysical(uint8_t servoId, int angle) {
  const int constrained = constrain(angle, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE);
  if (servoId >= SERVO_COUNT) {
    return constrained;
  }
  const int delta = constrained - SERVO_CENTER_ANGLE;
  const int direction = SERVO_INVERTED[servoId] ? -1 : 1;
  const int trimmed = SERVO_CENTER_ANGLE + robotState.servoZeroOffsets[servoId] + direction * delta;
  return constrain(trimmed, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE);
}

bool writeMpu6050Register(uint8_t reg, uint8_t value) {
  if (!robotState.imuAddress) {
    return false;
  }

  Wire.beginTransmission(robotState.imuAddress);
  Wire.write(reg);
  Wire.write(value);
  return Wire.endTransmission() == 0;
}

bool readMpu6050Bytes(uint8_t reg, uint8_t* buffer, size_t length) {
  if (!robotState.imuAddress || !buffer || length == 0) {
    return false;
  }

  Wire.beginTransmission(robotState.imuAddress);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) {
    return false;
  }

  const int received = Wire.requestFrom(static_cast<int>(robotState.imuAddress), static_cast<int>(length));
  if (received != static_cast<int>(length)) {
    return false;
  }

  for (size_t index = 0; index < length; index++) {
    buffer[index] = static_cast<uint8_t>(Wire.read());
  }

  return true;
}

float computeAccelRoll(float accelX, float accelY, float accelZ) {
  return atan2f(accelY, accelZ) * K_RADIANS_TO_DEGREES;
}

float computeAccelPitch(float accelX, float accelY, float accelZ) {
  return atan2f(-accelX, sqrtf(accelY * accelY + accelZ * accelZ)) * K_RADIANS_TO_DEGREES;
}

bool readMpu6050Sample() {
  uint8_t rawBytes[14];
  if (!readMpu6050Bytes(MPU6050_ACCEL_XOUT_H_REGISTER, rawBytes, sizeof(rawBytes))) {
    return false;
  }

  const int16_t rawAccelX = static_cast<int16_t>((rawBytes[0] << 8) | rawBytes[1]);
  const int16_t rawAccelY = static_cast<int16_t>((rawBytes[2] << 8) | rawBytes[3]);
  const int16_t rawAccelZ = static_cast<int16_t>((rawBytes[4] << 8) | rawBytes[5]);
  const int16_t rawTemperature = static_cast<int16_t>((rawBytes[6] << 8) | rawBytes[7]);
  const int16_t rawGyroX = static_cast<int16_t>((rawBytes[8] << 8) | rawBytes[9]);
  const int16_t rawGyroY = static_cast<int16_t>((rawBytes[10] << 8) | rawBytes[11]);
  const int16_t rawGyroZ = static_cast<int16_t>((rawBytes[12] << 8) | rawBytes[13]);

  robotState.imuAccelX = static_cast<float>(rawAccelX) / MPU6050_ACCEL_SCALE;
  robotState.imuAccelY = static_cast<float>(rawAccelY) / MPU6050_ACCEL_SCALE;
  robotState.imuAccelZ = static_cast<float>(rawAccelZ) / MPU6050_ACCEL_SCALE;
  robotState.imuTemperature = static_cast<float>(rawTemperature) / 340.0f + 36.53f;

  const float gyroX = static_cast<float>(rawGyroX) / MPU6050_GYRO_SCALE - robotState.imuGyroBiasX;
  const float gyroY = static_cast<float>(rawGyroY) / MPU6050_GYRO_SCALE - robotState.imuGyroBiasY;
  const float gyroZ = static_cast<float>(rawGyroZ) / MPU6050_GYRO_SCALE - robotState.imuGyroBiasZ;
  robotState.imuGyroX = gyroX;
  robotState.imuGyroY = gyroY;
  robotState.imuGyroZ = gyroZ;

  const float accelRoll = computeAccelRoll(robotState.imuAccelX, robotState.imuAccelY, robotState.imuAccelZ);
  const float accelPitch = computeAccelPitch(robotState.imuAccelX, robotState.imuAccelY, robotState.imuAccelZ);
  const unsigned long now = millis();

  if (!robotState.imuPoseInitialized || robotState.lastImuReadAt == 0 || now <= robotState.lastImuReadAt) {
    robotState.imuRoll = accelRoll;
    robotState.imuPitch = accelPitch;
    robotState.imuYaw = 0.0f;
    robotState.imuPoseInitialized = true;
  } else {
    const float dt = static_cast<float>(now - robotState.lastImuReadAt) / 1000.0f;
    robotState.imuRoll =
      IMU_COMPLEMENTARY_ALPHA * (robotState.imuRoll + gyroX * dt) +
      (1.0f - IMU_COMPLEMENTARY_ALPHA) * accelRoll;
    robotState.imuPitch =
      IMU_COMPLEMENTARY_ALPHA * (robotState.imuPitch + gyroY * dt) +
      (1.0f - IMU_COMPLEMENTARY_ALPHA) * accelPitch;
    robotState.imuYaw += gyroZ * dt;
  }

  robotState.lastImuReadAt = now;
  robotState.imuFallen =
    fabsf(robotState.imuRoll) >= IMU_FALLEN_THRESHOLD_DEG ||
    fabsf(robotState.imuPitch) >= IMU_FALLEN_THRESHOLD_DEG;

  return true;
}

void resetImuState() {
  robotState.imuAvailable = false;
  robotState.imuCalibrated = false;
  robotState.imuPoseInitialized = false;
  robotState.imuFallen = false;
  robotState.imuAddress = 0;
  robotState.imuRoll = 0.0f;
  robotState.imuPitch = 0.0f;
  robotState.imuYaw = 0.0f;
  robotState.imuTemperature = 0.0f;
  robotState.imuAccelX = 0.0f;
  robotState.imuAccelY = 0.0f;
  robotState.imuAccelZ = 0.0f;
  robotState.imuGyroX = 0.0f;
  robotState.imuGyroY = 0.0f;
  robotState.imuGyroZ = 0.0f;
  robotState.imuGyroBiasX = 0.0f;
  robotState.imuGyroBiasY = 0.0f;
  robotState.imuGyroBiasZ = 0.0f;
  robotState.lastImuReadAt = 0;
}

bool initMpu6050() {
  resetImuState();
  if (!IMU_MPU6050_ENABLED) {
    return false;
  }

  if (probeI2cDevice(MPU6050_PRIMARY_I2C_ADDRESS)) {
    robotState.imuAddress = MPU6050_PRIMARY_I2C_ADDRESS;
  } else if (probeI2cDevice(MPU6050_SECONDARY_I2C_ADDRESS)) {
    robotState.imuAddress = MPU6050_SECONDARY_I2C_ADDRESS;
  } else {
    Serial.println("MPU6050 not detected on I2C");
    return false;
  }

  uint8_t whoAmI = 0;
  if (!readMpu6050Bytes(MPU6050_WHO_AM_I_REGISTER, &whoAmI, 1) ||
      (whoAmI != MPU6050_PRIMARY_I2C_ADDRESS && whoAmI != MPU6050_SECONDARY_I2C_ADDRESS)) {
    Serial.printf("MPU6050 WHO_AM_I check failed: 0x%02X\n", whoAmI);
    resetImuState();
    return false;
  }

  if (!writeMpu6050Register(MPU6050_PWR_MGMT_1_REGISTER, 0x00) ||
      !writeMpu6050Register(MPU6050_SMPLRT_DIV_REGISTER, 0x07) ||
      !writeMpu6050Register(MPU6050_CONFIG_REGISTER, 0x03) ||
      !writeMpu6050Register(MPU6050_GYRO_CONFIG_REGISTER, 0x00) ||
      !writeMpu6050Register(MPU6050_ACCEL_CONFIG_REGISTER, 0x00)) {
    Serial.println("MPU6050 register configuration failed");
    resetImuState();
    return false;
  }

  delay(100);

  float gyroBiasX = 0.0f;
  float gyroBiasY = 0.0f;
  float gyroBiasZ = 0.0f;
  for (uint16_t sampleIndex = 0; sampleIndex < IMU_GYRO_CALIBRATION_SAMPLES; sampleIndex++) {
    uint8_t rawBytes[14];
    if (!readMpu6050Bytes(MPU6050_ACCEL_XOUT_H_REGISTER, rawBytes, sizeof(rawBytes))) {
      Serial.println("MPU6050 calibration read failed");
      resetImuState();
      return false;
    }

    const int16_t rawGyroX = static_cast<int16_t>((rawBytes[8] << 8) | rawBytes[9]);
    const int16_t rawGyroY = static_cast<int16_t>((rawBytes[10] << 8) | rawBytes[11]);
    const int16_t rawGyroZ = static_cast<int16_t>((rawBytes[12] << 8) | rawBytes[13]);
    gyroBiasX += static_cast<float>(rawGyroX) / MPU6050_GYRO_SCALE;
    gyroBiasY += static_cast<float>(rawGyroY) / MPU6050_GYRO_SCALE;
    gyroBiasZ += static_cast<float>(rawGyroZ) / MPU6050_GYRO_SCALE;
    delay(3);
  }

  robotState.imuGyroBiasX = gyroBiasX / static_cast<float>(IMU_GYRO_CALIBRATION_SAMPLES);
  robotState.imuGyroBiasY = gyroBiasY / static_cast<float>(IMU_GYRO_CALIBRATION_SAMPLES);
  robotState.imuGyroBiasZ = gyroBiasZ / static_cast<float>(IMU_GYRO_CALIBRATION_SAMPLES);

  if (!readMpu6050Sample()) {
    Serial.println("MPU6050 initial sample failed");
    resetImuState();
    return false;
  }

  robotState.imuAvailable = true;
  robotState.imuCalibrated = true;
  Serial.printf("MPU6050 ready on I2C 0x%02X\n", robotState.imuAddress);
  return true;
}

void updateImu() {
  if (!robotState.imuAvailable) {
    return;
  }

  if (!readMpu6050Sample()) {
    Serial.println("MPU6050 read failed");
    resetImuState();
  }
}

void initPca9685() {
  Wire.begin(PCA9685_SDA_PIN, PCA9685_SCL_PIN);
  Wire.setClock(400000);

  robotState.servoDriverReady = probePca9685();
  if (!robotState.servoDriverReady) {
    robotState.lastDriverError = "PCA9685 not detected on I2C";
    Serial.println(robotState.lastDriverError);
    return;
  }

  const float prescaleValue =
    (25000000.0f / (4096.0f * static_cast<float>(PCA9685_PWM_FREQUENCY))) - 1.0f;
  const uint8_t prescale = static_cast<uint8_t>(prescaleValue + 0.5f);
  const uint8_t oldMode = readPca9685Register(PCA9685_MODE1_REGISTER);
  const uint8_t sleepMode = static_cast<uint8_t>((oldMode & 0x7F) | 0x10);

  writePca9685Register(PCA9685_MODE1_REGISTER, sleepMode);
  writePca9685Register(PCA9685_PRESCALE_REGISTER, prescale);
  writePca9685Register(PCA9685_MODE2_REGISTER, 0x04);
  writePca9685Register(PCA9685_MODE1_REGISTER, static_cast<uint8_t>((oldMode & 0xEF) | 0x20));
  delay(5);
  writePca9685Register(PCA9685_MODE1_REGISTER, static_cast<uint8_t>((oldMode & 0xEF) | 0xA1));
  robotState.lastDriverError = "";
}

void applyServoAngle(uint8_t servoId, int angle) {
  if (servoId >= SERVO_COUNT) {
    return;
  }

  if (!robotState.servoDriverReady) {
    robotState.servoWriteFailures++;
    robotState.lastDriverError = "PCA9685 not ready";
    return;
  }

  const int constrained = constrain(angle, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE);
  const int physicalAngle = mapLogicalAngleToPhysical(servoId, constrained);
  const uint16_t pulseUs = angleToPulseUs(physicalAngle);
  const uint16_t ticks = pulseUsToTicks(pulseUs);

  if (!writePca9685Pwm(PCA9685_CHANNELS[servoId], 0, ticks)) {
    robotState.servoWriteFailures++;
    robotState.servoDriverReady = false;
    robotState.lastDriverError = "PCA9685 write failed";
    Serial.printf("PCA9685 write failed on channel %u\n", PCA9685_CHANNELS[servoId]);
    return;
  }

  robotState.lastDriverError = "";
  robotState.servoAngles[servoId] = constrained;
}

void centerPose() {
  for (uint8_t index = 0; index < SERVO_COUNT; index++) {
    applyServoAngle(index, SERVO_CENTER_ANGLE);
  }
}

void releaseServoOutputs() {
  for (uint8_t index = 0; index < SERVO_COUNT; index++) {
    if (!writePca9685FullOff(PCA9685_CHANNELS[index])) {
      robotState.servoWriteFailures++;
      robotState.lastDriverError = "PCA9685 release failed";
    }
  }
}

String trimPreferenceKey(uint8_t servoId) {
  return String("trim") + String(servoId + 1);
}

void loadServoZeroOffsets() {
  preferences.begin("robot-servo", false);
  for (uint8_t index = 0; index < SERVO_COUNT; index++) {
    robotState.servoZeroOffsets[index] = preferences.getInt(trimPreferenceKey(index).c_str(), 0);
  }
}

void saveServoZeroOffset(uint8_t servoId) {
  if (servoId >= SERVO_COUNT) {
    return;
  }
  preferences.putInt(trimPreferenceKey(servoId).c_str(), robotState.servoZeroOffsets[servoId]);
}

void resetServoZeroOffsets() {
  for (uint8_t index = 0; index < SERVO_COUNT; index++) {
    robotState.servoZeroOffsets[index] = 0;
    saveServoZeroOffset(index);
  }
}

void captureCurrentPoseAsServoZero() {
  for (uint8_t index = 0; index < SERVO_COUNT; index++) {
    const int delta = robotState.servoAngles[index] - SERVO_CENTER_ANGLE;
    const int direction = SERVO_INVERTED[index] ? -1 : 1;
    const int nextOffset = constrain(
      robotState.servoZeroOffsets[index] + direction * delta,
      SERVO_TRIM_MIN_ANGLE,
      SERVO_TRIM_MAX_ANGLE
    );
    robotState.servoZeroOffsets[index] = nextOffset;
    saveServoZeroOffset(index);
  }

  for (uint8_t index = 0; index < SERVO_COUNT; index++) {
    applyServoAngle(index, SERVO_CENTER_ANGLE);
  }
}

void resetGaitTelemetry() {
  gaitState.telemetryAvailable = false;
  gaitState.stepCount = 0;
  gaitState.estimatedForwardProgress = 0.0f;
  gaitState.baselineYaw = robotState.imuYaw;
  gaitState.baselineRoll = robotState.imuRoll;
  gaitState.stabilityScore = 0.0f;
  gaitState.lateralDriftMeters = 0.0f;
  gaitState.yawDriftDeg = 0.0f;
  gaitState.phase = GaitPhase::Idle;
}

void updateGaitTelemetry() {
  if (!gaitState.active && !gaitState.telemetryAvailable) {
    return;
  }

  if (robotState.imuAvailable) {
    gaitState.yawDriftDeg = robotState.imuYaw - gaitState.baselineYaw;
    gaitState.lateralDriftMeters =
      sinf((robotState.imuRoll - gaitState.baselineRoll) * K_DEGREES_TO_RADIANS) * 0.045f;
    const float rollPenalty = fabsf(robotState.imuRoll) * 0.018f;
    const float pitchPenalty = fabsf(robotState.imuPitch) * 0.022f;
    gaitState.stabilityScore = clampFloat(1.0f - rollPenalty - pitchPenalty, -1.0f, 1.0f);
  } else {
    gaitState.yawDriftDeg = 0.0f;
    gaitState.lateralDriftMeters = 0.0f;
    gaitState.stabilityScore = 0.0f;
  }

  gaitState.telemetryAvailable = gaitState.active || robotState.imuAvailable;
}

void stopPenguinGait(bool resetPose = true, const String& nextMode = "idle") {
  gaitState.active = false;
  gaitState.manualControl = false;
  gaitState.durationMs = 0;
  gaitState.phase = GaitPhase::Idle;
  updateGaitTelemetry();
  if (resetPose) {
    centerPose();
  }
  robotState.mode = nextMode;
}

void loadGaitParamsFromJson(JsonVariantConst paramsVariant) {
  gaitState.params.leanAngleDeg =
    clampFloat(paramsVariant["leanAngleDeg"] | gaitState.params.leanAngleDeg, 2.0f, 14.0f);
  gaitState.params.hipSwingDeg =
    clampFloat(paramsVariant["hipSwingDeg"] | gaitState.params.hipSwingDeg, 4.0f, 24.0f);
  gaitState.params.kneeLiftDeg =
    clampFloat(paramsVariant["kneeLiftDeg"] | gaitState.params.kneeLiftDeg, 4.0f, 28.0f);
  gaitState.params.stanceKneeDeg =
    clampFloat(paramsVariant["stanceKneeDeg"] | gaitState.params.stanceKneeDeg, 82.0f, 118.0f);
  gaitState.params.doubleSupportMs = constrain(
    static_cast<unsigned long>(paramsVariant["doubleSupportMs"] | gaitState.params.doubleSupportMs),
    80UL,
    420UL
  );
  gaitState.params.swingPhaseMs = constrain(
    static_cast<unsigned long>(paramsVariant["swingPhaseMs"] | gaitState.params.swingPhaseMs),
    180UL,
    820UL
  );
  gaitState.params.torsoLeadDeg =
    clampFloat(paramsVariant["torsoLeadDeg"] | gaitState.params.torsoLeadDeg, -8.0f, 12.0f);
  gaitState.params.neckTrimDeg =
    clampFloat(paramsVariant["neckTrimDeg"] | gaitState.params.neckTrimDeg, -16.0f, 16.0f);
}

void startPenguinGait(unsigned long durationMs, bool manualControl, uint32_t trialId = 0) {
  gaitState.active = true;
  gaitState.manualControl = manualControl;
  gaitState.trialId = trialId;
  gaitState.startedAt = millis();
  gaitState.phaseStartedAt = gaitState.startedAt;
  gaitState.durationMs = durationMs;
  gaitState.stepCount = 0;
  gaitState.estimatedForwardProgress = 0.0f;
  gaitState.baselineYaw = robotState.imuYaw;
  gaitState.baselineRoll = robotState.imuRoll;
  gaitState.phase = GaitPhase::ShiftLeft;
  gaitState.telemetryAvailable = true;
  gaitState.yawDriftDeg = 0.0f;
  gaitState.lateralDriftMeters = 0.0f;
  gaitState.stabilityScore = 0.0f;
  setPenguinPose(
    0.0f,
    gaitState.params.stanceKneeDeg - SERVO_CENTER_ANGLE,
    gaitState.params.stanceKneeDeg - SERVO_CENTER_ANGLE,
    gaitState.params.torsoLeadDeg,
    gaitState.params.torsoLeadDeg,
    gaitState.params.neckTrimDeg
  );
  robotState.mode = manualControl ? "penguin_walk" : "gait_trial";
}

void updatePenguinGait() {
  if (!gaitState.active) {
    return;
  }

  const unsigned long now = millis();
  if (gaitState.durationMs > 0 && now - gaitState.startedAt >= gaitState.durationMs) {
    stopPenguinGait(true, "idle");
    return;
  }

  if (robotState.imuFallen) {
    stopPenguinGait(true, "gait_fallen");
    return;
  }

  unsigned long phaseDuration = gaitPhaseDurationMs(gaitState.phase);
  if (phaseDuration == 0) {
    gaitState.phase = GaitPhase::ShiftLeft;
    gaitState.phaseStartedAt = now;
    phaseDuration = gaitPhaseDurationMs(gaitState.phase);
  }

  if (now - gaitState.phaseStartedAt >= phaseDuration) {
    if (gaitState.phase == GaitPhase::SwingRight || gaitState.phase == GaitPhase::SwingLeft) {
      gaitState.stepCount++;
      gaitState.estimatedForwardProgress += gaitState.params.hipSwingDeg * 0.0014f;
    }
    gaitState.phase = nextGaitPhase(gaitState.phase);
    gaitState.phaseStartedAt = now;
    phaseDuration = gaitPhaseDurationMs(gaitState.phase);
  }

  const float progress = phaseDuration == 0
    ? 1.0f
    : clampFloat(static_cast<float>(now - gaitState.phaseStartedAt) / static_cast<float>(phaseDuration), 0.0f, 1.0f);
  const float eased = easeInOutSine(progress);
  const float wave = swingWave(progress);
  const float stanceBend = clampFloat(
    gaitState.params.stanceKneeDeg - SERVO_CENTER_ANGLE,
    2.0f,
    30.0f
  );

  float bodyLean = 0.0f;
  float leftKneeBend = stanceBend;
  float rightKneeBend = stanceBend;
  float leftHipPitch = gaitState.params.torsoLeadDeg;
  float rightHipPitch = gaitState.params.torsoLeadDeg;

  switch (gaitState.phase) {
    case GaitPhase::ShiftLeft:
      bodyLean = lerpFloat(0.0f, gaitState.params.leanAngleDeg, eased);
      break;
    case GaitPhase::SwingRight:
      bodyLean = gaitState.params.leanAngleDeg;
      rightKneeBend = stanceBend + gaitState.params.kneeLiftDeg * wave;
      leftHipPitch = gaitState.params.torsoLeadDeg + lerpFloat(
        gaitState.params.hipSwingDeg * 0.18f,
        -gaitState.params.hipSwingDeg * 0.55f,
        eased
      );
      rightHipPitch = gaitState.params.torsoLeadDeg + lerpFloat(
        -gaitState.params.hipSwingDeg * 0.45f,
        gaitState.params.hipSwingDeg,
        eased
      );
      break;
    case GaitPhase::ShiftRight:
      bodyLean = lerpFloat(gaitState.params.leanAngleDeg, -gaitState.params.leanAngleDeg, eased);
      break;
    case GaitPhase::SwingLeft:
      bodyLean = -gaitState.params.leanAngleDeg;
      leftKneeBend = stanceBend + gaitState.params.kneeLiftDeg * wave;
      leftHipPitch = gaitState.params.torsoLeadDeg + lerpFloat(
        -gaitState.params.hipSwingDeg * 0.45f,
        gaitState.params.hipSwingDeg,
        eased
      );
      rightHipPitch = gaitState.params.torsoLeadDeg + lerpFloat(
        gaitState.params.hipSwingDeg * 0.18f,
        -gaitState.params.hipSwingDeg * 0.55f,
        eased
      );
      break;
    case GaitPhase::Idle:
    default:
      break;
  }

  setPenguinPose(
    bodyLean,
    leftKneeBend,
    rightKneeBend,
    leftHipPitch,
    rightHipPitch,
    gaitState.params.neckTrimDeg
  );
  updateGaitTelemetry();
}

void stopAllMotion() {
  stopPenguinGait(true, "stop");
}

void runAction(const String& name) {
  if (gaitState.active) {
    stopPenguinGait(false, "idle");
  }

  if (name == "stand") {
    applyServoAngle(0, 90);
    applyServoAngle(1, 85);
    applyServoAngle(2, 95);
    robotState.mode = "stand";
    return;
  }

  if (name == "squat") {
    applyServoAngle(0, 70);
    applyServoAngle(1, 115);
    applyServoAngle(2, 125);
    robotState.mode = "squat";
    return;
  }

  if (name == "center") {
    centerPose();
    robotState.mode = "center";
    return;
  }

  robotState.mode = "idle";
}

void runMove(const String& direction, int speed) {
  if (direction == "forward") {
    gaitState.params.leanAngleDeg = clampFloat(6.5f + speed * 0.035f, 6.5f, 8.5f);
    gaitState.params.hipSwingDeg = clampFloat(10.0f + speed * 0.05f, 10.0f, 13.0f);
    gaitState.params.kneeLiftDeg = clampFloat(12.0f + speed * 0.05f, 12.0f, 15.0f);
    gaitState.params.stanceKneeDeg = 104.0f;
    gaitState.params.doubleSupportMs = 240;
    gaitState.params.swingPhaseMs = 480;
    gaitState.params.torsoLeadDeg = 1.0f;
    gaitState.params.neckTrimDeg = 1.5f;
    startPenguinGait(0, true);
    return;
  }

  if (direction == "stop") {
    stopAllMotion();
    return;
  }

  if (gaitState.active) {
    stopPenguinGait(false, "idle");
  }

  const int delta = constrain(speed / 5, 0, 18);

  if (direction == "backward") {
    applyServoAngle(0, 90 - delta);
    applyServoAngle(1, 90 + delta);
    applyServoAngle(2, 90 - delta);
    robotState.mode = "backward";
    return;
  }

  if (direction == "left") {
    applyServoAngle(0, 90 - delta);
    applyServoAngle(1, 90);
    applyServoAngle(2, 90 + delta);
    robotState.mode = "left";
    return;
  }

  if (direction == "right") {
    applyServoAngle(0, 90 + delta);
    applyServoAngle(1, 90);
    applyServoAngle(2, 90 - delta);
    robotState.mode = "right";
    return;
  }

  stopAllMotion();
}

bool handleCommandDocument(JsonDocument& doc) {
  if (!doc["type"].is<const char*>()) {
    return false;
  }

  const String type = doc["type"].as<String>();
  robotState.lastCommandAt = millis();

  if (type == "status_request") {
    broadcastStatus();
    return true;
  }

  if (robotState.otaInProgress) {
    return false;
  }

  if (type == "servo") {
    if (gaitState.active) {
      stopPenguinGait(false, "idle");
    }
    const uint8_t id = static_cast<uint8_t>((doc["id"] | 1) - 1);
    const int angle = doc["angle"] | SERVO_CENTER_ANGLE;
    applyServoAngle(id, angle);
    robotState.mode = "servo";
    broadcastStatus();
    return true;
  }

  if (type == "servo_trim") {
    if (gaitState.active) {
      stopPenguinGait(false, "idle");
    }
    const uint8_t id = static_cast<uint8_t>((doc["id"] | 1) - 1);
    if (id >= SERVO_COUNT) {
      return false;
    }

    const int offset = constrain(
      static_cast<int>(doc["offset"] | 0),
      SERVO_TRIM_MIN_ANGLE,
      SERVO_TRIM_MAX_ANGLE
    );
    const bool applyNow = doc["applyNow"] | true;
    robotState.servoZeroOffsets[id] = offset;
    saveServoZeroOffset(id);
    if (applyNow) {
      applyServoAngle(id, robotState.servoAngles[id]);
    }
    robotState.mode = "servo_trim";
    broadcastStatus();
    return true;
  }

  if (type == "servo_trim_reset_all") {
    if (gaitState.active) {
      stopPenguinGait(false, "idle");
    }
    resetServoZeroOffsets();
    for (uint8_t index = 0; index < SERVO_COUNT; index++) {
      applyServoAngle(index, robotState.servoAngles[index]);
    }
    robotState.mode = "servo_trim_reset_all";
    broadcastStatus();
    return true;
  }

  if (type == "servo_trim_capture_current_pose") {
    if (gaitState.active) {
      stopPenguinGait(false, "idle");
    }
    captureCurrentPoseAsServoZero();
    robotState.mode = "servo_trim_capture_current_pose";
    broadcastStatus();
    return true;
  }

  if (type == "gait_trial_start") {
    loadGaitParamsFromJson(doc["params"]);
    startPenguinGait(
      static_cast<unsigned long>(doc["durationMs"] | 0),
      false,
      static_cast<uint32_t>(doc["trialId"] | 0)
    );
    broadcastStatus();
    return true;
  }

  if (type == "gait_trial_stop") {
    stopPenguinGait(true, "idle");
    broadcastStatus();
    return true;
  }

  if (type == "action") {
    runAction(doc["name"] | "idle");
    broadcastStatus();
    return true;
  }

  if (type == "move") {
    runMove(doc["direction"] | "stop", doc["speed"] | 0);
    broadcastStatus();
    return true;
  }

  if (type == "emergency_stop") {
    stopAllMotion();
    robotState.mode = "emergency_stop";
    broadcastStatus();
    return true;
  }

  return false;
}

void handleControlBody(
  AsyncWebServerRequest* request,
  uint8_t* data,
  size_t len,
  size_t index,
  size_t total
) {
  String* body = reinterpret_cast<String*>(request->_tempObject);

  if (index == 0) {
    request->_tempObject = new String();
    body = reinterpret_cast<String*>(request->_tempObject);
    body->reserve(total);
  }

  for (size_t offset = 0; offset < len; offset++) {
    body->concat(static_cast<char>(data[offset]));
  }

  if (index + len != total) {
    return;
  }

  JsonDocument doc;
  const DeserializationError error = deserializeJson(doc, *body);

  delete body;
  request->_tempObject = nullptr;

  if (error || !handleCommandDocument(doc)) {
    request->send(400, "application/json", "{\"ok\":false,\"message\":\"invalid command\"}");
    return;
  }

  request->send(200, "application/json", "{\"ok\":true}");
}

void handleWebSocketMessage(
  AsyncWebSocket* serverPtr,
  AsyncWebSocketClient* client,
  AwsEventType type,
  void* arg,
  uint8_t* data,
  size_t len
) {
  if (type == WS_EVT_CONNECT) {
    client->text(buildStatusJson());
    return;
  }

  if (type != WS_EVT_DATA) {
    return;
  }

  AwsFrameInfo* info = reinterpret_cast<AwsFrameInfo*>(arg);
  if (!info->final || info->index != 0 || info->len != len || info->opcode != WS_TEXT) {
    return;
  }

  JsonDocument doc;
  const DeserializationError error = deserializeJson(doc, data, len);
  if (error) {
    client->text("{\"type\":\"error\",\"message\":\"invalid json\"}");
    return;
  }

  if (!handleCommandDocument(doc)) {
    client->text("{\"type\":\"error\",\"message\":\"command rejected\"}");
  }
}

void configureHttpRoutes() {
  server.on("/status", HTTP_GET, [](AsyncWebServerRequest* request) {
    robotState.connected = WiFi.status() == WL_CONNECTED;
    robotState.signalStrength = WiFi.RSSI();
    robotState.battery = readBatteryVoltage();
    request->send(200, "application/json", buildStatusJson());
  });

  server.on(
    "/control",
    HTTP_POST,
    [](AsyncWebServerRequest* request) {},
    nullptr,
    handleControlBody
  );

  server.on(
    "/update",
    HTTP_POST,
    [](AsyncWebServerRequest* request) {
      const bool success = !Update.hasError();
      request->send(
        success ? 200 : 500,
        "application/json",
        success ? "{\"ok\":true,\"message\":\"restarting\"}" : "{\"ok\":false}"
      );

      if (success) {
        delay(500);
        ESP.restart();
      }
    },
    [](AsyncWebServerRequest* request, const String& filename, size_t index, uint8_t* data, size_t len, bool final) {
      if (index == 0) {
        robotState.otaInProgress = true;
        stopAllMotion();
        if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
          Update.printError(Serial);
        }
        Serial.printf("OTA start: %s\n", filename.c_str());
      }

      if (!Update.hasError() && Update.write(data, len) != len) {
        Update.printError(Serial);
      }

      if (final) {
        if (Update.end(true)) {
          Serial.printf("OTA success: %u bytes\n", index + len);
        } else {
          Update.printError(Serial);
        }
        robotState.otaInProgress = false;
        broadcastStatus();
      }
    }
  );

  server.onNotFound([](AsyncWebServerRequest* request) {
    request->send(404, "application/json", "{\"ok\":false,\"message\":\"not found\"}");
  });

  socketServer.onEvent(handleWebSocketMessage);
  server.addHandler(&socketServer);
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  if (WIFI_USE_STATIC_IP) {
    const IPAddress localIp(
      WIFI_STATIC_IP[0],
      WIFI_STATIC_IP[1],
      WIFI_STATIC_IP[2],
      WIFI_STATIC_IP[3]
    );
    const IPAddress gateway(
      WIFI_GATEWAY[0],
      WIFI_GATEWAY[1],
      WIFI_GATEWAY[2],
      WIFI_GATEWAY[3]
    );
    const IPAddress subnet(
      WIFI_SUBNET[0],
      WIFI_SUBNET[1],
      WIFI_SUBNET[2],
      WIFI_SUBNET[3]
    );
    const IPAddress dnsPrimary(
      WIFI_DNS_PRIMARY[0],
      WIFI_DNS_PRIMARY[1],
      WIFI_DNS_PRIMARY[2],
      WIFI_DNS_PRIMARY[3]
    );
    const IPAddress dnsSecondary(
      WIFI_DNS_SECONDARY[0],
      WIFI_DNS_SECONDARY[1],
      WIFI_DNS_SECONDARY[2],
      WIFI_DNS_SECONDARY[3]
    );

    if (!WiFi.config(localIp, gateway, subnet, dnsPrimary, dnsSecondary)) {
      Serial.println("Static IP configuration failed");
    }
  }
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("Connecting to Wi-Fi: %s\n", WIFI_SSID);

  unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < 15000) {
    delay(300);
    Serial.print(".");
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    robotState.connected = true;
    robotState.signalStrength = WiFi.RSSI();
    Serial.printf("Wi-Fi connected: %s\n", WiFi.localIP().toString().c_str());
  } else {
    robotState.connected = false;
    Serial.println("Wi-Fi connection timeout");
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);

  resetGaitTelemetry();
  loadServoZeroOffsets();
  initPca9685();
  initMpu6050();
  if (SERVO_CENTER_ON_BOOT) {
    centerPose();
  } else {
    releaseServoOutputs();
  }
  connectWifi();
  configureHttpRoutes();
  server.begin();
  broadcastStatus();
}

void loop() {
  socketServer.cleanupClients();

  const unsigned long now = millis();
  static unsigned long lastStatusPushAt = 0;
  static unsigned long lastImuUpdateAt = 0;
  static unsigned long lastImuRetryAt = 0;

  if (IMU_MPU6050_ENABLED) {
    if (robotState.imuAvailable) {
      if (now - lastImuUpdateAt >= IMU_UPDATE_INTERVAL_MS) {
        updateImu();
        updateGaitTelemetry();
        lastImuUpdateAt = now;
      }
    } else if (now - lastImuRetryAt >= IMU_RETRY_INTERVAL_MS) {
      initMpu6050();
      lastImuRetryAt = now;
      lastImuUpdateAt = now;
    }
  }

  updatePenguinGait();

  if (WiFi.status() != WL_CONNECTED) {
    robotState.connected = false;
  } else {
    robotState.connected = true;
  }

  if (now - lastStatusPushAt >= STATUS_PUSH_INTERVAL_MS) {
    robotState.signalStrength = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : -100;
    robotState.battery = readBatteryVoltage();
    broadcastStatus();
    lastStatusPushAt = now;
  }

  const bool shouldAutoStop =
    robotState.mode != "idle" &&
    robotState.mode != "servo" &&
    robotState.mode != "servo_trim" &&
    robotState.mode != "servo_trim_reset_all" &&
    robotState.mode != "servo_trim_capture_current_pose" &&
    robotState.mode != "penguin_walk" &&
    robotState.mode != "gait_trial";

  if (!robotState.otaInProgress && shouldAutoStop && now - robotState.lastCommandAt > SAFETY_TIMEOUT_MS) {
    stopAllMotion();
    robotState.mode = "idle";
    broadcastStatus();
  }
}
