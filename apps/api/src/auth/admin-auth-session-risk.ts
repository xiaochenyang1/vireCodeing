import type {
  AdminAuthSessionRiskLevel,
  AdminAuthSessionRiskSummary,
  AdminAuthSessionRiskTag,
  PlatformUserType,
} from './dto';

const highSessionVolumeThreshold = 3;
const adminMultiDeviceThreshold = 2;

export type AdminAuthSessionRiskInput = {
  id: string;
  userId: string;
  userType: PlatformUserType;
  deviceId: string;
};

export type AdminAuthSessionRiskEvaluation = {
  riskLevel: AdminAuthSessionRiskLevel;
  riskTags: AdminAuthSessionRiskTag[];
  riskContext: {
    deviceSessionCount: number;
    deviceUserCount: number;
    userSessionCount: number;
  };
};

export type AdminAuthSessionRiskRecord = {
  userId: string;
  userType: PlatformUserType;
  deviceId: string;
  riskLevel: AdminAuthSessionRiskLevel;
  riskTags: AdminAuthSessionRiskTag[];
};

export function buildAdminAuthSessionRiskProfile(
  sessions: AdminAuthSessionRiskInput[],
): {
  bySessionId: Map<string, AdminAuthSessionRiskEvaluation>;
  summary: AdminAuthSessionRiskSummary;
} {
  const deviceUserIds = new Map<string, Set<string>>();
  const deviceSessionCounts = new Map<string, number>();
  const userSessionCounts = new Map<string, number>();
  const adminUserDeviceIds = new Map<string, Set<string>>();

  for (const session of sessions) {
    incrementMapCount(deviceSessionCounts, session.deviceId);
    incrementMapCount(userSessionCounts, session.userId);
    addMapSetValue(deviceUserIds, session.deviceId, session.userId);

    if (session.userType === 'admin') {
      addMapSetValue(adminUserDeviceIds, session.userId, session.deviceId);
    }
  }

  const sharedDevices = new Set(
    [...deviceUserIds.entries()]
      .filter(([, userIds]) => userIds.size >= 2)
      .map(([deviceId]) => deviceId),
  );
  const highSessionVolumeUsers = new Set(
    [...userSessionCounts.entries()]
      .filter(([, sessionCount]) => sessionCount >= highSessionVolumeThreshold)
      .map(([userId]) => userId),
  );
  const adminMultiDeviceUsers = new Set(
    [...adminUserDeviceIds.entries()]
      .filter(([, deviceIds]) => deviceIds.size >= adminMultiDeviceThreshold)
      .map(([userId]) => userId),
  );

  const bySessionId = new Map<string, AdminAuthSessionRiskEvaluation>();

  for (const session of sessions) {
    const riskTags: AdminAuthSessionRiskTag[] = [];

    if (sharedDevices.has(session.deviceId)) {
      riskTags.push('shared_device');
    }
    if (highSessionVolumeUsers.has(session.userId)) {
      riskTags.push('high_session_volume');
    }
    if (
      session.userType === 'admin' &&
      adminMultiDeviceUsers.has(session.userId)
    ) {
      riskTags.push('admin_multi_device');
    }

    bySessionId.set(session.id, {
      riskLevel: deriveRiskLevel(session.userType, riskTags),
      riskTags,
      riskContext: {
        deviceSessionCount: deviceSessionCounts.get(session.deviceId) ?? 0,
        deviceUserCount: deviceUserIds.get(session.deviceId)?.size ?? 0,
        userSessionCount: userSessionCounts.get(session.userId) ?? 0,
      },
    });
  }

  return {
    bySessionId,
    summary: summarizeAdminAuthSessionRiskRecords(
      sessions.map(session => ({
        userId: session.userId,
        userType: session.userType,
        deviceId: session.deviceId,
        riskLevel: bySessionId.get(session.id)?.riskLevel ?? 'none',
        riskTags: bySessionId.get(session.id)?.riskTags ?? [],
      })),
    ),
  };
}

export function summarizeAdminAuthSessionRiskRecords(
  sessions: AdminAuthSessionRiskRecord[],
): AdminAuthSessionRiskSummary {
  const sharedDevices = new Set<string>();
  const highSessionVolumeUsers = new Set<string>();
  const adminMultiDeviceUsers = new Set<string>();
  let riskySessionCount = 0;
  let highRiskSessionCount = 0;

  for (const session of sessions) {
    if (session.riskLevel !== 'none') {
      riskySessionCount += 1;
    }
    if (session.riskLevel === 'high') {
      highRiskSessionCount += 1;
    }
    if (session.riskTags.includes('shared_device')) {
      sharedDevices.add(session.deviceId);
    }
    if (session.riskTags.includes('high_session_volume')) {
      highSessionVolumeUsers.add(session.userId);
    }
    if (session.riskTags.includes('admin_multi_device')) {
      adminMultiDeviceUsers.add(session.userId);
    }
  }

  return {
    riskySessionCount,
    highRiskSessionCount,
    sharedDeviceCount: sharedDevices.size,
    highSessionVolumeUserCount: highSessionVolumeUsers.size,
    adminMultiDeviceUserCount: adminMultiDeviceUsers.size,
  };
}

function deriveRiskLevel(
  userType: PlatformUserType,
  riskTags: AdminAuthSessionRiskTag[],
): AdminAuthSessionRiskLevel {
  if (!riskTags.length) {
    return 'none';
  }

  if (
    riskTags.length >= 2 ||
    (userType === 'admin' && riskTags.includes('shared_device'))
  ) {
    return 'high';
  }

  return 'warning';
}

function incrementMapCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function addMapSetValue(
  map: Map<string, Set<string>>,
  key: string,
  value: string,
) {
  const set = map.get(key) ?? new Set<string>();

  set.add(value);
  map.set(key, set);
}
