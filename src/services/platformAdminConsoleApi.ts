import { platformGet, type PlatformApiConfig } from './platformApiClient';

export type PlatformAdminConsoleOverviewMetricTone =
  | 'neutral'
  | 'warning'
  | 'positive';

export type PlatformAdminConsoleOverviewMetric = {
  label: string;
  value: number;
  tone: PlatformAdminConsoleOverviewMetricTone;
};

export type PlatformAdminConsoleOverviewModule = {
  key: string;
  title: string;
  route: string;
  stage: 'first_slice';
  summary: string;
  metrics: PlatformAdminConsoleOverviewMetric[];
  pendingGaps: string[];
};

export type PlatformAdminConsoleOverview = {
  generatedAtIso: string;
  implementedConsoleCount: number;
  liveMetricModuleCount: number;
  remainingCapabilityCount: number;
  modules: PlatformAdminConsoleOverviewModule[];
  remainingPlatformGaps: string[];
};

export type PlatformAdminPermissionAction = 'read' | 'write';

export type PlatformAdminPermissionRiskLevel =
  | 'normal'
  | 'sensitive'
  | 'high';

export type PlatformAdminPermissionMatrixModule = {
  key: string;
  title: string;
  route: string;
  summary: string;
  capabilityCount: number;
  writeCapabilityCount: number;
  highRiskCapabilityCount: number;
  capabilityKeys: string[];
};

export type PlatformAdminPermissionCapability = {
  key: string;
  title: string;
  moduleKey: string;
  moduleTitle: string;
  consoleRoute: string;
  summary: string;
  actions: PlatformAdminPermissionAction[];
  riskLevel: PlatformAdminPermissionRiskLevel;
  apiPaths: string[];
};

export type PlatformAdminPermissionMatrixProfile = {
  key: string;
  title: string;
  userType: 'admin';
  summary: string;
  moduleKeys: string[];
  capabilityKeys: string[];
  pendingGaps: string[];
};

export type PlatformAdminPermissionMatrix = {
  generatedAtIso: string;
  defaultProfileKey: string;
  profileCount: number;
  moduleCount: number;
  capabilityCount: number;
  writeCapabilityCount: number;
  highRiskCapabilityCount: number;
  profiles: PlatformAdminPermissionMatrixProfile[];
  modules: PlatformAdminPermissionMatrixModule[];
  capabilities: PlatformAdminPermissionCapability[];
  remainingGaps: string[];
};

export function createPlatformAdminConsoleApi(config: PlatformApiConfig) {
  return {
    getAdminConsoleOverview() {
      return platformGet<PlatformAdminConsoleOverview>(
        config,
        '/admin/console/overview',
      );
    },
    getAdminPermissionMatrix() {
      return platformGet<PlatformAdminPermissionMatrix>(
        config,
        '/admin/permissions/matrix',
      );
    },
  };
}
